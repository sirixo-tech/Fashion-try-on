<?php
defined('ABSPATH') || exit;

/** Commerce reference data only: never changes price, stock, checkout or SelfX VTO flags. */
final class SelfX_WC_Product {
    public static function timestamp(int $milliseconds): string {
        return gmdate('Y-m-d\TH:i:s', intdiv($milliseconds, 1000)) . sprintf('.%03dZ', $milliseconds % 1000);
    }
    private static function text($value, int $length): string {
        $text = trim(wp_strip_all_tags((string) $value));
        return function_exists('mb_substr') ? mb_substr($text, 0, $length) : substr($text, 0, $length);
    }
    private static function image(int $id): ?string {
        $url = $id ? wp_get_attachment_image_url($id, 'full') : false;
        return $url && strlen($url) <= 2048 ? $url : null;
    }
    public static function public_url(string $url): string {
        $parts = wp_parse_url($url); $host = strtolower($parts['host'] ?? '');
        if (!$parts || !in_array($parts['scheme'] ?? '', array('https', 'http'), true) || isset($parts['user']) || isset($parts['pass'])
            || !str_contains($host, '.') || preg_match('/\.(local|localhost|internal)$/D', $host)
            || (filter_var($host, FILTER_VALIDATE_IP) && !filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE))
            || !wp_http_validate_url($url)) { throw new SelfX_WC_Error('PUBLIC_CATALOG_URL_REQUIRED'); }
        return $url;
    }
    public static function normalize($product, int $revision = 0): array {
        $modified = $product->get_date_modified('edit') ?: $product->get_date_created('edit');
        $source = max($revision, $modified ? $modified->getTimestamp() * 1000 : 0);
        if ($source <= 0) { throw new SelfX_WC_Error('PRODUCT_DATE_INVALID'); }
        $id = (string) $product->get_id();
        if (in_array($product->get_status('edit'), array('trash', 'auto-draft'), true)) {
            return array('externalProductId' => $id, 'status' => 'ARCHIVED', 'sourceUpdatedAt' => self::timestamp($source));
        }
        $image = self::image((int) $product->get_image_id('edit'));
        if (!$image) { foreach ($product->get_gallery_image_ids('edit') as $image_id) { $image = self::image((int) $image_id); if ($image) { break; } } }
        $url = $product->get_permalink();
        if (strlen($url) > 2048) { throw new SelfX_WC_Error('PRODUCT_URL_TOO_LONG'); }
        self::public_url($url); if ($image) { self::public_url($image); }
        return array('externalProductId' => $id, 'title' => self::text($product->get_name('edit'), 180),
            'handle' => self::text($product->get_slug('edit'), 220), 'description' => self::text($product->get_description('edit'), 5000),
            'status' => ($product->is_type('simple') || $product->is_type('variable')) && $product->get_status('edit') === 'publish'
                && !get_post_field('post_password', $product->get_id()) && $product->get_catalog_visibility('edit') !== 'hidden' ? 'ACTIVE' : 'DRAFT',
            'sourceUpdatedAt' => self::timestamp($source), 'productUrl' => $url, 'featuredImageUrl' => $image);
    }
}
