-- An unchanged commerce product must be importable again after its Store is
-- restored and the merchant reconnects the source integration.
UPDATE external_product_mappings AS mapping
SET external_updated_at = NULL
FROM organizations AS store
WHERE mapping.organization_id = store.id
  AND store.status = 'ARCHIVED';
