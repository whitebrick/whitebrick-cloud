import { environment } from "./environment";
import { log, errResult } from "./whitebrick-cloud";
import { Pool } from "pg";
import {
  Role,
  RoleLevel,
  User,
  Organization,
  OrganizationUser,
  Schema,
  SchemaUser,
  Table,
  TableUser,
  Column,
} from "./entity";
import { ConstraintId, QueryParams, ServiceResult } from "./types";
import { first } from "voca";
import { result } from "lodash";
import { BgQueue } from "./bg-queue";

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

  /**
   * ========== DB =========
   */

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
        let logTxt = queryParams.query;
        if (logTxt.startsWith("--SKIPLOG"))
          logTxt = `${logTxt.substring(0, 30)}...`;
        log.info(
          `dal.executeQuery QueryParams: ${logTxt}`,
          `    [ ${queryParams.params ? queryParams.params.join(", ") : ""} ]`
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
    } catch (error: any) {
      await client.query("ROLLBACK");
      log.error(JSON.stringify(error));
      results.push(
        errResult({
          message: error.message,
          refCode: "PG_" + error.code,
        } as ServiceResult)
      );
    } finally {
      client.release();
    }
    return results;
  }

  // used for DDL identifiers (eg CREATE TABLE sanitize(tableName))
  public static sanitize(str: string): string {
    return str.replace(/[^\w%]+/g, "");
  }

  public async healthCheck(): Promise<ServiceResult> {
    return await this.discoverSchemas("%", "schema_name", 1);
  }

  /**
   * ========== BG QUEUE ==========
   */

  public async bgQueueSelect(
    columns: string[],
    schemaId: number,
    status?: string,
    limit?: number,
    orderBy?: string
  ): Promise<ServiceResult> {
    if (!limit) limit = 50;
    if (!orderBy) orderBy = "id ASC";
    let statusSql = "";
    if (status) statusSql = `AND status='${status}'`;
    let query = `
      SELECT ${columns.join(",")}
      FROM wb.bg_queue
      WHERE schema_id=$1
      ${statusSql}
      ORDER BY id
      LIMIT ${limit}
    `;
    return await this.executeQuery({
      query: query,
      params: [schemaId],
    } as QueryParams);
  }

  public async bgQueueInsert(
    userId: number,
    schemaId: number,
    status: string,
    key: string,
    data?: object | null
  ): Promise<ServiceResult> {
    if (!data) data = null;
    const result = await this.executeQuery({
      query: `
        INSERT INTO wb.bg_queue(
          user_id, schema_id, status, key, data
        ) VALUES($1, $2, $3, $4, $5) RETURNING *
      `,
      params: [userId, schemaId, status, key, data],
    } as QueryParams);
    return result;
  }

  public async bgQueueUpdateStatus(
    newStatus: string,
    id?: number,
    schemaId?: number,
    currentStatus?: string,
    data?: Record<string, any>
  ): Promise<ServiceResult> {
    let query = `
      UPDATE wb.bg_queue
      SET status=$1, updated_at=$2
      WHERE
    `;
    const whereSql: string[] = [];
    if (id) whereSql.push(`id=${id}`);
    if (schemaId) whereSql.push(`schema_id=${schemaId}`);
    if (currentStatus) whereSql.push(`status='${currentStatus}'`);
    const result = await this.executeQuery({
      query: (query += whereSql.join(" AND ")),
      params: [newStatus, new Date()],
    } as QueryParams);
    return result;
  }

  public async bgQueueDelete(
    id?: number,
    schemaId?: number
  ): Promise<ServiceResult> {
    let sqlWhere;
    if (id) {
      sqlWhere = `id=${id}`;
    } else if (schemaId) {
      sqlWhere = `schema_id=${schemaId}`;
    }
    const result = await this.executeQuery({
      query: `
        DELETE FROM wb.bg_queue
        WHERE ${sqlWhere}
      `,
    } as QueryParams);
    return result;
  }

  /**
   * ========== Roles & Permissions ==========
   */

  public async rolesIdLookup(): Promise<ServiceResult> {
    const nameIdLookup: Record<string, number> = {};
    const result = await this.executeQuery({
      query: `
        SELECT wb.roles.id, wb.roles.name
        FROM wb.roles
        WHERE custom IS false
      `,
    } as QueryParams);
    if (!result.success) return result;
    for (const row of result.payload.rows) {
      nameIdLookup[row.name] = row.id;
    }
    result.payload = nameIdLookup;
    return result;
  }

  public async roleIdsFromNames(roleNames: string[]): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.roles.id
        FROM wb.roles
        WHERE custom IS false
        AND name=ANY($1)
      `,
      params: [roleNames],
    } as QueryParams);
    if (result.success) {
      result.payload = result.payload.rows.map((row: { id: number }) => row.id);
    }
    return result;
  }

  public async roleByName(name: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.roles.*
        FROM wb.roles
        WHERE name=$1 LIMIT 1
      `,
      params: [name],
    } as QueryParams);
    if (result.success) {
      result.payload = Role.parseResult(result.payload)[0];
      if (!result.payload) {
        return errResult({
          wbCode: "ROLE_NOT_FOUND",
          values: [name],
        });
      }
    }
    return result;
  }

  // Typically setting a role directly is explicit,
  // so any implied_from_role_id is cleared unless keepImpliedFrom
  public async setRole(
    userIds: number[],
    roleName: string,
    roleLevel: RoleLevel,
    objectId: number,
    keepImpliedFrom?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `dal.setRole(${userIds},${roleName},${roleLevel},${objectId},${keepImpliedFrom})`
    );
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
    const params: Date[] = [];
    const date = new Date();
    let query: string = `
      INSERT INTO ${wbTable} (role_id,  user_id, ${wbColumn}, updated_at)
      VALUES
    `;
    for (const userId of userIds) {
      query += `
        (
          ${roleResult.payload.id},
          ${userId},
          ${objectId},
          $${params.length + 1}
        )
      `;
      params.push(date);
      if (params.length != userIds.length) query += ", ";
    }
    query += `
      ON CONFLICT (user_id, ${wbColumn})
      DO UPDATE SET
      role_id=EXCLUDED.role_id,
      updated_at=EXCLUDED.updated_at
    `;
    if (!keepImpliedFrom) query += ", implied_from_role_id=NULL";
    return await this.executeQuery({
      query: query,
      params: params,
    } as QueryParams);
  }

  public async deleteRole(
    userIds: number[],
    roleLevel: RoleLevel,
    objectId?: number,
    parentObjectId?: number,
    impliedFromRoles?: string[]
  ): Promise<ServiceResult> {
    const params: (number | number[] | undefined)[] = [userIds];
    let wbTable: string = "";
    let wbWhere: string = "";
    switch (roleLevel) {
      case "organization" as RoleLevel:
        wbTable = "wb.organization_users";
        wbWhere = "AND organization_id=$2";
        params.push(objectId);
        break;
      case "schema" as RoleLevel:
        wbTable = "wb.schema_users";
        if (objectId) {
          wbWhere = "AND schema_id=$2";
          params.push(objectId);
        } else if (parentObjectId) {
          wbWhere = `
            AND schema_id IN (
              SELECT id FROM wb.schemas
              WHERE organization_owner_id=$2
            )
          `;
          params.push(parentObjectId);
        }
        break;
      case "table" as RoleLevel:
        wbTable = "wb.table_users";
        if (objectId) {
          wbWhere = "AND table_id=$2";
          params.push(objectId);
        } else if (parentObjectId) {
          wbWhere = `
            AND table_id IN (
              SELECT id FROM wb.tables
              WHERE schema_id=$2
            )
          `;
          params.push(parentObjectId);
        }
        break;
    }
    let result: ServiceResult = errResult();
    if (impliedFromRoles) {
      wbWhere += `AND implied_from_role_id=ANY($3)`;
      result = await this.roleIdsFromNames(impliedFromRoles);
      if (!result.success) return result;
      params.push(result.payload);
    }
    result = await this.executeQuery({
      query: `
        DELETE FROM ${wbTable}
        WHERE user_id=ANY($1)
        ${wbWhere}
      `,
      params: params,
    } as QueryParams);
    return result;
  }

  public async deleteAndSetTablePermissions(
    tableId: number,
    deleteOnly?: boolean
  ): Promise<ServiceResult> {
    let result = await this.rolesIdLookup();
    if (!result.success) return result;
    const rolesIdLookup = result.payload;
    const queryParams: QueryParams[] = [
      {
        query: `
          DELETE FROM wb.table_permissions
          WHERE table_id=$1
        `,
        params: [tableId],
      } as QueryParams,
    ];
    if (!deleteOnly) {
      for (const tableRole of Object.keys(Role.SYSROLES_TABLES)) {
        for (const permissionPrefix of Role.tablePermissionPrefixes(
          tableRole
        )) {
          queryParams.push({
            query: `
              INSERT INTO wb.table_permissions(table_permission_key, user_id, table_id)
              SELECT '${Role.tablePermissionKey(
                permissionPrefix,
                tableId
              )}', user_id, ${tableId}
              FROM wb.table_users
              JOIN wb.roles ON wb.table_users.role_id=wb.roles.id
              WHERE wb.table_users.table_id=$1 AND wb.roles.name=$2
            `,
            params: [tableId, tableRole],
          } as QueryParams);
        }
      }
    }
    const results = await this.executeQueries(queryParams);
    return results[results.length - 1];
  }

  public async roleAndIdForUserObject(
    userId: number,
    roleLevel: RoleLevel,
    objectIdOrName: number | string,
    parentObjectName?: string
  ): Promise<ServiceResult> {
    log.info(
      `dal.roleAndIdForUserObject(${userId},${roleLevel},${objectIdOrName},${parentObjectName})`
    );
    let objectId: number | undefined = undefined;
    let queryObjId: string = "";
    let sqlJoin: string = "";
    let sqlWhere: string = "";
    if (typeof objectIdOrName === "number") objectId = objectIdOrName;
    const params: (number | string)[] = [userId];
    const paramsObjId: string[] = [];
    switch (roleLevel) {
      case "organization" as RoleLevel:
        sqlJoin = `
         JOIN wb.organization_users ON wb.roles.id=wb.organization_users.role_id
        `;
        sqlWhere = `
         WHERE wb.organization_users.user_id=$1
        `;
        if (objectId) {
          params.push(objectId);
          sqlWhere += `
            AND wb.organization_users.organization_id=$2
          `;
        } else {
          params.push(objectIdOrName);
          sqlJoin += `
            JOIN wb.organizations ON wb.organization_users.organization_id=wb.organizations.id
          `;
          sqlWhere += `
            AND wb.organizations.name=$2
          `;
          queryObjId =
            "SELECT id as object_id FROM wb.organizations WHERE name=$1 LIMIT 1";
          paramsObjId.push(objectIdOrName.toString());
        }
        break;
      case "schema" as RoleLevel:
        sqlJoin = `
         JOIN wb.schema_users ON wb.roles.id=wb.schema_users.role_id
        `;
        sqlWhere = `
         WHERE wb.schema_users.user_id=$1
        `;
        if (objectId) {
          params.push(objectId);
          sqlWhere += `
            AND wb.schema_users.schema_id=$2
          `;
        } else {
          params.push(objectIdOrName);
          sqlJoin += `
            JOIN wb.schemas ON wb.schema_users.schema_id=wb.schemas.id
          `;
          sqlWhere += `
            AND wb.schemas.name=$2
          `;
          queryObjId =
            "SELECT id as object_id FROM wb.schemas WHERE name=$1 LIMIT 1";
          paramsObjId.push(objectIdOrName.toString());
        }
        break;
      case "table" as RoleLevel:
        sqlJoin = `
         JOIN wb.table_users ON wb.roles.id=wb.table_users.role_id
        `;
        sqlWhere = `
         WHERE wb.table_users.user_id=$1
        `;
        if (objectId) {
          params.push(objectId);
          sqlWhere += `
            AND wb.table_users.table_id=$2
          `;
        } else {
          if (!parentObjectName) {
            throw `dal.roleNameForUserObject parentObjectName required for table level`;
          }
          params.push(objectIdOrName, parentObjectName);
          sqlJoin += `
            JOIN wb.tables ON wb.table_users.table_id=wb.tables.id
            JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
          `;
          sqlWhere += `
            AND wb.tables.name=$2
            AND wb.schemas.name=$3
          `;
          queryObjId = `
            SELECT wb.tables.id as object_id
            FROM wb.tables
            JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
            WHERE wb.tables.name=$1 AND wb.schemas.name=$2
            LIMIT 1
          `;
          paramsObjId.push(objectIdOrName.toString(), parentObjectName);
        }
        break;
    }
    const queries: QueryParams[] = [
      {
        query: `
        SELECT wb.roles.name as role_name
        FROM wb.roles
        ${sqlJoin}
        ${sqlWhere}  
        LIMIT 1
      `,
        params: params,
      } as QueryParams,
    ];
    if (!objectId) {
      queries.push({
        query: queryObjId,
        params: paramsObjId,
      } as QueryParams);
    }
    const results = await this.executeQueries(queries);
    if (!results[0].success) return results[0];
    if (results[1] && !results[1].success) return results[1];
    const result: ServiceResult = {
      success: true,
      payload: {
        roleName: null,
        objectId: null,
      },
    };
    if (results[0].payload.rows.length == 1) {
      result.payload.roleName = results[0].payload.rows[0].role_name;
    }
    if (objectId) {
      result.payload.objectId = objectId;
    } else if (results[1].payload.rows.length == 1) {
      result.payload.objectId = results[1].payload.rows[0].object_id;
    }
    return result;
  }

  /**
   * ========== Users =========
   */

  public async userIdFromAuthId(authId: string): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.users.id
        FROM wb.users
        WHERE auth_id=$1
        LIMIT 1
      `,
      params: [authId],
    } as QueryParams);
    if (result.success) {
      if (result.payload.rows.length == 0) {
        return errResult({
          wbCode: "WB_USER_NOT_FOUND",
          values: [authId],
        });
      }
      result.payload = result.payload.rows[0].id;
    }
    return result;
  }

  public async users(
    ids?: number[],
    emails?: string[],
    searchPattern?: string
  ): Promise<ServiceResult> {
    let sqlWhere: string = "";
    let params: (number[] | string[] | string)[] = [];
    if (ids) {
      sqlWhere = "AND id=ANY($1)";
      params.push(ids);
    } else if (emails) {
      sqlWhere = "AND email=ANY($1)";
      params.push(emails.map((v) => v.toLowerCase()));
    } else if (searchPattern) {
      sqlWhere = `
        AND email LIKE $1
        OR first_name LIKE $1
        OR last_name LIKE $1
      `;
      params.push(searchPattern.replace(/\*/g, "%"));
    }
    const result = await this.executeQuery({
      query: `
      SELECT wb.users.*
      FROM wb.users
      WHERE id NOT IN (${User.SYS_ADMIN_ID})
      ${sqlWhere}
      ORDER BY email
    `,
      params: params,
    } as QueryParams);
    if (result.success) result.payload = User.parseResult(result.payload);
    return result;
  }

  public async createUser(
    authId?: string,
    email?: string,
    firstName?: string,
    lastName?: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        INSERT INTO wb.users(
          auth_id, email, first_name, last_name
        ) VALUES($1, $2, $3, $4) RETURNING *
      `,
      params: [authId, email, firstName, lastName],
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
      return errResult({
        message: "dal.updateUser: all parameters are null",
      } as ServiceResult);
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
    const userIdSql = `SELECT id FROM wb.users
            WHERE email like 'test\\_%${environment.testUserEmailDomain}'`;
    const results = await this.executeQueries([
      {
        query: `
          UPDATE wb.schemas SET user_owner_id=1
          WHERE user_owner_id IN (${userIdSql})
        `,
      } as QueryParams,
      {
        query: `
          DELETE FROM wb.schema_users
          WHERE user_id IN (${userIdSql})
        `,
      } as QueryParams,
      {
        query: `
          DELETE FROM wb.organization_users
          WHERE user_id IN (${userIdSql})
        `,
      } as QueryParams,
      {
        query: `
          DELETE FROM wb.table_users
          WHERE user_id IN (${userIdSql})
        `,
      } as QueryParams,
      {
        query: `
          DELETE FROM wb.table_permissions
          WHERE user_id IN (${userIdSql})
        `,
      } as QueryParams,
      {
        query: `
          DELETE FROM wb.users
          WHERE email like 'test\\_%${environment.testUserEmailDomain}'
        `,
      } as QueryParams,
    ]);
    return results[result.length - 1];
  }

  /**
   * ========== Organizations ==========
   */

  public async organizations(
    organizationIds?: number[],
    organizationNames?: string[],
    organizationNamePattern?: string
  ): Promise<ServiceResult> {
    const params: (string[] | number[] | string)[] = [];
    let query: string = `
      SELECT wb.organizations.*
      FROM wb.organizations
    `;
    if (organizationIds) {
      query += `
        WHERE wb.organizations.id=ANY($1)
      `;
      params.push(organizationIds);
    } else if (organizationNames) {
      query += `
        WHERE wb.organizations.name=ANY($1)
      `;
      params.push(organizationNames);
    } else if (organizationNamePattern) {
      query += `
        WHERE wb.organizations.name LIKE $1
      `;
      params.push(organizationNamePattern);
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

  // userRole and userRoleImpliedFrom only returned if userIds/Emails.length==1
  public async organizationsByUsers(
    userIds?: number[],
    userEmails?: string[],
    organizationNames?: string[],
    withSettings?: boolean
  ): Promise<ServiceResult> {
    const params: (number[] | string[])[] = [];
    let sqlSelect: string = "";
    let sqlWhere: string = "";
    if (userIds) {
      sqlWhere = "WHERE wb.users.id=ANY($1)";
      params.push(userIds);
    } else if (userEmails) {
      sqlWhere = "WHERE wb.users.email=ANY($1)";
      params.push(userEmails);
    }
    if (organizationNames) {
      sqlWhere += " AND wb.organizations.name=ANY($2)";
      params.push(organizationNames);
    }
    if (withSettings) {
      sqlSelect += ", wb.schema_users.settings as settings";
    }
    const result = await this.executeQuery({
      query: `
        SELECT
        wb.organizations.*,
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from
        ${sqlSelect}
        FROM wb.organizations
        JOIN wb.organization_users ON wb.organizations.id=wb.organization_users.organization_id
        JOIN wb.users ON wb.organization_users.user_id=wb.users.id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.organization_users.implied_from_role_id=implied_roles.id
        ${sqlWhere}
      `,
      params: params,
    } as QueryParams);
    if (result.success) {
      result.payload = Organization.parseResult(result.payload);
    }
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
    query += ` WHERE name=$${params.length} RETURNING *`;
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
    return await this.deleteOrganizations(name.replace(/\%/g, ""));
  }

  public async deleteTestOrganizations(): Promise<ServiceResult> {
    return await this.deleteOrganizations("test\\_%");
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
   * ========== Organization Users ==========
   */

  public async organizationUsers(
    name?: string,
    id?: number,
    roleNames?: string[],
    userIds?: number[],
    withSettings?: boolean
  ): Promise<ServiceResult> {
    let sqlSelect: string = "";
    let sqlWhere: string = "";
    const params: (string | number | string[] | number[])[] = [];
    if (id) {
      sqlWhere = "WHERE wb.organization_users.organization_id=$1";
      params.push(id);
    } else if (name) {
      sqlWhere = "WHERE wb.organizations.name=$1";
      params.push(name);
    }
    if (roleNames) {
      sqlWhere += " AND wb.roles.name=ANY($2)";
      params.push(roleNames);
    }
    if (userIds) {
      sqlWhere += ` AND wb.organization_users.user_id=ANY($${
        params.length + 1
      })`;
      params.push(userIds);
    }
    if (withSettings) {
      sqlSelect = "wb.organization_users.settings,";
    }
    const result = await this.executeQuery({
      query: `
        SELECT
        wb.organization_users.organization_id,
        wb.organization_users.user_id,
        wb.organization_users.role_id,
        wb.organization_users.implied_from_role_id,
        wb.organization_users.created_at,
        wb.organization_users.updated_at,
        ${sqlSelect}
        wb.organizations.name as organization_name,
        wb.users.email as user_email,
        wb.users.first_name as user_first_name,
        wb.users.last_name as user_last_name,
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from
        FROM wb.organization_users
        JOIN wb.users ON wb.organization_users.user_id=wb.users.id
        JOIN wb.organizations ON wb.organization_users.organization_id=wb.organizations.id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.organization_users.implied_from_role_id=implied_roles.id
        ${sqlWhere}
      `,
      params: params,
    } as QueryParams);
    if (result.success)
      result.payload = OrganizationUser.parseResult(result.payload);
    return result;
  }

  public async saveOrganizationUserSettings(
    organizationId: number,
    userId: number,
    settings: object
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        UPDATE wb.organization_users
        SET settings=$1, updated_at=$2
        WHERE organization_id=$3
        AND user_id=$4
      `,
      params: [settings, new Date(), organizationId, userId],
    } as QueryParams);
    return result;
  }

  /**
   * ========== Schemas ==========
   */

  static sqlScheamaStatusSelect: string = `
    CASE
      WHEN wb.bg_queue.id IS NOT NULL THEN '${Schema.STATUS.rebuilding}'
      ELSE '${Schema.STATUS.ready}'
    END status
  `;

  static sqlScheamaStatusJoin: string = `
    LEFT JOIN wb.bg_queue ON (
      wb.schemas.id=wb.bg_queue.schema_id
      AND wb.bg_queue.status='Running'
      AND wb.bg_queue.key IN ('${BgQueue.TABLE_BUSY_KEYS.join("','")}')
    )
  `;

  public async schemas(
    schemaIds?: number[],
    schemaNames?: string[],
    schemaNamePattern?: string,
    orderBy?: string,
    limit?: number,
    wbOnly?: boolean
  ): Promise<ServiceResult> {
    const pgParams: (string[] | number[] | string)[] = [
      Schema.SYS_SCHEMA_NAMES,
    ];
    const wbParams: (string[] | number[] | string)[] = [];
    let sqlPgWhere: string = "";
    let sqlWbWhere: string = "";
    if (schemaIds) {
      sqlWbWhere = "WHERE id=ANY($1)";
      wbParams.push(schemaIds);
    } else if (schemaNames) {
      sqlPgWhere = "AND schema_name=ANY($2)";
      pgParams.push(schemaNames);
      sqlWbWhere = "WHERE name=ANY($1)";
      wbParams.push(schemaNames);
    } else if (schemaNamePattern) {
      sqlPgWhere = "AND schema_name LIKE $2";
      pgParams.push(schemaNamePattern);
      sqlWbWhere = "WHERE name LIKE $1";
      wbParams.push(schemaNamePattern);
    } else {
      return errResult({
        message:
          "dal.schemas: One of schemaIds, schemaNames or schemaNamePattern must be specified.",
      } as ServiceResult);
    }
    let sqlOrderBy = "ORDER BY name";
    if (orderBy) {
      const split = orderBy.split(" ");
      sqlOrderBy = `ORDER BY ${DAL.sanitize(split[0])}`;
      if (split.length == 2) sqlOrderBy += ` ${DAL.sanitize(split[1])}`;
    }
    let sqlLimit = "";
    if (limit) sqlLimit = `LIMIT ${limit}`;
    const queries: QueryParams[] = [
      {
        query: `
          SELECT wb.schemas.*,
          ${DAL.sqlScheamaStatusSelect}
          FROM wb.schemas
          ${DAL.sqlScheamaStatusJoin}
          ${sqlWbWhere}
          ${sqlOrderBy}
          ${sqlLimit}
        `,
        params: wbParams,
      } as QueryParams,
    ];
    if (!wbOnly && !limit) {
      queries.push({
        query: `
          SELECT information_schema.schemata.*
          FROM information_schema.schemata
          WHERE schema_name NOT LIKE 'pg_%'
          AND schema_name!=ANY($1)
          ${sqlPgWhere}
        `,
        params: pgParams,
      } as QueryParams);
    }
    const results = await this.executeQueries(queries);
    if (!results[0].success) return results[0];
    // if (!wbOnly) {
    //   if (!results[1].success) return results[1];
    //   if (results[0].payload.rows.length != results[1].payload.rows.length) {
    //     return errResult({
    //       message:
    //         "dal.schemas: wb.schemas out of sync with information_schema.schemata",
    //     } as ServiceResult);
    //   }
    // }
    results[0].payload = Schema.parseResult(results[0].payload);
    return results[0];
  }

  public async discoverSchemas(
    schemaNamePattern?: string,
    orderBy?: string,
    limit?: number
  ): Promise<ServiceResult> {
    if (!schemaNamePattern) schemaNamePattern = "%";
    if (!orderBy) orderBy = "schema_name";
    let sqlLimit = "";
    if (limit) sqlLimit = `LIMIT ${limit}`;
    const result = await this.executeQuery({
      query: `
        SELECT information_schema.schemata.schema_name
        FROM information_schema.schemata
        WHERE schema_name NOT LIKE 'pg_%'
        AND schema_name!=ANY($1)
        AND schema_name LIKE '${schemaNamePattern}'
        ORDER BY ${orderBy}
        ${sqlLimit}
      `,
      params: [Schema.SYS_SCHEMA_NAMES],
    } as QueryParams);
    if (result.success) {
      result.payload = result.payload.rows.map(
        (row: { schema_name: string }) => row.schema_name
      );
    }
    return result;
  }

  public async nextUnassignedDemoSchema(schemaNamePattern: string) {
    const result = await this.executeQuery({
      query: `
        SELECT wb.schemas.*,
        ${DAL.sqlScheamaStatusSelect}
        FROM wb.schemas
        ${DAL.sqlScheamaStatusJoin}
        WHERE wb.schemas.name LIKE '${schemaNamePattern}'
        AND wb.schemas.user_owner_id=${User.SYS_ADMIN_ID}
        ORDER BY name
        LIMIT 1
      `,
    } as QueryParams);
    if (result.success) result.payload = Schema.parseResult(result.payload)[0];
    return result;
  }

  public async schemasByUsers(
    userIds?: number[],
    userEmails?: string[],
    schemaNames?: string[],
    withSettings?: boolean
  ): Promise<ServiceResult> {
    const params: (number[] | string[])[] = [];
    let sqlSelect: string = "";
    let sqlWhere: string = "";
    if (userIds) {
      sqlWhere = "WHERE wb.users.id=ANY($1)";
      params.push(userIds);
    } else if (userEmails) {
      sqlWhere = "WHERE wb.users.email=ANY($1)";
      params.push(userEmails);
    }
    if (schemaNames) {
      sqlWhere += "AND wb.schemas.name=ANY($2)";
      params.push(schemaNames);
    }
    if (withSettings) {
      sqlSelect += ", wb.schema_users.settings as settings";
    }
    const result = await this.executeQuery({
      query: `
        SELECT
        wb.schemas.*,
        ${DAL.sqlScheamaStatusSelect},
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from,
        wb.organizations.name as organization_owner_name,
        user_owners.email as user_owner_email
        ${sqlSelect}
        FROM wb.schemas
        ${DAL.sqlScheamaStatusJoin}
        JOIN wb.schema_users ON wb.schemas.id=wb.schema_users.schema_id
        JOIN wb.users ON wb.schema_users.user_id=wb.users.id
        JOIN wb.roles ON wb.schema_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.schema_users.implied_from_role_id=implied_roles.id
        LEFT JOIN wb.users user_owners ON wb.schemas.user_owner_id=user_owners.id
        LEFT JOIN wb.organizations ON wb.schemas.organization_owner_id=wb.organizations.id
        ${sqlWhere}
      `,
      params: params,
    } as QueryParams);
    if (result.success) result.payload = Schema.parseResult(result.payload);
    return result;
  }

  public async schemasByUserOwner(
    userId?: number,
    userEmail?: string
  ): Promise<ServiceResult> {
    const params: (number | string)[] = [];
    let sqlWhere: string = "";
    if (userId) {
      sqlWhere = "WHERE wb.users.id=$1";
      params.push(userId);
    } else if (userEmail) {
      sqlWhere = "WHERE wb.users.email=$1";
      params.push(userEmail);
    }
    const result = await this.executeQuery({
      query: `
        SELECT
        wb.schemas.*,
        ${DAL.sqlScheamaStatusSelect},
        wb.users.email as user_owner_email,
        'schema_owner' as role_name
        FROM wb.schemas
        ${DAL.sqlScheamaStatusJoin}
        JOIN wb.users ON wb.schemas.user_owner_id=wb.users.id
        ${sqlWhere}
      `,
      params: params,
    } as QueryParams);
    if (result.success) result.payload = Schema.parseResult(result.payload);
    return result;
  }

  public async schemasByOrganizationOwner(
    currentUserId?: number,
    organizationId?: number,
    organizationName?: string
  ): Promise<ServiceResult> {
    const params: (number | string)[] = [];
    let sqlWhere: string = "";
    if (organizationId) {
      sqlWhere = "WHERE wb.organizations.id=$1";
      params.push(organizationId);
    } else if (organizationName) {
      sqlWhere = `WHERE wb.organizations.name=$1`;
      params.push(organizationName);
    }
    if (currentUserId) {
      sqlWhere += `AND wb.schema_users.user_id=$2`;
      params.push(currentUserId);
    }
    const result = await this.executeQuery({
      query: `
        SELECT
        wb.schemas.*,
        ${DAL.sqlScheamaStatusSelect},
        wb.roles.name as role_name,
        schema_user_implied_roles.name as role_implied_from,
        wb.organizations.name as organization_owner_name
        FROM wb.schemas
        ${DAL.sqlScheamaStatusJoin}
        JOIN wb.organizations ON wb.schemas.organization_owner_id=wb.organizations.id
        LEFT JOIN wb.schema_users ON wb.schemas.id=wb.schema_users.schema_id
        JOIN wb.roles on wb.schema_users.role_id=wb.roles.id
        LEFT JOIN wb.roles schema_user_implied_roles ON wb.schema_users.implied_from_role_id=schema_user_implied_roles.id
        ${sqlWhere}
      `,
      params: params,
    } as QueryParams);
    if (result.success) result.payload = Schema.parseResult(result.payload);
    return result;
  }

  public async schemasByOrganizationOwnerAdmin(
    userId?: number,
    userEmail?: string
  ): Promise<ServiceResult> {
    const params: (number | string)[] = [];
    let sqlWhere: string = "";
    if (userId) {
      sqlWhere = "AND wb.users.id=$1";
      params.push(userId);
    } else if (userEmail) {
      sqlWhere = "AND wb.users.email=$1";
      params.push(userEmail);
    }
    const result = await this.executeQuery({
      query: `
        SELECT
        wb.schemas.*,
        ${DAL.sqlScheamaStatusSelect},
        wb.organizations.name as organization_owner_name
        schema_user_roles.name as role_name,
        schema_user_implied_roles.name as role_implied_from,
        FROM wb.schemas
        ${DAL.sqlScheamaStatusJoin}
        JOIN wb.organizations ON wb.schemas.organization_owner_id=wb.organizations.id
        JOIN wb.organization_users ON wb.organizations.id=wb.organization_users.organization_id
        JOIN wb.users ON wb.organization_users.user_id=wb.users.id
        JOIN wb.roles ON wb.organization_users.role_id=wb.roles.id
        JOIN wb.schema_users ON wb.schemas.id=wb.schema_users.schema_id
        JOIN wb.roles schema_user_roles ON wb.schema_users.role_id=schema_user_roles.id
        LEFT JOIN wb.roles schema_user_implied_roles ON wb.schema_users.implied_from_role_id=schema_user_implied_roles.id
        WHERE wb.roles.name='organization_administrator'
        ${sqlWhere}
      `,
      params: params,
    } as QueryParams);
    if (result.success) result.payload = Schema.parseResult(result.payload);
    return result;
  }

  public async addOrCreateSchema(
    name: string,
    label: string,
    organizationOwnerId?: number,
    userOwnerId?: number,
    create?: boolean
  ): Promise<ServiceResult> {
    name = DAL.sanitize(name);
    const queries: QueryParams[] = [
      {
        query: `
          INSERT INTO wb.schemas(
            name, label, organization_owner_id, user_owner_id
          ) VALUES($1, $2, $3, $4) RETURNING *
        `,
        params: [name, label, organizationOwnerId, userOwnerId],
      } as QueryParams,
    ];
    if (create) {
      queries.push({
        query: `CREATE SCHEMA ${name}`,
      } as QueryParams);
    }
    const results = await this.executeQueries(queries);
    if (!results[0].success) return results[0];
    if (create && !results[1].success) return results[1];
    results[0].payload = Schema.parseResult(results[0].payload)[0];
    return results[0];
  }

  public async updateSchema(
    schema: Schema,
    newSchemaName?: string,
    newSchemaLabel?: string,
    newOrganizationOwnerId?: number,
    newUserOwnerId?: number
  ): Promise<ServiceResult> {
    log.info(
      `dal.updateSchema(${schema},${newSchemaName},${newSchemaLabel},${newOrganizationOwnerId},${newUserOwnerId})`
    );
    if (newSchemaName) newSchemaName = DAL.sanitize(newSchemaName);
    let params = [];
    let query = `
      UPDATE wb.schemas SET
    `;
    let updates: string[] = [];
    if (newSchemaName) {
      params.push(newSchemaName);
      updates.push("name=$" + params.length);
    }
    if (newSchemaLabel) {
      params.push(newSchemaLabel);
      updates.push("label=$" + params.length);
    }
    if (newOrganizationOwnerId) {
      params.push(newOrganizationOwnerId);
      updates.push("organization_owner_id=$" + params.length);
      updates.push("organization_user_id=NULL");
    }
    if (newUserOwnerId) {
      params.push(newUserOwnerId);
      updates.push("user_owner_id=$" + params.length);
      updates.push("organization_owner_id=NULL");
    }
    params.push(schema.id);
    query += `
      ${updates.join(", ")}
      WHERE id=$${params.length}
      RETURNING *
    `;
    const queriesAndParams: Array<QueryParams> = [
      {
        query: query,
        params: params,
      } as QueryParams,
    ];
    if (newSchemaName) {
      queriesAndParams.push({
        query: `
          ALTER SCHEMA "${schema.name}"
          RENAME TO ${newSchemaName}
        `,
      } as QueryParams);
    }
    const results: Array<ServiceResult> = await this.executeQueries(
      queriesAndParams
    );
    if (newSchemaName && !results[1].success) return results[1];
    if (results[0].success) {
      results[0].payload = Schema.parseResult(results[0].payload)[0];
    }
    return results[0];
  }

  public async removeOrDeleteSchema(
    schemaName: string,
    del?: boolean
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
   * ========== Schema Users ==========
   */

  public async schemaUsers(
    schemaName: string,
    roleNames?: string[],
    userIds?: number[],
    impliedFromRoleId?: number,
    withSettings?: boolean
  ): Promise<ServiceResult> {
    const params: (string | string[] | number | number[])[] = [schemaName];
    let sqlSelect: string = "";
    let sqlWhere = "";
    if (roleNames) {
      params.push(roleNames);
      sqlWhere = `AND wb.roles.name=ANY($${params.length})`;
    }
    if (userIds) {
      params.push(userIds);
      sqlWhere = `AND wb.schema_users.user_id=ANY($${params.length})`;
    }
    if (impliedFromRoleId) {
      params.push(impliedFromRoleId);
      sqlWhere = `AND wb.schema_users.implied_from_role_id=${params.length}`;
    }
    if (withSettings) {
      sqlSelect = "wb.organization_users.settings,";
    }
    const result = await this.executeQuery({
      query: `
        SELECT
        wb.schema_users.schema_id,
        wb.schema_users.user_id,
        wb.schema_users.role_id,
        wb.schema_users.implied_from_role_id,
        wb.schema_users.created_at,
        wb.schema_users.updated_at,
        ${sqlSelect}
        wb.schemas.name as schema_name,
        wb.users.email as user_email,
        wb.users.first_name as user_first_name,
        wb.users.last_name as user_last_name,
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from
        FROM wb.schema_users
        JOIN wb.schemas ON wb.schema_users.schema_id=wb.schemas.id
        JOIN wb.users ON wb.schema_users.user_id=wb.users.id
        JOIN wb.roles ON wb.schema_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.schema_users.implied_from_role_id=implied_roles.id
        WHERE wb.schemas.name=$1
        ${sqlWhere}
      `,
      params: params,
    } as QueryParams);
    if (result.success) {
      result.payload = SchemaUser.parseResult(result.payload);
      if (!result.payload) {
        return errResult({
          wbCode: "WB_SCHEMA_USERS_NOT_FOUND",
          values: [schemaName],
        });
      }
    }
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

  public async saveSchemaUserSettings(
    schemaId: number,
    userId: number,
    settings: object
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        UPDATE wb.schema_users
        SET settings=$1, updated_at=$2
        WHERE schema_id=$3
        AND user_id=$4
      `,
      params: [settings, new Date(), schemaId, userId],
    } as QueryParams);
    return result;
  }

  /**
   * ========== Tables ==========
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

  public async tablesByUsers(
    schemaName: string,
    userIds?: number[],
    userEmails?: string[],
    tableNames?: string[],
    withSettings?: boolean
  ): Promise<ServiceResult> {
    const params: (string | number[] | string[])[] = [schemaName];
    let sqlSelect: string = "";
    let sqlWhere: string = "";
    let onlyAdminUser: boolean = false;
    if (userIds && userIds.length == 1 && userIds[0] == User.SYS_ADMIN_ID) {
      onlyAdminUser = true;
    }
    if (userIds && !onlyAdminUser) {
      params.push(userIds);
      sqlWhere = `AND wb.users.id=ANY($${params.length}) `;
    } else if (userEmails) {
      params.push(userEmails);
      sqlWhere = `AND wb.users.email=ANY($${params.length}) `;
    }
    if (tableNames) {
      params.push(tableNames);
      sqlWhere += `AND wb.tables.name=ANY($${params.length})`;
    }
    if (withSettings) {
      sqlSelect += ", wb.table_users.settings as settings";
    }
    const result = await this.executeQuery({
      query: `
        SELECT
        wb.tables.*,
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from
        ${sqlSelect}
        FROM wb.tables
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        JOIN wb.table_users ON wb.tables.id=wb.table_users.table_id
        JOIN wb.users ON wb.table_users.user_id=wb.users.id
        JOIN wb.roles ON wb.table_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.table_users.implied_from_role_id=implied_roles.id
        WHERE wb.schemas.name=$1
        ${sqlWhere}
      `,
      params: params,
    } as QueryParams);
    if (result.success) result.payload = Table.parseResult(result.payload);
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
    let sqlWhere: string = "";
    switch (type) {
      case "FOREIGN_KEYS":
        sqlWhere = `
          AND fk.table_name LIKE '${tableNamePattern}'
          AND fk.column_name LIKE '${columnNamePattern}'
        `;
        break;
      case "REFERENCES":
        sqlWhere = `
          AND ref.table_name LIKE '${tableNamePattern}'
          AND ref.column_name LIKE '${columnNamePattern}'
        `;
        break;
      case "ALL":
        sqlWhere = `
          AND fk.table_name LIKE '${tableNamePattern}'
          AND fk.column_name LIKE '${columnNamePattern}'
        `;
        break;
    }
    const result = await this.executeQuery({
      query: `--SKIPLOG foreignKeysOrReferences
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
        map.delete_rule      AS fk_on_delete,
        -- add labels
        tables_ref.label     AS ref_table_label,
        columns_ref.label    AS ref_column_label,
        tables_fk.label      AS fk_table_label,
        columns_fk.label     AS fk_column_label
        -- lists fk constraints AND maps them to pk constraints
        FROM information_schema.referential_constraints AS map
        -- join unique constraints (e.g. PKs constraints) to ref columns info
        JOIN information_schema.key_column_usage AS ref
        ON  ref.constraint_catalog = map.unique_constraint_catalog
        AND ref.constraint_schema = map.unique_constraint_schema
        AND ref.constraint_name = map.unique_constraint_name
        -- optional: to include reference constraint type
        LEFT JOIN information_schema.table_constraints AS refd
        ON  refd.constraint_catalog = ref.constraint_catalog
        AND refd.constraint_schema = ref.constraint_schema
        AND refd.constraint_name = ref.constraint_name
        -- join fk columns to the correct ref columns using ordinal positions
        JOIN information_schema.key_column_usage AS fk
        ON  fk.constraint_catalog = map.constraint_catalog
        AND fk.constraint_schema = map.constraint_schema
        AND fk.constraint_name = map.constraint_name
        AND fk.position_in_unique_constraint = ref.ordinal_position --IMPORTANT!
        -- add labels
        JOIN wb.schemas ON schemas.name=ref.table_schema
        JOIN wb.tables tables_ref ON (tables_ref.schema_id=wb.schemas.id AND tables_ref.name=ref.table_name)
        JOIN wb.columns columns_ref ON (columns_ref.table_id=tables_ref.id AND columns_ref.name=ref.column_name)
        JOIN wb.tables tables_fk ON (tables_fk.schema_id=wb.schemas.id AND tables_fk.name=fk.table_name )
        JOIN wb.columns columns_fk ON (columns_fk.table_id=tables_fk.id AND columns_fk.name=fk.column_name)
        WHERE ref.table_schema='${schemaName}'
        AND fk.table_schema='${schemaName}'
        ${sqlWhere}
      `,
    } as QueryParams);
    if (!result.success) return result;
    const constraints: ConstraintId[] = [];
    for (const row of result.payload.rows) {
      const constraint: ConstraintId = {
        constraintName: row.fk_name,
        tableName: row.fk_table,
        tableLabel: row.fk_table_label,
        columnName: row.fk_column,
        columnLabel: row.fk_column_label,
        relTableName: row.ref_table,
        relTableLabel: row.ref_table_label,
        relColumnName: row.ref_column,
        relColumnLabel: row.ref_column_label,
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
    log.info(
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

  public async tableBySchemaNameTableName(
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    const result = await this.executeQuery({
      query: `
        SELECT wb.tables.*, wb.schemas.name as schema_name
        FROM wb.tables
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        WHERE wb.schemas.name=$1 AND wb.tables.name=$2 LIMIT 1
      `,
      params: [schemaName, tableName],
    } as QueryParams);
    if (result.success) {
      result.payload = Table.parseResult(result.payload)[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_TABLE_NOT_FOUND",
          values: [schemaName, tableName],
        });
      }
    }
    return result;
  }

  public async addOrCreateTable(
    schemaName: string,
    tableName: string,
    tableLabel: string,
    create: boolean
  ): Promise<ServiceResult> {
    log.info(
      `dal.addOrCreateTable ${schemaName} ${tableName} ${tableLabel} ${create}`
    );
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    let result = await this.schemas(undefined, [schemaName]);
    if (!result.success) return result;
    const queriesAndParams: Array<QueryParams> = [
      {
        query: `
        INSERT INTO wb.tables(schema_id, name, label)
        VALUES ($1, $2, $3) RETURNING *
      `,
        params: [result.payload[0].id, tableName, tableLabel],
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
    if (create && !results[1].success) return results[1];
    if (results[0].success) {
      results[0].payload = Table.parseResult(results[0].payload)[0];
    }
    return results[0];
  }

  public async removeOrDeleteTable(
    schemaName: string,
    tableName: string,
    del: boolean
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    let result = await this.schemas(undefined, [schemaName]);
    if (!result.success) return result;
    const queriesAndParams: Array<QueryParams> = [
      {
        query: `
          DELETE FROM wb.tables
          WHERE schema_id=$1 AND name=$2
        `,
        params: [result.payload[0].id, tableName],
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
    let result = await this.tableBySchemaNameTableName(schemaName, tableName);
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
    query += `
      ${updates.join(", ")}
      WHERE id=$${params.length}
      RETURNING *
    `;
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
    if (newTableName && !results[1].success) return results[1];
    if (results[0].success) {
      results[0].payload = Table.parseResult(results[0].payload)[0];
      results[0].payload.schemaName = schemaName;
    }
    return results[0];
  }

  /**
   * ========== Table Users ==========
   */

  public async tableUsers(
    schemaName: string,
    tableName: string,
    userIds?: number[],
    withSettings?: boolean
  ): Promise<ServiceResult> {
    const params: (string | number[])[] = [schemaName, tableName];
    let sqlSelect: string = "";
    let sqlWhere = "";
    if (userIds) {
      sqlWhere = "AND wb.table_users.user_id=ANY($3)";
      params.push(userIds);
    }
    if (withSettings) {
      sqlSelect = "wb.organization_users.settings,";
    }
    const result = await this.executeQuery({
      query: `
        SELECT
        wb.table_users.table_id,
        wb.table_users.user_id,
        wb.table_users.role_id,
        wb.table_users.implied_from_role_id,
        wb.table_users.created_at,
        wb.table_users.updated_at,
        ${sqlSelect}
        wb.schemas.name as schema_name,
        wb.tables.name as table_name,
        wb.users.email as user_email,
        wb.users.first_name as user_first_name,
        wb.users.last_name as user_last_name,
        wb.roles.name as role_name,
        implied_roles.name as role_implied_from
        FROM wb.table_users
        JOIN wb.tables ON wb.table_users.table_id=wb.tables.id
        JOIN wb.schemas ON wb.tables.schema_id=wb.schemas.id
        JOIN wb.users ON wb.table_users.user_id=wb.users.id
        JOIN wb.roles ON wb.table_users.role_id=wb.roles.id
        LEFT JOIN wb.roles implied_roles ON wb.table_users.implied_from_role_id=implied_roles.id
        WHERE wb.schemas.name=$1 AND wb.tables.name=$2
        ${sqlWhere}
      `,
      params: params,
    } as QueryParams);
    if (result.success) {
      result.payload = TableUser.parseResult(result.payload);
      if (!result.payload) {
        return errResult({
          wbCode: "WB_TABLE_USERS_NOT_FOUND",
          values: [schemaName, tableName],
        });
      }
    }
    return result;
  }

  // if !tableIds all tables for schema
  // if !userIds all schema_users
  public async setSchemaUserRolesFromOrganizationRoles(
    organizationId: number,
    roleMap?: Record<string, string>, // eg { schema_owner: "table_administrator" }
    schemaIds?: number[],
    userIds?: number[],
    clearExistingImpliedFromRoleName?: string
  ): Promise<ServiceResult> {
    log.info(
      `dal.setSchemaUserRolesFromOrganizationRoles(${organizationId}, <roleMap>, ${schemaIds}, ${userIds}, ${clearExistingImpliedFromRoleName})`
    );
    let result = await this.rolesIdLookup();
    if (!result.success) return result;
    let whereSchemasSql = "";
    let whereUsersSql = "";
    let whereSchemaUsersSql = "";
    let onConflictSql = "";
    if (schemaIds && schemaIds.length > 0) {
      whereSchemasSql = `AND wb.schemas.id IN (${schemaIds.join(",")})`;
    }
    if (userIds && userIds.length > 0) {
      whereSchemaUsersSql = `
        AND wb.schema_users.user_id IN (${userIds.join(",")})
      `;
      whereUsersSql = `AND wb.users.id IN (${userIds.join(",")})`;
    }
    const rolesIdLookup = result.payload;
    const queryParams: QueryParams[] = [];
    const date = new Date();
    if (clearExistingImpliedFromRoleName) {
      const impliedFromRoleResult = await this.roleByName(
        clearExistingImpliedFromRoleName
      );
      if (!impliedFromRoleResult.success) return impliedFromRoleResult;
      queryParams.push({
        query: `
          DELETE FROM wb.schema_users
          WHERE
            wb.schema_users.schema_id IN (
              SELECT id FROM wb.schemas
              WHERE wb.schemas.organization_owner_id=$1
              ${whereSchemasSql}
            )
            AND wb.schema_users.implied_from_role_id=${impliedFromRoleResult.payload.id}
            ${whereSchemaUsersSql}
        `,
        params: [organizationId],
      });
    } else {
      // Update implied roles only, leave explicit roles alone
      onConflictSql = `
        ON CONFLICT (schema_id, user_id)
        DO UPDATE SET role_id=EXCLUDED.role_id, updated_at=EXCLUDED.updated_at
        WHERE wb.schema_users.implied_from_role_id IS NOT NULL
      `;
    }
    if (roleMap) {
      for (const organizationRole of Object.keys(roleMap)) {
        queryParams.push({
          query: `
            INSERT INTO wb.schema_users(schema_id, user_id, role_id, implied_from_role_id, updated_at)
            SELECT
            wb.schemas.id,
            user_id,
            ${rolesIdLookup[roleMap[organizationRole]]},
            ${rolesIdLookup[organizationRole]},
            $1
            FROM wb.organization_users
            JOIN wb.schemas ON wb.schemas.organization_owner_id=wb.organization_users.organization_id
            JOIN wb.users ON wb.organization_users.user_id=wb.users.id
            WHERE wb.organization_users.organization_id=$2
            AND wb.organization_users.role_id=$3
            ${whereSchemasSql}
            ${whereUsersSql}
            ${onConflictSql}
          `,
          params: [date, organizationId, rolesIdLookup[organizationRole]],
        } as QueryParams);
      }
    }
    const results = await this.executeQueries(queryParams);
    return results[results.length - 1];
  }

  // if !tableIds all tables for schema
  // if !userIds all schema_users
  public async setTableUserRolesFromSchemaRoles(
    schemaId: number,
    roleMap: Record<string, string>, // eg { schema_owner: "table_administrator" }
    tableIds?: number[],
    userIds?: number[],
    clearExisting?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `dal.setTableUserRolesFromSchemaRoles(${schemaId}, ${JSON.stringify(
        roleMap
      )}, ${tableIds}, ${userIds}, ${clearExisting})`
    );
    let result = await this.rolesIdLookup();
    if (!result.success) return result;
    let whereTablesSql = "";
    let whereUsersSql = "";
    let whereTableUsersSql = "";
    let onConflictSql = "";
    if (tableIds && tableIds.length > 0) {
      whereTablesSql = `AND wb.tables.id IN (${tableIds.join(",")})`;
    }
    if (userIds && userIds.length > 0) {
      whereTableUsersSql = `
        AND wb.table_users.user_id IN (${userIds.join(",")})
      `;
      whereUsersSql = `AND wb.users.id IN (${userIds.join(",")})`;
    }
    const rolesIdLookup = result.payload;
    const queryParams: QueryParams[] = [];
    const date = new Date();
    if (clearExisting) {
      queryParams.push({
        query: `
          DELETE FROM wb.table_users
          WHERE
            wb.table_users.table_id IN (
              SELECT id FROM wb.tables
              WHERE wb.tables.schema_id=$1
              ${whereTablesSql}
            )
            ${whereTableUsersSql}
        `,
        params: [schemaId],
      });
    } else {
      // Update implied roles only, leave explicit roles alone
      onConflictSql = `
        ON CONFLICT (table_id, user_id)
        DO UPDATE SET role_id=EXCLUDED.role_id, updated_at=EXCLUDED.updated_at
        WHERE wb.table_users.implied_from_role_id IS NOT NULL
      `;
    }
    for (const schemaRole of Object.keys(roleMap)) {
      queryParams.push({
        query: `
          INSERT INTO wb.table_users(table_id, user_id, role_id, implied_from_role_id, updated_at)
          SELECT
          wb.tables.id,
          user_id,
          ${rolesIdLookup[roleMap[schemaRole]]},
          ${rolesIdLookup[schemaRole]},
          $1
          FROM wb.schema_users
          JOIN wb.schemas ON wb.schema_users.schema_id=wb.schemas.id
          JOIN wb.tables ON wb.schemas.id=wb.tables.schema_id
          JOIN wb.users ON wb.schema_users.user_id=wb.users.id
          WHERE wb.schema_users.schema_id=$2 AND wb.schema_users.role_id=$3
          ${whereTablesSql}
          ${whereUsersSql}
          ${onConflictSql}
        `,
        params: [date, schemaId, rolesIdLookup[schemaRole]],
      } as QueryParams);
    }
    const results = await this.executeQueries(queryParams);
    return results[results.length - 1];
  }

  public async removeAllTableUsers(
    tableId?: number,
    schemaId?: number
  ): Promise<ServiceResult> {
    let queryWhere = "";
    const params: number[] = [];
    if (tableId) {
      queryWhere = "WHERE table_id=$1";
      params.push(tableId);
    } else if (schemaId) {
      queryWhere = `
        WHERE table_id IN (
          SELECT id from wb.tables
          WHERE wb.tables.schema_id=$1
        )
      `;
      params.push(schemaId);
    }
    const result = await this.executeQuery({
      query: `
        DELETE FROM wb.table_users
        ${queryWhere}
      `,
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
        UPDATE wb.table_users
        SET settings=$1, updated_at=$2
        WHERE table_id=$3
        AND user_id=$4
      `,
      params: [settings, new Date(), tableId, userId],
    } as QueryParams);
    return result;
  }

  /**
   * ========== Columns ==========
   */

  public async columnBySchemaNameTableNameColumnName(
    schemaName: string,
    tableName: string,
    columnName: string
  ): Promise<ServiceResult> {
    const result = await this.columns(schemaName, tableName, columnName);
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_COLUMN_NOT_FOUND",
          values: [schemaName, tableName, columnName],
        });
      }
    }
    return result;
  }

  public async columns(
    schemaName: string,
    tableName: string,
    columnName?: string
  ): Promise<ServiceResult> {
    let query: string = `
      SELECT wb.columns.*,
      information_schema.columns.data_type as type,
      information_schema.columns.column_default as default,
      information_schema.columns.is_nullable as is_nullable
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
    tableName: string,
    columnName?: string
  ): Promise<ServiceResult> {
    let query = `
      SELECT column_name as name, data_type as type
      FROM information_schema.columns
      WHERE table_schema=$1
      AND table_name=$2
    `;
    let params = [schemaName, tableName];
    if (columnName) {
      query += " AND column_name=$3";
      params.push(columnName);
    }
    const result = await this.executeQuery({
      query: query,
      params: params,
    } as QueryParams);
    if (result.success) result.payload = Column.parseResult(result.payload);
    return result;
  }

  public async addOrCreateColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    columnLabel: string,
    create: boolean,
    columnPGType?: string,
    isNotNullable?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `dal.addOrCreateColumn ${schemaName} ${tableName} ${columnName} ${columnLabel} ${create} ${columnPGType} ${isNotNullable}`
    );
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    columnName = DAL.sanitize(columnName);
    if (!columnPGType) columnPGType = "TEXT";
    let sqlNotNull = "";
    // TBD type null placeholders
    if (isNotNullable) sqlNotNull = "DEFAULT '' NOT NULL";
    let result = await this.tableBySchemaNameTableName(schemaName, tableName);
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
          ADD ${columnName} ${columnPGType} ${sqlNotNull}
        `,
      } as QueryParams);
    }
    const results: Array<ServiceResult> = await this.executeQueries(
      queriesAndParams
    );
    if (create && results[1] && !results[1].success) return results[1];
    return results[0];
  }

  public async updateColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    newColumnName?: string,
    newColumnLabel?: string,
    newType?: string,
    newIsNotNullable?: boolean
  ): Promise<ServiceResult> {
    schemaName = DAL.sanitize(schemaName);
    tableName = DAL.sanitize(tableName);
    columnName = DAL.sanitize(columnName);
    const queriesAndParams: Array<QueryParams> = [];
    if (newColumnName || newColumnLabel) {
      let result = await this.columnBySchemaNameTableNameColumnName(
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
    if (newIsNotNullable !== undefined) {
      let sqlNewNotNull = "";
      if (newIsNotNullable) {
        queriesAndParams.push({
          query: `
            UPDATE "${schemaName}"."${tableName}"
            SET ${columnName}='' WHERE ${columnName} IS NULL
        `,
        } as QueryParams);
        queriesAndParams.push({
          query: `
            ALTER TABLE "${schemaName}"."${tableName}"
            ALTER COLUMN ${columnName} SET NOT NULL
        `,
        } as QueryParams);
      } else {
        queriesAndParams.push({
          query: `
            ALTER TABLE "${schemaName}"."${tableName}"
            ALTER COLUMN ${columnName} DROP NOT NULL
        `,
        } as QueryParams);
      }
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

  public async addSequenceToColumn(
    schema: Schema,
    table: Table,
    column: Column,
    nextSeqNumber?: number
  ): Promise<ServiceResult> {
    if (!nextSeqNumber) {
      const nextSeqNumberResult = await this.executeQuery({
        query: `
          SELECT ${column.name} as max_val
          FROM ${schema.name}.${table.name}
          ORDER BY ${column.name} DESC
          LIMIT 1
        `,
      } as QueryParams);
      if (
        nextSeqNumberResult.success &&
        nextSeqNumberResult.payload.rows.length == 1
      ) {
        nextSeqNumber =
          parseInt(nextSeqNumberResult.payload.rows[0].max_val) + 1;
      }
    }
    if (!nextSeqNumber || nextSeqNumber < 1) nextSeqNumber = 1;
    const sequencName = `wbseq_s${schema.id}_t${table.id}_c${column.id}`;
    log.warn("nextSeqNumber" + nextSeqNumber);
    const result = await this.executeQueries([
      {
        query: `CREATE SEQUENCE ${schema.name}.${sequencName}`,
      },
      {
        query: `ALTER TABLE ${schema.name}.${table.name} ALTER COLUMN ${column.name} SET DEFAULT nextval('${schema.name}."${sequencName}"')`,
      },
      {
        query: `ALTER SEQUENCE ${schema.name}.${sequencName} OWNED BY ${schema.name}.${table.name}.${column.name}`,
      },
      {
        query: `SELECT setval('${schema.name}."${sequencName}"', ${
          nextSeqNumber - 1
        })`,
      },
    ]);
    return result[result.length - 1];
  }

  public async removeSequenceFromColumn(
    schema: Schema,
    table: Table,
    column: Column
  ): Promise<ServiceResult> {
    if (!column.default) {
      return errResult({
        wbCode: "WB_NO_DEFAULT_ON_COLUMN",
        values: [schema.name, table.name, column.name],
      });
    }
    // eg column.default="nextval('test_the_daisy_blog.wbseq_s30826_t41209_c53600'::regclass)"
    const sequencNameSplitA = column.default.split("wbseq_");
    const sequencNameSplitB = sequencNameSplitA[1].split("::");
    const sequencName = `wbseq_${sequencNameSplitB[0].slice(0, -1)}`;
    const results = await this.executeQueries([
      {
        query: `ALTER TABLE ${schema.name}.${table.name} ALTER COLUMN ${column.name} DROP DEFAULT`,
      },
      {
        query: `DROP SEQUENCE IF EXISTS ${schema.name}.${sequencName}`,
      },
    ]);
    return results[0]; // query 2 will always succeed
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
}
