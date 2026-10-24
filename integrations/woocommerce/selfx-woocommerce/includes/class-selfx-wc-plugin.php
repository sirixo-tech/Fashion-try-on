<?php
defined('ABSPATH') || exit;

final class SelfX_WC_Plugin {
    public const CONFIG = 'selfx_wc_connection';
    public const STATE = 'selfx_wc_sync_state';
    public const PENDING = 'selfx_wc_pending_link';
    public const DIRTY = 'selfx_wc_dirty_';
    public const RUN = 'selfx_wc_run';
    public const GROUP = 'selfx-woocommerce';
    private const LOCK = 'selfx_wc_worker_lock';
    public function register(): void {
        add_action('admin_menu', array($this, 'menu'));
        add_action('admin_post_selfx_wc_connect', array($this, 'connect'));
        add_action('admin_post_selfx_wc_begin', array($this, 'begin'));
        add_action('admin_post_selfx_wc_finish', array($this, 'finish'));
        add_action('rest_api_init', array($this, 'register_link_proof'));
        add_action('admin_post_selfx_wc_disconnect', array($this, 'disconnect'));
        add_action('admin_post_selfx_wc_sync', array($this, 'manual'));
        // WooCommerce's bundled Action Scheduler initializes at init priority 1.
        add_action('action_scheduler_init', array($this, 'initialize'));
        add_action('init', array($this, 'initialize'), 20);
        add_action(self::RUN, array($this, 'run'), 10, 1);
        add_action('selfx_wc_reconcile', array($this, 'reconcile'));
        add_action('selfx_wc_dispatch', array($this, 'dispatch'));
        add_action('woocommerce_scheduled_sales', array($this, 'reconcile'));
        foreach (array('woocommerce_new_product', 'woocommerce_update_product') as $hook) {
            add_action($hook, array($this, 'changed'), 10, 1);
        }
        foreach (array('before_delete_post', 'wp_trash_post', 'untrashed_post') as $hook) {
            add_action($hook, array($this, 'changed'), 10, 1);
        }
    }
    private function config(): array { $value = get_option(self::CONFIG, array()); return is_array($value) ? $value : array(); }
    private function state(): array { $value = get_option(self::STATE, array()); return is_array($value) ? $value : array(); }
    private function authorize(string $action): void {
        if (!current_user_can('manage_woocommerce')) { wp_die(esc_html__('You cannot manage this connection.', 'selfx-woocommerce'), '', array('response' => 403)); }
        check_admin_referer('selfx_wc_' . $action);
    }
    private function redirect(): void { wp_safe_redirect(admin_url('admin.php?page=selfx-woocommerce')); exit; }
    public function menu(): void {
        add_submenu_page('woocommerce', 'SelfX', 'SelfX', 'manage_woocommerce', 'selfx-woocommerce', array($this, 'page'));
    }
    public function register_link_proof(): void {
        register_rest_route('selfx/v1', '/link-proof', array(
            'methods' => 'GET', 'callback' => array($this, 'link_proof'),
            'permission_callback' => '__return_true',
        ));
    }
    public function link_proof($request): array {
        $pending = get_option(self::PENDING, array());
        $challenge = (string) $request->get_param('challenge');
        if (!is_array($pending) || empty($pending['tokenHash']) || empty($pending['expiresAt'])
            || time() >= (int) $pending['expiresAt'] || !preg_match('/^[a-f0-9]{64}$/D', $challenge)
            || !hash_equals($pending['tokenHash'], $challenge)) { return array(); }
        return array('siteUrl' => rtrim(home_url('/'), '/'),
            'adminUrl' => admin_url('admin.php?page=selfx-woocommerce&selfx_return=1'), 'challenge' => $challenge);
    }
    public function begin(): void {
        $this->authorize('begin');
        try {
            if ($this->config()) { throw new SelfX_WC_Error('DISCONNECT_BEFORE_CHANGING_STORE'); }
            if (!function_exists('openssl_encrypt')) { throw new SelfX_WC_Error('ENCRYPTION_UNAVAILABLE'); }
            $site = rtrim(home_url('/'), '/');
            $admin = admin_url('admin.php?page=selfx-woocommerce&selfx_return=1');
            $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
            $redeem = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
            $origin = defined('SELFX_WC_API_ORIGIN') ? SELFX_WC_API_ORIGIN : SelfX_WC_Client::DEFAULT_ORIGIN;
            $pending = array('token' => $token, 'tokenHash' => hash('sha256', $token),
                'redeem' => SelfX_WC_Client::encrypt($redeem), 'siteUrl' => $site,
                'origin' => $origin, 'expiresAt' => time() + 600);
            update_option(self::PENDING, $pending, false);
            $created = SelfX_WC_Client::link_request($origin, 'POST', '/api/v1/public/integrations/woocommerce/link-sessions',
                array('siteUrl' => $site, 'adminUrl' => $admin, 'linkToken' => $token, 'redeemSecret' => $redeem));
            $approval = $created['approvalUrl'] ?? '';
            $url = wp_parse_url($approval);
            if (!$url || ($url['scheme'] ?? '') !== 'https' || ($url['path'] ?? '') !== '/app/integrations/woocommerce/link'
                || ($url['query'] ?? '') !== 'token=' . $token) { throw new SelfX_WC_Error('LINK_RESPONSE_INVALID'); }
            $pending['approvalUrl'] = $approval;
            update_option(self::PENDING, $pending, false);
            update_option(self::STATE, array('status' => 'PENDING_APPROVAL', 'message' => 'Sign in to SelfX and approve this website, then return here.'), false);
        } catch (Throwable $error) {
            delete_option(self::PENDING);
            update_option(self::STATE, array('status' => 'DISCONNECTED', 'message' => $this->safe_error($error)), false);
        }
        $this->redirect();
    }
    public function finish(): void {
        $this->authorize('finish');
        $pending = get_option(self::PENDING, array());
        try {
            if ($this->config()) { throw new SelfX_WC_Error('DISCONNECT_BEFORE_CHANGING_STORE'); }
            if (!is_array($pending) || empty($pending['token']) || empty($pending['redeem'])
                || empty($pending['origin']) || empty($pending['siteUrl']) || time() >= (int) ($pending['expiresAt'] ?? 0)) {
                throw new SelfX_WC_Error('LINK_EXPIRED');
            }
            $lock = $this->lock();
            if (!$lock) { throw new SelfX_WC_Error('SYNC_IN_PROGRESS_TRY_AGAIN'); }
            try {
                $result = SelfX_WC_Client::link_request($pending['origin'], 'POST',
                    '/api/v1/public/integrations/woocommerce/link-sessions/' . $pending['token'] . '/redeem', null,
                    SelfX_WC_Client::decrypt($pending['redeem']));
                if (($result['status'] ?? '') !== 'LINKED' || ($result['siteUrl'] ?? '') !== $pending['siteUrl']
                    || empty($result['storeId']) || empty($result['storeName']) || empty($result['integrationId'])
                    || empty($result['integrationToken'])) { throw new SelfX_WC_Error('LINK_RESPONSE_INVALID'); }
                $encrypted = SelfX_WC_Client::encrypt($result['integrationToken']);
                self::unschedule(); self::clear_dirty();
                update_option(self::CONFIG, array('origin' => $pending['origin'], 'credential' => $encrypted,
                    'connectionId' => wp_generate_uuid4(), 'storeId' => $result['storeId'],
                    'storeName' => $result['storeName'], 'integrationId' => $result['integrationId']), false);
                update_option(self::STATE, array('status' => 'QUEUED', 'message' => 'Connection verified. Initial catalog sync queued.'), false);
                update_option('selfx_wc_reconcile_needed', true, false);
                delete_option(self::PENDING);
            } finally { self::compare_delete(self::LOCK, $lock); }
        } catch (Throwable $error) {
            $state = $this->state(); $state['message'] = $this->safe_error($error);
            update_option(self::STATE, $state, false);
        }
        $this->redirect();
    }
    public function connect(): void {
        $this->authorize('connect');
        $lock = $this->lock();
        try {
            if (!$lock) { throw new SelfX_WC_Error('SYNC_IN_PROGRESS_TRY_AGAIN'); }
            $current = $this->config();
            $origin = trim((string) wp_unslash($_POST['api_origin'] ?? SelfX_WC_Client::DEFAULT_ORIGIN));
            $token = trim((string) wp_unslash($_POST['integration_token'] ?? ''));
            if ($token === '' && !empty($current['origin']) && rtrim($origin, '/') !== $current['origin']) {
                throw new SelfX_WC_Error('TOKEN_REQUIRED_FOR_NEW_API_ORIGIN');
            }
            // Blank retains an existing saved token without exposing it in HTML.
            if ($token === '' && !empty($current['credential'])) { $token = SelfX_WC_Client::decrypt($current['credential']); }
            $client = new SelfX_WC_Client($origin, $token);
            $context = $client->context();
            if (!empty($current['storeId']) && $current['storeId'] !== $context['store']['id'] && empty($_POST['confirm_store_change'])) {
                throw new SelfX_WC_Error('STORE_CHANGE_CONFIRMATION_REQUIRED');
            }
            $encrypted = SelfX_WC_Client::encrypt($token);
            self::unschedule(); self::clear_dirty();
            update_option(self::CONFIG, array('origin' => rtrim($origin, '/'), 'credential' => $encrypted,
                'connectionId' => wp_generate_uuid4(), 'storeId' => $context['store']['id'], 'storeName' => (string) $context['store']['name'],
                'integrationId' => $context['integrationId']), false);
            update_option(self::STATE, array('status' => 'QUEUED', 'message' => 'Connection verified. Initial catalog sync queued.'), false);
            update_option('selfx_wc_reconcile_needed', true, false);
        } catch (Throwable $error) {
            $state = $this->state(); $state['message'] = $this->safe_error($error);
            update_option(self::STATE, $state, false);
        } finally { if ($lock) { self::compare_delete(self::LOCK, $lock); } }
        $this->redirect();
    }
    public function disconnect(): void {
        $this->authorize('disconnect');
        $lock = $this->lock();
        if (!$lock) { wp_die(esc_html__('A catalog batch is running. Try disconnecting again shortly.', 'selfx-woocommerce'), '', array('response' => 409)); }
        self::unschedule(); self::clear_dirty();
        delete_option(self::CONFIG); delete_option(self::PENDING); delete_option('selfx_wc_reconcile_needed');
        update_option(self::STATE, array('status' => 'DISCONNECTED', 'message' => 'Disconnected on this website. The SelfX catalog is retained; revoke the credential or disconnect the integration in SelfX to disable its access.'), false);
        self::compare_delete(self::LOCK, $lock);
        $this->redirect();
    }
    public function manual(): void {
        $this->authorize('sync');
        $lock = $this->lock();
        if (!$lock) { wp_die(esc_html__('A catalog batch is running. Try again shortly.', 'selfx-woocommerce'), '', array('response' => 409)); }
        if ($this->config()) {
            // Do not replace an active snapshot; retry its unacknowledged batch.
            $state = $this->state();
            if (empty($state['full'])) { update_option('selfx_wc_reconcile_needed', true, false); }
            $state['attempts'] = 0; $state['status'] = 'QUEUED'; $state['message'] = 'Catalog sync queued.';
            unset($state['nextRetryAt']);
            update_option(self::STATE, $state, false); $this->schedule(1, true);
        }
        self::compare_delete(self::LOCK, $lock); $this->redirect();
    }
    public function initialize(): void {
        if (!$this->config()) { return; }
        if (function_exists('as_schedule_recurring_action')) {
            if (!as_has_scheduled_action('selfx_wc_reconcile', array(), self::GROUP)) {
                as_schedule_recurring_action(time() + DAY_IN_SECONDS, DAY_IN_SECONDS, 'selfx_wc_reconcile', array(), self::GROUP, true);
            }
            if (!as_has_scheduled_action('selfx_wc_dispatch', array(), self::GROUP)) {
                as_schedule_recurring_action(time() + 300, 300, 'selfx_wc_dispatch', array(), self::GROUP, true);
            }
        } else {
            if (!wp_next_scheduled('selfx_wc_reconcile')) { wp_schedule_event(time() + DAY_IN_SECONDS, 'daily', 'selfx_wc_reconcile'); }
            if (!wp_next_scheduled('selfx_wc_dispatch')) { wp_schedule_event(time() + HOUR_IN_SECONDS, 'hourly', 'selfx_wc_dispatch'); }
        }
        if (get_option('selfx_wc_reconcile_needed')) { $this->schedule(); }
    }
    public static function unschedule(): void {
        foreach (array(self::RUN, 'selfx_wc_reconcile', 'selfx_wc_dispatch') as $hook) {
            if (function_exists('as_unschedule_all_actions')) { as_unschedule_all_actions($hook, null, self::GROUP); }
            wp_unschedule_hook($hook);
        }
    }
    private function schedule(int $delay = 1, bool $force = false): void {
        $connection = $this->config()['connectionId'] ?? '';
        if (!$connection) { return; }
        $retry = strtotime($this->state()['nextRetryAt'] ?? '') ?: 0;
        $delay = max($delay, $retry - time());
        $args = array($connection);
        if (function_exists('as_schedule_single_action')) {
            if ($force || !as_has_scheduled_action(self::RUN, $args, self::GROUP)) {
                as_schedule_single_action(time() + $delay, self::RUN, $args, self::GROUP, false);
            }
        } elseif ($force || !wp_next_scheduled(self::RUN, $args)) { wp_schedule_single_event(time() + $delay, self::RUN, $args); }
    }
    public function reconcile(): void {
        if (!$this->config()) { return; }
        $lock = $this->lock(); if (!$lock) { return; }
        $state = $this->state();
        // Auth/configuration failures require an explicit operator correction.
        if (($state['status'] ?? '') === 'BLOCKED') { self::compare_delete(self::LOCK, $lock); return; }
        if (empty($state['full'])) { update_option('selfx_wc_reconcile_needed', true, false); }
        $state['attempts'] = 0; $state['status'] = 'QUEUED'; unset($state['nextRetryAt']);
        update_option(self::STATE, $state, false); $this->schedule(1, true);
        self::compare_delete(self::LOCK, $lock);
    }
    public function dispatch(): void {
        if (in_array($this->state()['status'] ?? '', array('FAILED', 'BLOCKED'), true)) { return; }
        if (get_option('selfx_wc_reconcile_needed') || !empty($this->state()['full']) || $this->dirty()) { $this->schedule(); }
    }
    public function changed($value): void {
        if (!$this->config()) { return; }
        $id = is_object($value) && method_exists($value, 'get_id') ? (int) $value->get_id() : (int) $value;
        $post = get_post($id);
        if (!$post || !in_array($post->post_type, array('product', 'product_variation'), true)) { return; }
        $id = $post->post_type === 'product_variation' ? (int) $post->post_parent : $id;
        if (!$id) { return; }
        $previous = (int) get_post_meta($id, '_selfx_wc_revision', true);
        $product = wc_get_product($id);
        $modified = $product ? ($product->get_date_modified('edit') ?: $product->get_date_created('edit')) : null;
        $revision = max((int) floor(microtime(true) * 1000), $previous + 1, $modified ? $modified->getTimestamp() * 1000 + 1 : 0);
        update_post_meta($id, '_selfx_wc_revision', $revision);
        update_option(self::DIRTY . $id, array('revision' => $revision, 'generation' => wp_generate_uuid4(),
            'connectionId' => $this->config()['connectionId']), false);
        if (!in_array($this->state()['status'] ?? '', array('FAILED', 'BLOCKED'), true)) { $this->schedule(); }
    }
    private function dirty(): array {
        global $wpdb;
        $rows = $wpdb->get_results($wpdb->prepare("SELECT option_name, option_value FROM {$wpdb->options} WHERE option_name LIKE %s ORDER BY option_id ASC LIMIT 5", $wpdb->esc_like(self::DIRTY) . '%'), ARRAY_A);
        if ($rows === null || $wpdb->last_error) { throw new SelfX_WC_Error('CATALOG_QUERY_FAILED'); }
        return $rows;
    }
    public static function compare_delete(string $name, $value): bool {
        global $wpdb;
        $deleted = $wpdb->delete($wpdb->options, array('option_name' => $name, 'option_value' => maybe_serialize($value)));
        if ($deleted) { wp_cache_delete($name, 'options'); }
        return (bool) $deleted;
    }
    public static function clear_dirty(): void {
        global $wpdb;
        $names = $wpdb->get_col($wpdb->prepare("SELECT option_name FROM {$wpdb->options} WHERE option_name LIKE %s", $wpdb->esc_like(self::DIRTY) . '%'));
        foreach ($names ?: array() as $name) { delete_option($name); }
    }
    private function lock(): ?array {
        $lock = array('owner' => wp_generate_uuid4(), 'until' => time() + 180);
        if (add_option(self::LOCK, $lock, '', false)) { return $lock; }
        $previous = get_option(self::LOCK);
        if (is_array($previous) && ($previous['until'] ?? 0) < time() && self::compare_delete(self::LOCK, $previous)
            && add_option(self::LOCK, $lock, '', false)) { return $lock; }
        return null;
    }
    private function client(array $config): SelfX_WC_Client {
        return new SelfX_WC_Client($config['origin'], SelfX_WC_Client::decrypt($config['credential']));
    }
    private function assert_lock(array $lock, int $reserve = 0): void {
        if (get_option(self::LOCK) !== $lock || $lock['until'] <= time() + $reserve) {
            throw new SelfX_WC_Error('WORKER_LEASE_LOST');
        }
    }
    public function run(string $connection): void {
        $config = $this->config();
        if (!$config || ($config['connectionId'] ?? '') !== $connection) { return; }
        $lock = $this->lock(); if (!$lock) { $this->schedule(30, true); return; }
        $state = $this->state();
        try {
            if (in_array($state['status'] ?? '', array('FAILED', 'BLOCKED'), true)) { return; }
            $retry = strtotime($state['nextRetryAt'] ?? '') ?: 0;
            if ($retry > time()) { $this->schedule($retry - time(), true); return; }
            $client = $this->client($config); $context = $client->context();
            if ($context['integrationId'] !== $config['integrationId'] || $context['store']['id'] !== $config['storeId']) {
                throw new SelfX_WC_Error('CONNECTION_CONTEXT_CHANGED');
            }
            $state['status'] = 'RUNNING';
            if (empty($state['full']) && get_option('selfx_wc_reconcile_needed')) {
                global $wpdb;
                $maximum = (int) $wpdb->get_var("SELECT MAX(ID) FROM {$wpdb->posts} WHERE post_type='product'");
                if ($wpdb->last_error) { throw new SelfX_WC_Error('CATALOG_QUERY_FAILED'); }
                $state['full'] = array('cursor' => 0, 'maximum' => $maximum, 'snapshot' => $context['serverTime']);
                $state['counts'] = array('created' => 0, 'updated' => 0, 'archived' => 0, 'ignoredAsStale' => 0, 'skippedWithoutImage' => 0);
                // Persist before the HTTP request so retries keep the exact snapshot/cursor.
                update_option(self::STATE, $state, false); delete_option('selfx_wc_reconcile_needed');
            }
            if (!empty($state['full'])) { $state = $this->full_batch($client, $state, $lock); }
            else { $state = $this->dirty_batch($client, $state, $connection, $lock); }
            $this->assert_lock($lock);
            if (($this->config()['connectionId'] ?? '') !== $connection) { return; }
            $state['attempts'] = 0; $state['error'] = null; $state['lastSuccessAt'] = gmdate('c');
            unset($state['nextRetryAt']);
            $pending = !empty($state['full']) || (bool) $this->dirty() || (bool) get_option('selfx_wc_reconcile_needed');
            $state['status'] = $pending ? 'QUEUED' : 'IDLE';
            $state['message'] = $pending ? 'Catalog sync is progressing.' : 'Catalog is synchronized.';
            update_option(self::STATE, $state, false);
            if ($pending) { $this->schedule(2, true); }
        } catch (Throwable $error) {
            if (($this->config()['connectionId'] ?? '') !== $connection) { return; }
            if ($error instanceof SelfX_WC_Error && $error->getMessage() === 'WORKER_LEASE_LOST') {
                $this->schedule(30, true); return;
            }
            $state['attempts'] = ($state['attempts'] ?? 0) + 1;
            $code = $this->safe_error($error);
            $blocked = in_array($code, array('API_HTTP_401', 'API_HTTP_403', 'CONNECTION_CONTEXT_CHANGED', 'CONNECTION_CONTEXT_INVALID', 'WEBSITE_MISMATCH', 'CREDENTIALS_UNAVAILABLE'), true);
            $permanent = $blocked || in_array($code, array('API_HTTP_400', 'API_HTTP_413', 'API_ORIGIN_INVALID', 'AUTH_VALIDATION_FAILED', 'COMMERCE_PUBLIC_URL_REQUIRED', 'PUBLIC_CATALOG_URL_REQUIRED', 'CATALOG_BATCH_TOO_LARGE'), true);
            $retry = !$permanent && $state['attempts'] < 8;
            $state['status'] = $blocked ? 'BLOCKED' : ($retry ? 'RETRYING' : 'FAILED');
            $state['error'] = $code; $state['message'] = $retry ? 'Sync will retry automatically.' : 'Sync stopped. Correct the issue and reconnect or select Sync now.';
            update_option(self::STATE, $state, false);
            if ($retry) { $delay = min(3600, 30 * (2 ** ($state['attempts'] - 1))); $state['nextRetryAt'] = gmdate('c', time() + $delay); update_option(self::STATE, $state, false); $this->schedule($delay, true); }
        } finally { self::compare_delete(self::LOCK, $lock); }
    }
    private function full_batch(SelfX_WC_Client $client, array $state, array $lock): array {
        global $wpdb;
        $full = $state['full'];
        $ids = $wpdb->get_col($wpdb->prepare("SELECT ID FROM {$wpdb->posts} WHERE post_type='product' AND ID>%d AND ID<=%d ORDER BY ID ASC LIMIT 5", $full['cursor'], $full['maximum']));
        if ($ids === null || $wpdb->last_error) { throw new SelfX_WC_Error('CATALOG_QUERY_FAILED'); }
        $products = array(); $last = null;
        foreach ($ids as $id) {
            $product = $this->snapshot((int) $id, (int) get_post_meta((int) $id, '_selfx_wc_revision', true));
            if ($products && strlen(wp_json_encode(array_merge($products, array($product)))) > 650000) { break; }
            $products[] = $product; $last = (int) $id;
        }
        // Empty terminal batch is deliberate: a failed/incomplete scan never finalizes.
        $this->assert_lock($lock, 25);
        $response = $client->request('POST', '/api/v1/integrations/catalog/sync', array('mode' => 'FULL',
            'sourceSnapshotAt' => $full['snapshot'], 'finalize' => !$ids, 'products' => $products));
        $this->check_response($response, !$ids);
        foreach (array_keys($state['counts']) as $key) { $state['counts'][$key] += (int) $response[$key]; }
        if ($ids) { $state['full']['cursor'] = $last; }
        else { unset($state['full']); $state['lastFullSyncAt'] = gmdate('c'); }
        return $state;
    }
    private function dirty_batch(SelfX_WC_Client $client, array $state, string $connection, array $lock): array {
        $entries = $this->dirty(); $products = array(); $acknowledge = array();
        foreach ($entries as $row) {
            $entry = maybe_unserialize($row['option_value']);
            if (!is_array($entry) || ($entry['connectionId'] ?? '') !== $connection) { self::compare_delete($row['option_name'], $entry); continue; }
            $id = (int) substr($row['option_name'], strlen(self::DIRTY));
            if ($id <= 0) { throw new SelfX_WC_Error('CATALOG_QUEUE_INVALID'); }
            $product = $this->snapshot($id, (int) $entry['revision']);
            if ($products && strlen(wp_json_encode(array_merge($products, array($product)))) > 650000) { break; }
            $products[] = $product; $acknowledge[] = array($row['option_name'], $entry);
        }
        if ($products) {
            $this->assert_lock($lock, 25);
            $response = $client->request('POST', '/api/v1/integrations/catalog/sync', array('mode' => 'INCREMENTAL', 'products' => $products));
            $this->check_response($response, false);
            $this->assert_lock($lock);
            foreach ($acknowledge as [$name, $entry]) { self::compare_delete($name, $entry); }
        }
        return $state;
    }
    private function snapshot(int $id, int $revision): array {
        $product = wc_get_product($id);
        if (!$product) { return array('externalProductId' => (string) $id, 'status' => 'ARCHIVED', 'sourceUpdatedAt' => SelfX_WC_Product::timestamp(max($revision, (int) floor(microtime(true) * 1000)))); }
        return SelfX_WC_Product::normalize($product, $revision);
    }
    private function check_response(array $response, bool $finalize): void {
        if (($response['direction'] ?? '') !== 'COMMERCE_TO_SELFX' || ($response['sourceOfTruth'] ?? '') !== 'COMMERCE_PLATFORM'
            || ($response['finalized'] ?? null) !== $finalize) { throw new SelfX_WC_Error('API_RESPONSE_INVALID'); }
        foreach (array('created', 'updated', 'archived', 'ignoredAsStale', 'skippedWithoutImage') as $key) {
            if (!isset($response[$key]) || !is_int($response[$key]) || $response[$key] < 0) { throw new SelfX_WC_Error('API_RESPONSE_INVALID'); }
        }
    }
    private function safe_error(Throwable $error): string {
        return $error instanceof SelfX_WC_Error && preg_match('/^[A-Z0-9_]{1,80}$/D', $error->getMessage()) ? $error->getMessage() : 'SYNC_UNAVAILABLE';
    }
    public function page(): void {
        if (!current_user_can('manage_woocommerce')) { return; }
        $config = $this->config(); $state = $this->state();
        echo '<div class="wrap"><h1>SelfX for WooCommerce</h1><p>Sync your website catalog into its connected SelfX Store. WooCommerce keeps control of products, stock, prices and checkout.</p>';
        if (!empty($state['message'])) { echo '<div class="notice notice-info"><p>' . esc_html($state['message']) . '</p></div>'; }
        if (!empty($state['error'])) { echo '<p><strong>Last issue:</strong> ' . esc_html($state['error']) . '</p>'; }
        echo '<h2>Connection</h2>';
        $pending = get_option(self::PENDING, array());
        if (!$config && is_array($pending) && !empty($pending['approvalUrl']) && time() < (int) ($pending['expiresAt'] ?? 0)) {
            echo '<p>Approve <strong>' . esc_html($pending['siteUrl']) . '</strong> in SelfX, then return here. The connection will finish automatically.</p>';
            echo '<p><a class="button button-primary" target="_blank" rel="noopener noreferrer" href="' . esc_url($pending['approvalUrl']) . '">Sign in and approve in SelfX</a></p>';
            echo '<form id="selfx-wc-finish" method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="selfx_wc_finish">';
            wp_nonce_field('selfx_wc_finish'); submit_button('Finish connection'); echo '</form>';
            if (isset($_GET['selfx_return']) && (string) wp_unslash($_GET['selfx_return']) === '1') {
                echo '<script>document.getElementById("selfx-wc-finish").submit();</script>';
            }
        } elseif (!$config) {
            echo '<p>New to SelfX? Connect this website, then sign in or create a SelfX account. A new Store gets the standard one-time Starter trial.</p>';
            echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="selfx_wc_begin">';
            wp_nonce_field('selfx_wc_begin'); submit_button('Connect to SelfX'); echo '</form>';
        }
        echo '<details><summary>Connect with an existing plugin token</summary><p>In SelfX → Integrations → WooCommerce, create the connection for this website and generate a plugin token, then paste it here.</p>';
        if ($config) { echo '<p><strong>Connected Store:</strong> ' . esc_html($config['storeName']) . ' <code>' . esc_html($config['storeId']) . '</code></p>'; }
        if ($config) {
            try {
                $client = new SelfX_WC_Client($config['origin'], SelfX_WC_Client::decrypt($config['credential']));
                $summary = $client->request('GET', '/api/v1/integrations/me/credit-summary');
                $plan = $summary['subscription']['pricingPlan'] ?? array();
                $name = $plan['name'] ?? 'Current SelfX plan';
                $mode = $plan['billingMode'] ?? 'CREDIT_LIMITED';
                $status = $summary['subscription']['status'] ?? 'UNAVAILABLE';
                echo '<h3>SelfX plan and usage</h3><p><strong>' . esc_html($name) . '</strong> · ' . esc_html($status) . '</p>';
                if (!in_array($status, array('ACTIVE', 'TRIALING'), true)) {
                    echo '<p>Try-On is unavailable while this Store plan is inactive. Review billing in SelfX.</p>';
                } elseif ($mode === 'POSTPAID_PAYG') {
                    echo '<p>Pay as you go · ' . esc_html((string) ($summary['postpaid']['billableCredits'] ?? 0)) . ' billable Try-Ons this period.</p>';
                } else {
                    $available = (int) ($summary['availableCredits'] ?? 0);
                    echo '<p>' . esc_html((string) $available) . ' Try-On credits available across SelfX channels.</p>';
                    if ($available <= 0) { echo '<p>Try-On is unavailable until the Store has credits.</p>'; }
                }
            } catch (Throwable $error) {
                echo '<p>SelfX plan and usage are temporarily unavailable. The Store connection is unchanged.</p>';
            }
        }
        echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="selfx_wc_connect">';
        wp_nonce_field('selfx_wc_connect');
        echo '<table class="form-table"><tr><th><label for="selfx-origin">SelfX API address</label></th><td><input class="regular-text" type="url" required id="selfx-origin" name="api_origin" value="' . esc_attr($config['origin'] ?? SelfX_WC_Client::DEFAULT_ORIGIN) . '"></td></tr>';
        echo '<tr><th><label for="selfx-token">Integration token</label></th><td><input class="regular-text" type="password" autocomplete="new-password" id="selfx-token" name="integration_token" value="" placeholder="' . esc_attr($config ? 'Saved token retained if blank' : 'Paste your WooCommerce integration token') . '"></td></tr></table>';
        if ($config) { echo '<p><label><input type="checkbox" name="confirm_store_change" value="1"> Confirm if the new token belongs to a different SelfX Store</label></p>'; }
        submit_button($config ? 'Verify / reconnect' : 'Connect and sync'); echo '</form></details>';
        if ($config) {
            echo '<h2>Catalog sync</h2><p><strong>Status:</strong> ' . esc_html($state['status'] ?? 'QUEUED') . '</p>';
            foreach (array('lastSuccessAt' => 'Last successful batch', 'lastFullSyncAt' => 'Last completed full sync', 'nextRetryAt' => 'Next retry') as $key => $label) {
                if (!empty($state[$key])) { echo '<p>' . esc_html($label) . ': ' . esc_html($state[$key]) . ' (UTC)</p>'; }
            }
            if (!empty($state['counts'])) { echo '<p>'; foreach ($state['counts'] as $key => $count) { echo esc_html($key . ': ' . (int) $count) . ' · '; } echo '</p>'; }
            echo '<p>New products are initially disabled for Try-On. In SelfX, enable the eligible imported products; those settings are preserved during future syncs. Eligible products appear on kiosks assigned to that Store, including products currently out of stock.</p>';
            echo '<p>Product changes sync in the background; a full reconciliation runs daily. Reliable delivery requires WordPress cron / WooCommerce Scheduled Actions to run.</p>';
            foreach (array('sync' => 'Sync now / retry', 'disconnect' => 'Disconnect website') as $action => $label) {
                echo '<form style="display:inline-block;margin-right:12px" method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="selfx_wc_' . esc_attr($action) . '">';
                wp_nonce_field('selfx_wc_' . $action); submit_button($label, $action === 'sync' ? 'primary' : 'secondary', 'submit', false); echo '</form>';
            }
        }
        echo '<hr><p>Try-On-only integration: product pages show Try it on when enabled in SelfX. For block themes, add the SelfX Try-On block or a Shortcode block containing [selfx_try_on] to the Single Product template. Products, sizes, colors, prices, stock and purchases stay in WooCommerce. Replace catalog-only tokens with a new plugin token including tryon:create to enable the storefront button. Public website and image URLs are required; localhost URLs cannot be fetched by SelfX.</p></div>';
    }
}
