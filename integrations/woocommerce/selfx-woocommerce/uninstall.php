<?php
defined('WP_UNINSTALL_PLUGIN') || exit;
require_once __DIR__ . '/includes/class-selfx-wc-client.php';
require_once __DIR__ . '/includes/class-selfx-wc-product.php';
require_once __DIR__ . '/includes/class-selfx-wc-plugin.php';
SelfX_WC_Plugin::unschedule();
SelfX_WC_Plugin::clear_dirty();
foreach (array(SelfX_WC_Plugin::CONFIG, SelfX_WC_Plugin::STATE, 'selfx_wc_reconcile_needed', 'selfx_wc_worker_lock') as $option) { delete_option($option); }
delete_post_meta_by_key('_selfx_wc_revision');
