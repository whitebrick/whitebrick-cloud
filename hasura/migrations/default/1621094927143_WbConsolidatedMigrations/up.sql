

CREATE SCHEMA wb;

CREATE TABLE IF NOT EXISTS wb.tenants(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
);

CREATE INDEX idx_wb_tenants_name ON wb.tenants(name);
ALTER SEQUENCE wb.tenants_id_seq RESTART WITH 101;

CREATE TABLE IF NOT EXISTS wb.users(
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
);

CREATE INDEX idx_wb_users_email ON wb.users(email);
ALTER SEQUENCE wb.users_id_seq RESTART WITH 30001;

CREATE TABLE IF NOT EXISTS wb.roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_wb_roles_name ON wb.roles(name);

CREATE TABLE IF NOT EXISTS wb.tenant_users (
  tenant_id integer REFERENCES wb.tenants(id) NOT NULL,
  user_id bigint REFERENCES wb.users(id) NOT NULL,
  role_id integer REFERENCES wb.roles(id) NOT NULL,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (tenant_id, user_id, role_id)
);

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

CREATE TABLE IF NOT EXISTS wb.schema_users (
  schema_id integer REFERENCES wb.schemas(id) NOT NULL,
  user_id bigint REFERENCES wb.users(id) NOT NULL,
  role_id integer REFERENCES wb.roles(id) NOT NULL,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (schema_id, user_id, role_id)
);

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
