BEGIN;

-- Recover only the latest explicitly approved identity erased by the old
-- uninstall handler. Never reclaim archived/redacted or subsequently reassigned
-- shops, issue credentials, activate a plan, or grant another trial.
WITH last_approval AS (
  SELECT DISTINCT ON (organization_id)
    organization_id, metadata_json->>'external_account_id' AS account_id,
    metadata_json->>'shop_domain' AS shop_domain, created_at, id AS approval_id
  FROM audit_logs
  WHERE action = 'SHOPIFY_LINK_SESSION_APPROVED'
    AND metadata_json->>'external_account_id' ~ '^gid://shopify/Shop/[0-9]+$'
    AND metadata_json->>'shop_domain' ~ '^[a-z0-9][a-z0-9-]*\.myshopify\.com$'
  ORDER BY organization_id, created_at DESC, id DESC
), last_uninstall AS (
  SELECT DISTINCT ON (resource_id) resource_id, created_at
  FROM audit_logs
  WHERE action = 'SHOPIFY_APP_UNINSTALLED' AND resource_type = 'integration'
  ORDER BY resource_id, created_at DESC, id DESC
)
UPDATE integrations i SET
  external_account_id = a.account_id,
  metadata_json = jsonb_build_object('shopDomain', a.shop_domain,
    'connectionMode', 'SHOPIFY_APP', 'uninstalledAt', u.created_at,
    'recoveredUninstallBinding', true)
FROM last_approval a, last_uninstall u, organizations o
WHERE i.organization_id = a.organization_id AND i.id = u.resource_id
  AND o.id = i.organization_id AND o.status = 'ACTIVE'
  AND i.type = 'SHOPIFY' AND i.status = 'DISCONNECTED'
  AND i.external_account_id IS NULL
  AND COALESCE(i.metadata_json->>'privacyStatus', '') <> 'REDACTED'
  AND a.created_at <= u.created_at
  AND i.disconnected_at BETWEEN u.created_at - INTERVAL '10 minutes' AND u.created_at
  AND NOT EXISTS (SELECT 1 FROM audit_logs newer
    WHERE newer.action = 'SHOPIFY_LINK_SESSION_APPROVED'
      AND (newer.metadata_json->>'external_account_id' = a.account_id OR newer.metadata_json->>'shop_domain' = a.shop_domain)
      AND (newer.created_at > a.created_at OR (newer.created_at = a.created_at AND newer.id > a.approval_id)))
  AND NOT EXISTS (SELECT 1 FROM integrations other
    WHERE other.id <> i.id AND other.type = 'SHOPIFY'
      AND (other.external_account_id = a.account_id
        OR other.metadata_json->>'shopDomain' = a.shop_domain));

-- An unchanged Shopify product must be importable again after reconnect.
UPDATE external_product_mappings m SET external_updated_at = NULL
FROM integrations i WHERE m.integration_id = i.id AND m.status = 'ARCHIVED'
  AND i.type = 'SHOPIFY' AND i.status = 'DISCONNECTED'
  AND i.metadata_json->>'recoveredUninstallBinding' = 'true';

COMMIT;
