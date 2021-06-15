import { ApolloServer, ApolloError } from "apollo-server-lambda";
import { Logger } from "tslog";
import { DAL } from "./dal";
import { hasuraApi } from "./hasura-api";
import { ConstraintId, schema, ServiceResult } from "./types";
import v = require("voca");
import { Column, Organization, Role, RoleLevel, Schema, User } from "./entity";
import { isThisTypeNode } from "typescript";

export const graphqlHandler = new ApolloServer({
  schema,
  introspection: true,
  context: ({ event, context }) => {
    return {
      headers: event.headers,
      multiValueHeaders: event.multiValueHeaders,
      wbCloud: new WhitebrickCloud(),
    };
  },
}).createHandler();

export const log: Logger = new Logger({
  minLevel: "debug",
});

class WhitebrickCloud {
  dal = new DAL();

  static RESULT_DEFAULT: ServiceResult = {
    success: false,
    message: "RESULT_DEFAULT: result has not been assigned",
  };

  public err(result: ServiceResult): Error {
    if (result.success) {
      return new Error(
        "WhitebrickCloud.err: result is not an error (success==true)"
      );
    }
    let apolloError = "INTERNAL_SERVER_ERROR";
    if (result.apolloError) apolloError = result.apolloError;
    return new ApolloError(result.message, apolloError, {
      ref: result.code,
    });
  }

  public async uidFromHeaders(
    headers: Record<string, string>
  ): Promise<ServiceResult> {
    log.warn("========== HEADERS: " + JSON.stringify(headers));
    const headersLowerCase = Object.entries(headers).reduce(
      (acc: Record<string, string>, [key, val]) => (
        (acc[key.toLowerCase()] = val), acc
      ),
      {}
    );
    let result: ServiceResult = WhitebrickCloud.RESULT_DEFAULT;
    if (
      headersLowerCase["x-hasura-role"] &&
      headersLowerCase["x-hasura-role"].toLowerCase() == "admin"
    ) {
      return {
        success: true,
        payload: User.HASURA_ADMIN_ID,
      } as ServiceResult;
    } else if (
      process.env.NODE_ENV == "development" &&
      headersLowerCase["x-test-user-id"]
    ) {
      // log.warn("uid: " + headersLowerCase["x-test-user-id"]);
      result = await this.userByEmail(headersLowerCase["x-test-user-id"]);
      if (result.success) result.payload = result.payload.id;
    } else if (headersLowerCase["x-hasura-user-id"]) {
      result = {
        success: true,
        payload: parseInt(headersLowerCase["x-hasura-user-id"]),
      } as ServiceResult;
    } else {
      result = {
        success: false,
        message: `uidFromHeaders: Could not find headers for Admin, Test or User in: ${JSON.stringify(
          headers
        )}`,
      } as ServiceResult;
    }
    return result;
  }

  public cloudContext(): object {
    return {
      defaultColumnTypes: Column.COMMON_TYPES,
      roles: {
        organizations: Role.SYSROLES_ORGANIZATIONS,
        schemas: Role.SYSROLES_SCHEMAS,
        tables: Role.SYSROLES_TABLES,
      },
    };
  }

  /**
   * Test
   */

  public async resetTestData(): Promise<ServiceResult> {
    let result = await this.dal.schemas("test_%");
    if (!result.success) return result;
    for (const schema of result.payload) {
      result = await this.removeOrDeleteSchema(schema.name, true);
      if (!result.success) return result;
    }
    result = await this.dal.deleteTestOrganizations();
    if (!result.success) return result;
    result = await this.dal.deleteTestUsers();
    return result;
  }

  /**
   * Auth
   */

  public async auth(
    schemaName: string,
    authUserId: string,
    authUserName?: string
  ): Promise<ServiceResult> {
    const randomNumber = Math.floor(Math.random() * 10000);
    return {
      success: true,
      payload: {
        "x-hasura-allowed-roles": [
          `RANDOM_ROLE_${randomNumber}`,
          "tr40320",
          "tr40321",
        ],
        "x-hasura-default-role": "tr40321",
        "x-hasura-user-id": authUserId,
      },
    } as ServiceResult;
  }

  /**
   * Organizations
   */

