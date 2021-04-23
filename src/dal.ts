import { environment } from './environment';
import { log } from "./apollo-server";
import { Pool } from 'pg';
import { Tenant } from './entity/Tenant';

export class DAL {

  public pool: Pool;

  constructor() {
    this.pool = new Pool({
      database: environment.dbName,
      host: environment.dbHost,
      port: environment.dbPort,
      user: environment.dbUser,
      password: environment.dbPassword,
      max: environment.dbPoolMax,
      idleTimeoutMillis: environment.dbPoolConnectionTimeoutMillis,
      connectionTimeoutMillis: environment.dbPoolConnectionTimeoutMillis,
    });
  }

  public async executeQuery(query: string, inputs: [any]) {
    const client = await this.pool.connect();
    try {
      log.debug(`executeQuery: ${query}`, inputs);
      const response = await client.query(query, inputs);
      log.trace(response);
      return response;
    } catch (error) {
      log.error(error);
      return null;
    } finally {
      client.release();
    }
  }

  

  public async getTenants() {
    const query = "SELECT * FROM tenants";
    const inputs: any = [];
    const res = await this.executeQuery(query, inputs);
    return Tenant.parseResult(res)
  }

  public async getTenantById(id: number) {
    const query = "SELECT * FROM tenants WHERE id=$1 LIMIT 1";
    const inputs: any = [id];
    const res = await this.executeQuery(query, inputs);
    if(!res || res.rows.length == 0) return null;
    return Tenant.parseResult(res)[0];
  }

  public async createTenant(name: String, label: String) {
    const query = "INSERT INTO tenants(name, label, created_at, updated_at) VALUES($1, $2, $3, $4) RETURNING *";
    const inputs: any = [name, label, new Date(), new Date()];
    const res = await this.executeQuery(query, inputs);
    if(!res || res.rows.length == 0) return null;
    return Tenant.parseResult(res)[0];
  }

  // public async getTenantById(id: String) {
  //   const query = "SELECT * FROM tenant WHERE id=$1";
  //   const inputs: any = [id]
  //   const res = await this.executeQuery(query, inputs);
  //   if (res) {
  //     return res.rows[0];
  //   }
  //   else
  //     return res
  // }

  public async getTenantByName(name: String) {
    const query = "SELECT * FROM tenant WHERE name=$1";
    const inputs: any = [name]
    const res = await this.executeQuery(query, inputs);
    if (res) {
      return res.rows[0];
    }
    else
      return res
  }

  


  // public async getTenants() {
  //   const query = "SELECT * FROM tenants";
  //   const inputs: any = []
  //   const res = await this.executeQuery(query, inputs);
  //   if (res) {
  //     return res.rows;
  //   }
  //   else
  //     return res
  // }



  public async getUsers() {
    const query = "SELECT * FROM users";
    const inputs: any = []
    const res = await this.executeQuery(query, inputs);
    if (res) {
      return res.rows;
    }
    else
      return res
  }

  public async getUserByName(firstName: String) {
    const query = "SELECT * FROM users WHERE first_name=$1";
    const inputs: any = [firstName]
    const res = await this.executeQuery(query, inputs);
    if (res) {
      return res.rows[0];
    }
    else
      return res
  }

  public async getUserByEmail(email: String) {
    const query = "SELECT * FROM users WHERE email=$1";
    const inputs: any = [email]
    const res = await this.executeQuery(query, inputs);
    if (res) {
      return res.rows[0];
    }
    else
      return res
  }

  public async getUserByTenantID(tenantId: String) {
    const query = "SELECT * FROM users WHERE tenant_id=$1";
    const inputs: any = [tenantId]
    const res = await this.executeQuery(query, inputs);
    if (res) {
      return res.rows;
    }
    else
      return res
  }


  public async getUsersByTenantName(tenant_name: String) {
    const query = "SELECT * FROM users RIGHT JOIN tenant ON users.tenant_id = tenant.id WHERE tenant.name=$1";
    const inputs: any = [tenant_name]
    const res = await this.executeQuery(query, inputs);
    if (res) {
      return res.rows;
    }
    else
      return res
  }

  public async createUser(tenant_id: String, email: String, first_name: String, last_name: String) {
    const query = "INSERT INTO users(email, first_name, last_name, created_at, updated_at, tenant_id ) VALUES($1, $2, $3, $4, $5, $6) RETURNING *";
    const inputs: any = [email, first_name, last_name, new Date(), new Date(), tenant_id]
    const res = await this.executeQuery(query, inputs);
    if (res) {
      return true;
    }
    else
      return false
  }

  public async updateUser(id: String, email: String, first_name: String, last_name: String) {
    let query = "UPDATE users SET ";
    if (email != null)
      query += ("email='" + email + "',")

    if (first_name != null)
      query += ("first_name='" + first_name + "',")

    if (last_name != null)
      query += ("last_name='" + last_name + "',")

    query += ("updated_at=$1 WHERE id=$2")
    const inputs: any = [new Date(), id]
    const res = await this.executeQuery(query, inputs);
    if (res) {
      return true;
    }
    else
      return false
  }

  public async updateTenant(id: String, name: String, label: String) {
    let query = "UPDATE tenant SET ";
    if (name != null)
      query += ("name='" + name + "',")

    if (label != null)
      query += ("label='" + label + "',")

    query += ("updated_at=$1 WHERE id=$2")

    const inputs: any = [new Date(), id]
    const res = await this.executeQuery(query, inputs);
    if (res) {
      console.log(res);
      return true;
    }
    else
      return false
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