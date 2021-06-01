import { environment } from "./environment";
import { log } from "./whitebrick-cloud";
import { Pool } from "pg";
import { Tenant, User, Role, Schema, Table, Column, TableUser } from "./entity";
import { QueryParams, ServiceResult } from "./types";

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
    return str.replace(/[\\"\\'\\`]+/g, "");
  }

  private async executeQuery(queryParams: QueryParams): Promise<ServiceResult> {
    const results = await this.executeQueries([queryParams]);
    return results[0];
  }

  private async executeQueries(
    queriesAndParams: Array<QueryParams>
  ): Promise<ServiceResult[]> {
    const client = await this.pool.connect();
    const results: Array<ServiceResult> = [];
    try {
      await client.query("BEGIN");
      for (const queryParams of queriesAndParams) {
        log.debug(
          `dal.executeQuery QueryParams: ${queryParams.query}`,
          queryParams.params
        );
        const response = await client.query(
          queryParams.query,
          queryParams.params
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
      query: `
        SELECT wb.tenants.*
        FROM wb.tenants
      `,
    });
    if (result.success) result.payload = Tenant.parseResult(result.payload);
    return result;
  }

  public async tenantById(id: number): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.tenants.*
        FROM wb.tenants
        WHERE id=$1 LIMIT 1
      `,
      params: [id],
    });
    if (result.success) result.payload = Tenant.parseResult(result.payload)[0];
    return result;
  }

  public async tenantByName(name: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.tenants.*
        FROM wb.tenants
        WHERE name=$1 LIMIT 1
      `,
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
      query: `
        INSERT INTO wb.tenants(
          name, label, created_at, updated_at
        ) VALUES($1, $2, $3, $4)
        RETURNING *
      `,
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
        query: `
          DELETE FROM wb.tenant_users
          WHERE tenant_id IN (
            SELECT id FROM wb.tenants WHERE name like 'test_%'
          )
        `,
      },
      {
        query: `
          DELETE FROM wb.tenants WHERE name like 'test_%'
        `,
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
      query: `
        INSERT INTO wb.tenant_users(
          tenant_id, user_id, role_id, created_at, updated_at
        ) VALUES($1, $2, $3, $4, $5)
      `,
      params: [tenantId, userId, tenantRoleId, new Date(), new Date()],
    });
    return result;
  }

  public async removeUserFromTenant(
    tenantId: number,
    userId: number,
    tenantRoleId?: number
  ): Promise<ServiceResult> {
    let query = `
      DELETE FROM wb.tenant_users
      WHERE tenant_id=$1 AND user_id=$2
    `;
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
      query: `
        SELECT wb.users.*
        FROM wb.users
        WHERE tenant_id=$1
      `,
      params: [tenantId],
    });
    if (result.success) result.payload = User.parseResult(result.payload);
    return result;
  }

  public async userById(id: number): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.users.*
        FROM wb.users
        WHERE id=$1 LIMIT 1
      `,
      params: [id],
    });
    if (result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async userByEmail(email: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT * FROM wb.users
        WHERE email=$1 LIMIT 1
      `,
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
      query: `
        INSERT INTO wb.users(
          email, first_name, last_name, created_at, updated_at
        ) VALUES($1, $2, $3, $4, $5) RETURNING *
      `,
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
      query: `
        DELETE FROM wb.users
        WHERE email like 'test_%test.whitebrick.com'
      `,
      params: [],
    });
    return result;
  }

  /**
   * Roles
   */

  public async roleByName(name: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.roles.*
        FROM wb.roles
        WHERE name=$1 LIMIT 1
      `,
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
        query: `
          INSERT INTO wb.schemas(
            name, label, tenant_owner_id, user_owner_id, created_at, updated_at
          ) VALUES($1, $2, $3, $4, $5, $6) RETURNING *
        `,
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

  public async schemas(schemaNamePattern?: string): Promise<ServiceResult> {
    if (!schemaNamePattern) schemaNamePattern = "%";
    schemaNamePattern = DAL.sanitize(schemaNamePattern);
    const results = await this.executeQueries([
      {
        query: `
          SELECT information_schema.schemata.*
          FROM information_schema.schemata
          WHERE schema_name LIKE $1
          AND schema_name NOT LIKE 'pg_%'
          AND schema_name NOT IN ('${Schema.SYS_SCHEMA_NAMES.join("','")}')
        `,
        params: [schemaNamePattern],
      },
      {
        query: `
          SELECT wb.schemas.*
          FROM wb.schemas
          WHERE name LIKE $1
        `,
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
    return results[results.length - 1];
  }

  public async schemaByName(name: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.schemas.*
        FROM wb.schemas
        WHERE name=$1 LIMIT 1
      `,
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

  public async removeOrDeleteSchema(
    schemaName: string,
    del: boolean
  ): Promise<ServiceResult> {
    const queriesAndParams: Array<QueryParams> = [
      {
        query: `
          DELETE FROM wb.schemas
          WHERE name=$1
        `,
        params: [schemaName],
      },
    ];
    if (del) {
      queriesAndParams.push({
        query: `DROP SCHEMA IF EXISTS "${DAL.sanitize(schemaName)}" CASCADE`,
      });
    }
    const results: Array<ServiceResult> = await this.executeQueries(
      queriesAndParams
    );
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
      query: `
        INSERT INTO wb.schema_users(
          schema_id, user_id, role_id, created_at, updated_at
        ) VALUES($1, $2, $3, $4, $5)
      `,
      params: [schemaId, userId, schemaRoleId, new Date(), new Date()],
    });
    return result;
  }

  public async removeUserFromSchema(
    schemaId: number,
    userId: number,
    schemaRoleId?: number
  ): Promise<ServiceResult> {
    let query = `
      DELETE FROM wb.schema_users
      WHERE schema_id=$1 AND user_id=$2
    `;
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
      query: `
        DELETE FROM wb.schema_users
        WHERE schema_id IN (
          SELECT id FROM wb.schemas WHERE name=$1
        )
      `,
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

  public async tables(schemaName: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.tables.*
        FROM wb.tables
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        WHERE wb.schemas.name=$1
      `,
      params: [schemaName],
    });
    if (result.success) result.payload = Table.parseResult(result.payload);
    return result;
  }

  public async discoverTables(schemaName: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT information_schema.tables.table_name
        FROM information_schema.tables
        WHERE table_schema=$1
      `,
      params: [schemaName],
    });
    if (result.success) {
      result.payload = result.payload.rows.map(
        (row: { table_name: string }) => row.table_name
      );
    }
    return result;
  }

  public async columns(
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.columns.*, information_schema.columns.data_type as type
        FROM wb.columns
        JOIN wb.tables ON wb.columns.table_id=wb.tables.id
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        JOIN information_schema.columns ON (
          wb.columns.name=information_schema.columns.column_name
          AND wb.schemas.name=information_schema.columns.table_schema
        )
        WHERE wb.schemas.name=$1 AND wb.tables.name=$2 AND information_schema.columns.table_name=$2
      `,
      params: [schemaName, tableName],
    });
    if (result.success) result.payload = Column.parseResult(result.payload);
    return result;
  }

  public async discoverColumns(
    schemaName: string,
    tableNme: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT column_name as name, data_type as type
        FROM information_schema.columns
        WHERE table_schema=$1
        AND table_name=$2
      `,
      params: [schemaName, tableNme],
    });
    if (result.success) result.payload = Column.parseResult(result.payload);
    return result;
  }

  public async tableBySchemaNameTableName(
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.tables.*
        FROM wb.tables
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        WHERE wb.schemas.name=$1 AND wb.tables.name=$2 LIMIT 1
      `,
      params: [schemaName, tableName],
    });
    if (result.success) result.payload = Table.parseResult(result.payload)[0];
    return result;
  }

  public async addOrCreateTable(
    schemaName: string,
    tableName: string,
    tableLabel: string,
    create: boolean
  ): Promise<ServiceResult> {
    log.debug(
      `dal.addOrCreateTable ${schemaName} ${tableName} ${tableLabel} ${create}`
    );
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    let result = await this.schemaByName(schemaName);
    if (!result.success) return result;
    const queriesAndParams: Array<QueryParams> = [
      {
        query: `
        INSERT INTO wb.tables(schema_id, name, label, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
        params: [
          result.payload.id,
          tableName,
          tableLabel,
          new Date(),
          new Date(),
        ],
      },
    ];
    if (create) {
      queriesAndParams.push({
        query: `CREATE TABLE "${schemaName}"."${tableName}"()`,
      });
    }
    const results: Array<ServiceResult> = await this.executeQueries(
      queriesAndParams
    );
    return results[results.length - 1];
  }

  public async removeOrDeleteTable(
    schemaName: string,
    tableName: string,
    del: boolean
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    let result = await this.schemaByName(schemaName);
    if (!result.success) return result;
    const queriesAndParams: Array<QueryParams> = [
      {
        query: `
          DELETE FROM wb.tables
          WHERE schema_id=$1 AND name=$2
        `,
        params: [result.payload.id, tableName],
      },
    ];
    if (del) {
      queriesAndParams.push({
        query: `DROP TABLE IF EXISTS "${schemaName}"."${tableName}" CASCADE`,
      });
    }
    const results: Array<ServiceResult> = await this.executeQueries(
      queriesAndParams
    );
    return results[results.length - 1];
  }

  public async updateTable(
    schemaName: string,
    tableName: string,
    newTableName?: string,
    newTableLabel?: string
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    let result = await this.tableBySchemaNameTableName(schemaName, tableName);
    if (!result.success) return result;
    let params = [];
    let query = `
      UPDATE wb.tables SET
    `;
    let updates: string[] = [];
    if (newTableName) {
      updates.push("name=$" + (params.length + 1));
      params.push(newTableName);
    }
    if (newTableLabel) {
      updates.push("label=$" + (params.length + 1));
      params.push(newTableLabel);
    }
    query += `${updates.join(", ")} WHERE id=$${params.length + 1}`;
    params.push(result.payload.id);
    const queriesAndParams: Array<QueryParams> = [
      {
        query: query,
        params: params,
      },
    ];
    if (newTableName) {
      queriesAndParams.push({
        query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          RENAME TO ${newTableName}
        `,
      });
    }
    const results: Array<ServiceResult> = await this.executeQueries(
      queriesAndParams
    );
    return results[results.length - 1];
  }

  public async addOrCreateColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    columnLabel: string,
    create: boolean,
    columnPGType?: string
  ): Promise<ServiceResult> {
    log.debug(
      `dal.addOrCreateColumn ${schemaName} ${tableName} ${columnName} ${columnLabel} ${columnPGType} ${create}`
    );
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    columnName = DAL.sanitize(columnName);
    let result = await this.tableBySchemaNameTableName(schemaName, tableName);
    if (!result.success) return result;
    const queriesAndParams: Array<QueryParams> = [
      {
        query: `
          INSERT INTO wb.columns(table_id, name, label, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5)
        `,
        params: [
          result.payload.id,
          columnName,
          columnLabel,
          new Date(),
          new Date(),
        ],
      },
    ];
    if (create) {
      queriesAndParams.push({
        query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          ADD ${columnName} ${columnPGType}
        `,
      });
    }
    const results: Array<ServiceResult> = await this.executeQueries(
      queriesAndParams
    );
    return results[results.length - 1];
  }

  public async removeOrDeleteColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    del: boolean
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    columnName = DAL.sanitize(columnName);
    let result = await this.tableBySchemaNameTableName(schemaName, tableName);
    if (!result.success) return result;
    const queriesAndParams: Array<QueryParams> = [
      {
        query: `
          DELETE FROM wb.columns
          WHERE table_id=$1 AND name=$2
        `,
        params: [result.payload.id, columnName],
      },
    ];
    if (del) {
      queriesAndParams.push({
        query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          DROP COLUMN IF EXISTS ${columnName} CASCADE
        `,
      });
    }
    const results: Array<ServiceResult> = await this.executeQueries(
      queriesAndParams
    );
    return results[results.length - 1];
  }

  /**
   * Table Users
   */

  public async tableUser(
    userEmail: string,
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.table_users.*
        FROM wb.table_users
        JOIN wb.tables ON wb.table_users.table_id=wb.tables.id
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        JOIN wb.users ON wb.table_users.user_id=wb.users.id
        WHERE wb.users.email=$1 AND wb.schemas.name=$2 AND wb.tables.name=$3
        LIMIT 1
      `,
      params: [userEmail, schemaName, tableName],
    });
    if (result.success) {
      result.payload = TableUser.parseResult(result.payload)[0];
    }
    return result;
  }

  public async removeTableUsers(
    schemaName: string,
    tableName: string,
    userEmails?: [string]
  ): Promise<ServiceResult> {
    let params = [schemaName, tableName];
    let query = `
      DELETE FROM wb.table_users
      WHERE wb.table_users.table_id IN (
        SELECT wb.tables.id FROM wb.tables
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        WHERE wb.schemas.name=$1
        AND wb.tables.name=$2
      )
    `;
    if (userEmails && userEmails.length > 0) {
      params.push(userEmails.join(","));
      query += `
        AND wb.table_users.user_id IN (
          SELECT wb.users.id from wb.users
          WHERE email IN $3
        )
      `;
    }
    const result = await this.executeQuery({
      query: query,
      params: params,
    });
    return result;
  }

  public async saveTableUserSettings(
    tableId: number,
    userId: number,
    roleId: number,
    settings: object
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        INSERT INTO wb.table_users (
          table_id, user_id, role_id, settings
        )
        VALUES($1, $2, $3, $4)
        ON CONFLICT (table_id, user_id, role_id) 
        DO UPDATE SET settings = EXCLUDED.settings
      `,
      params: [tableId, userId, roleId, settings],
    });
    return result;
  }

  // TBD-SG
  // use tables as tamplate
  // public async tableRelationships(schemaName: string, tableName: string): Promise<ServiceResult> {
}