  public async organizations(
    userId?: number,
    userEmail?: string,
    organizationId?: number
  ): Promise<ServiceResult> {
    return this.dal.organizations(userId, userEmail, organizationId);
  }

  public async organizationsByUserId(userId: number): Promise<ServiceResult> {
    return this.dal.organizations(userId);
  }

  public async organizationsByUserEmail(
    userEmail: string
  ): Promise<ServiceResult> {
    return this.dal.organizations(undefined, userEmail);
  }

  public async organizationAccess(
    userId: number,
    organizationId: number
  ): Promise<ServiceResult> {
    const orgsResult = await this.dal.organizations(
      userId,
      undefined,
      organizationId
    );
    if (orgsResult.success) orgsResult.payload = orgsResult.payload[0];
    return orgsResult;
  }

  public async organizationsByIds(ids: number[]): Promise<ServiceResult> {
    return this.dal.organizationsByIdsOrNames(ids);
  }

  public async organizationById(id: number): Promise<ServiceResult> {
    const result = await this.organizationsByIds([id]);
    if (result.success) result.payload = result.payload[0];
    return result;
  }

  public async organizationsByNames(names: string[]): Promise<ServiceResult> {
    return this.dal.organizationsByIdsOrNames(undefined, names);
  }

  public async organizationByName(name: string): Promise<ServiceResult> {
    const result = await this.organizationsByNames([name]);
    if (result.success) result.payload = result.payload[0];
    return result;
  }

  public async organizationUsers(
    name: string,
    roles?: string[]
  ): Promise<ServiceResult> {
    const result = await this.organizationByName(name);
    if (!result.success) return result;
    if (!result.payload) {
      return {
        success: false,
        message: `Organization with name '${name}' could not be found`,
        code: "WB_ORGANIZATION_NOT_FOUND",
        apolloError: "BAD_USER_INPUT",
      } as ServiceResult;
    }
    if (roles && !Role.areRoles(roles)) {
      return {
        success: false,
        message:
          "organizationUsers: roles contains one or more unrecognized strings",
      } as ServiceResult;
    }
    return this.dal.organizationUsers(name, roles);
  }

  public async createOrganization(
    currentUserEmail: string, // TBD: repace with uid
    name: string,
    label: string
  ): Promise<ServiceResult> {
    const checkNameResult = await this.organizationByName(name);
    if (!checkNameResult.success) return checkNameResult;
    if (checkNameResult.payload) {
      return {
        success: false,
        message: `This organization name has already been taken.`,
        code: "WB_ORGANIZATION_NAME_TAKEN",
        apolloError: "BAD_USER_INPUT",
      } as ServiceResult;
    }
    const createOrgResult = await this.dal.createOrganization(name, label);
    if (!createOrgResult.success) return createOrgResult;
    const result = await this.setOrganizationUserRole(
      name,
      currentUserEmail,
      "organization_administrator"
    );
    if (!result.success) return result;
    return createOrgResult;
  }

  public async updateOrganization(
    name: string,
    newName?: string,
    newLabel?: string
  ): Promise<ServiceResult> {
    return this.dal.updateOrganization(name, newName, newLabel);
  }

  public async deleteOrganization(name: string): Promise<ServiceResult> {
    const result = await this.organizationUsers(name, [
      "organization_user",
      "organization_external_user",
    ]);
    if (!result.success) return result;
    if (result.payload.length > 0) {
      return {
        success: false,
        message: `Remove all non-administrative users from Organization before deleting.`,
        code: "WB_ORGANIZATION_NOT_EMPTY",
        apolloError: "BAD_USER_INPUT",
      } as ServiceResult;
    }
    return this.dal.deleteOrganization(name);
  }

  public async deleteTestOrganizations(): Promise<ServiceResult> {
    return this.dal.deleteTestOrganizations();
  }

  /**
   * Organization-User-Roles
   */

  public async setOrganizationUserRole(
    organizationName: string,
    userEmail: string,
    role: string
  ): Promise<ServiceResult> {
    return await this.setOrganizationUsersRole(
      organizationName,
      [userEmail],
      role
    );
  }

