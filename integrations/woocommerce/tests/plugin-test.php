<?php
/** Offline integration harness: real plugin PHP, deterministic WordPress/Woo adapters. */
define('ABSPATH', __DIR__ . '/'); define('ARRAY_A', 'ARRAY_A');
define('DAY_IN_SECONDS', 86400); define('HOUR_IN_SECONDS', 3600);
$options = $products = $posts = $meta = $requests = $scheduled = $hooks = array();
$context = array('authenticated' => true, 'integrationType' => 'WOOCOMMERCE', 'integrationId' => 'integration-a',
    'store' => array('id' => 'store-a', 'name' => 'Store A'), 'serverTime' => '2026-10-22T00:00:00.000Z',
    'scopes' => array('catalog:sync'), 'externalAccountId' => 'https://website.example');
$response_hook = null; $can_manage = true; $nonce_valid = true;
function wp_parse_url($url, $component = -1) { return parse_url($url, $component); }
function wp_http_validate_url($url) { $p = parse_url($url); return !empty($p['host']) && !in_array($p['host'], array('localhost', '127.0.0.1', '10.0.0.1'), true) ? $url : false; }
function home_url($path = '') { return 'https://website.example' . $path; }
function wp_salt($scheme) { return 'offline-fixture-salt-not-a-real-secret'; }
function wp_json_encode($value) { return json_encode($value); }
function wp_remote_retrieve_response_code($response) { return $response['code']; }
function wp_remote_retrieve_body($response) { return $response['body']; }
function is_wp_error($value) { return $value instanceof Exception; }
function wp_safe_remote_request($url, $args) {
    global $requests, $context, $response_hook;
    $requests[] = array($url, $args);
    if ($response_hook) { $response = $response_hook($url, $args); if ($response !== null) { return $response; } }
    if (str_ends_with($url, '/me')) { return array('code' => 200, 'body' => json_encode($context)); }
    if (str_ends_with($url, '/me/credit-summary')) { return array('code' => 200, 'body' => json_encode(array('availableCredits' => 10,
        'subscription' => array('status' => 'TRIALING', 'pricingPlan' => array('name' => 'Starter', 'billingMode' => 'CREDIT_LIMITED'))))); }
    if (str_contains($url, '/storefront/availability?')) { return array('code' => 200, 'body' => '{"available":true}'); }
    $body = json_decode($args['body'], true);
    return array('code' => 200, 'body' => json_encode(array('direction' => 'COMMERCE_TO_SELFX', 'sourceOfTruth' => 'COMMERCE_PLATFORM',
        'finalized' => $body['finalize'] ?? false, 'created' => count($body['products']), 'updated' => 0, 'archived' => 0, 'ignoredAsStale' => 0, 'skippedWithoutImage' => 0)));
}
function wp_generate_uuid4() { static $i = 1; return sprintf('00000000-0000-4000-8000-%012d', $i++); }
function absint($value) { return abs((int) $value); }
function get_queried_object_id() { return 10; }
function get_transient($key) { return get_option('transient_' . $key); }
function set_transient($key, $value, $expires) { update_option('transient_' . $key, $value); }
function wp_create_nonce($action) { return 'nonce:' . $action; }
function wp_verify_nonce($nonce, $action) { return $nonce === wp_create_nonce($action); }
function get_option($key, $default = false) { global $options; return $options[$key] ?? $default; }
function update_option($key, $value, $autoload = null) { global $options; $options[$key] = $value; return true; }
function add_option($key, $value, $deprecated = '', $autoload = null) { global $options; if (array_key_exists($key, $options)) { return false; } $options[$key] = $value; return true; }
function delete_option($key) { global $options; unset($options[$key]); return true; }
function maybe_serialize($value) { return is_array($value) || is_object($value) ? serialize($value) : $value; }
function maybe_unserialize($value) { return is_string($value) && str_starts_with($value, 'a:') ? unserialize($value, array('allowed_classes' => false)) : $value; }
function wp_cache_delete(...$args) {}
function add_action($hook, $callback, ...$args) { global $hooks; $hooks[$hook][] = $callback; }
function as_has_scheduled_action($hook, $args = array(), $group = '') { global $scheduled; foreach ($scheduled as $s) { if ($s['hook'] === $hook && $s['args'] === $args) { return true; } } return false; }
function as_schedule_single_action($at, $hook, $args, $group, ...$rest) { global $scheduled; $scheduled[] = compact('at', 'hook', 'args', 'group'); return count($scheduled); }
function as_schedule_recurring_action($at, $interval, $hook, $args, $group, ...$rest) { return as_schedule_single_action($at, $hook, $args, $group); }
function as_unschedule_all_actions($hook, ...$args) { global $scheduled; $scheduled = array_values(array_filter($scheduled, fn($s) => $s['hook'] !== $hook)); }
function wp_unschedule_hook($hook) {}
function current_user_can($cap) { global $can_manage; return $can_manage && $cap === 'manage_woocommerce'; }
function check_admin_referer($action) { global $nonce_valid; if (!$nonce_valid) { throw new Exception('NONCE_DENIED'); } }
function wp_die($message, ...$args) { throw new Exception('PERMISSION_DENIED'); }
function wp_unslash($value) { return $value; }
function wp_safe_redirect($url) { throw new Exception('REDIRECT'); }
function esc_html__($value, $domain) { return $value; }
function esc_html($value) { return htmlspecialchars((string) $value, ENT_QUOTES); }
function esc_attr($value) { return esc_html($value); }
function esc_url($value) { return esc_html($value); }
function admin_url($path) { return 'https://website.example/wp-admin/' . $path; }
function wp_nonce_field($action) { echo '<input name="_wpnonce" value="fixture">'; }
function submit_button($label, ...$args) { echo '<button>' . esc_html($label) . '</button>'; }
function get_post($id) { global $posts; return $posts[$id] ?? null; }
function get_post_field($field, $id) { $post = get_post($id); return $post->$field ?? ''; }
function get_post_meta($id, $key, $single = false) { global $meta; return $meta[$id][$key] ?? ''; }
function update_post_meta($id, $key, $value) { global $meta; $meta[$id][$key] = $value; }
function wc_get_product($id) { global $products; return $products[$id] ?? false; }
function wp_strip_all_tags($value) { return strip_tags($value); }
function wc_get_price_decimals() { return 2; }
function get_woocommerce_currency() { return 'INR'; }
function wp_get_attachment_image_url($id, $size) { return 'https://website.example/images/' . $id . '.jpg'; }
function taxonomy_exists($name) { return $name === 'pa_color'; }
function get_term_by($field, $value, $taxonomy) { return (object) array('name' => ucfirst($value)); }
function wc_attribute_label($name) { return ucfirst(str_replace('pa_', '', $name)); }
final class FakeDb {
    public string $options = 'options'; public string $posts = 'posts'; public string $last_error = '';
    public bool $fail_query = false;
    function prepare($query, ...$args) { return array($query, $args); }
    function esc_like($value) { return $value; }
    function get_results($query, $format) {
        global $options; $rows = array(); $this->last_error = $this->fail_query ? 'simulated' : '';
        if ($this->fail_query) { return null; }
        foreach ($options as $key => $value) { if (str_starts_with($key, SelfX_WC_Plugin::DIRTY)) { $rows[] = array('option_name' => $key, 'option_value' => maybe_serialize($value)); } }
        return array_slice($rows, 0, 5);
    }
    function get_var($query) { global $posts; $this->last_error = $this->fail_query ? 'simulated' : ''; return $posts ? max(array_keys($posts)) : null; }
    function get_col($query) {
        global $posts, $options; $this->last_error = $this->fail_query ? 'simulated' : '';
        if ($this->fail_query) { return null; }
        [$sql, $args] = $query;
        if (str_contains($sql, 'option_name')) { return array_values(array_filter(array_keys($options), fn($key) => str_starts_with($key, SelfX_WC_Plugin::DIRTY))); }
        $ids = array_keys(array_filter($posts, fn($p) => $p->post_type === 'product'));
        sort($ids); return array_slice(array_values(array_filter($ids, fn($id) => $id > $args[0] && $id <= $args[1])), 0, 5);
    }
    function delete($table, $where) {
        global $options; $name = $where['option_name'];
        if (isset($options[$name]) && maybe_serialize($options[$name]) === $where['option_value']) { unset($options[$name]); return 1; } return 0;
    }
}
$wpdb = new FakeDb();
final class FakeProduct {
    public function __construct(public int $id, public string $type = 'simple', public array $values = array()) {}
    function get_id() { return $this->id; }
    function is_type($type) { return $this->type === $type; }
    function get_date_modified(...$args) { return new DateTimeImmutable('2026-10-21T00:00:00Z'); }
    function get_date_created(...$args) { return $this->get_date_modified(); }
    function get_status(...$args) { return $this->values['status'] ?? 'publish'; }
    function get_image_id(...$args) { return $this->values['image'] ?? $this->id; }
    function get_gallery_image_ids(...$args) { return $this->values['gallery'] ?? array(); }
    function get_children() { return $this->values['children'] ?? array(); }
    function get_attributes(...$args) { return $this->values['attributes'] ?? array(); }
    function get_sku(...$args) { return 'sku-' . $this->id; }
    function get_price(...$args) { return $this->values['price'] ?? '19.95'; }
    function is_in_stock() { return $this->values['stock'] ?? true; }
    function is_purchasable() { return true; }
    function get_permalink() { return 'https://website.example/product/' . $this->id; }
    function get_name(...$args) { return $this->values['name'] ?? 'Tee'; }
    function get_slug(...$args) { return 'tee-' . $this->id; }
    function get_description(...$args) { return '<p>Product description</p>'; }
    function get_catalog_visibility(...$args) { return $this->values['visibility'] ?? 'visible'; }
}
require __DIR__ . '/../selfx-woocommerce/includes/class-selfx-wc-client.php';
require __DIR__ . '/../selfx-woocommerce/includes/class-selfx-wc-product.php';
require __DIR__ . '/../selfx-woocommerce/includes/class-selfx-wc-plugin.php';
require __DIR__ . '/../selfx-woocommerce/includes/class-selfx-wc-storefront.php';
function equal($actual, $expected) { if ($actual !== $expected) { throw new Exception('Expected ' . var_export($expected, true) . ', got ' . var_export($actual, true)); } }
function rejects(callable $fn, string $message) { try { $fn(); } catch (Throwable $e) { equal($e->getMessage(), $message); return; } throw new Exception('Expected failure ' . $message); }
$passed = 0;
function test(string $name, callable $fn) {
    global $passed; try { $fn(); echo "PASS $name\n"; $passed++; } catch (Throwable $e) { fwrite(STDERR, "FAIL $name: {$e->getMessage()}\n"); exit(1); }
}
function setup(): SelfX_WC_Plugin {
    global $options, $products, $posts, $requests, $scheduled, $response_hook, $context, $wpdb, $meta, $can_manage, $nonce_valid;
    $options = $products = $posts = $requests = $scheduled = $meta = array(); $response_hook = null; $wpdb->fail_query = false;
    $can_manage = $nonce_valid = true; $context['integrationType'] = 'WOOCOMMERCE'; $context['externalAccountId'] = 'https://website.example';
    update_option(SelfX_WC_Plugin::CONFIG, array('connectionId' => 'connection-a', 'origin' => 'https://api.example', 'credential' => SelfX_WC_Client::encrypt('selfx_woocommerce_' . str_repeat('a', 43)), 'storeId' => 'store-a', 'storeName' => 'Store A', 'integrationId' => 'integration-a'));
    return new SelfX_WC_Plugin();
}
function add_product(int $id, string $type = 'simple', array $values = array()) {
    global $products, $posts; $products[$id] = new FakeProduct($id, $type, $values);
    $posts[$id] = (object) array('post_type' => $type === 'variation' ? 'product_variation' : 'product', 'post_parent' => $values['parent'] ?? 0, 'post_password' => $values['password'] ?? '');
    return $products[$id];
}
function sync_requests(): array { global $requests; return array_values(array_filter($requests, fn($r) => str_ends_with($r[0], '/catalog/sync'))); }
if (in_array('--fixture', $argv, true)) {
    setup(); $parent = add_product(10, 'variable', array('children' => array(11, 12)));
    add_product(11, 'variation', array('parent' => 10, 'attributes' => array('pa_color' => 'blue', 'size' => 'M'), 'price' => '20.00'));
    add_product(12, 'variation', array('parent' => 10, 'attributes' => array('pa_color' => 'red', 'size' => 'L'), 'price' => '25.00', 'stock' => false));
    echo json_encode(array('mode' => 'INCREMENTAL', 'products' => array(SelfX_WC_Product::normalize($parent)))); exit;
}
test('encrypted credentials round-trip and tampering fails closed', function () {
    $token = 'selfx_woocommerce_' . str_repeat('a', 43); $encrypted = SelfX_WC_Client::encrypt($token);
    equal(str_contains($encrypted, $token), false); equal(SelfX_WC_Client::decrypt($encrypted), $token);
    $parts = explode('.', $encrypted); $parts[1] = base64_encode(str_repeat('0', 16));
    rejects(fn() => SelfX_WC_Client::decrypt(implode('.', $parts)), 'CREDENTIALS_UNAVAILABLE');
});
test('rejects insecure origins, embedded credentials, private hosts and wrong token types', function () {
    foreach (array('http://api.example', 'https://user:pass@api.example', 'https://api.example/path', 'https://api.example?x=1', 'https://127.0.0.1', 'https://10.0.0.1', 'https://api.example:3001') as $url) {
        rejects(fn() => new SelfX_WC_Client($url, 'selfx_woocommerce_' . str_repeat('a', 43)), 'API_ORIGIN_INVALID');
    }
    rejects(fn() => new SelfX_WC_Client('https://api.example', 'selfx_shopify_' . str_repeat('a', 43)), 'TOKEN_INVALID');
});
test('sends credentials only in a verified HTTPS header and never follows redirects', function () {
    setup(); $client = new SelfX_WC_Client('https://api.example', 'selfx_woocommerce_' . str_repeat('a', 43)); $client->context();
    global $requests, $response_hook; equal($requests[0][1]['redirection'], 0); equal($requests[0][1]['sslverify'], true);
    equal(str_contains($requests[0][0], 'selfx_woocommerce_'), false);
    rejects(fn() => $client->request('GET', '/admin'), 'API_PATH_INVALID');
    $response_hook = fn() => array('code' => 302, 'body' => '{}'); rejects(fn() => $client->context(), 'API_HTTP_302');
});
test('verifies WooCommerce type, catalog scope and website binding', function () {
    setup(); global $context; $client = new SelfX_WC_Client('https://api.example', 'selfx_woocommerce_' . str_repeat('a', 43));
    $context['integrationType'] = 'SHOPIFY'; rejects(fn() => $client->context(), 'CONNECTION_CONTEXT_INVALID');
    $context['integrationType'] = 'WOOCOMMERCE'; $context['externalAccountId'] = 'https://another.example'; rejects(fn() => $client->context(), 'WEBSITE_MISMATCH');
});
test('normalizes parent Try-On references without prices, variants, stock or Store overrides', function () {
    setup(); $p = SelfX_WC_Product::normalize(add_product(10));
    equal($p['externalProductId'], '10'); equal($p['description'], 'Product description');
    foreach (array('variants', 'priceAmountCents', 'priceCurrency', 'available', 'storeId', 'vtoEnabled') as $key) { equal(array_key_exists($key, $p), false); }
});
test('a variable product is one reference even when it has thousands of variations', function () {
    setup(); $parent = add_product(10, 'variable', array('children' => range(11, 5000)));
    $p = SelfX_WC_Product::normalize($parent); equal($p['externalProductId'], '10'); equal(isset($p['variants']), false);
    equal($p['featuredImageUrl'], 'https://website.example/images/10.jpg');
});
test('local product and image URLs fail early with an actionable code', function () {
    foreach (array('http://localhost:8881/product/10', 'http://127.0.0.1/a.jpg', 'http://10.0.0.1/a.jpg') as $url) { rejects(fn() => SelfX_WC_Product::public_url($url), 'PUBLIC_CATALOG_URL_REQUIRED'); }
});
test('launch redirects require the trusted SelfX origin, fixed path and a fragment capability', function () {
    $good = 'https://app.selfx.example/try-on/commerce#session=' . str_repeat('a', 43);
    equal(SelfX_WC_Storefront::validated_launch($good, 'https://app.selfx.example'), $good);
    foreach (array(str_replace('app.selfx.example', 'evil.example', $good), str_replace('/try-on/commerce', '/login', $good), str_replace('#session=', '?session=', $good)) as $url) { rejects(fn() => SelfX_WC_Storefront::validated_launch($url, 'https://app.selfx.example'), 'LAUNCH_RESPONSE_INVALID'); }
});
test('eligible sold-out products show only Try it on and keep credentials off the storefront', function () {
    setup(); add_product(10, 'simple', array('stock' => false));
    $front = new SelfX_WC_Storefront(); $html = $front->button();
    equal(str_contains($html, 'Try it on'), true); equal(str_contains($html, 'selfx_woocommerce_'), false);
    equal(str_contains($html, 'add-to-cart'), false); equal(str_contains($html, 'size'), false);
    global $requests; $count = count($requests); $front->button(); equal(count($requests), $count);
});
test('ineligible and unpublished products hide the storefront button', function () {
    setup(); add_product(10, 'simple', array('status' => 'draft')); $front = new SelfX_WC_Storefront(); equal($front->button(), '');
    setup(); add_product(10); global $response_hook;
    $response_hook = fn() => array('code' => 200, 'body' => '{"available":false}'); equal($front->button(), '');
});
test('a public launch validates its nonce before using the server credential', function () {
    setup(); add_product(10); $_POST = array('product_id' => 10, '_wpnonce' => 'wrong');
    rejects(fn() => (new SelfX_WC_Storefront())->launch(), 'PERMISSION_DENIED');
    global $requests; equal($requests, array()); $_POST = array();
});
test('out of stock stays active, hidden/private/protected products stay unavailable', function () {
    setup(); equal(SelfX_WC_Product::normalize(add_product(10, 'simple', array('stock' => false)))['status'], 'ACTIVE');
    foreach (array(array('status' => 'draft'), array('visibility' => 'hidden'), array('password' => 'private')) as $values) {
        equal(SelfX_WC_Product::normalize(add_product(10, 'simple', $values))['status'], 'DRAFT');
    }
    equal(SelfX_WC_Product::normalize(add_product(10, 'simple', array('status' => 'trash')))['status'], 'ARCHIVED');
});
test('full scan persists its cursor and finalizes only with an acknowledged empty terminal batch', function () {
    $plugin = setup(); for ($i = 1; $i <= 6; $i++) { add_product($i); }
    update_option('selfx_wc_reconcile_needed', true); $plugin->run('connection-a');
    equal(get_option(SelfX_WC_Plugin::STATE)['full']['cursor'], 5);
    $plugin->run('connection-a'); equal(get_option(SelfX_WC_Plugin::STATE)['full']['cursor'], 6);
    $plugin->run('connection-a'); equal(get_option(SelfX_WC_Plugin::STATE)['status'], 'IDLE');
    $batches = array_map(fn($r) => json_decode($r[1]['body'], true), sync_requests());
    equal(array_map(fn($b) => $b['finalize'], $batches), array(false, false, true));
    equal(array_unique(array_column($batches, 'sourceSnapshotAt')), array(0 => '2026-10-22T00:00:00.000Z'));
});
test('transient HTTP failure retains the full cursor, retries the same snapshot and honors backoff', function () {
    $plugin = setup(); add_product(1); update_option('selfx_wc_reconcile_needed', true);
    global $response_hook; $response_hook = fn($url) => str_ends_with($url, '/catalog/sync') ? array('code' => 503, 'body' => 'private failure') : null;
    $plugin->run('connection-a'); $state = get_option(SelfX_WC_Plugin::STATE); equal($state['status'], 'RETRYING'); equal($state['full']['cursor'], 0);
    $before = count(sync_requests()); $plugin->run('connection-a'); equal(count(sync_requests()), $before);
    unset($state['nextRetryAt']); update_option(SelfX_WC_Plugin::STATE, $state); $response_hook = null;
    $plugin->run('connection-a'); equal(get_option(SelfX_WC_Plugin::STATE)['full']['cursor'], 1);
});
test('database scan failure never emits a destructive full finalize', function () {
    $plugin = setup(); global $wpdb; $wpdb->fail_query = true; update_option('selfx_wc_reconcile_needed', true);
    $plugin->run('connection-a'); equal(sync_requests(), array()); equal(get_option(SelfX_WC_Plugin::STATE)['error'], 'CATALOG_QUERY_FAILED');
});
test('coalesces variation edits to its parent and compare-delete preserves a concurrent change', function () {
    $plugin = setup(); add_product(10, 'variable', array('children' => array(11))); add_product(11, 'variation', array('parent' => 10));
    $plugin->changed(11); global $response_hook;
    $response_hook = function ($url) use ($plugin) { if (str_ends_with($url, '/catalog/sync')) { $plugin->changed(11); } return null; };
    $plugin->run('connection-a'); equal(is_array(get_option(SelfX_WC_Plugin::DIRTY . '10')), true);
    $response_hook = null; $plugin->run('connection-a'); equal(get_option(SelfX_WC_Plugin::DIRTY . '10'), false);
    $body = json_decode(sync_requests()[0][1]['body'], true); equal($body['mode'], 'INCREMENTAL'); equal($body['products'][0]['externalProductId'], '10');
});
test('permanent deletion persists a tombstone after the product disappears', function () {
    $plugin = setup(); add_product(10); $plugin->changed(10); global $products, $posts; unset($products[10], $posts[10]);
    $plugin->run('connection-a'); $body = json_decode(sync_requests()[0][1]['body'], true); equal($body['products'][0]['status'], 'ARCHIVED');
});
test('auth failures block sync, do not leak response bodies, and never finalize', function () {
    $plugin = setup(); global $response_hook; $response_hook = fn() => array('code' => 401, 'body' => 'secret-token');
    update_option('selfx_wc_reconcile_needed', true); $plugin->run('connection-a'); equal(get_option(SelfX_WC_Plugin::STATE)['status'], 'BLOCKED');
    equal(str_contains(json_encode(get_option(SelfX_WC_Plugin::STATE)), 'secret-token'), false); equal(sync_requests(), array());
    $plugin->reconcile(); equal(get_option(SelfX_WC_Plugin::STATE)['status'], 'BLOCKED');
});
test('old connection jobs and competing workers cannot send or overwrite state', function () {
    $plugin = setup(); add_product(10); $plugin->changed(10); $plugin->run('old-connection'); global $requests; equal($requests, array());
    update_option('selfx_wc_worker_lock', array('owner' => 'another', 'until' => time() + 180)); $plugin->run('connection-a'); equal($requests, array());
});
test('admin mutations require WooCommerce capability and a valid nonce', function () {
    $plugin = setup(); global $can_manage, $nonce_valid; $can_manage = false;
    rejects(fn() => $plugin->connect(), 'PERMISSION_DENIED'); rejects(fn() => $plugin->manual(), 'PERMISSION_DENIED'); rejects(fn() => $plugin->disconnect(), 'PERMISSION_DENIED');
    $can_manage = true; $nonce_valid = false; rejects(fn() => $plugin->connect(), 'NONCE_DENIED');
});
test('a worker that loses its lease cannot clear pending changes or overwrite another worker state', function () {
    $plugin = setup(); add_product(10); $plugin->changed(10); global $response_hook;
    $response_hook = function ($url) {
        if (str_ends_with($url, '/catalog/sync')) {
            update_option('selfx_wc_worker_lock', array('owner' => 'replacement', 'until' => time() + 180));
            update_option(SelfX_WC_Plugin::STATE, array('status' => 'RUNNING', 'message' => 'Replacement worker'));
        }
        return null;
    };
    $plugin->run('connection-a');
    equal(get_option(SelfX_WC_Plugin::STATE)['message'], 'Replacement worker');
    equal(is_array(get_option(SelfX_WC_Plugin::DIRTY . '10')), true);
    equal(get_option('selfx_wc_worker_lock')['owner'], 'replacement');
});
test('connection verifies context, encrypts credentials and requires confirmation before changing Store', function () {
    $plugin = setup(); global $context; $token = 'selfx_woocommerce_' . str_repeat('b', 43);
    $_POST = array('api_origin' => 'https://api.example', 'integration_token' => $token);
    rejects(fn() => $plugin->connect(), 'REDIRECT');
    $config = get_option(SelfX_WC_Plugin::CONFIG);
    equal(SelfX_WC_Client::decrypt($config['credential']), $token);
    equal(str_contains(json_encode($config), $token), false);
    equal(get_option(SelfX_WC_Plugin::STATE)['status'], 'QUEUED');
    $context['store']['id'] = 'store-b';
    rejects(fn() => $plugin->connect(), 'REDIRECT');
    equal(get_option(SelfX_WC_Plugin::CONFIG)['storeId'], 'store-a');
    equal(get_option(SelfX_WC_Plugin::STATE)['message'], 'STORE_CHANGE_CONFIRMATION_REQUIRED');
    $_POST['confirm_store_change'] = '1'; rejects(fn() => $plugin->connect(), 'REDIRECT');
    equal(get_option(SelfX_WC_Plugin::CONFIG)['storeId'], 'store-b');
    $context['store']['id'] = 'store-a'; $_POST = array();
});
test('changing API origin never forwards the saved credential without a freshly supplied token', function () {
    $plugin = setup(); global $requests;
    $_POST = array('api_origin' => 'https://another-api.example', 'integration_token' => '');
    rejects(fn() => $plugin->connect(), 'REDIRECT');
    equal($requests, array()); equal(get_option(SelfX_WC_Plugin::STATE)['message'], 'TOKEN_REQUIRED_FOR_NEW_API_ORIGIN');
    $_POST = array();
});
test('disconnect removes the local credential and queued changes without deleting WooCommerce products', function () {
    $plugin = setup(); add_product(10); $plugin->changed(10);
    rejects(fn() => $plugin->disconnect(), 'REDIRECT');
    equal(get_option(SelfX_WC_Plugin::CONFIG), false); equal(get_option(SelfX_WC_Plugin::DIRTY . '10'), false);
    equal(get_option(SelfX_WC_Plugin::STATE)['status'], 'DISCONNECTED'); equal(wc_get_product(10)->get_id(), 10);
});
test('incremental queue query failure is retried instead of reported as synchronized', function () {
    $plugin = setup(); add_product(10); $plugin->changed(10); global $wpdb; $wpdb->fail_query = true;
    $plugin->run('connection-a'); equal(get_option(SelfX_WC_Plugin::STATE)['status'], 'RETRYING');
    equal(get_option(SelfX_WC_Plugin::STATE)['error'], 'CATALOG_QUERY_FAILED'); equal(sync_requests(), array());
});
test('settings HTML escapes Store names, never reveals the token and schedules background reconciliation', function () {
    $plugin = setup(); $config = get_option(SelfX_WC_Plugin::CONFIG); $config['storeName'] = '<script>alert(1)</script>'; update_option(SelfX_WC_Plugin::CONFIG, $config);
    ob_start(); $plugin->page(); $html = ob_get_clean(); equal(str_contains($html, '<script>'), false); equal(str_contains($html, 'selfx_woocommerce_' . str_repeat('a', 43)), false);
    $plugin->initialize(); global $scheduled; equal(count(array_filter($scheduled, fn($s) => $s['hook'] === 'selfx_wc_reconcile')), 1);
    $plugin->initialize(); equal(count(array_filter($scheduled, fn($s) => $s['hook'] === 'selfx_wc_reconcile')), 1);
});
test('plugin-first linking keeps the secret server-side and receives the selected Store', function () {
    $plugin = setup(); delete_option(SelfX_WC_Plugin::CONFIG);
    global $response_hook, $requests;
    $response_hook = function ($url, $args) {
        if (str_ends_with($url, '/link-sessions')) {
            equal($args['headers']['Content-Type'] ?? null, 'application/json');
            $body = json_decode($args['body'], true);
            return array('code' => 201, 'body' => json_encode(array('approvalUrl' => 'https://selfx.example/app/integrations/woocommerce/link?token=' . $body['linkToken'], 'expiresAt' => gmdate('c', time() + 600))));
        }
        if (str_ends_with($url, '/redeem')) {
            equal(isset($args['headers']['Content-Type']), false);
            equal(isset($args['body']), false);
            return array('code' => 200, 'body' => json_encode(array('status' => 'LINKED', 'siteUrl' => 'https://website.example',
                'storeId' => 'new-store', 'storeName' => 'New Store', 'integrationId' => 'new-integration',
                'integrationToken' => 'selfx_woocommerce_' . str_repeat('z', 43))));
        }
        return null;
    };
    rejects(fn() => $plugin->begin(), 'REDIRECT');
    $pending = get_option(SelfX_WC_Plugin::PENDING);
    equal(isset($pending['approvalUrl']), true);
    equal(str_contains(json_encode($pending), 'selfx_woocommerce_'), false);
    ob_start(); $plugin->page(); $html = ob_get_clean();
    equal(str_contains($html, $pending['token']), true);
    equal(str_contains($html, SelfX_WC_Client::decrypt($pending['redeem'])), false);
    rejects(fn() => $plugin->finish(), 'REDIRECT');
    $config = get_option(SelfX_WC_Plugin::CONFIG);
    equal($config['storeId'], 'new-store');
    equal(SelfX_WC_Client::decrypt($config['credential']), 'selfx_woocommerce_' . str_repeat('z', 43));
    equal(get_option(SelfX_WC_Plugin::PENDING), false);
    equal(get_option(SelfX_WC_Plugin::STATE)['status'], 'QUEUED');
    $redeem = array_values(array_filter($requests, fn($request) => str_ends_with($request[0], '/redeem')))[0];
    equal($redeem[1]['headers']['x-selfx-woocommerce-redeem-secret'] !== '', true);
});

