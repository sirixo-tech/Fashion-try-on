<?php
defined('ABSPATH') || exit;

/** Storefront launch only. Customer photos and generation remain on SelfX. */
final class SelfX_WC_Storefront {
    public function register(): void {
        add_action('woocommerce_single_product_summary', array($this, 'automatic_button'), 35);
        add_shortcode('selfx_try_on', array($this, 'button'));
        add_action('init', array($this, 'block'));
        add_action('admin_post_selfx_wc_try_on', array($this, 'launch'));
        add_action('admin_post_nopriv_selfx_wc_try_on', array($this, 'launch'));
    }
    public function block(): void {
        wp_register_script('selfx-try-on-editor', plugins_url('../assets/block.js', __FILE__), array('wp-blocks', 'wp-element'), '0.2.0', true);
        register_block_type('selfx/try-on', array('api_version' => 3, 'editor_script' => 'selfx-try-on-editor', 'uses_context' => array('postId'),
            'render_callback' => function ($attributes, $content, $block) { return $this->button(array('product_id' => $block->context['postId'] ?? 0)); }));
    }
    private function product(int $id) {
        $product = wc_get_product($id);
        if (!$product || !($product->is_type('simple') || $product->is_type('variable')) || $product->get_status('edit') !== 'publish'
            || get_post_field('post_password', $id) || $product->get_catalog_visibility('edit') === 'hidden') { return null; }
        return $product;
    }
    private function client(): SelfX_WC_Client {
        $config = get_option(SelfX_WC_Plugin::CONFIG, array());
        if (empty($config['credential'])) { throw new SelfX_WC_Error('CONNECTION_REQUIRED'); }
        return new SelfX_WC_Client($config['origin'], SelfX_WC_Client::decrypt($config['credential']));
    }
    public function automatic_button(): void { echo $this->button(array()); } // Already escaped by button().
    public function button($attributes = array()): string {
        $id = absint($attributes['product_id'] ?? get_queried_object_id());
        if (!$this->product($id)) { return ''; }
        $config = get_option(SelfX_WC_Plugin::CONFIG, array());
        if (!$config) { return ''; }
        $cache = 'selfx_wc_ready_' . md5(($config['connectionId'] ?? '') . ':' . $id);
        $ready = get_transient($cache);
        if ($ready === false) {
            try { $ready = $this->client()->request('GET', '/api/v1/integrations/storefront/availability?externalProductId=' . rawurlencode((string) $id)); }
            catch (Throwable $error) { $ready = array('available' => false); }
            set_transient($cache, $ready, 60);
        }
        if (($ready['available'] ?? false) !== true) { return ''; }
        return '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" class="selfx-try-on"><input type="hidden" name="action" value="selfx_wc_try_on"><input type="hidden" name="product_id" value="' . esc_attr((string) $id) . '"><input type="hidden" name="_wpnonce" value="' . esc_attr(wp_create_nonce('selfx_wc_try_on_' . $id)) . '"><button type="submit" class="button">' . esc_html__('Try it on', 'selfx-woocommerce') . '</button></form>';
    }
    public function launch(): void {
        $id = absint($_POST['product_id'] ?? 0);
        if (!$this->product($id) || !wp_verify_nonce((string) wp_unslash($_POST['_wpnonce'] ?? ''), 'selfx_wc_try_on_' . $id)) {
            wp_die(esc_html__('This Try-On link has expired. Reload the product page and try again.', 'selfx-woocommerce'), '', array('response' => 403));
        }
        try {
            $rate = 'selfx_wc_launch_' . hash_hmac('sha256', (string) ($_SERVER['REMOTE_ADDR'] ?? '') . ':' . gmdate('YmdHi'), wp_salt('auth'));
            $attempts = (int) get_transient($rate); if ($attempts >= 10) { throw new SelfX_WC_Error('STOREFRONT_RATE_LIMITED'); }
            set_transient($rate, $attempts + 1, 120);
            $visitor = (string) ($_COOKIE['selfx_wc_visitor'] ?? '');
            if (!preg_match('/^[A-Za-z0-9_-]{43}$/D', $visitor)) {
                $visitor = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
                setcookie('selfx_wc_visitor', $visitor, array('expires' => time() + DAY_IN_SECONDS, 'path' => '/', 'secure' => is_ssl(), 'httponly' => true, 'samesite' => 'Lax'));
            }
            $client = $this->client(); $context = $client->context();
            $config = get_option(SelfX_WC_Plugin::CONFIG, array());
            if ($context['integrationId'] !== $config['integrationId'] || $context['store']['id'] !== $config['storeId'] || !in_array('tryon:create', $context['scopes'], true)) { throw new SelfX_WC_Error('STOREFRONT_TOKEN_REQUIRED'); }
            $result = $client->request('POST', '/api/v1/integrations/storefront/try-on-sessions', array('externalProductId' => (string) $id, 'visitorToken' => $visitor, 'locale' => str_replace('_', '-', get_locale())));
            $launch = self::validated_launch($result['launchUrl'] ?? '', $context['storefrontWebOrigin'] ?? '');
            add_filter('allowed_redirect_hosts', static function ($hosts) use ($launch) { $hosts[] = wp_parse_url($launch, PHP_URL_HOST); return $hosts; });
            wp_safe_redirect($launch, 303); exit;
        } catch (Throwable $error) {
            wp_die(esc_html__('Try-On is temporarily unavailable. Return to the product page and try again shortly.', 'selfx-woocommerce'), '', array('response' => 503, 'back_link' => true));
        }
    }
    public static function validated_launch(string $url, string $origin): string {
        $target = wp_parse_url($url); $expected = wp_parse_url($origin);
        if (!$target || !$expected || ($target['scheme'] ?? '') !== 'https' || isset($target['user']) || isset($target['pass'])
            || ($target['host'] ?? '') !== ($expected['host'] ?? '') || ($target['port'] ?? 443) !== ($expected['port'] ?? 443)
            || ($target['path'] ?? '') !== '/try-on/commerce' || isset($target['query']) || !preg_match('/^session=[A-Za-z0-9_-]{43}$/D', $target['fragment'] ?? '')) { throw new SelfX_WC_Error('LAUNCH_RESPONSE_INVALID'); }
        return $url;
    }
}
