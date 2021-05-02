CREATE TABLE IF NOT EXISTS wb.schemas(
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  tenant_owner_id integer REFERENCES wb.tenants(id),
  user_owner_id bigint REFERENCES wb.users(id),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
);

ALTER SEQUENCE wb.schemas_id_seq RESTART WITH 60001;
CREATE INDEX idx_wb_schemas_name ON wb.schemas(name);


-- CREATE TABLE IF NOT EXISTS wb.tables(
--   id BIGSERIAL PRIMARY KEY,
--   name TEXT NOT NULL UNIQUE,
--   label TEXT NOT NULL,
--   created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
--   updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
-- );

-- ALTER SEQUENCE wb.schemas_id_seq RESTART WITH 90001;
-- CREATE INDEX idx_wb_schemas_name ON wb.schemas(name);

-- CREATE TABLE IF NOT EXISTS wb.table_users (
--   schema_id integer REFERENCES schemas(id) NOT NULL,
--   user_id bigint REFERENCES wb.users(id) NOT NULL,
--   role_id integer REFERENCES wb.roles(id) NOT NULL,
--   created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
--   updated_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
--   PRIMARY KEY (schema_id, user_id, role_id)
-- );