  public async setOrganizationUsersRole(
    organizationName: string,
    userEmails: string[],
    role: string
  ): Promise<ServiceResult> {
    const usersResult = await this.usersByEmails(userEmails);
    if (!usersResult.success) return usersResult;
    if (usersResult.payload.length != userEmails) {
      return {
        success: false,
        message: `setOrganizationUsersRole: ${
          userEmails.length - usersResult.payload.length
        } missing user(s)`,
      } as ServiceResult;
    }
    const organizationResult = await this.organizationByName(organizationName);
    if (!organizationResult.success) return organizationResult;
    const roleResult = await this.dal.roleByName(role);
    if (!roleResult.success) return roleResult;
    const result = await this.dal.setOrganizationUsersRole(
      organizationResult.payload.id,
      usersResult.payload,
      roleResult.payload.id
    );
    return result;
  }

  public async removeUsersFromOrganization(
    userEmails: string[],
    organizationName: string
  ): Promise<ServiceResult> {
    const usersResult = await this.usersByEmails(userEmails);
    if (!usersResult.success) return usersResult;
    const userIds = usersResult.payload.map((user: { id: number }) => user.id);
    // check not all the admins will be removed
    const adminsResult = await this.organizationUsers(organizationName, [
      "organization_administrator",
    ]);
    if (!adminsResult.success) return adminsResult;
    const allAdminIds = adminsResult.payload.map(
      (user: { id: number }) => user.id
    );
    if (allAdminIds.every((elem: number) => userIds.includes(elem))) {
      return {
        success: false,
        message: `You can not remove all Administrators from an Organization - you must leave at least one.`,
        code: "WB_ORGANIZATION_NO_ADMINS",
        apolloError: "BAD_USER_INPUT",
      } as ServiceResult;
    }
    const organizationResult = await this.organizationByName(organizationName);
    if (!organizationResult.success) return organizationResult;
    const result = await this.dal.removeUsersFromOrganization(
      usersResult.payload,
      organizationResult.payload.id
    );
    return result;
  }

  /**
   * Users
   */

  public async usersByOrganizationId(
    organizationId: number
  ): Promise<ServiceResult> {
    return this.dal.usersByOrganizationId(organizationId);
  }

  public async usersByIds(ids: number[]): Promise<ServiceResult> {
    return this.dal.usersByIdsOrEmails(ids);
  }

  public async userById(id: number): Promise<ServiceResult> {
    const result = await this.usersByIds([id]);
    if (result.success) result.payload = result.payload[0];
    return result;
  }

  public async usersByEmails(userEmails: string[]): Promise<ServiceResult> {
    return this.dal.usersByIdsOrEmails(undefined, userEmails);
  }

  public async userByEmail(email: string): Promise<ServiceResult> {
    const result = await this.usersByEmails([email]);
    if (result.success) result.payload = result.payload[0];
    return result;
  }

  public async createUser(
    email: string,
    firstName: string,
    lastName: string
  ): Promise<ServiceResult> {
    // TBD: authentication, save password
    return this.dal.createUser(email, firstName, lastName);
  }

  public async updateUser(
    id: number,
    email: string,
    firstName: string,
    lastName: string
  ): Promise<ServiceResult> {
    return this.dal.updateUser(id, email, firstName, lastName);
  }

  /**
   * Roles
   */

  public async roleByName(name: string): Promise<ServiceResult> {
    return this.dal.roleByName(name);
  }

  /**
   * Schemas
   * TBD: validate name ~ [a-z]{1}[_a-z0-9]{2,}
   */

