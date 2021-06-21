INSERT INTO wb.users(id, email, first_name, last_name) VALUES
  (1, 'HASURA_ADMIN@example.com', 'HASURA_ADMIN', 'HASURA_ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO wb.roles(name, custom, label) VALUES
  ('organization_administrator', false, 'Organization Administrator'),
  ('organization_user',          false, 'Organization User'),
  ('organization_external_user', false, 'Organization External User'),
  ('schema_owner',               false, 'DB Owner'),
  ('schema_administrator',       false, 'DB Administrator'),
  ('schema_manager',             false, 'DB Manager'),
  ('schema_editor',              false, 'DB Editor'),
  ('schema_reader',              false, 'DB Reader'),
  ('table_inherit',              false, 'Inherit Table Role From DB'),
  ('table_administrator',        false, 'Table Administrator'),
  ('table_manager',              false, 'Table Manager'),
  ('table_editor',               false, 'Table Editor'),
  ('table_reader',               false, 'Table Reader')
ON CONFLICT DO NOTHING;