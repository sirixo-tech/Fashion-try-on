BEGIN;
CREATE TABLE global_store_roles (
  id UUID PRIMARY KEY,
  system_code VARCHAR(80) NOT NULL UNIQUE CHECK (system_code IN ('store-admin','staff')),
  name VARCHAR(120) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(3) NOT NULL
);
CREATE TABLE global_store_role_permissions (
  id UUID PRIMARY KEY,
  role_id UUID NOT NULL REFERENCES global_store_roles(id) ON DELETE CASCADE ON UPDATE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE RESTRICT ON UPDATE CASCADE,
  created_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(role_id,permission_id)
);
CREATE INDEX global_store_role_permissions_permission_id_idx ON global_store_role_permissions(permission_id);
CREATE FUNCTION pg_temp.selfx_global_role_id(input text) RETURNS uuid AS $$
 SELECT (substr(md5(input),1,8)||'-'||substr(md5(input),9,4)||'-7'||substr(md5(input),14,3)||'-8'||substr(md5(input),18,3)||'-'||substr(md5(input),21,12))::uuid;
$$ LANGUAGE SQL IMMUTABLE;
-- This capability previously entered the registry lazily, so clean databases
-- need the definition before the initial shared maps are seeded.
INSERT INTO permissions(id,code,module,action,label,description,is_system,applicability,updated_at)
VALUES(pg_temp.selfx_global_role_id('permission:tryon.garment_preview'),'tryon.garment_preview','tryon','garment_preview','Captured Garment Preview','Allow captured garment extraction preview.',true,'STORE',NOW())
ON CONFLICT(code) DO NOTHING;
INSERT INTO global_store_roles(id,system_code,name,description,updated_at) VALUES
 (pg_temp.selfx_global_role_id('global-store-admin'),'store-admin','Store Admin','Store administration permissions shared across all Stores.',NOW()),
 (pg_temp.selfx_global_role_id('global-store-staff'),'staff','Store Staff','Daily operational permissions shared across all Stores.',NOW());

-- Preserve revocations conservatively: use the intersection of existing maps,
-- never the union or one arbitrarily selected Store. Empty maps stay empty.
-- If no tenant roles exist, use the approved initial permission baseline.
INSERT INTO global_store_role_permissions(id,role_id,permission_id)
SELECT pg_temp.selfx_global_role_id(g.id::text||':'||p.id::text),g.id,p.id
FROM global_store_roles g CROSS JOIN permissions p
WHERE p.applicability IN ('STORE','BOTH')
AND (g.system_code<>'staff' OR p.code IN ('stores.view','products.manage','kiosks.view','kiosks.configure','kiosks.update','analytics.view','tryon.garment_preview'))
AND (
 (EXISTS(SELECT 1 FROM store_roles r WHERE r.system_code=g.system_code)
  AND NOT EXISTS(SELECT 1 FROM store_roles r WHERE r.system_code=g.system_code AND (
    NOT EXISTS(SELECT 1 FROM store_role_permissions rp WHERE rp.role_id=r.id AND rp.permission_id=p.id)
    OR NOT EXISTS(SELECT 1 FROM store_permission_grants pg WHERE pg.store_tenant_id=r.organization_id AND pg.permission_id=p.id))))
 OR
 (NOT EXISTS(SELECT 1 FROM store_roles r WHERE r.system_code=g.system_code)
  AND (g.system_code='staff' OR p.code IN ('stores.view','stores.update','products.manage','users.view','users.invite','users.update','users.deactivate','roles.view','roles.assign','kiosks.view','kiosks.pair','kiosks.update','kiosks.assign','kiosks.configure','kiosks.revoke','analytics.view','integrations.view','integrations.manage','tryon.garment_preview','developer_api.view','developer_api.manage')))
);
INSERT INTO audit_logs(id,action,resource_type,metadata_json)
VALUES(pg_temp.selfx_global_role_id('global-store-role-migration'),'GLOBAL_STORE_ROLES_INITIALIZED','global_store_role',
 '{"initialization":"intersection_of_existing_role_maps","tenant_assignments_preserved":true}'::jsonb);
COMMIT;
