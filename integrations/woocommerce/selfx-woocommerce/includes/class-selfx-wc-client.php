<?php
defined('ABSPATH') || exit;

final class SelfX_WC_Error extends RuntimeException {}

/** Credentials stay on the WordPress server. No redirects or arbitrary API paths. */
final class SelfX_WC_Client {
    public const DEFAULT_ORIGIN = 'https://selfxapi-production.up.railway.app';
    private string $origin;
    private string $token;
    public function __construct(string $origin, string $token) {
        $parts = wp_parse_url($origin);
        $local = defined('SELFX_WC_ALLOW_LOCAL_API') && SELFX_WC_ALLOW_LOCAL_API === true
            && in_array($parts['host'] ?? '', array('localhost', '127.0.0.1'), true);
        if (!$parts || isset($parts['user'], $parts['pass']) || isset($parts['user']) || isset($parts['pass'])
            || isset($parts['query']) || isset($parts['fragment']) || !empty(trim($parts['path'] ?? '', '/'))
            || (!$local && (($parts['scheme'] ?? '') !== 'https' || (isset($parts['port']) && $parts['port'] !== 443)))
            || ($local && !in_array($parts['scheme'] ?? '', array('http', 'https'), true))
            || (!$local && !wp_http_validate_url($origin))) {
            throw new SelfX_WC_Error('API_ORIGIN_INVALID');
        }
        if (!preg_match('/^selfx_woocommerce_[A-Za-z0-9_-]{32,}$/D', $token)) {
            throw new SelfX_WC_Error('TOKEN_INVALID');
        }
        $this->origin = rtrim($origin, '/');
        $this->token = $token;
    }
    public function request(string $method, string $path, ?array $body = null): array {
        $route = explode('?', $path, 2)[0];
        if (!in_array($route, array('/api/v1/integrations/me', '/api/v1/integrations/me/credit-summary', '/api/v1/integrations/catalog/sync', '/api/v1/integrations/storefront/settings', '/api/v1/integrations/storefront/availability', '/api/v1/integrations/storefront/try-on-sessions'), true)) {
            throw new SelfX_WC_Error('API_PATH_INVALID');
        }
        $args = array('method' => $method, 'timeout' => 20, 'redirection' => 0, 'sslverify' => true,
            'limit_response_size' => 65536, 'headers' => array('Accept' => 'application/json',
            'Content-Type' => 'application/json', 'x-selfx-integration-token' => $this->token));
        if ($body !== null) {
            $args['body'] = wp_json_encode($body);
            if ($args['body'] === false || strlen($args['body']) > 750000) {
                throw new SelfX_WC_Error('CATALOG_BATCH_TOO_LARGE');
            }
        }
        $local = defined('SELFX_WC_ALLOW_LOCAL_API') && SELFX_WC_ALLOW_LOCAL_API === true
            && in_array(wp_parse_url($this->origin, PHP_URL_HOST), array('localhost', '127.0.0.1'), true);
        $response = $local ? wp_remote_request($this->origin . $path, $args) : wp_safe_remote_request($this->origin . $path, $args);
        if (is_wp_error($response)) { throw new SelfX_WC_Error('API_UNAVAILABLE'); }
        $status = wp_remote_retrieve_response_code($response);
        if ($status < 200 || $status >= 300) {
            $error = json_decode(wp_remote_retrieve_body($response), true);
            $code = $error['error']['code'] ?? '';
            // Expose only explicitly supported actionable codes, never response payloads.
            if (in_array($code, array('AUTH_VALIDATION_FAILED', 'COMMERCE_PUBLIC_URL_REQUIRED', 'STOREFRONT_RATE_LIMITED', 'SELFX_CREDITS_EXHAUSTED', 'SELFX_SUBSCRIPTION_UNAVAILABLE', 'SELFX_FEATURE_UNAVAILABLE', 'SHOPIFY_STOREFRONT_TRYON_VISITOR_LIMIT_REACHED', 'SHOPIFY_STOREFRONT_TRYON_MONTHLY_LIMIT_REACHED', 'SHOPIFY_STOREFRONT_TRYON_PRODUCT_NOT_ENABLED', 'SHOPIFY_STOREFRONT_TRYON_PRODUCT_UNAVAILABLE', 'INTEGRATION_CREDENTIAL_REVOKED', 'INTEGRATION_DISCONNECTED', 'ORGANIZATION_SUSPENDED'), true)) { throw new SelfX_WC_Error($code); }
            throw new SelfX_WC_Error('API_HTTP_' . (int) $status);
        }
        $data = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($data)) { throw new SelfX_WC_Error('API_RESPONSE_INVALID'); }
        return $data;
    }
    public static function friendly_error(string $code, bool $customer = true): string {
        $messages = array(
            'STORE_BINDING_LOCKED' => 'This website is linked to its approved SelfX Store. Reconnect to that Store or contact SelfX support about ownership.',
            'SHOPIFY_USAGE_CAP_REACHED' => 'This Store has reached its approved Shopify usage spending cap.',
            'SELFX_CREDITS_EXHAUSTED' => 'This Store has no Try-On credits available. Please try again later.',
            'SHOPIFY_STOREFRONT_TRYON_VISITOR_LIMIT_REACHED' => 'You have reached this Store\'s Try-On allowance for now. Please return after the allowance resets.',
            'SHOPIFY_STOREFRONT_TRYON_MONTHLY_LIMIT_REACHED' => 'This Store has reached its monthly Try-On allowance. Please try again later.',
            'STOREFRONT_RATE_LIMITED' => 'Try-On is busy. Please wait a minute and try again.',
            'SHOPIFY_STOREFRONT_TRYON_PRODUCT_NOT_ENABLED' => 'Try-On is not enabled for this product.',
            'SHOPIFY_STOREFRONT_TRYON_PRODUCT_UNAVAILABLE' => 'This product is currently unavailable for Try-On.',
            'LIMIT_SETTINGS_INVALID' => 'Enter whole-number limits from 0 to 1000000 and select Day, Week or Month.',
        );
        if (isset($messages[$code])) { return $messages[$code]; }
        if (in_array($code, array('API_HTTP_401', 'API_HTTP_403', 'INTEGRATION_CREDENTIAL_REVOKED', 'INTEGRATION_DISCONNECTED', 'CONNECTION_REQUIRED', 'CREDENTIALS_UNAVAILABLE', 'STOREFRONT_TOKEN_REQUIRED', 'WEBSITE_MISMATCH'), true)) {
            return $customer ? 'This Store\'s Try-On connection is unavailable. Please try again later.' : 'The SelfX connection needs attention. Verify the website binding and reconnect to the same Store.';
        }
        if (in_array($code, array('SELFX_SUBSCRIPTION_UNAVAILABLE', 'SELFX_FEATURE_UNAVAILABLE', 'ORGANIZATION_SUSPENDED'), true)) {
            return $customer ? 'Try-On is currently unavailable for this Store.' : 'Review the Store status and plan in SelfX. This action cannot reactivate a suspended Store.';
        }
        return $customer ? 'Try-On is temporarily unavailable. Please try again shortly.' : 'SelfX could not complete this action. Check the connection and Scheduled Actions, then retry.';
    }
    public function context(): array {
        $data = $this->request('GET', '/api/v1/integrations/me');
        if (($data['authenticated'] ?? false) !== true || ($data['integrationType'] ?? '') !== 'WOOCOMMERCE'
            || !in_array('catalog:sync', $data['scopes'] ?? array(), true)
            || empty($data['store']['id']) || empty($data['store']['name']) || empty($data['integrationId']) || empty($data['serverTime'])
            || strtotime($data['serverTime']) === false) { throw new SelfX_WC_Error('CONNECTION_CONTEXT_INVALID'); }
        $bound = $data['externalAccountId'] ?? '';
        if ($bound !== '' && $bound !== null && self::site($bound) !== self::site(home_url('/'))) {
            throw new SelfX_WC_Error('WEBSITE_MISMATCH');
        }
        return $data;
    }
    /** One-time plugin pairing uses its own secret, never a catalog credential. */
    public static function link_request(string $origin, string $method, string $path, ?array $body = null, string $redeem_secret = ''): array {
        if (!preg_match('#^/api/v1/public/integrations/woocommerce/link-sessions(?:/[A-Za-z0-9_-]{43}/redeem)?$#D', $path)) {
            throw new SelfX_WC_Error('API_PATH_INVALID');
        }
        $client = new self($origin, 'selfx_woocommerce_' . str_repeat('a', 43));
        $args = array('method' => $method, 'timeout' => 20, 'redirection' => 0, 'sslverify' => true,
            'limit_response_size' => 4096, 'headers' => array('Accept' => 'application/json'));
        if ($redeem_secret !== '') { $args['headers']['x-selfx-woocommerce-redeem-secret'] = $redeem_secret; }
        if ($body !== null) {
            $args['headers']['Content-Type'] = 'application/json';
            $args['body'] = wp_json_encode($body);
        }
        $local = defined('SELFX_WC_ALLOW_LOCAL_API') && SELFX_WC_ALLOW_LOCAL_API === true
            && in_array(wp_parse_url($client->origin, PHP_URL_HOST), array('localhost', '127.0.0.1'), true);
        $response = $local ? wp_remote_request($client->origin . $path, $args) : wp_safe_remote_request($client->origin . $path, $args);
        if (is_wp_error($response)) { throw new SelfX_WC_Error('API_UNAVAILABLE'); }
        $status = wp_remote_retrieve_response_code($response);
        $data = json_decode(wp_remote_retrieve_body($response), true);
        if ($status < 200 || $status >= 300) {
            $code = $data['error']['code'] ?? '';
            if (in_array($code, array('WOOCOMMERCE_LINK_PENDING', 'WOOCOMMERCE_SITE_UNVERIFIED', 'WOOCOMMERCE_SITE_ALREADY_LINKED', 'WOOCOMMERCE_STORE_ALREADY_LINKED', 'WOOCOMMERCE_LINK_INVALID'), true)) {
                throw new SelfX_WC_Error($code);
            }
            throw new SelfX_WC_Error('API_HTTP_' . (int) $status);
        }
        if (!is_array($data)) { throw new SelfX_WC_Error('API_RESPONSE_INVALID'); }
        return $data;
    }
    private static function site(string $url): string {
        $parts = wp_parse_url(str_contains($url, '://') ? $url : 'https://' . $url);
        if (!$parts || empty($parts['host']) || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])) {
            throw new SelfX_WC_Error('WEBSITE_MISMATCH');
        }
        return strtolower($parts['host']) . ':' . ($parts['port'] ?? (($parts['scheme'] ?? '') === 'http' ? 80 : 443)) . '/' . trim($parts['path'] ?? '', '/');
    }
    public static function encrypt(string $token): string {
        if (!function_exists('openssl_encrypt')) { throw new SelfX_WC_Error('ENCRYPTION_UNAVAILABLE'); }
        $iv = random_bytes(12); $tag = '';
        $cipher = openssl_encrypt($token, 'aes-256-gcm', hash('sha256', wp_salt('auth') . '|selfx-wc', true), OPENSSL_RAW_DATA, $iv, $tag);
        if ($cipher === false) { throw new SelfX_WC_Error('ENCRYPTION_UNAVAILABLE'); }
        return base64_encode($iv) . '.' . base64_encode($tag) . '.' . base64_encode($cipher);
    }
    public static function decrypt(string $value): string {
        $parts = explode('.', $value);
        if (count($parts) !== 3) { throw new SelfX_WC_Error('CREDENTIALS_UNAVAILABLE'); }
        [$iv, $tag, $cipher] = array_map(static fn($part) => base64_decode($part, true), $parts);
        if ($iv === false || $tag === false || $cipher === false || strlen($iv) !== 12 || strlen($tag) !== 16) {
            throw new SelfX_WC_Error('CREDENTIALS_UNAVAILABLE');
        }
        $token = openssl_decrypt($cipher, 'aes-256-gcm', hash('sha256', wp_salt('auth') . '|selfx-wc', true), OPENSSL_RAW_DATA, $iv, $tag);
        if ($token === false) { throw new SelfX_WC_Error('CREDENTIALS_UNAVAILABLE'); }
        return $token;
    }
}
