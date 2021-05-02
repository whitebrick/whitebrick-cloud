import { environment } from "./environment";
import { log } from "./wb-cloud";
import { Pool } from "pg";
import { ServiceResult } from "./service-result";
import { Tenant } from "./entity/Tenant";
import { User } from "./entity/User";
import { Role } from "./entity/Role";
import { Schema } from "./entity/Schema";


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

  // TBD: make transactional and loop multiple queries
  // https://node-postgres.com/features/transactions
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
    return result;
  }

  
  /**
   * Tenants 
   */

  public async tenants() {
    const query = "SELECT * FROM wb.tenants";
    const params: any = [];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Tenant.parseResult(result.payload);
    return result;
  }

  public async tenantById(id: number) {
    const query = "SELECT * FROM wb.tenants WHERE id=$1 LIMIT 1";
    const params: any = [id];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async tenantByName(name: string) {
    const query = "SELECT * FROM wb.tenants WHERE name=$1 LIMIT 1";
    const params: any = [name];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async createTenant(name: string, label: string) {
    const query = "INSERT INTO wb.tenants(name, label, created_at, updated_at) VALUES($1, $2, $3, $4) RETURNING *";
    const params: any = [name, label, new Date(), new Date()];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async updateTenant(id: number, name: string|null, label: string|null) {
    if(name == null && label == null) return {success: false, message: "updateTenant: all parameters are null"}
    let paramCount = 3;
    let params: any = [new Date(), id];
    let query = "UPDATE wb.tenants SET ";
    if (name  != null)  query += (`name=$${paramCount}, `);  params.push(name);   paramCount++; 
    if (label != null)  query += (`label=$${paramCount}, `); params.push(label);  paramCount++; 
    query += ("updated_at=$1 WHERE id=$2 RETURNING *");
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async deleteTestTenants() {
    const tenantUsersQuery = "DELETE FROM wb.tenant_users WHERE tenant_id IN (SELECT id FROM wb.tenants WHERE name like 'test_tenant_%')";
    const tenantsQuery = "DELETE FROM wb.tenants WHERE name like 'test_tenant_%'";
    const params: any = [];
    var result = await this.executeQuery(tenantUsersQuery, params);
    if(!result.success) return result;
    result = await this.executeQuery(tenantsQuery, params);
    if(!result.success) return result;
    return result;
  }


  /**
   * Tenant-User-Roles
   */

  public async addUserToTenant(tenantId: number, userId: number, tenantRoleId: number) {
    const query = "INSERT INTO wb.tenant_users(tenant_id, user_id, role_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5)";
    const params: any = [tenantId, userId, tenantRoleId, new Date(), new Date()];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async removeUserFromTenant(tenantId: number, userId: number, tenantRoleId: number|null) {
    var query = "DELETE FROM wb.tenant_users WHERE tenant_id=$1 AND user_id=$2";
    var params: any = [tenantId, userId];
    if(tenantRoleId) query += (" AND role_id=$3"); params.push(tenantRoleId);
    const result = await this.executeQuery(query, params);
    return result;
  }


  /**
   * Users 
   */

  public async usersByTenantId(tenantId: number) {
    const query = "SELECT * FROM wb.users WHERE tenant_id=$1";
    const params: any = [tenantId];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = User.parseResult(result.payload);
    return result;
  }

  public async userById(id: number) {
    const query = "SELECT * FROM wb.users WHERE id=$1 LIMIT 1";
    const params: any = [id];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async userByEmail(email: string) {
    const query = "SELECT * FROM wb.users WHERE email=$1 LIMIT 1";
    const params: any = [email];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async createUser(email: string, firstName: string, lastName: string) {
    const query = "INSERT INTO wb.users(email, first_name, last_name, created_at, updated_at) VALUES($1, $2, $3, $4, $5) RETURNING *";
    const params: any = [email, firstName, lastName, new Date(), new Date()];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async updateUser(id: number, email: string|null, firstName: string|null, lastName: string|null) {
    if(email == null && firstName == null && lastName == null) return {success: false, message: "updateUser: all parameters are null"}
    let paramCount = 3;
    let params: any = [new Date(), id];
    let query = "UPDATE wb.users SET ";
    if (email     != null)  query += (`email=$${paramCount}, `);      params.push(email);     paramCount++; 
    if (firstName != null)  query += (`first_name=$${paramCount}, `); params.push(firstName); paramCount++; 
    if (lastName  != null)  query += (`last_name=$${paramCount}, `);  params.push(lastName);  paramCount++; 
    query += ("updated_at=$1 WHERE id=$2 RETURNING *");
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async deleteTestUsers() {
    const query = "DELETE FROM wb.users WHERE email like 'test_user_%example.com'";
    const params: any = [];
    const result = await this.executeQuery(query, params);
    return result;
  }


  /**
   * Roles 
   */

  public async roleByName(name: string) {
    const query = "SELECT * FROM wb.roles WHERE name=$1 LIMIT 1";
    const params: any = [name];
    const result = await this.executeQuery(query, params);
    if(result.success) result.payload = Role.parseResult(result.payload)[0];
    return result;
  }


  /**
   * Schemas
   */

  public async createSchema(name: string, label: string, tenantOwnerId: number, userOwnerId: number) {
    // TBD: make transactional
    var query = `CREATE SCHEMA ${name.replace(/[^\w-]+/g,'')}`; // paramatization not supported
    var params: any = [];
    var result = await this.executeQuery(query, params);
    if(!result.success) return result;
    query = "INSERT INTO wb.schemas(name, label, tenant_owner_id, user_owner_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6) RETURNING *";
    params = [name, label, tenantOwnerId, userOwnerId, new Date(), new Date()];
    result = await this.executeQuery(query, params);
    if(result.success) result.payload = Schema.parseResult(result.payload)[0];
    return result;
  }


};