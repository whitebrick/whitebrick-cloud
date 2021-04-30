CREATE SCHEMA wb;

CREATE TABLE IF NOT EXISTS wb.tenants(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
);

CREATE INDEX idx_wb_tenants_name ON wb.tenants(name);

CREATE TABLE IF NOT EXISTS wb.users(
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
);

CREATE INDEX idx_wb_users_email ON wb.users(email);

CREATE TABLE IF NOT EXISTS wb.roles (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS wb.tenant_users (
  tenant_id integer REFERENCES tenants(id) NOT NULL,
  user_id bigint REFERENCES wb.users(id) NOT NULL,
  role_id integer REFERENCES wb.roles(id) NOT NULL,
  created_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  updated_at timestamp without time zone DEFAULT timezone('utc'::text, now()),
  PRIMARY KEY (tenant_id, user_id, role_id)
);
