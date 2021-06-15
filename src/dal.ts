import { environment } from "./environment";
import { log } from "./whitebrick-cloud";
import { Pool } from "pg";
import {
  Organization,
  User,
  Role,
  Schema,
  Table,
  Column,
  TableUser,
  RoleLevel,
} from "./entity";
import { ConstraintId, QueryParams, ServiceResult } from "./types";

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

  // used for DDL identifiers (eg CREATE TABLE sanitize(tableName))
  public static sanitize(str: string): string {
    return str.replace(/[^\w%]+/g, "");
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
        results.push({
          success: true,
          payload: response,
        } as ServiceResult);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      log.error(JSON.stringify(error));
      results.push(<ServiceResult>{
        success: false,
        message: error.message,
        code: "PG_" + error.code,
      });
    } finally {
      client.release();
    }
    return results;
  }

  /**
   * Organizations
   */

  public async organizations(
    userId?: number,
    userEmail?: string,
    organizationId?: number
  ): Promise<ServiceResult> {
    const params: (string | number)[] = [];
    let query: string = `
      SELECT wb.organizations.*
      FROM wb.organizations
      WHERE true
    `;
    if (userId || userEmail) {
      query = `
        SELECT wb.organizations.*, wb.roles.name as user_role
        FROM wb.organizations
        JOIN wb.organization_users ON wb.organizations.id=wb.organization_users.organization_id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
      `;
      if (userId) {
        query += `
          WHERE wb.organization_users.user_id=$1
        `;
        params.push(userId);
      } else if (userEmail) {
        query += `
          JOIN wb.users ON wb.organization_users.user_id=wb.users.id
          WHERE users.email=$1
        `;
        params.push(userEmail);
      }
    }
    if (organizationId) {
      query += `
        AND wb.organizations.id=$${params.length + 1}
      `;
      params.push(organizationId);
    }
    const result = await this.executeQuery({
      query: query,
      params: params,
    } as QueryParams);
    if (result.success) {
      result.payload = Organization.parseResult(result.payload);
    }
    return result;
  }

  public async organizationsByIdsOrNames(
    ids?: number[],
    names?: string[]
  ): Promise<ServiceResult> {
    let column = "id";
    let params: any[] = [ids];
    if (names) {
      column = "name";
      params = [names];
    }
    const result = await this.executeQuery({
      query: `
        SELECT wb.organizations.*
        FROM wb.organizations
        WHERE ${column}=ANY($1)
      `,
      params: params,
    } as QueryParams);
    if (result.success) result.payload = User.parseResult(result.payload);
    return result;
  }

  public async organizationUsers(
    name: string,
    roles?: string[]
  ): Promise<ServiceResult> {
    let query = `
      SELECT wb.users.*, wb.roles.name as role
      FROM wb.users
      JOIN wb.organization_users ON wb.users.id=wb.organization_users.user_id
      JOIN wb.organizations ON wb.organizations.id=wb.organization_users.organization_id
      JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
      WHERE wb.organizations.name=$1
    `;
    if (roles) query += `AND wb.roles.name IN ('${roles.join("','")}')`;
    const result = await this.executeQuery({
      query: query,
      params: [name],
    } as QueryParams);
    if (result.success) result.payload = User.parseResult(result.payload);
    return result;
  }

  public async createOrganization(
    name: string,
    label: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        INSERT INTO wb.organizations(
          name, label
        ) VALUES($1, $2)
        RETURNING *
      `,
      params: [name, label],
    } as QueryParams);
    if (result.success)
      result.payload = Organization.parseResult(result.payload)[0];
    return result;
  }

  public async updateOrganization(
    name: string,
    newName?: string,
    newLabel?: string
  ): Promise<ServiceResult> {
    const params: (Date | string)[] = [new Date()];
    let query = "UPDATE wb.organizations SET updated_at=$1";
    if (newName) {
      params.push(newName);
      query += `, name=$${params.length}`;
    }
    if (newLabel) {
      params.push(newLabel);
      query += `, label=$${params.length}`;
    }
    params.push(name);
    query += ` WHERE id=$${params.length} RETURNING *`;
    const result = await this.executeQuery({
      query: query,
      params: params,
    } as QueryParams);
    if (result.success)
      result.payload = Organization.parseResult(result.payload)[0];
    return result;
  }

  public async deleteOrganization(name: string): Promise<ServiceResult> {
    // no patterns allowed here
    return await this.deleteOrganizations(name.replace("%", ""));
  }

  public async deleteTestOrganizations(): Promise<ServiceResult> {
    return await this.deleteOrganizations("test_%");
  }

  public async deleteOrganizations(
    namePattern: string
  ): Promise<ServiceResult> {
    const results = await this.executeQueries([
      {
        query: `
          DELETE FROM wb.organization_users
          WHERE organization_id IN (
            SELECT id FROM wb.organizations WHERE name like $1
          )
        `,
        params: [namePattern],
      } as QueryParams,
      {
        query: `
          DELETE FROM wb.organizations WHERE name like $1
        `,
        params: [namePattern],
      } as QueryParams,
    ]);
    return results[results.length - 1];
  }

  /**
   * Organization-User-Roles
   */

  public async setOrganizationUsersRole(
    organizationId: number,
    users: User[],
    roleId: number
  ): Promise<ServiceResult> {
    log.warn(`++++++++++++++++++++++${organizationId} ${users} ${roleId}`);
    const queryParams: QueryParams[] = [];
    for (const user of users) {
      queryParams.push({
        query: `
        INSERT INTO wb.organization_users(
          organization_id, user_id, role_id, updated_at
        ) VALUES($1, $2, $3, $4)
        ON CONFLICT (organization_id, user_id)
        DO UPDATE SET role_id=EXCLUDED.role_id, updated_at=EXCLUDED.updated_at
      `,
        params: [organizationId, user.id, roleId, new Date()],
      } as QueryParams);
    }
    const results = await this.executeQueries(queryParams);
    return results[results.length - 1];
  }

  public async removeUsersFromOrganization(
    users: User[],
    organizationId: number
  ): Promise<ServiceResult> {
    const queryParams: QueryParams[] = [];
    for (const user of users) {
      queryParams.push({
        query: `
          DELETE FROM wb.organization_users
          WHERE user_id=$1 AND organization_id=$2
      `,
        params: [user.id, organizationId],
      } as QueryParams);
    }
    const results = await this.executeQueries(queryParams);
    return results[results.length - 1];
  }

  /**
   * Users
   */

  public async usersByOrganizationId(
    organizationId: number
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.users.*
        FROM wb.users
        WHERE organization_id=$1
      `,
      params: [organizationId],
    } as QueryParams);
    if (result.success) result.payload = User.parseResult(result.payload);
    return result;
  }

  public async usersByIdsOrEmails(
    ids?: number[],
    emails?: string[]
  ): Promise<ServiceResult> {
    let column = "id";
    let params: any[] = [ids];
    if (emails) {
      column = "email";
      params = [emails];
    }
    const result = await this.executeQuery({
      query: `
        SELECT wb.users.*
        FROM wb.users
        WHERE ${column}=ANY($1)
      `,
      params: params,
    } as QueryParams);
    if (result.success) result.payload = User.parseResult(result.payload);
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
          email, first_name, last_name
        ) VALUES($1, $2, $3) RETURNING *
      `,
      params: [email, firstName, lastName],
    } as QueryParams);
    if (result.success) result.payload = User.parseResult(result.payload)[0];
    return result;
  }

  public async updateUser(
    id: number,
    email?: string,
    firstName?: string,
    lastName?: string
  ): Promise<ServiceResult> {
    if (!email && !firstName && !lastName) {
      return {
        success: false,
        message: "dal.updateUser: all parameters are null",
      } as ServiceResult;
    }
    let paramCount = 3;
    const date = new Date();
    const params: (Date | number | string)[] = [date, id];
    let query = "UPDATE wb.users SET ";
    if (email) {
      query += `email=$${paramCount}, `;
      params.push(email);
      paramCount++;
    }
    if (firstName) {
      query += `first_name=$${paramCount}, `;
      params.push(firstName);
      paramCount++;
    }
    if (lastName) {
      query += `last_name=$${paramCount}, `;
      params.push(lastName);
      paramCount++;
    }
    query += "updated_at=$1 WHERE id=$2 RETURNING *";
    const result = await this.executeQuery({
      query: query,
      params: params,
    } as QueryParams);
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
    } as QueryParams);
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
    } as QueryParams);
    if (result.success) result.payload = Role.parseResult(result.payload)[0];
    return result;
  }

  public async setRole(
    userId: number,
    roleName: string,
    roleLevel: RoleLevel,
    objectId: number
  ): Promise<ServiceResult> {
    if (!Role.isRole(roleName)) {
      return {
        success: false,
        message: `${roleName} is not a valid Role`,
      };
    }
    const roleResult = await this.roleByName(roleName);
    if (!roleResult.success) return roleResult;
    let wbTable: string = "";
    let wbColumn: string = "";
    switch (roleLevel) {
      case "organization" as RoleLevel:
        wbTable = "wb.organization_users";
        wbColumn = "organization_id";
        break;
      case "schema" as RoleLevel:
        wbTable = "wb.schema_users";
        wbColumn = "schema_id";
        break;
      case "table" as RoleLevel:
        wbTable = "wb.table_users";
        wbColumn = "table_id";
        break;
    }
    const query: string = `
      INSERT INTO ${wbTable} (role_id,  user_id, ${wbColumn}, updated_at)
      VALUES (${roleResult.payload.id}, ${userId}, ${objectId}, $1)
      ON CONFLICT (user_id, ${wbColumn})
      DO UPDATE SET role_id=EXCLUDED.role_id, updated_at=EXCLUDED.updated_at
    `;
    return await this.executeQuery({
      query: query,
      params: [new Date()],
    } as QueryParams);
  }

  public async userRolesForSchema(
    schemaId: number,
    userId: number
  ): Promise<ServiceResult> {
    let result = await this.executeQuery({
      query: `
        SELECT wb.roles.*
        FROM wb.roles
        JOIN wb.schema_users ON wb.roles.id=wb.schema_users.role_id
        WHERE wb.schema_users.schema_id=$1 AND wb.schema_users.user_id=$2
      `,
      params: [schemaId, userId],
    } as QueryParams);
    if (!result.success) return result;
    const tableUserRoles = Role.parseResult(result.payload);
    result = await this.executeQuery({
      query: `
        SELECT wb.roles.*
        FROM wb.roles
        JOIN wb.schema_users ON wb.roles.id=wb.schema_users.role_id
        WHERE wb.schema_users.schema_id=$1 AND wb.schema_users.user_id=$2
      `,
      params: [schemaId, userId],
    } as QueryParams);
    if (!result.success) return result;
    const schemaUserRoles = Role.parseResult(result.payload);
    return result;
  }

  /**
   * Schemas
   */

  public async createSchema(
    name: string,
    label: string,
    organizationOwnerId?: number,
    userOwnerId?: number
  ): Promise<ServiceResult> {
    const results = await this.executeQueries([
      {
        query: `CREATE SCHEMA ${DAL.sanitize(name)}`,
      } as QueryParams,
      {
        query: `
          INSERT INTO wb.schemas(
            name, label, organization_owner_id, user_owner_id
          ) VALUES($1, $2, $3, $4) RETURNING *
        `,
        params: [name, label, organizationOwnerId, userOwnerId],
      } as QueryParams,
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
      } as QueryParams,
      {
        query: `
          SELECT wb.schemas.*
          FROM wb.schemas
          WHERE name LIKE $1
        `,
        params: [schemaNamePattern],
      } as QueryParams,
    ]);
    if (results[0].success && results[1].success) {
      results[0].payload = Schema.parseResult(results[0].payload);
      results[1].payload = Schema.parseResult(results[1].payload);
      if (results[0].payload.length != results[1].payload.length) {
        return {
          success: false,
          message:
            "dal.schemas: wb.schemas out of sync with information_schema.schemata",
        } as ServiceResult;
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
    } as QueryParams);
    if (result.success) {
      result.payload = Schema.parseResult(result.payload);
      if (result.payload.length == 0) {
        return (<ServiceResult>{
          success: false,
          message: `dal.schemaByName: Could not find schema where name=${name}`,
        }) as ServiceResult;
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
    } as QueryParams);
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

  public async schemasByOrgOwnerAdmin(
    userEmail: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.schemas.*, wb.roles.name as user_role
        FROM wb.schemas
        JOIN wb.organizations ON wb.schemas.organization_owner_id=wb.organizations.id
        JOIN wb.organization_users ON wb.organizations.id=wb.organization_users.organization_id
        JOIN wb.users ON wb.organization_users.user_id=wb.users.id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
        WHERE wb.roles.name='organization_administrator' AND wb.users.email=$1
      `,
      params: [userEmail],
    } as QueryParams);
    if (result.success) result.payload = Schema.parseResult(result.payload);
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
      } as QueryParams,
    ];
    if (del) {
      queriesAndParams.push({
        query: `DROP SCHEMA IF EXISTS ${DAL.sanitize(schemaName)} CASCADE`,
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
          schema_id, user_id, role_id
        ) VALUES($1, $2, $3)
      `,
      params: [schemaId, userId, schemaRoleId],
    } as QueryParams);
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
    } as QueryParams);
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
    } as QueryParams);
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
    } as QueryParams);
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
    } as QueryParams);
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
    } as QueryParams);
    if (result.success) {
      result.payload = result.payload.rows.map(
        (row: { table_name: string }) => row.table_name
      );
    }
    return result;
  }

  public async columnBySchemaTableColumn(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<ServiceResult> {
    const result = await this.columns(schemaName, tableName, columnName);
    if (result.success) result.payload = result.payload[0];
    return result;
  }

  public async columns(
    schemaName: string,
    tableName: string,
    columnName?: string
  ): Promise<ServiceResult> {
    let query: string = `
      SELECT wb.columns.*, information_schema.columns.data_type as type
      FROM wb.columns
      JOIN wb.tables ON wb.columns.table_id=wb.tables.id
      JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
      JOIN information_schema.columns ON (
        wb.columns.name=information_schema.columns.column_name
        AND wb.schemas.name=information_schema.columns.table_schema
      )
      WHERE wb.schemas.name=$1 AND wb.tables.name=$2 AND information_schema.columns.table_name=$2
    `;
    let params: string[] = [schemaName, tableName];
    if (columnName) {
      query = `${query} AND wb.columns.name=$3 AND information_schema.columns.column_name=$3`;
      params.push(columnName);
    }
    const result = await this.executeQuery({
      query: query,
      params: params,
    } as QueryParams);
    if (result.success) result.payload = Column.parseResult(result.payload);
    return result;
  }

  public async discoverColumns(
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT column_name as name, data_type as type
        FROM information_schema.columns
        WHERE table_schema=$1
        AND table_name=$2
      `,
      params: [schemaName, tableName],
    } as QueryParams);
    if (result.success) result.payload = Column.parseResult(result.payload);
    return result;
  }

  // type = foreignKeys|references|all
  public async foreignKeysOrReferences(
    schemaName: string,
    tableNamePattern: string,
    columnNamePattern: string,
    type: string
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableNamePattern = DAL.sanitize(tableNamePattern);
    columnNamePattern = DAL.sanitize(columnNamePattern);
    let whereSql: string = "";
    switch (type) {
      case "FOREIGN_KEYS":
        whereSql = `
          AND fk.table_name LIKE '${tableNamePattern}'
          AND fk.column_name LIKE '${columnNamePattern}'
        `;
        break;
      case "REFERENCES":
        whereSql = `
          AND ref.table_name LIKE '${tableNamePattern}'
          AND ref.column_name LIKE '${columnNamePattern}'
        `;
        break;
      case "ALL":
        whereSql = `
          AND fk.table_name LIKE '${tableNamePattern}'
          AND fk.column_name LIKE '${columnNamePattern}'
        `;
        break;
    }
    const result = await this.executeQuery({
      query: `
        SELECT
        -- unique reference info
        ref.table_name       AS ref_table,
        ref.column_name      AS ref_column,
        refd.constraint_type AS ref_type, -- e.g. UNIQUE or PRIMARY KEY
        -- foreign key info
        fk.table_name        AS fk_table,
        fk.column_name       AS fk_column,
        fk.constraint_name   AS fk_name,
        map.update_rule      AS fk_on_update,
        map.delete_rule      AS fk_on_delete
        -- lists fk constraints AND maps them to pk constraints
        FROM information_schema.referential_constraints AS map
        -- join unique constraints (e.g. PKs constraints) to ref columns info
        INNER JOIN information_schema.key_column_usage AS ref
        ON  ref.constraint_catalog = map.unique_constraint_catalog
        AND ref.constraint_schema = map.unique_constraint_schema
        AND ref.constraint_name = map.unique_constraint_name
        -- optional: to include reference constraint type
        LEFT JOIN information_schema.table_constraints AS refd
        ON  refd.constraint_catalog = ref.constraint_catalog
        AND refd.constraint_schema = ref.constraint_schema
        AND refd.constraint_name = ref.constraint_name
        -- join fk columns to the correct ref columns using ordinal positions
        INNER JOIN information_schema.key_column_usage AS fk
        ON  fk.constraint_catalog = map.constraint_catalog
        AND fk.constraint_schema = map.constraint_schema
        AND fk.constraint_name = map.constraint_name
        AND fk.position_in_unique_constraint = ref.ordinal_position --IMPORTANT!
        WHERE ref.table_schema='${schemaName}'
        AND fk.table_schema='${schemaName}'
        ${whereSql}
      `,
    } as QueryParams);
    if (!result.success) return result;
    const constraints: ConstraintId[] = [];
    for (const row of result.payload.rows) {
      const constraint: ConstraintId = {
        constraintName: row.fk_name,
        tableName: row.fk_table,
        columnName: row.fk_column,
        relTableName: row.ref_table,
        relColumnName: row.ref_column,
      };
      constraints.push(constraint);
    }
    result.payload = constraints;
    return result;
  }

  public async primaryKeys(
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    const result = await this.executeQuery({
      query: `
        SELECT DISTINCT c.column_name, tc.constraint_name
        FROM information_schema.table_constraints tc 
        JOIN information_schema.constraint_column_usage AS ccu
        USING (constraint_schema, constraint_name)
        JOIN information_schema.columns AS c
        ON c.table_schema = tc.constraint_schema
        AND tc.table_name = c.table_name
        AND ccu.column_name = c.column_name
        WHERE constraint_type = 'PRIMARY KEY'
        AND c.table_schema='${schemaName}'
        AND tc.table_name = '${tableName}'
      `,
    } as QueryParams);
    if (result.success) {
      const pKColsConstraints: Record<string, string> = {};
      for (const row of result.payload.rows) {
        pKColsConstraints[row.column_name] = row.constraint_name;
      }
      result.payload = pKColsConstraints;
    }
    return result;
  }

  public async deleteConstraint(
    schemaName: string,
    tableName: string,
    constraintName: string
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    constraintName = DAL.sanitize(constraintName);
    const result = await this.executeQuery({
      query: `
        ALTER TABLE ${schemaName}.${tableName}
        DROP CONSTRAINT IF EXISTS ${constraintName}
      `,
    } as QueryParams);
    return result;
  }

  public async createPrimaryKey(
    schemaName: string,
    tableName: string,
    columnNames: string[]
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    const sanitizedColumnNames: string[] = [];
    for (const columnName of columnNames) {
      sanitizedColumnNames.push(DAL.sanitize(columnName));
    }
    const result = await this.executeQuery({
      query: `
        ALTER TABLE ${schemaName}.${tableName}
        ADD PRIMARY KEY (${sanitizedColumnNames.join(",")});
      `,
    } as QueryParams);
    return result;
  }

  public async createForeignKey(
    schemaName: string,
    tableName: string,
    columnNames: string[],
    parentTableName: string,
    parentColumnNames: string[]
  ): Promise<ServiceResult> {
    log.debug(
      `dal.createForeignKey(${schemaName},${tableName},${columnNames},${parentTableName},${parentColumnNames})`
    );
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    const sanitizedColumnNames: string[] = [];
    for (const columnName of columnNames) {
      sanitizedColumnNames.push(DAL.sanitize(columnName));
    }
    parentTableName = DAL.sanitize(parentTableName);
    const sanitizedParentColumnNames: string[] = [];
    for (const parentColumnName of parentColumnNames) {
      sanitizedParentColumnNames.push(DAL.sanitize(parentColumnName));
    }
    const result = await this.executeQuery({
      query: `
        ALTER TABLE ${schemaName}.${tableName}
        ADD CONSTRAINT ${tableName}_${sanitizedColumnNames.join("_")}_fkey
        FOREIGN KEY (${sanitizedColumnNames.join(",")})
        REFERENCES ${schemaName}.${parentTableName}
          (${sanitizedParentColumnNames.join(",")})
        ON DELETE SET NULL
      `,
    } as QueryParams);
    return result;
  }

  public async tableBySchemaTable(
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
    } as QueryParams);
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
        INSERT INTO wb.tables(schema_id, name, label)
        VALUES ($1, $2, $3)
      `,
        params: [result.payload.id, tableName, tableLabel],
      } as QueryParams,
    ];
    if (create) {
      queriesAndParams.push({
        query: `CREATE TABLE "${schemaName}"."${tableName}"()`,
      } as QueryParams);
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
      } as QueryParams,
    ];
    if (del) {
      queriesAndParams.push({
        query: `DROP TABLE IF EXISTS "${schemaName}"."${tableName}" CASCADE`,
      } as QueryParams);
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
    let result = await this.tableBySchemaTable(schemaName, tableName);
    if (!result.success) return result;
    let params = [];
    let query = `
      UPDATE wb.tables SET
    `;
    let updates: string[] = [];
    if (newTableName) {
      params.push(newTableName);
      updates.push("name=$" + params.length);
    }
    if (newTableLabel) {
      params.push(newTableLabel);
      updates.push("label=$" + params.length);
    }
    params.push(result.payload.id);
    query += `${updates.join(", ")} WHERE id=$${params.length}`;
    const queriesAndParams: Array<QueryParams> = [
      {
        query: query,
        params: params,
      } as QueryParams,
    ];
    if (newTableName) {
      queriesAndParams.push({
        query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          RENAME TO ${newTableName}
        `,
      } as QueryParams);
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
    let result = await this.tableBySchemaTable(schemaName, tableName);
    if (!result.success) return result;
    const queriesAndParams: Array<QueryParams> = [
      {
        query: `
          INSERT INTO wb.columns(table_id, name, label)
          VALUES ($1, $2, $3)
        `,
        params: [result.payload.id, columnName, columnLabel],
      } as QueryParams,
    ];
    if (create) {
      queriesAndParams.push({
        query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          ADD ${columnName} ${columnPGType}
        `,
      } as QueryParams);
    }
    const results: Array<ServiceResult> = await this.executeQueries(
      queriesAndParams
    );
    return results[results.length - 1];
  }

  public async updateColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    newColumnName?: string,
    newColumnLabel?: string,
    newType?: string
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    columnName = DAL.sanitize(columnName);
    const queriesAndParams: Array<QueryParams> = [];
    if (newColumnName || newColumnLabel) {
      let result = await this.columnBySchemaTableColumn(
        schemaName,
        tableName,
        columnName
      );
      if (!result.success) return result;
      let params = [];
      let query = `
        UPDATE wb.columns SET
      `;
      let updates: string[] = [];
      if (newColumnName) {
        params.push(newColumnName);
        updates.push("name=$" + params.length);
      }
      if (newColumnLabel) {
        params.push(newColumnLabel);
        updates.push("label=$" + params.length);
      }
      params.push(result.payload.id);
      query += `${updates.join(", ")} WHERE id=$${params.length}`;
      queriesAndParams.push({
        query: query,
        params: params,
      } as QueryParams);
    }
    if (newType) {
      queriesAndParams.push({
        query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          ALTER COLUMN ${columnName} TYPE ${newType}
        `,
      } as QueryParams);
    }
    if (newColumnName) {
      queriesAndParams.push({
        query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          RENAME COLUMN ${columnName} TO ${newColumnName}
        `,
      } as QueryParams);
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
    let result = await this.tableBySchemaTable(schemaName, tableName);
    if (!result.success) return result;
    const queriesAndParams: Array<QueryParams> = [
      {
        query: `
          DELETE FROM wb.columns
          WHERE table_id=$1 AND name=$2
        `,
        params: [result.payload.id, columnName],
      } as QueryParams,
    ];
    if (del) {
      queriesAndParams.push({
        query: `
          ALTER TABLE "${schemaName}"."${tableName}"
          DROP COLUMN IF EXISTS ${columnName} CASCADE
        `,
      } as QueryParams);
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
    } as QueryParams);
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
    } as QueryParams);
    return result;
  }

  public async saveTableUserSettings(
    tableId: number,
    userId: number,
    settings: object
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        INSERT INTO wb.table_users (
          table_id, user_id, settings
        )
        VALUES($1, $2, $3)
        ON CONFLICT (table_id, user_id) 
        DO UPDATE SET settings = EXCLUDED.settings
      `,
      params: [tableId, userId, settings],
    } as QueryParams);
    return result;
  }
}
