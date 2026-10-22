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
        if (!in_array($path, array('/api/v1/integrations/me', '/api/v1/integrations/catalog/sync'), true)) {
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
        if ($status < 200 || $status >= 300) { throw new SelfX_WC_Error('API_HTTP_' . (int) $status); }
        $data = json_decode(wp_remote_retrieve_body($response), true);
        if (!is_array($data)) { throw new SelfX_WC_Error('API_RESPONSE_INVALID'); }
        return $data;
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
