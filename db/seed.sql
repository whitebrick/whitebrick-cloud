INSERT INTO wb.roles(name, label) VALUES
  ('tenant_user','Organization User'),
  ('tenant_admin','Organization Admin')
ON CONFLICT DO NOTHING;