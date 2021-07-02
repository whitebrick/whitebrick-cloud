
CREATE SCHEMA wb;

CREATE TABLE IF NOT EXISTS wb.organizations(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
);

CREATE INDEX idx_wb_organizations_name ON wb.organizations(name);
ALTER SEQUENCE wb.organizations_id_seq RESTART WITH 101;

CREATE TABLE IF NOT EXISTS wb.users(
  id BIGSERIAL PRIMARY KEY,
  auth_id TEXT UNIQUE,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
);

CREATE INDEX idx_wb_users_auth_id ON wb.users(auth_id);
CREATE INDEX idx_wb_users_email ON wb.users(email);
ALTER SEQUENCE wb.users_id_seq RESTART WITH 20001;

CREATE TABLE IF NOT EXISTS wb.roles (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  custom BOOLEAN DEFAULT false,
  label TEXT,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now())
);

CREATE INDEX idx_wb_roles_name ON wb.roles(name);
-- Create a partial index because only a small fraction of the table has the value false
CREATE INDEX idx_wb_roles_custom ON wb.roles((1)) WHERE wb.roles.custom;

CREATE TABLE IF NOT EXISTS wb.organization_users (
  organization_id INTEGER REFERENCES wb.organizations(id) NOT NULL,
  user_id BIGINT REFERENCES wb.users(id) NOT NULL,
  role_id BIGINT REFERENCES wb.roles(id) NOT NULL,
  implied_from_role_id BIGINT REFERENCES wb.roles(id),
  settings jsonb,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS wb.schemas(
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  organization_owner_id INTEGER REFERENCES wb.organizations(id),
  user_owner_id BIGINT REFERENCES wb.users(id),
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
);

ALTER SEQUENCE wb.schemas_id_seq RESTART WITH 30001;
CREATE INDEX idx_wb_schemas_name ON wb.schemas(name);

CREATE TABLE IF NOT EXISTS wb.schema_users (
  schema_id INTEGER REFERENCES wb.schemas(id) NOT NULL,
  user_id BIGINT REFERENCES wb.users(id) NOT NULL,
  role_id BIGINT REFERENCES wb.roles(id) NOT NULL,
  implied_from_role_id BIGINT REFERENCES wb.roles(id),
  settings jsonb,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (schema_id, user_id)
);

CREATE TABLE IF NOT EXISTS wb.tables(
  id BIGSERIAL PRIMARY KEY,
  schema_id BIGSERIAL REFERENCES wb.schemas(id) NOT NULL,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  UNIQUE (schema_id, name)
);

ALTER SEQUENCE wb.tables_id_seq RESTART WITH 40001;
CREATE INDEX idx_wb_tables_name ON wb.tables(name);

CREATE TABLE IF NOT EXISTS wb.table_users(
  table_id BIGINT REFERENCES wb.tables(id) NOT NULL,
  user_id BIGINT REFERENCES wb.users(id) NOT NULL,
  role_id BIGINT REFERENCES wb.roles(id) NOT NULL,
  implied_from_role_id BIGINT REFERENCES wb.roles(id),
  settings jsonb,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (table_id, user_id)
);

CREATE TABLE IF NOT EXISTS wb.table_permissions(
  table_permission_key TEXT NOT NULL,
  user_id BIGINT REFERENCES wb.users(id) NOT NULL,
  table_id BIGINT REFERENCES wb.tables(id) NOT NULL,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (table_permission_key, user_id)
);

CREATE INDEX idx_wb_table_permissions_table_permission_key ON wb.table_permissions(table_permission_key);

CREATE TABLE IF NOT EXISTS wb.columns(
  id BIGSERIAL PRIMARY KEY,
  table_id BIGSERIAL REFERENCES wb.tables(id) NOT NULL,
  name TEXT NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  UNIQUE (table_id, name)
);

ALTER SEQUENCE wb.columns_id_seq RESTART WITH 50001;
CREATE INDEX idx_wb_columns_name ON wb.columns(name);

CREATE TABLE IF NOT EXISTS wb.custom_role_column_permissions(
  role_id BIGINT REFERENCES wb.roles(id) NOT NULL,
  column_id BIGINT REFERENCES wb.columns(id) NOT NULL,
  allow_insert BOOLEAN DEFAULT false,
  allow_select BOOLEAN DEFAULT false,
  allow_update BOOLEAN DEFAULT false,
  allow_delete BOOLEAN DEFAULT false,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (role_id, column_id)
);