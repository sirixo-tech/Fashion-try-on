-- Bring Stores archived before the archive cleanup into the same disconnected
-- state. Shopify identities must be free before another Store can link them.
BEGIN;

DELETE FROM integration_provider_credentials AS credential
USING organizations AS store
WHERE credential.organization_id = store.id
  AND store.status = 'ARCHIVED';

DELETE FROM integration_oauth_states AS oauth
USING organizations AS store
WHERE oauth.organization_id = store.id
  AND store.status = 'ARCHIVED'
  AND oauth.consumed_at IS NULL;

DELETE FROM shopify_link_sessions AS session
USING organizations AS store
WHERE session.organization_id = store.id
  AND store.status = 'ARCHIVED'
  AND session.redeemed_at IS NULL;

UPDATE integration_credentials AS credential
SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP
FROM organizations AS store
WHERE credential.organization_id = store.id
  AND store.status = 'ARCHIVED'
  AND credential.status = 'ACTIVE';

UPDATE products AS product
SET active = FALSE
FROM external_product_mappings AS mapping, organizations AS store
WHERE mapping.product_id = product.id
  AND mapping.organization_id = store.id
  AND product.organization_id = store.id
  AND mapping.external_variant_id IS NULL
  AND store.status = 'ARCHIVED';

UPDATE external_product_mappings AS mapping
SET status = 'ARCHIVED'
FROM organizations AS store
WHERE mapping.organization_id = store.id
  AND store.status = 'ARCHIVED';

UPDATE integrations AS integration
SET status = 'DISCONNECTED',
    external_account_id = NULL,
    external_account_name = NULL,
    metadata_json = NULL,
    disconnected_at = CURRENT_TIMESTAMP
FROM organizations AS store
WHERE integration.organization_id = store.id
  AND store.status = 'ARCHIVED';

COMMIT;
