CREATE TABLE IF NOT EXISTS wb.schema_users (
  schema_id integer REFERENCES wb.schemas(id) NOT NULL,
  user_id bigint REFERENCES wb.users(id) NOT NULL,
  role_id integer REFERENCES wb.roles(id) NOT NULL,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (schema_id, user_id, role_id)
);