  public async createSchema(
    uid: number,
    name: string,
    label: string,
    organizationOwnerId?: number,
    organizationOwnerName?: string,
    userOwnerId?: number,
    userOwnerEmail?: string
  ): Promise<ServiceResult> {
    if (name.startsWith("pg_") || Schema.SYS_SCHEMA_NAMES.includes(name)) {
      return {
        success: false,
        message: `Database name can not begin with 'pg_' or be in the reserved list: ${Schema.SYS_SCHEMA_NAMES.join(
          ", "
        )}`,
        code: "WB_SCHEMA_NAME",
        apolloError: "BAD_USER_INPUT",
      } as ServiceResult;
    }
    let result: ServiceResult = WhitebrickCloud.RESULT_DEFAULT;
    // Get the IDs
    if (!organizationOwnerId && !userOwnerId) {
      if (organizationOwnerName) {
        let result = await this.organizationByName(organizationOwnerName);
        if (!result.success) return result;
        organizationOwnerId = result.payload.id;
      } else if (userOwnerEmail) {
        result = await this.userByEmail(userOwnerEmail);
        if (!result.success) return result;
        userOwnerId = result.payload.id;
      } else {
        return {
          success: false,
          message: "createSchema: Owner could not be found",
        } as ServiceResult;
      }
    }
    let userOrgRole: Organization | undefined = undefined;
    if (!User.isAdmin(uid)) {
      // User must be in the organization for organizationOwner
      if (organizationOwnerId) {
        const orgResult = await this.organizationAccess(
          uid,
          organizationOwnerId
        );
        if (!orgResult.success) return orgResult;
        userOrgRole = orgResult.payload;
        if (!userOrgRole) {
          return {
            success: false,
            message: `createSchema: User ${uid} must be in Organization ${organizationOwnerId}`,
          } as ServiceResult;
        }
        // Only the current user can be the userOwner
      } else if (userOwnerId) {
        if (uid != userOwnerId) {
          return {
            success: false,
            message: `createSchema: The current user ${uid} does not match the userOwnerId ${userOwnerId}`,
          } as ServiceResult;
        }
      }
    }
    const schemaResult = await this.dal.createSchema(
      name,
      label,
      organizationOwnerId,
      userOwnerId
    );
    if (!schemaResult.success) return schemaResult;
    // If owner is organization and user is not an admin of the organization,
    // add admin so they dont lose access
    if (
      !User.isAdmin(uid) &&
      organizationOwnerId &&
      userOrgRole &&
      userOrgRole.userRole != "organiation_admin"
    ) {
      result = await this.setRole(
        uid,
        "schema_administrator",
        "schema" as RoleLevel,
        schemaResult.payload.id
      );
      if (!result.success) return result;
    }
    return schemaResult;
  }

  public async setRole(
    userId: number,
    roleName: string,
    roleLevel: RoleLevel,
    objectId: number
  ): Promise<ServiceResult> {
    return await this.dal.setRole(userId, roleName, roleLevel, objectId);
  }

  public async removeOrDeleteSchema(
    schemaName: string,
    del: boolean
  ): Promise<ServiceResult> {
    let result = await this.dal.discoverTables(schemaName);
    if (!result.success) return result;
    for (const tableName of result.payload) {
      result = await this.removeOrDeleteTable(schemaName, tableName, del);
      if (!result.success) return result;
    }
    result = await this.dal.removeAllUsersFromSchema(schemaName);
    if (!result.success) return result;
    return await this.dal.removeOrDeleteSchema(schemaName, del);
  }

  public async schemasByUserOwner(userEmail: string): Promise<ServiceResult> {
    return this.dal.schemasByUserOwner(userEmail);
  }

  public async schemasByOrgOwnerAdmin(
    userEmail: string
  ): Promise<ServiceResult> {
    return this.dal.schemasByOrgOwnerAdmin(userEmail);
  }

  /**
   * Schema-User-Roles
   */

  public async addUserToSchema(
    schemaName: string,
    userEmail: string,
    schemaRole: string
  ): Promise<ServiceResult> {
    const userResult = await this.userByEmail(userEmail);
    if (!userResult.success) return userResult;
    const schemaResult = await this.dal.schemaByName(schemaName);
    if (!schemaResult.success) return schemaResult;
    const roleResult = await this.dal.roleByName(schemaRole);
    if (!roleResult.success) return roleResult;
    const result = await this.dal.addUserToSchema(
      schemaResult.payload.id,
      userResult.payload.id,
      roleResult.payload.id
    );
    if (!result.success) return result;
    return userResult;
  }

