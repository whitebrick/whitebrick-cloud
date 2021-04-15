import { environment } from './environment';
import { Pool } from 'pg';

export class DAL {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      host: environment.dbHost,
      port: environment.dbPort,
      user: environment.dbUser,
      password: environment.dbPassword,
      max: environment.dbPoolMax,
      idleTimeoutMillis: environment.dbPoolConnectionTimeoutMillis,
      connectionTimeoutMillis: environment.dbPoolConnectionTimeoutMillis,
    });
  }

  /**
   * Methods here for CRUD access to DB records - rename to best practises
   * 
   * getTenantByName(id) - eg SELECT * FROM tenants WHERE id=?
   * getTenantById(name) - eg SELECT * FROM tenants WHERE name=?
   * getTenants - eg SELECT * FROM tenants?
   * createTenant(name, label) - eg INSERT INTO tenants (name, label) VALUES (?,?)
   * updateTenant(id, name, label) - eg UPDATE tenants SET(name=?, label=?, updated_at=(now() at time zone 'utc')) WHERE id=?
   * - it would be nice to only update the supplied columns
   * 
   * getUserByName(id) - eg SELECT * FROM users WHERE id=?
   * getUserByEmail(email) - eg SELECT * FROM users WHERE email=?
   * getUsersByTenantId(id) - eg SELECT * FROM users WHERE tenant_id=?
   * getUsersByTenantName(name) - eg SELECT * FROM users JOIN tenants ON users.tenant_id=tenants.id WHERE tenants.name=?
   * 
   * createUser(tenant_id, email, first_name, last_name) - eg INSERT INTO tenants (tenant_id, email, first_name, last_name) VALUES (?,?,?,?)
   * updateUser(id, tenant_id, email, first_name, last_name) - eg UPDATE tenants SET(tenant_id=?, email=?, first_name=?, last_name=?, updated_at=(now() at time zone 'utc')) WHERE id=?
   * - it would be nice to only update the supplied columns
   */

};