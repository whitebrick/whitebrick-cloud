import { environment } from './environment';
import { log } from "./wb-cloud";
import { Pool } from 'pg';
import { Tenant } from './entity/Tenant';
import { User } from './entity/User';
import { ServiceResult } from './service-result';

export class DAL {

  private pool: Pool;

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

  private async executeQuery(query: string, params: [any]) {
    const client = await this.pool.connect();
    let result: ServiceResult;
    try {
      log.debug(`dal.executeQuery: ${query}`, params);
      const response = await client.query(query, params);
      result = {
        success: true,
        payload: response
      };
    } catch (error) {
      log.error(error);
      result = {
        success: false,
        message: error.detail,
        code: error.code
      };
    } finally {
      client.release();
    }
    return result
  }

  
  /**
   * Tenants 
   */

  public async tenants() {
    const query = "SELECT * FROM tenants";
    const params: any = [];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Tenant.parseResult(result.payload);
    return result;
  }

  public async tenantById(id: number) {
    const query = "SELECT * FROM tenants WHERE id=$1 LIMIT 1";
    const params: any = [id];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async tenantByName(name: string) {
    const query = "SELECT * FROM tenants WHERE name=$1 LIMIT 1";
    const params: any = [name];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async createTenant(name: string, label: string) {
    const query = "INSERT INTO tenants(name, label, created_at, updated_at) VALUES($1, $2, $3, $4) RETURNING *";
    const params: any = [name, label, new Date(), new Date()];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async updateTenant(id: number, name: string, label: string) {
    let query = "UPDATE tenants SET ";
    if (name != null)   query += ("name='" + name + "', ");
    if (label != null)  query += ("label='" + label + "', ");
    query += ("updated_at=$1 WHERE id=$2 RETURNING *");
    const params: any = [new Date(), id];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async addUserToTenant(tenantId: number, userId: number, tenantRoleId: number) {
    const query = "INSERT INTO tenant_users(tenant_id, user_id, role_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5)";
    const params: any = [tenantId, userId, tenantRoleId, new Date(), new Date()];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  /**
   * Users 
   */

  public async usersByTenantId(tenantId: number) {
    const query = "SELECT * FROM users WHERE tenant_id=$1";
    const params: any = [tenantId];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = User.parseResult(result.payload);
    return result;
  }

  public async userById(id: number) {
    const query = "SELECT * FROM users WHERE id=$1 LIMIT 1";
    const params: any = [id];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async userByEmail(name: string) {
    const query = "SELECT * FROM users WHERE email=$1 LIMIT 1";
    const params: any = [name];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async createUser(email: string, firstName: string|null, lastName: string|null) {
    const query = "INSERT INTO users(email, first_name, last_name, created_at, updated_at) VALUES($1, $2, $3, $4, $5) RETURNING *";
    const params: any = [email, firstName, lastName, new Date(), new Date()];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async updateUser(id: number, email: string, firstName: string, lastName: string) {
    let query = "UPDATE users SET ";
    if (email != null)      query += ("email='" + email + "', ");
    if (firstName != null)  query += ("first_name='" + firstName + "', ");
    if (lastName != null)   query += ("last_name='" + lastName + "', ");
    query += ("updated_at=$1 WHERE id=$2 RETURNING *");
    const params: any = [new Date(), id];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async deleteTestUsers() {
    const query = "DELETE FROM users WHERE email like '%example.com'";
    const params: any = [];
    const result = await this.executeQuery(query, params);
    return result;
  }

};