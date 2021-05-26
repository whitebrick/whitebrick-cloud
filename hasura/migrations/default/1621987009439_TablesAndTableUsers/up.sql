CREATE TABLE IF NOT EXISTS wb.tables(
  id BIGSERIAL PRIMARY KEY,
  schema_id BIGSERIAL REFERENCES wb.schemas(id) NOT NULL,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  UNIQUE (schema_id, name)
);

CREATE TABLE IF NOT EXISTS wb.table_users(
  table_id bigint REFERENCES wb.tables(id) NOT NULL,
  user_id bigint REFERENCES wb.users(id) NOT NULL,
  role_id integer REFERENCES wb.roles(id) NOT NULL,
  settings jsonb,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (table_id, user_id, role_id)
);