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
    public static function money($value): ?int {
        if ($value === '' || $value === null) { return null; }
        if (!preg_match('/^(\d{1,9})(?:\.(\d+))?$/D', (string) $value, $match)) { throw new SelfX_WC_Error('PRODUCT_PRICE_INVALID'); }
        $fraction = str_pad($match[2] ?? '', 3, '0');
        $result = (int) $match[1] * 100 + (int) substr($fraction, 0, 2) + ((int) $fraction[2] >= 5 ? 1 : 0);
        if ($result > 100000000) { throw new SelfX_WC_Error('PRODUCT_PRICE_TOO_LARGE'); }
        return $result;
    }
    private static function image(int $id): ?string {
        $url = $id ? wp_get_attachment_image_url($id, 'full') : false;
        return $url && strlen($url) <= 2048 ? $url : null;
    }
    public static function normalize($product, int $revision = 0): array {
        if ((int) wc_get_price_decimals() !== 2) { throw new SelfX_WC_Error('CURRENCY_DECIMALS_UNSUPPORTED'); }
        $currency = strtoupper(get_woocommerce_currency());
        if (!preg_match('/^[A-Z]{3}$/D', $currency)) { throw new SelfX_WC_Error('CURRENCY_INVALID'); }
        $modified = $product->get_date_modified('edit') ?: $product->get_date_created('edit');
        $source = max($revision, $modified ? $modified->getTimestamp() * 1000 : 0);
        if ($source <= 0) { throw new SelfX_WC_Error('PRODUCT_DATE_INVALID'); }
        $id = (string) $product->get_id();
        if (in_array($product->get_status('edit'), array('trash', 'auto-draft'), true)) {
            return array('externalProductId' => $id, 'status' => 'ARCHIVED', 'sourceUpdatedAt' => self::timestamp($source));
        }
        // Grouped/external products need a separate compatibility decision.
        $supported = $product->is_type('simple') || $product->is_type('variable');
        $image = self::image((int) $product->get_image_id('edit'));
        if (!$image) {
            foreach ($product->get_gallery_image_ids('edit') as $image_id) { $image = self::image((int) $image_id); if ($image) { break; } }
        }
        $variants = array();
        $children = $product->is_type('variable') ? $product->get_children() : array($product->get_id());
        if (count($children) > 2048) { throw new SelfX_WC_Error('PRODUCT_VARIANT_LIMIT_EXCEEDED'); }
        foreach ($children as $child_id) {
            $variant = $product->is_type('variable') ? wc_get_product($child_id) : $product;
            if (!$variant) { throw new SelfX_WC_Error('VARIANT_UNAVAILABLE'); }
            $variant_modified = $variant->get_date_modified('edit');
            if ($variant_modified) { $source = max($source, $variant_modified->getTimestamp() * 1000); }
            $size = null; $color = null; $labels = array();
            if ($variant->is_type('variation')) {
                foreach ($variant->get_attributes('edit') as $attribute => $value) {
                    $display = (string) $value;
                    if (taxonomy_exists($attribute)) { $term = get_term_by('slug', $value, $attribute); if ($term && !is_wp_error($term)) { $display = $term->name; } }
                    $key = strtolower(str_replace(array('attribute_', 'pa_'), '', $attribute));
                    if ($key === 'size') { $size = self::text($display, 80); }
                    if (in_array($key, array('color', 'colour'), true)) { $color = self::text($display, 80); }
                    $labels[] = self::text(wc_attribute_label($attribute) . ': ' . ($display === '' ? 'Any' : $display), 120);
                }
            }
            $variants[] = array('externalVariantId' => (string) $variant->get_id(), 'sku' => self::text($variant->get_sku('edit'), 120),
                'title' => self::text(implode(' / ', $labels) ?: 'Standard', 180), 'size' => $size, 'color' => $color,
                'priceAmountCents' => self::money($variant->get_price('edit')), 'priceCurrency' => $currency,
                'imageUrl' => self::image((int) $variant->get_image_id('edit')) ?: $image,
                'available' => $variant->get_status('edit') === 'publish' && $variant->is_in_stock() && $variant->is_purchasable());
        }
        $prices = array_values(array_filter(array_column($variants, 'priceAmountCents'), static fn($value) => $value !== null));
        $url = $product->get_permalink();
        if (strlen($url) > 2048) { throw new SelfX_WC_Error('PRODUCT_URL_TOO_LONG'); }
        return array('externalProductId' => $id, 'title' => self::text($product->get_name('edit'), 180),
            'handle' => self::text($product->get_slug('edit'), 220), 'description' => self::text($product->get_description('edit'), 5000),
            'status' => $supported && $product->get_status('edit') === 'publish' && !get_post_field('post_password', $product->get_id())
                && $product->get_catalog_visibility('edit') !== 'hidden' ? 'ACTIVE' : 'DRAFT',
            'sourceUpdatedAt' => self::timestamp($source), 'productUrl' => $url, 'featuredImageUrl' => $image,
            'priceAmountCents' => $prices ? min($prices) : null, 'priceCurrency' => $currency, 'variants' => $variants);
    }
}
