INSERT INTO wb.roles(name) VALUES
  ('Organization User'),
  ('Organization Admin')
ON CONFLICT DO NOTHING;