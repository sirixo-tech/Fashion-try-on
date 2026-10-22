-- Repair the initial intersection with retired Store ceilings. This is a
-- one-time initialization correction, never a startup/default-reset policy.
BEGIN;

-- Serialize with the role editor before inspecting timestamps and audit history.
SELECT id FROM global_store_roles ORDER BY id FOR UPDATE;

CREATE TEMP TABLE selfx_roles_to_repair ON COMMIT DROP AS
SELECT g.id, g.system_code,
  COALESCE((SELECT jsonb_agg(p.code ORDER BY p.code)
    FROM global_store_role_permissions rp JOIN permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=g.id), '[]'::jsonb) AS previous_codes
FROM global_store_roles g
WHERE g.system_code IN ('store-admin','staff')
  AND g.updated_at=g.created_at
  AND EXISTS (SELECT 1 FROM audit_logs a
    WHERE a.action='GLOBAL_STORE_ROLES_INITIALIZED'
      AND a.metadata_json->>'initialization'='intersection_of_existing_role_maps')
  AND NOT EXISTS (SELECT 1 FROM audit_logs a
    WHERE a.resource_id=g.id
      AND a.action IN ('GLOBAL_STORE_ROLE_PERMISSIONS_UPDATED','GLOBAL_STORE_ROLE_DEFAULTS_REPAIRED'));

CREATE OR REPLACE FUNCTION pg_temp.selfx_repair_role_id(input text) RETURNS uuid AS $$
 SELECT (substr(md5(input),1,8)||'-'||substr(md5(input),9,4)||'-7'||substr(md5(input),14,3)||'-8'||substr(md5(input),18,3)||'-'||substr(md5(input),21,12))::uuid;
$$ LANGUAGE SQL IMMUTABLE;

-- Store Admin starts with Store administration/operations. Staff starts with
-- daily operations. Neither list is a permission ceiling for future edits.
INSERT INTO global_store_role_permissions(id,role_id,permission_id)
SELECT pg_temp.selfx_repair_role_id('store-role-default-repair:'||r.id::text||':'||p.code),r.id,p.id
FROM selfx_roles_to_repair r CROSS JOIN permissions p
WHERE p.applicability IN ('STORE','BOTH')
  AND p.code IN ('stores.view','stores.update','products.manage',
    'users.view','users.invite','users.update','users.deactivate','roles.view','roles.assign',
    'kiosks.view','kiosks.pair','kiosks.update','kiosks.assign','kiosks.configure','kiosks.revoke',
    'analytics.view','integrations.view','integrations.manage','tryon.garment_preview')
  AND (r.system_code='store-admin' OR p.code IN ('stores.view','products.manage',
    'kiosks.view','kiosks.configure','kiosks.update','analytics.view','tryon.garment_preview'))
ON CONFLICT(role_id,permission_id) DO NOTHING;

UPDATE global_store_roles g
SET updated_at=GREATEST(clock_timestamp(),g.updated_at+INTERVAL '1 millisecond'),
  description=CASE WHEN g.system_code='staff'
    THEN 'Store permissions configured by authorized Platform role managers.'
    ELSE g.description END
FROM selfx_roles_to_repair r WHERE g.id=r.id;

INSERT INTO audit_logs(id,action,resource_type,resource_id,metadata_json)
SELECT pg_temp.selfx_repair_role_id('store-role-default-repair-audit:'||r.id::text),
  'GLOBAL_STORE_ROLE_DEFAULTS_REPAIRED','global_store_role',r.id,
  jsonb_build_object('scope','ALL_STORES','system_code',r.system_code,
    'reason','repair_untouched_initial_intersection',
    'previous_permission_codes',r.previous_codes,
    'permission_codes',(SELECT jsonb_agg(p.code ORDER BY p.code)
      FROM global_store_role_permissions rp JOIN permissions p ON p.id=rp.permission_id
      WHERE rp.role_id=r.id))
FROM selfx_roles_to_repair r;
COMMIT;
