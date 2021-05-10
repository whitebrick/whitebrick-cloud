INSERT INTO wb.roles(name, label) VALUES
  ('tenant_user','Organization User'),
  ('tenant_admin','Organization Admin'),
  ('schema_owner','DB Owner'),
  ('schema_administrator', 'DB Administrator'),
  ('schema_editor', 'DB Editor'),
  ('schema_commenter', 'DB Commenter'),
  ('schema_reader', 'DB Reader')
ON CONFLICT DO NOTHING;