  public async accessibleSchemas(userEmail: string): Promise<ServiceResult> {
    // Order matters - owners, admins take presedence over users
    // Schemas with user owners
    const schemaOwnerResult = await this.schemasByUserOwner(userEmail);
    if (!schemaOwnerResult.success) return schemaOwnerResult;
    // Schemas with organization owners where user is organization_administrator
    const schemaOrgAdminResult = await this.schemasByOrgOwnerAdmin(userEmail);
    if (!schemaOrgAdminResult.success) return schemaOrgAdminResult;
    // Schemas with scheama_users assigned
    const userRolesResult = await this.dal.schemasByUser(userEmail);
    if (!userRolesResult.success) return userRolesResult;
    const schemas: Schema[] = [];
    const schemaIds: number[] = [];
    for (const schema of schemaOwnerResult.payload.concat(
      schemaOrgAdminResult.payload,
      userRolesResult.payload
    )) {
      if (!schemaIds.includes(schema.id)) {
        schemas.push(schema);
        schemaIds.push(schema.id);
      }
    }
    return {
      success: true,
      payload: schemas,
    } as ServiceResult;
  }

  /**
   * Tables
   * TBD: validate name ~ [a-z]{1}[_a-z0-9]{2,}
   */

  public async tables(schemaName: string): Promise<ServiceResult> {
    const result = await this.dal.tables(schemaName);
    if (!result.success) return result;
    for (const table of result.payload) {
      const columnsResult = await this.columns(schemaName, table.name);
      if (!columnsResult.success) return columnsResult;
      table.columns = columnsResult.payload;
    }
    return result;
  }

  public async columns(
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    let result = await this.dal.primaryKeys(schemaName, tableName);
    if (!result.success) return result;
    const pKColsConstraints: Record<string, string> = result.payload;
    const pKColumnNames: string[] = Object.keys(pKColsConstraints);
    result = await this.dal.columns(schemaName, tableName);
    if (!result.success) return result;
    for (const column of result.payload) {
      column.isPrimaryKey = pKColumnNames.includes(column.name);
      const foreignKeysResult = await this.dal.foreignKeysOrReferences(
        schemaName,
        tableName,
        column.name,
        "FOREIGN_KEYS"
      );
      if (!foreignKeysResult.success) return result;
      column.foreignKeys = foreignKeysResult.payload;
      const referencesResult = await this.dal.foreignKeysOrReferences(
        schemaName,
        tableName,
        column.name,
        "REFERENCES"
      );
      if (!referencesResult.success) return result;
      column.referencedBy = referencesResult.payload;
    }
    return result;
  }

  public async addOrCreateTable(
    schemaName: string,
    tableName: string,
    tableLabel: string,
    create?: boolean
  ): Promise<ServiceResult> {
    if (!create) create = false;
    let result = await this.dal.addOrCreateTable(
      schemaName,
      tableName,
      tableLabel,
      create
    );
    if (!result.success) return result;
    return await hasuraApi.trackTable(schemaName, tableName);
  }

  public async removeOrDeleteTable(
    schemaName: string,
    tableName: string,
    del?: boolean
  ): Promise<ServiceResult> {
    if (!del) del = false;
    // 1. untrack
    let result = await hasuraApi.untrackTable(schemaName, tableName);
    if (!result.success) return result;
    // 2. remove/delete columns
    result = await this.dal.columns(schemaName, tableName);
    if (!result.success) return result;
    const columns = result.payload;
    for (const column of columns) {
      result = await this.removeOrDeleteColumn(
        schemaName,
        tableName,
        column.name,
        del
      );
      if (!result.success) return result;
    }
    // 3. remove user settings
    result = await this.dal.removeTableUsers(schemaName, tableName);
    if (!result.success) return result;
    // 4. remove/delete the table
    return await this.dal.removeOrDeleteTable(schemaName, tableName, del);
  }

