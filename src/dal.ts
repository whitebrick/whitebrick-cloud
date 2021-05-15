import { environment } from "./environment";
import { log } from "./whitebrick-cloud";
import { Pool } from "pg";
import { Tenant } from "./entity/Tenant";
import { User } from "./entity/User";
import { Role } from "./entity/Role";
import { Schema } from "./entity/Schema";
import { QueryParam, ServiceResult } from "./type-defs";

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

  public static sanitize(str: string): string {
    return str.replace(/[\\"]+/g, "");
  }

  private async executeQuery(queryParam: QueryParam) {
    const results = await this.executeQueries([queryParam]);
    return results[0];
  }

  private async executeQueries(
    queryParams: Array<QueryParam>
  ): Promise<ServiceResult[]> {
    const client = await this.pool.connect();
    const results: Array<ServiceResult> = [];
    try {
      await client.query("BEGIN");
      for (const queryParam of queryParams) {
        log.debug(
          `dal.executeQuery QueryParam: ${queryParam.query}`,
          queryParam.params
        );
        const response = await client.query(
          queryParam.query,
          queryParam.params
        );
        results.push(<ServiceResult>{
          success: true,
          payload: response,
        });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      log.error(error);
      results.push(<ServiceResult>{
        success: false,
        message: error.detail,
        code: error.code,
      });
    } finally {
      client.release();
    }
    return results;
  }

  /**
   * Tenants
   */

  public async tenants(): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: "SELECT * FROM wb.tenants",
    });
    if (result.success) result.payload = Tenant.parseResult(result.payload);
    return result;
  }

  public async tenantById(id: number): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: "SELECT * FROM wb.tenants WHERE id=$1 LIMIT 1",
      params: [id],
    });
    if (result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async tenantByName(name: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: "SELECT * FROM wb.tenants WHERE name=$1 LIMIT 1",
      params: [name],
    });
    if (result.success) {
      result.payload = Tenant.parseResult(result.payload);
      if (result.payload.length == 0) {
        return <ServiceResult>{
          success: false,
          message: `Could not find tenant where name=${name}`,
        };
      } else {
        result.payload = result.payload[0];
      }
    }
    return result;
  }

  public async createTenant(
    name: string,
    label: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query:
        "INSERT INTO wb.tenants(name, label, created_at, updated_at) VALUES($1, $2, $3, $4) RETURNING *",
      params: [name, label, new Date(), new Date()],
    });
    if (result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async updateTenant(
    id: number,
    name: string | null,
    label: string | null
  ): Promise<ServiceResult> {
    if (name == null && label == null) {
      return {
        success: false,
        message: "updateTenant: all parameters are null",
      };
    }
    let paramCount = 3;
    const params: (number | Date | string | null)[] = [new Date(), id];
    let query = "UPDATE wb.tenants SET ";
    if (name != null) query += `name=$${paramCount}, `;
    params.push(name);
    paramCount++;
    if (label != null) query += `label=$${paramCount}, `;
    params.push(label);
    paramCount++;
    query += "updated_at=$1 WHERE id=$2 RETURNING *";
    const result = await this.executeQuery({
      query: query,
      params: [new Date(), id],
    });
    if (result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async deleteTestTenants(): Promise<ServiceResult> {
    const results = await this.executeQueries([
      {
        query:
          "DELETE FROM wb.tenant_users WHERE tenant_id IN (SELECT id FROM wb.tenants WHERE name like 'test_%')",
      },
      {
        query: "DELETE FROM wb.tenants WHERE name like 'test_%'",
      },
    ]);
    return results[results.length - 1];
  }

  /**
   * Tenant-User-Roles
   */

  public async addUserToTenant(
    tenantId: number,
    userId: number,
    tenantRoleId: number
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query:
        "INSERT INTO wb.tenant_users(tenant_id, user_id, role_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5)",
      params: [tenantId, userId, tenantRoleId, new Date(), new Date()],
    });
    return result;
  }

  public async removeUserFromTenant(
    tenantId: number,
    userId: number,
    tenantRoleId?: number
  ): Promise<ServiceResult> {
    let query = "DELETE FROM wb.tenant_users WHERE tenant_id=$1 AND user_id=$2";
    const params: (number | undefined)[] = [tenantId, userId];
    if (tenantRoleId) query += " AND role_id=$3";
    params.push(tenantRoleId);
    const result = await this.executeQuery({
      query: query,
      params: params,
    });
    return result;
  }

  /**
   * Users
   */

  public async usersByTenantId(tenantId: number): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: "SELECT * FROM wb.users WHERE tenant_id=$1",
      params: [tenantId],
    });
    if (result.success) result.payload = User.parseResult(result.payload);
    return result;
  }

  public async userById(id: number): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: "SELECT * FROM wb.users WHERE id=$1 LIMIT 1",
      params: [id],
    });
    if (result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async userByEmail(email: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: "SELECT * FROM wb.users WHERE email=$1 LIMIT 1",
      params: [email],
    });
    if (result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async createUser(
    email: string,
    firstName: string,
    lastName: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query:
        "INSERT INTO wb.users(email, first_name, last_name, created_at, updated_at) VALUES($1, $2, $3, $4, $5) RETURNING *",
      params: [email, firstName, lastName, new Date(), new Date()],
    });
    if (result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async updateUser(
    id: number,
    email: string | null,
    firstName: string | null,
    lastName: string | null
  ): Promise<ServiceResult> {
    if (email == null && firstName == null && lastName == null) {
      return { success: false, message: "updateUser: all parameters are null" };
    }
    let paramCount = 3;
    const params: (Date | number | string | null)[] = [new Date(), id];
    let query = "UPDATE wb.users SET ";
    if (email != null) query += `email=$${paramCount}, `;
    params.push(email);
    paramCount++;
    if (firstName != null) query += `first_name=$${paramCount}, `;
    params.push(firstName);
    paramCount++;
    if (lastName != null) query += `last_name=$${paramCount}, `;
    params.push(lastName);
    paramCount++;
    query += "updated_at=$1 WHERE id=$2 RETURNING *";
    const result = await this.executeQuery({
      query: query,
      params: params,
    });
    if (result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async deleteTestUsers(): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: "DELETE FROM wb.users WHERE email like 'test_%example.com'",
      params: [],
    });
    return result;
  }

  /**
   * Roles
   */

  public async roleByName(name: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: "SELECT * FROM wb.roles WHERE name=$1 LIMIT 1",
      params: [name],
    });
    if (result.success) result.payload = Role.parseResult(result.payload)[0];
    return result;
  }

  /**
   * Schemas
   */

  public async createSchema(
    name: string,
    label: string,
    tenantOwnerId: number | null,
    userOwnerId: number | null
  ): Promise<ServiceResult> {
    const results = await this.executeQueries([
      {
        query: `CREATE SCHEMA "${DAL.sanitize(name)}"`,
      },
      {
        query:
          "INSERT INTO wb.schemas(name, label, tenant_owner_id, user_owner_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5, $6) RETURNING *",
        params: [
          name,
          label,
          tenantOwnerId,
          userOwnerId,
          new Date(),
          new Date(),
        ],
      },
    ]);
    const insertResult: ServiceResult = results[results.length - 1];
    if (insertResult.success) {
      insertResult.payload = Schema.parseResult(insertResult.payload)[0];
    }
    return insertResult;
  }

  public async schemas(
    schemaNamePattern: string | undefined
  ): Promise<ServiceResult> {
    if (!schemaNamePattern) schemaNamePattern = "%";
    const results = await this.executeQueries([
      {
        query:
          "SELECT * FROM information_schema.schemata WHERE schema_name LIKE $1;",
        params: [schemaNamePattern],
      },
      {
        query: "SELECT * FROM wb.schemas WHERE name LIKE $1;",
        params: [schemaNamePattern],
      },
    ]);
    if (results[0].success && results[1].success) {
      results[0].payload = Schema.parseResult(results[0].payload);
      results[1].payload = Schema.parseResult(results[1].payload);
      if (results[0].payload.length != results[1].payload.length) {
        return <ServiceResult>{
          success: false,
          message: "wb.schemas out of sync with information_schema.schemata",
        };
      }
    }
    return results[1];
  }

  public async schemaByName(name: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: "SELECT * FROM wb.schemas WHERE name=$1 LIMIT 1",
      params: [name],
    });
    if (result.success) {
      result.payload = Schema.parseResult(result.payload);
      if (result.payload.length == 0) {
        return <ServiceResult>{
          success: false,
          message: `Could not find schema where name=${name}`,
        };
      } else {
        result.payload = result.payload[0];
      }
    }
    return result;
  }

  public async schemasByUserOwner(userEmail: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.schemas.* FROM wb.schemas
        JOIN wb.users ON wb.schemas.user_owner_id=wb.users.id
        WHERE wb.users.email=$1
      `,
      params: [userEmail],
    });
    if (result.success) {
      // TBD: map this instead
      const schemasWithRole = Array<Schema>();
      for (const schema of Schema.parseResult(result.payload)) {
        schema.userRole = "schema_owner";
        schemasWithRole.push(schema);
      }
      result.payload = schemasWithRole;
    }
    return result;
  }

  public async deleteSchema(schemaName: string): Promise<ServiceResult> {
    const results = await this.executeQueries([
      {
        query: "DELETE FROM wb.schemas WHERE name=$1",
        params: [schemaName],
      },
      {
        query: `DROP SCHEMA IF EXISTS "${DAL.sanitize(schemaName)}" CASCADE`,
      },
    ]);
    return results[results.length - 1];
  }

  /**
   * Schema-User-Roles
   */

  public async addUserToSchema(
    schemaId: number,
    userId: number,
    schemaRoleId: number
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query:
        "INSERT INTO wb.schema_users(schema_id, user_id, role_id, created_at, updated_at) VALUES($1, $2, $3, $4, $5)",
      params: [schemaId, userId, schemaRoleId, new Date(), new Date()],
    });
    return result;
  }

  public async removeUserFromSchema(
    schemaId: number,
    userId: number,
    schemaRoleId?: number
  ): Promise<ServiceResult> {
    let query = "DELETE FROM wb.schema_users WHERE schema_id=$1 AND user_id=$2";
    const params: (number | undefined)[] = [schemaId, userId];
    if (schemaRoleId) query += " AND role_id=$3";
    params.push(schemaRoleId);
    const result = await this.executeQuery({
      query: query,
      params: params,
    });
    return result;
  }

  public async removeAllUsersFromSchema(
    schemaName: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query:
        "DELETE FROM wb.schema_users WHERE schema_id IN (SELECT id FROM wb.schemas WHERE name=$1)",
      params: [schemaName],
    });
    return result;
  }

  public async schemasByUser(userEmail: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.schemas.*, wb.roles.name as role_name
        FROM wb.schemas
        JOIN wb.schema_users ON wb.schemas.id=wb.schema_users.schema_id
        JOIN wb.users ON wb.schema_users.user_id=wb.users.id
        JOIN wb.roles ON wb.schema_users.role_id=wb.roles.id
        WHERE wb.users.email=$1
      `,
      params: [userEmail],
    });
    if (result.success) {
      // TBD: map this instead
      const schemasWithRole = Array<Schema>();
      let schema: Schema;
      result.payload.rows.forEach((row: any) => {
        schema = Schema.parse(row);
        schema.userRole = row.role_name;
        schemasWithRole.push(schema);
      });
      result.payload = schemasWithRole;
    }
    return result;
  }

  /**
   * Tables
   */

  public async schemaTableNames(schemaName: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query:
        "SELECT table_name FROM information_schema.tables WHERE table_schema=$1",
      params: [schemaName],
    });
    if (result.success) {
      result.payload = result.payload.rows.map(
        (row: { table_name: string }) => row.table_name
      );
    }
    return result;
  }

  public async createTable(
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    const result = await this.executeQuery({
      query: `CREATE TABLE "${schemaName}"."${tableName}"()`,
      params: [],
    });
    return result;
  }

  public async deleteTable(
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    const result = await this.executeQuery({
      query: `DROP TABLE "${schemaName}"."${tableName}" CASCADE`,
      params: [],
    });
    return result;
  }
}
