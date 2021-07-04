SELECT
wb.organizations.name AS organization_name,
wb.users.email AS user_email,
wb.roles.name AS role,
implied_roles.name AS implied_role
FROM wb.organization_users
JOIN wb.organizations ON wb.organization_users.organization_id=wb.organizations.id
JOIN wb.users ON wb.organization_users.user_id=wb.users.id
JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
LEFT JOIN wb.roles implied_roles ON wb.organization_users.implied_from_role_id=implied_roles.id;

SELECT
wb.schemas.name AS schema_name,
wb.users.email AS user_email,
wb.roles.name AS role,
implied_roles.name AS implied_role
FROM wb.schema_users
JOIN wb.schemas ON wb.schema_users.schema_id=wb.schemas.id
JOIN wb.users ON wb.schema_users.user_id=wb.users.id
JOIN wb.roles ON wb.schema_users.role_id=wb.roles.id
LEFT JOIN wb.roles implied_roles ON wb.schema_users.implied_from_role_id=implied_roles.id;