  public async removeOrDeleteColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    del?: boolean
  ): Promise<ServiceResult> {
    if (!del) del = false;
    return await this.dal.removeOrDeleteColumn(
      schemaName,
      tableName,
      columnName,
      del
    );
  }

  public async updateTable(
    schemaName: string,
    tableName: string,
    newTableName?: string,
    newTableLabel?: string
  ): Promise<ServiceResult> {
    let result: ServiceResult;
    if (newTableName) {
      result = await this.tables(schemaName);
      if (!result.success) return result;
      const existingTableNames = result.payload.map(
        (table: { name: string }) => table.name
      );
      if (existingTableNames.includes(newTableName)) {
        return {
          success: false,
          message: "The new table name must be unique",
          code: "WB_TABLE_NAME_EXISTS",
          apolloError: "BAD_USER_INPUT",
        } as ServiceResult;
      }
      result = await hasuraApi.untrackTable(schemaName, tableName);
      if (!result.success) return result;
    }
    result = await this.dal.updateTable(
      schemaName,
      tableName,
      newTableName,
      newTableLabel
    );
    if (!result.success) return result;
    if (newTableName) {
      result = await hasuraApi.trackTable(schemaName, newTableName);
      if (!result.success) return result;
    }
    return result;
  }

  public async addAllExistingTables(
    schemaName: string
  ): Promise<ServiceResult> {
    let result = await this.dal.discoverTables(schemaName);
    if (!result.success) return result;
    const tableNames = result.payload;
    for (const tableName of tableNames) {
      result = await this.addOrCreateTable(
        schemaName,
        tableName,
        v.titleCase(tableName.replaceAll("_", " ")),
        false
      );
      if (!result.success) return result;
      result = await this.dal.discoverColumns(schemaName, tableName);
      if (!result.success) return result;
      const columns = result.payload;
      for (const column of columns) {
        result = await this.addOrCreateColumn(
          schemaName,
          tableName,
          column.name,
          v.titleCase(column.name.replaceAll("_", " ")),
          false
        );
        if (!result.success) return result;
      }
    }
    return result;
  }

  public async addAllExistingRelationships(
    schemaName: string
  ): Promise<ServiceResult> {
    let result = await this.dal.foreignKeysOrReferences(
      schemaName,
      "%",
      "%",
      "ALL"
    );
    if (!result.success) return result;
    const relationships: ConstraintId[] = result.payload;
    if (relationships.length > 0) {
      for (const relationship of relationships) {
        if (relationship.relTableName && relationship.relColumnName) {
          this.addOrCreateForeignKey(
            schemaName,
            relationship.tableName,
            [relationship.columnName],
            relationship.relTableName,
            [relationship.relColumnName]
          );
        } else {
          return {
            success: false,
            message:
              "addAllExistingRelationships: ConstraintId must have relTableName and relColumnName",
          } as ServiceResult;
        }
      }
    }
    return result;
  }

  public async addOrCreateColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    columnLabel: string,
    create?: boolean,
    columnType?: string
  ): Promise<ServiceResult> {
    if (!create) create = false;
    let result = await this.dal.addOrCreateColumn(
      schemaName,
      tableName,
      columnName,
      columnLabel,
      create,
      columnType
    );
    if (!result.success) return result;
    if (create) {
      result = await hasuraApi.untrackTable(schemaName, tableName);
      if (!result.success) return result;
      result = await hasuraApi.trackTable(schemaName, tableName);
    }
    return result;
  }

  public async updateColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    newColumnName?: string,
    newColumnLabel?: string,
    newType?: string
  ): Promise<ServiceResult> {
    let result: ServiceResult;
    if (newColumnName) {
      result = await this.columns(schemaName, tableName);
      if (!result.success) return result;
      const existingColumnNames = result.payload.map(
        (table: { name: string }) => table.name
      );
      if (existingColumnNames.includes(newColumnName)) {
        return {
          success: false,
          message: "The new column name must be unique",
          code: "WB_COLUMN_NAME_EXISTS",
          apolloError: "BAD_USER_INPUT",
        } as ServiceResult;
      }
    }
    if (newColumnName || newType) {
      result = await hasuraApi.untrackTable(schemaName, tableName);
      if (!result.success) return result;
    }
    result = await this.dal.updateColumn(
      schemaName,
      tableName,
      columnName,
      newColumnName,
      newColumnLabel,
      newType
    );
    if (!result.success) return result;
    if (newColumnName || newType) {
      result = await hasuraApi.trackTable(schemaName, tableName);
      if (!result.success) return result;
    }
    return result;
  }

  // Pass empty columnNames[] to clear
  public async createOrDeletePrimaryKey(
    schemaName: string,
    tableName: string,
    columnNames: string[],
    del?: boolean
  ): Promise<ServiceResult> {
    if (!del) del = false;
    let result = await this.dal.primaryKeys(schemaName, tableName);
    if (!result.success) return result;
    const existingConstraintNames = Object.values(result.payload);
    if (del) {
      if (existingConstraintNames.length > 0) {
        // multiple coulmn primary keys will all have same constraint name
        result = await this.dal.deleteConstraint(
          schemaName,
          tableName,
          existingConstraintNames[0] as string
        );
      }
    } else {
      if (existingConstraintNames.length > 0) {
        return {
          success: false,
          message: "Remove existing primary key first",
          code: "WB_PK_EXISTS",
          apolloError: "BAD_USER_INPUT",
        } as ServiceResult;
      }
      result = await hasuraApi.untrackTable(schemaName, tableName);
      if (!result.success) return result;
      result = await this.dal.createPrimaryKey(
        schemaName,
        tableName,
        columnNames
      );
      if (!result.success) return result;
      result = await hasuraApi.trackTable(schemaName, tableName);
    }
    return result;
  }

  public async addOrCreateForeignKey(
    schemaName: string,
    tableName: string,
    columnNames: string[],
    parentTableName: string,
    parentColumnNames: string[],
    create?: boolean
  ): Promise<ServiceResult> {
    let operation: string = "CREATE";
    if (!create) operation = "ADD";
    return await this.setForeignKey(
      schemaName,
      tableName,
      columnNames,
      parentTableName,
      parentColumnNames,
      operation
    );
  }

  public async removeOrDeleteForeignKey(
    schemaName: string,
    tableName: string,
    columnNames: string[],
    parentTableName: string,
    del?: boolean
  ): Promise<ServiceResult> {
    let operation: string = "DELETE";
    if (!del) operation = "REMOVE";
    return await this.setForeignKey(
      schemaName,
      tableName,
      columnNames,
      parentTableName,
      [],
      operation
    );
  }

  // operation = "ADD|CREATE|REMOVE|DELETE"
  public async setForeignKey(
    schemaName: string,
    tableName: string,
    columnNames: string[],
    parentTableName: string,
    parentColumnNames: string[],
    operation: string
  ): Promise<ServiceResult> {
    let result = await this.dal.foreignKeysOrReferences(
      schemaName,
      tableName,
      columnNames[0],
      "FOREIGN_KEYS"
    );
    if (!result.success) return result;
    const existingForeignKeys: Record<string, string> = {};
    for (const constraintId of result.payload) {
      existingForeignKeys[constraintId.columnName] =
        constraintId.constraintName;
    }
    // Check for existing foreign keys
    for (const columnName of columnNames) {
      if (Object.keys(existingForeignKeys).includes(columnName)) {
        if (operation == "REMOVE" || operation == "DELETE") {
          result = await hasuraApi.dropRelationships(
            schemaName,
            tableName,
            parentTableName
          );
          if (result.success && operation == "DELETE") {
            result = await this.dal.deleteConstraint(
              schemaName,
              tableName,
              existingForeignKeys[columnName] as string
            );
          }
          return result;
        } else {
          return {
            success: false,
            message: `Remove existing foreign key on ${columnName} first`,
            code: "WB_FK_EXISTS",
            apolloError: "BAD_USER_INPUT",
          } as ServiceResult;
        }
      }
    }
    if (operation == "ADD" || operation == "CREATE") {
      // result = await hasuraApi.untrackTable(schemaName, tableName);
      // if (!result.success) return result;
      if (operation == "CREATE") {
        result = await this.dal.createForeignKey(
          schemaName,
          tableName,
          columnNames,
          parentTableName,
          parentColumnNames
        );
        if (!result.success) return result;
      }
      result = await hasuraApi.createObjectRelationship(
        schemaName,
        tableName, // posts
        columnNames[0], // author_id
        parentTableName // authors
      );
      if (!result.success) return result;
      result = await hasuraApi.createArrayRelationship(
        schemaName,
        parentTableName, // authors
        tableName, // posts
        columnNames // author_id
      );
      if (!result.success) return result;
    }
    return result;
  }

  public async tableUser(
    userEmail: string,
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    return this.dal.tableUser(userEmail, schemaName, tableName);
  }

  public async saveTableUserSettings(
    schemaName: string,
    tableName: string,
    userEmail: string,
    settings: object
  ): Promise<ServiceResult> {
    const tableResult = await this.dal.tableBySchemaTable(
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    const userResult = await this.userByEmail(userEmail);
    if (!userResult.success) return userResult;
    return this.dal.saveTableUserSettings(
      tableResult.payload.id,
      userResult.payload.id,
      settings
    );
  }
}
