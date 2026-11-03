BEGIN;

CREATE FUNCTION pg_temp.selfx_developer_role_id(input text) RETURNS uuid AS $$
 SELECT (substr(md5(input),1,8)||'-'||substr(md5(input),9,4)||'-7'||substr(md5(input),14,3)||'-8'||substr(md5(input),18,3)||'-'||substr(md5(input),21,12))::uuid;
$$ LANGUAGE SQL IMMUTABLE;

INSERT INTO permissions(id,code,module,action,label,description,is_system,applicability,updated_at)
VALUES
 (pg_temp.selfx_developer_role_id('permission:developer_api.view'),'developer_api.view','developer_api','view','View Developer API','View Store API keys, usage and webhook configuration.',true,'STORE',NOW()),
 (pg_temp.selfx_developer_role_id('permission:developer_api.manage'),'developer_api.manage','developer_api','manage','Manage Developer API','Create and revoke Store API keys and manage webhooks.',true,'STORE',NOW())
ON CONFLICT(code) DO UPDATE SET module=EXCLUDED.module,action=EXCLUDED.action,label=EXCLUDED.label,description=EXCLUDED.description,applicability='STORE',updated_at=NOW();

-- Keep existing application-wide maps, while assigning the new module defaults
-- according to the approved Store roles: admins manage, staff view.
INSERT INTO global_store_role_permissions(id,role_id,permission_id)
SELECT pg_temp.selfx_developer_role_id(g.system_code||':'||p.code),g.id,p.id
FROM global_store_roles g CROSS JOIN permissions p
WHERE p.code='developer_api.view' AND g.system_code IN ('store-admin','staff')
ON CONFLICT(role_id,permission_id) DO NOTHING;
INSERT INTO global_store_role_permissions(id,role_id,permission_id)
SELECT pg_temp.selfx_developer_role_id(g.system_code||':'||p.code),g.id,p.id
FROM global_store_roles g CROSS JOIN permissions p
WHERE p.code='developer_api.manage' AND g.system_code='store-admin'
ON CONFLICT(role_id,permission_id) DO NOTHING;

COMMIT;
