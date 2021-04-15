BEGIN;

CREATE TABLE IF NOT EXISTS tenants(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
);

CREATE TABLE IF NOT EXISTS users(
  id BIGSERIAL PRIMARY KEY,
  tenant_id integer,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc'),
  updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (now() at time zone 'utc')
);

CREATE INDEX idx_tenants_name ON tenants(name);
CREATE INDEX idx_users_email ON users(email);

ALTER TABLE users 
ADD CONSTRAINT users_tenant_id_fk
FOREIGN KEY (tenant_id)
REFERENCES tenants(id);

COMMIT;