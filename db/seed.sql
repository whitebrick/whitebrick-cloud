INSERT INTO wb.users(id, email, first_name, last_name) VALUES
  (1, 'HASURA_ADMIN@example.com', 'HASURA_ADMIN', 'HASURA_ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO wb.roles(name, syscode, label) VALUES
  ('organization_administrator', 'oa', 'Organization Administrator'),
  ('organization_user',          'ou', 'Organization User'),
  ('organization_external_user', 'oe', 'Organization External User'),
  ('schema_owner',               'so', 'DB Owner'),
  ('schema_administrator',       'sa', 'DB Administrator'),
  ('schema_manager',             'sm', 'DB Manager'),
  ('schema_editor',              'se', 'DB Editor'),
  ('schema_reader',              'sr', 'DB Reader'),
  ('table_inherit',              'ti', 'Inherit Table Role From DB'),
  ('table_administrator',        'ta', 'Table Administrator'),
  ('table_manager',              'tm', 'Table Manager'),
  ('table_editor',               'te', 'Table Editor'),
  ('table_reader',               'tr', 'Table Reader')
ON CONFLICT DO NOTHING;