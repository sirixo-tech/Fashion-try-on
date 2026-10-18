-- Preserve legacy enum values for compatibility. Only five business roles remain.
BEGIN;
CREATE FUNCTION pg_temp.selfx_role_id(input text) RETURNS uuid AS $$
 SELECT (substr(md5(input),1,8)||'-'||substr(md5(input),9,4)||'-7'||substr(md5(input),14,3)||'-8'||substr(md5(input),18,3)||'-'||substr(md5(input),21,12))::uuid;
$$ LANGUAGE SQL IMMUTABLE;
-- Free canonical names held by legacy/custom roles before restoring built-ins.
UPDATE store_roles SET name='Retired role '||id::text,updated_at=NOW()
WHERE name IN ('Store Admin','Staff') AND
  (system_code IS NULL OR (name='Store Admin' AND system_code<>'store-admin') OR (name='Staff' AND system_code<>'staff'));
UPDATE platform_roles SET name='Retired role '||id::text,updated_at=NOW()
WHERE name IN ('Platform Admin','Platform Staff') AND
  (system_code IS NULL OR (name='Platform Admin' AND system_code<>'platform-staff-admin') OR (name='Platform Staff' AND system_code<>'platform-support-admin'));
INSERT INTO permissions(id,code,module,action,label,description,is_system,applicability,updated_at) VALUES(pg_temp.selfx_role_id('permission:products.manage'),'products.manage','products','manage','Manage products and stock','Manage catalog products and stock without Store administration',true,'STORE',NOW()) ON CONFLICT(code) DO NOTHING;
INSERT INTO store_permission_grants(id,store_tenant_id,permission_id)
SELECT pg_temp.selfx_role_id('product-grant:'||g.store_tenant_id::text),g.store_tenant_id,p.id FROM store_permission_grants g JOIN permissions old ON old.id=g.permission_id CROSS JOIN permissions p WHERE old.code='stores.update' AND p.code='products.manage' ON CONFLICT DO NOTHING;

INSERT INTO store_roles(id,organization_id,system_code,name,is_system,is_active,updated_at)
SELECT pg_temp.selfx_role_id('five-role:'||o.id::text||':'||r.code), o.id, r.code, r.name, true,true,NOW()
FROM organizations o CROSS JOIN (VALUES ('store-admin','Store Admin'),('staff','Staff')) r(code,name)
ON CONFLICT (organization_id,system_code) DO UPDATE SET name=EXCLUDED.name,is_system=true,is_active=true,updated_at=NOW();

-- Admin/owner links remain administrative; all manager/viewer/custom links
-- become Staff without inheriting custom administrative permission maps.
INSERT INTO store_membership_roles(id,organization_id,membership_id,role_id)
SELECT pg_temp.selfx_role_id('five-membership:'||m.id::text),m.organization_id,m.id,r.id
FROM organization_memberships m JOIN store_roles r ON r.organization_id=m.organization_id AND r.system_code=CASE
 WHEN m.role::text IN ('ORGANIZATION_OWNER','ORGANIZATION_ADMIN','STORE_OWNER') OR EXISTS(SELECT 1 FROM store_membership_roles mr JOIN store_roles old ON old.id=mr.role_id WHERE mr.membership_id=m.id AND old.system_code='store-admin') THEN 'store-admin' ELSE 'staff' END
ON CONFLICT (membership_id,role_id) DO NOTHING;
DELETE FROM store_membership_roles mr USING store_roles r WHERE mr.role_id=r.id AND (r.system_code IS NULL OR r.system_code NOT IN ('store-admin','staff'));
-- Avoid users appearing as both Store Admin and Staff after consolidation.
DELETE FROM store_membership_roles mr USING store_roles r WHERE mr.role_id=r.id AND r.system_code='staff' AND EXISTS(SELECT 1 FROM store_membership_roles ar JOIN store_roles a ON a.id=ar.role_id WHERE ar.membership_id=mr.membership_id AND a.system_code='store-admin');
UPDATE store_roles SET is_active=false,updated_at=NOW() WHERE system_code IS NULL OR system_code NOT IN ('store-admin','staff');
DELETE FROM store_role_permissions rp USING store_roles r WHERE rp.role_id=r.id AND r.system_code='staff';
INSERT INTO store_role_permissions(id,role_id,permission_id)
SELECT pg_temp.selfx_role_id('five-staff-permission:'||r.id::text||':'||p.id::text),r.id,p.id FROM store_roles r CROSS JOIN permissions p WHERE r.system_code='staff' AND p.code IN ('stores.view','products.manage','kiosks.view','kiosks.configure','kiosks.update','analytics.view','tryon.garment_preview') ON CONFLICT DO NOTHING;

INSERT INTO platform_roles(id,system_code,name,is_system,is_active,updated_at) VALUES
 (pg_temp.selfx_role_id('five-platform-admin'),'platform-staff-admin','Platform Admin',true,true,NOW()),
 (pg_temp.selfx_role_id('five-platform-staff'),'platform-support-admin','Platform Staff',true,true,NOW())
ON CONFLICT(system_code) DO UPDATE SET name=EXCLUDED.name,is_active=true,is_system=true,updated_at=NOW();
-- Newly created Platform Staff must be usable immediately after conversion.
INSERT INTO platform_role_permissions(id,role_id,permission_id)
SELECT pg_temp.selfx_role_id('five-platform-staff-permission:'||r.id::text||':'||p.id::text),r.id,p.id
FROM platform_roles r CROSS JOIN permissions p
WHERE r.system_code='platform-support-admin' AND p.code IN ('ORGANIZATION_APPLICATION_REVIEW','STORE_IMPERSONATION') ON CONFLICT DO NOTHING;
INSERT INTO platform_user_roles(id,user_id,role_id,status,updated_at)
SELECT pg_temp.selfx_role_id('five-platform-user:'||a.user_id::text),a.user_id,r.id,'ACTIVE'::"PlatformRoleAssignmentStatus",NOW()
FROM platform_user_roles a JOIN platform_roles old ON old.id=a.role_id CROSS JOIN platform_roles r
WHERE a.status='ACTIVE' AND (old.system_code IS NULL OR old.system_code NOT IN ('platform-staff-admin','platform-support-admin')) AND r.system_code='platform-support-admin'
ON CONFLICT(user_id,role_id) DO UPDATE SET status='ACTIVE',revoked_at=NULL,updated_at=NOW();
UPDATE platform_user_roles a SET status='REVOKED',revoked_at=NOW() FROM platform_roles r WHERE a.role_id=r.id AND (r.system_code IS NULL OR r.system_code NOT IN ('platform-staff-admin','platform-support-admin'));
UPDATE platform_roles SET is_active=false,updated_at=NOW() WHERE system_code IS NULL OR system_code NOT IN ('platform-staff-admin','platform-support-admin');
INSERT INTO audit_logs(id,action,resource_type,metadata_json) VALUES(pg_temp.selfx_role_id('five-roles-migration'),'USER_ROLES_CONSOLIDATED','role_policy','{"store_roles":["Store Admin","Staff"],"platform_roles":["Superadmin","Admin","Staff"],"legacy_values_retained":true}'::jsonb);
COMMIT;