test('approved return completes server-side and rejects unauthorized or invalid returns', function () {
    $plugin = setup(); delete_option(SelfX_WC_Plugin::CONFIG);
    global $response_hook, $requests, $can_manage;
    $response_hook = function ($url, $args) {
        if (str_ends_with($url, '/link-sessions')) {
            $body = json_decode($args['body'], true);
            return array('code' => 201, 'body' => json_encode(array(
                'approvalUrl' => 'https://selfx.example/app/integrations/woocommerce/link?token=' . $body['linkToken'],
                'expiresAt' => gmdate('c', time() + 600),
            )));
        }
        if (str_ends_with($url, '/redeem')) {
            return array('code' => 200, 'body' => json_encode(array(
                'status' => 'LINKED', 'siteUrl' => 'https://website.example',
                'storeId' => 'new-store', 'storeName' => 'New Store',
                'integrationId' => 'new-integration',
                'integrationToken' => 'selfx_woocommerce_' . str_repeat('z', 43),
            )));
        }
        return null;
    };
    rejects(fn() => $plugin->begin(), 'REDIRECT');
    $pending = get_option(SelfX_WC_Plugin::PENDING);
    $return_state = wp_parse_url($pending['adminUrl'], PHP_URL_QUERY);
    parse_str($return_state, $query);
    equal($query['selfx_return'], '1');
    equal(hash('sha256', $query['selfx_state']), $pending['returnStateHash']);
    $proof = $plugin->link_proof(new class($pending) {
        function __construct(private array $pending) {}
        function get_param($key) { return $key === 'challenge' ? $this->pending['tokenHash'] : null; }
    });
    equal($proof['adminUrl'], $pending['adminUrl']);
    $requests = array();
    $_GET = array('page' => 'selfx-woocommerce', 'selfx_return' => '1', 'selfx_state' => str_repeat('x', 43));
    rejects(fn() => $plugin->complete_return(), 'REDIRECT');
    equal(get_option(SelfX_WC_Plugin::STATE)['message'], 'LINK_RETURN_INVALID');
    equal($requests, array());
    $_GET['selfx_state'] = $query['selfx_state'];
    $can_manage = false;
    rejects(fn() => $plugin->complete_return(), 'PERMISSION_DENIED');
    equal($requests, array());
    $can_manage = true;
    rejects(fn() => $plugin->complete_return(), 'REDIRECT');
    equal(get_option(SelfX_WC_Plugin::CONFIG)['storeId'], 'new-store');
    equal(get_option(SelfX_WC_Plugin::STATE)['status'], 'QUEUED');
    equal(get_option(SelfX_WC_Plugin::PENDING), false);
    equal(count(array_filter($requests, fn($request) => str_ends_with($request[0], '/redeem'))), 1);
    rejects(fn() => $plugin->complete_return(), 'REDIRECT');
    equal(count(array_filter($requests, fn($request) => str_ends_with($request[0], '/redeem'))), 1);
    $_GET = array();
});
test('settings show the live Store billing mode and inactive plan state', function () {
    $plugin = setup(); global $response_hook;
    $response_hook = fn($url) => str_ends_with($url, '/me/credit-summary')
        ? array('code' => 200, 'body' => json_encode(array('availableCredits' => 0,
            'subscription' => array('status' => 'ACTIVE', 'pricingPlan' => array('name' => 'Flex', 'billingMode' => 'POSTPAID_PAYG')),
            'postpaid' => array('billableCredits' => 7)))) : null;
    ob_start(); $plugin->page(); $html = ob_get_clean();
    equal(str_contains($html, 'Pay as you go · 7 billable Try-Ons'), true);
    equal(str_contains($html, 'Try-On is unavailable until the Store has credits'), false);
    $response_hook = fn($url) => str_ends_with($url, '/me/credit-summary')
        ? array('code' => 200, 'body' => json_encode(array('availableCredits' => 5,
            'subscription' => array('status' => 'PAST_DUE', 'pricingPlan' => array('name' => 'Growth', 'billingMode' => 'CREDIT_LIMITED'))))) : null;
    ob_start(); $plugin->page(); $html = ob_get_clean();
    equal(str_contains($html, 'Growth</strong> · PAST_DUE'), true);
    equal(str_contains($html, 'Try-On is unavailable while this Store plan is inactive'), true);
});
echo "$passed plugin checks passed.\n";
