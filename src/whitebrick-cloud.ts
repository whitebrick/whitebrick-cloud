import { ApolloServer, ApolloError } from "apollo-server-lambda";
import { Logger } from "tslog";
import { DAL } from "./dal";
import { hasuraApi } from "./hasura-api";
import { ConstraintId, schema, ServiceResult } from "./types";
import v = require("voca");
import {
  Column,
  Organization,
  Role,
  RoleLevel,
  Schema,
  Table,
  User,
} from "./entity";
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

  // wbErrorCode : [ message, apolloErrorCode? ]
  static WB_ERROR_CODES: Record<string, string[]> = {
    // Users
    WB_USER_NOT_FOUND: ["User not found.", "BAD_USER_INPUT"],
    WB_USERS_NOT_FOUND: ["One or more users were not found."],
    // Organizations
    WB_ORGANIZATION_NOT_FOUND: ["Organization not found.", "BAD_USER_INPUT"],
    WB_ORGANIZATION_NAME_TAKEN: [
      "This Organization name has already been taken.",
      "BAD_USER_INPUT",
    ],
    WB_ORGANIZATION_NOT_USER_EMPTY: [
      "This organization still has non-administrative users.",
      "BAD_USER_INPUT",
    ],
    WB_ORGANIZATION_NO_ADMINS: [
      "You can not remove all Administrators from an Organization - you must leave at least one.",
      "BAD_USER_INPUT",
    ],
    WB_USER_NOT_IN_ORG: ["User must be in Organization"],
    WB_USER_NOT_SCHEMA_OWNER: ["The current user is not the owner."],
    // Schemas
    WB_SCHEMA_NOT_FOUND: ["Database could not be found."],
    WB_BAD_SCHEMA_NAME: [
      "Database name can not begin with 'pg_' or be in the reserved list.",
      "BAD_USER_INPUT",
    ],
    // Tables
    WB_TABLE_NOT_FOUND: ["Table could not be found."],
    WB_TABLE_NAME_EXISTS: ["This Table name already exists", "BAD_USER_INPUT"],
    COLUMN_NOT_FOUND: ["Column could not be found"],
    WB_COLUMN_NAME_EXISTS: [
      "This Column name already exists.",
      "BAD_USER_INPUT",
    ],
    WB_PK_EXISTS: ["Remove existing primary key first.", "BAD_USER_INPUT"],
    WB_FK_EXISTS: [
      "Remove existing foreign key on the column first.",
      "BAD_USER_INPUT",
    ],
    // Table Users,
    WB_TABLE_USER_NOT_FOUND: ["Table User not found."],
    // Roles
    ROLE_NOT_FOUND: ["This role could not be found."],
  };

  public err(result: ServiceResult): Error {
    return apolloErr(result);
  }

  public async uidFromHeaders(
    headers: Record<string, string>
  ): Promise<ServiceResult> {
    log.info("========== HEADERS: " + JSON.stringify(headers));
    const headersLowerCase = Object.entries(headers).reduce(
      (acc: Record<string, string>, [key, val]) => (
        (acc[key.toLowerCase()] = val), acc
      ),
      {}
    );
    let result: ServiceResult = errResult();
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
      // log.info("uid: " + headersLowerCase["x-test-user-id"]);
      result = await this.userByEmail(headersLowerCase["x-test-user-id"]);
      if (result.success) result.payload = result.payload.id;
    } else if (headersLowerCase["x-hasura-user-id"]) {
      result = {
        success: true,
        payload: parseInt(headersLowerCase["x-hasura-user-id"]),
      } as ServiceResult;
    } else {
      result = errResult({
        message: `uidFromHeaders: Could not find headers for Admin, Test or User in: ${JSON.stringify(
          headers
        )}`,
      } as ServiceResult);
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
   * ========== Test ==========
   */

  public async resetTestData(): Promise<ServiceResult> {
    log.debug(`resetTestData()`);
    let result = await this.dal.schemas("test_%");
    if (!result.success) return result;
    for (const schema of result.payload) {
      result = await this.removeOrDeleteSchema(schema.name, true);
      if (!result.success) return result;
    }
    result = await this.dal.deleteTestOrganizations();
    if (!result.success) return result;
    result = await this.deleteTestUsers();
    return result;
  }

  /**
   * ========== Auth ==========
   */

  public async auth(
    schemaName: string,
    userAuthId: string
  ): Promise<ServiceResult> {
    let hasuraUserId: number;
    let result = await this.dal.userIdFromAuthId(userAuthId);
    if (!result.success) return result;
    hasuraUserId = result.payload;
    return {
      success: true,
      payload: {
        "X-Hasura-Allowed-Roles": ["wbuser"],
        "x-Hasura-Default-Role": "wbuser",
        "X-Hasura-User-Id": hasuraUserId,
        "x-Hasura-Schema-Name": schemaName,
        "x-Hasura-Authenticated-At": Date().toString(),
      },
    } as ServiceResult;
  }

  /**
   * ========== Roles & Permissions ==========
   */

  public async roleByName(name: string): Promise<ServiceResult> {
    return this.dal.roleByName(name);
  }

  public async deleteAndSetTablePermissions(
    table: Table,
    deleteOnly?: boolean
  ): Promise<ServiceResult> {
    return await this.dal.deleteAndSetTablePermissions(table.id);
  }

  public async setRole(
    userIds: number[],
    roleName: string,
    roleLevel: RoleLevel,
    object: Organization | Schema | Table
  ): Promise<ServiceResult> {
    if (!Role.isRole(roleName, roleLevel)) {
      return errResult({
        message: `${roleName} is not a valid name for an ${roleLevel} Role.`,
      });
    }
    let result = await this.dal.setRole(
      userIds,
      roleName,
      roleLevel,
      object.id
    );
    if (!result.success) return result;
    switch (roleLevel) {
      case "schema":
        // Changing role at the schema level resets all
        // table roles to the schema default inheritence
        result = await this.dal.setTableUserRolesFromSchemaRoles(
          object.id,
          Role.SCHEMA_TO_TABLE_ROLE_MAP, // eg { schema_owner: "table_administrator" }
          true, // delete existing roles for this scheam/user
          undefined,
          userIds
        );
    }
    return result;
  }

  public async deleteRole(
    userIds: number[],
    roleLevel: RoleLevel,
    objectId: number
  ): Promise<ServiceResult> {
    let result = await this.dal.deleteRole(userIds, roleLevel, objectId);
    if (!result.success) return result;
    switch (roleLevel) {
      case "schema":
        result = await this.dal.deleteRole(
          userIds,
          "table",
          undefined,
          objectId // parentObjectId ie the schema id
        );
    }
    return result;
  }

  /**
   * ========== Users ==========
   */

  public async deleteTestUsers(): Promise<ServiceResult> {
    log.debug(`deleteTestUsers()`);
    return this.dal.deleteTestUsers();
  }

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
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_USER_NOT_FOUND",
          values: [id.toString()],
        });
      }
    }
    return result;
  }

  public async usersByEmails(userEmails: string[]): Promise<ServiceResult> {
    return this.dal.usersByIdsOrEmails(undefined, userEmails);
  }

  public async userByEmail(email: string): Promise<ServiceResult> {
    const result = await this.usersByEmails([email]);
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_USER_NOT_FOUND",
          values: [email],
        });
      }
    }
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
   * ========== Organizations ==========
   */

  public async organizations(
    userId?: number,
    userEmail?: string,
    organizationId?: number
  ): Promise<ServiceResult> {
    // this.addDefaultTablePermissions("test_the_daisy_blog", "authors");
    let result = await this.tableBySchemaNameTableName(
      "test_the_daisy_blog",
      "authors"
    );
    if (!result.success) return result;
    // result = await this.addDefaultTableUsersToTable(result.payload);
    // if (!result.success) return result;

    return this.dal.organizations(userId, userEmail, organizationId);
  }

  public async organization(
    userId?: number,
    userEmail?: string,
    organizationId?: number,
    organizationName?: string
  ): Promise<ServiceResult> {
    const result = await this.dal.organizations(
      userId,
      userEmail,
      organizationId,
      organizationName
    );
    if (result.success) result.payload = result.payload[0];
    return result;
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
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_ORGANIZATION_NOT_FOUND",
          values: [id.toString()],
        });
      }
    }
    return result;
  }

  public async organizationsByNames(names: string[]): Promise<ServiceResult> {
    return this.dal.organizationsByIdsOrNames(undefined, names);
  }

  public async organizationByName(name: string): Promise<ServiceResult> {
    const result = await this.organizationsByNames([name]);
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_ORGANIZATION_NOT_FOUND",
          values: [name],
        });
      }
    }
    return result;
  }

  public async createOrganization(
    currentUserEmail: string, // TBD: repace with uid
    name: string,
    label: string
  ): Promise<ServiceResult> {
    const checkNameResult = await this.organizationByName(name);
    if (checkNameResult.success) {
      return errResult({
        wbCode: "WB_ORGANIZATION_NAME_TAKEN",
      } as ServiceResult);
      // WB_ORGANIZATION_NOT_FOUND is the desired result
    } else if (checkNameResult.wbCode != "WB_ORGANIZATION_NOT_FOUND") {
      return checkNameResult;
    }
    const createOrgResult = await this.dal.createOrganization(name, label);
    if (!createOrgResult.success) return createOrgResult;
    const result = await this.setOrganizationUsersRole(
      name,
      [currentUserEmail],
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
      return errResult({
        wbCode: "WB_ORGANIZATION_NOT_USER_EMPTY",
      } as ServiceResult);
    }
    return this.dal.deleteOrganization(name);
  }

  public async deleteTestOrganizations(): Promise<ServiceResult> {
    log.debug(`deleteTestOrganizations()`);
    return this.dal.deleteTestOrganizations();
  }

  /**
   * ========== Organization Users ==========
   */

  public async organizationUsers(
    name: string,
    roles?: string[]
  ): Promise<ServiceResult> {
    const result = await this.organizationByName(name);
    if (!result.success) return result;
    if (!result.payload) {
      return errResult({
        wbCode: "WB_ORGANIZATION_NOT_FOUND",
      } as ServiceResult);
    }
    if (roles && !Role.areRoles(roles)) {
      return errResult({
        message:
          "organizationUsers: roles contains one or more unrecognized strings",
      } as ServiceResult);
    }
    return this.dal.organizationUsers(name, roles);
  }

  public async setOrganizationUsersRole(
    organizationName: string,
    userEmails: [string],
    role: string
  ): Promise<ServiceResult> {
    const organizationResult = await this.organizationByName(organizationName);
    if (!organizationResult.success) return organizationResult;
    const usersResult = await this.usersByEmails(userEmails);
    if (!usersResult.success || !usersResult.payload) return usersResult;
    if (usersResult.payload.length != userEmails.length) {
      return errResult({
        wbCode: "WB_USERS_NOT_FOUND",
        values: userEmails.filter(
          (x: string) => !usersResult.payload.includes(x)
        ),
      } as ServiceResult);
    }
    const userIds = usersResult.payload.map((user: { id: number }) => user.id);
    return await this.setRole(
      userIds,
      role,
      "organization",
      organizationResult.payload
    );
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
      return errResult({
        wbCode: "WB_ORGANIZATION_NO_ADMINS",
      } as ServiceResult);
    }
    const organizationResult = await this.organizationByName(organizationName);
    if (!organizationResult.success) return organizationResult;
    const result = await this.deleteRole(
      userIds,
      "organization",
      organizationResult.payload.id
    );
    return result;
  }

  /**
   * ========== Schemas ==========
   */

  public async schemasByUserOwner(userEmail: string): Promise<ServiceResult> {
    return this.dal.schemasByUserOwner(userEmail);
  }

  public async schemasByOrgOwnerAdmin(
    userEmail: string
  ): Promise<ServiceResult> {
    return this.dal.schemasByOrgOwnerAdmin(userEmail);
  }

  public async schemaByName(schemaName: string): Promise<ServiceResult> {
    return this.dal.schemaByName(schemaName);
  }

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
      return errResult({ wbCode: "WB_BAD_SCHEMA_NAME" } as ServiceResult);
    }
    let result: ServiceResult = errResult();
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
        return errResult({
          message:
            "createSchema: Either organizationOwnerName or userOwnerEmail required.",
        } as ServiceResult);
      }
    }
    let userOrgRole: Organization | undefined = undefined;
    if (!User.isSysAdmin(uid)) {
      // User must be in the organization for organizationOwner
      if (organizationOwnerId) {
        const orgResult = await this.organizationAccess(
          uid,
          organizationOwnerId
        );
        if (!orgResult.success) return orgResult;
        userOrgRole = orgResult.payload;
        if (!userOrgRole) {
          return errResult({
            wbCode: "WB_USER_NOT_IN_ORG",
            values: [uid.toString(), organizationOwnerId.toString()],
          }) as ServiceResult;
        }
        // Only the current user can be the userOwner
      } else if (userOwnerId) {
        if (uid != userOwnerId) {
          return errResult({
            wbCode: "WB_USER_NOT_SCHEMA_OWNER",
            values: [uid.toString()],
          }) as ServiceResult;
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
      !User.isSysAdmin(uid) &&
      organizationOwnerId &&
      userOrgRole &&
      userOrgRole.userRole != "organiation_admin"
    ) {
      result = await this.setRole(
        [uid],
        "schema_administrator",
        "schema" as RoleLevel,
        schemaResult.payload
      );
      if (!result.success) return result;
    }
    return schemaResult;
  }

  public async removeOrDeleteSchema(
    schemaName: string,
    del: boolean
  ): Promise<ServiceResult> {
    log.debug(`removeOrDeleteSchema(${schemaName},${del})`);
    let result = await this.addOrRemoveAllExistingRelationships(
      schemaName,
      true
    );
    if (!result.success) return result;
    result = await this.dal.tables(schemaName);
    if (!result.success) return result;
    for (const table of result.payload) {
      result = await this.removeOrDeleteTable(schemaName, table.name, del);
      if (!result.success) return result;
    }
    result = await this.dal.removeAllUsersFromSchema(schemaName);
    if (!result.success) return result;
    return await this.dal.removeOrDeleteSchema(schemaName, del);
  }

  /**
   * ========== Schema Users ==========
   */

  public async setSchemaUsersRole(
    schemaName: string,
    userEmails: string[],
    role: string
  ): Promise<ServiceResult> {
    const schemaResult = await this.schemaByName(schemaName);
    if (!schemaResult.success) return schemaResult;
    const usersResult = await this.usersByEmails(userEmails);
    if (!usersResult.success || !usersResult.payload) return usersResult;
    if (usersResult.payload.length != userEmails.length) {
      return errResult({
        wbCode: "WB_USERS_NOT_FOUND",
        values: userEmails.filter(
          (x: string) => !usersResult.payload.includes(x)
        ),
      } as ServiceResult);
    }
    const userIds = usersResult.payload.map((user: { id: number }) => user.id);
    return await this.setRole(userIds, role, "schema", schemaResult.payload);
  }

  public async removeSchemaUsers(
    schemaName: string,
    userEmails: string[]
  ): Promise<ServiceResult> {
    const usersResult = await this.usersByEmails(userEmails);
    if (!usersResult.success) return usersResult;
    const userIds = usersResult.payload.map((user: { id: number }) => user.id);
    const schemaResult = await this.schemaByName(schemaName);
    if (!schemaResult.success) return schemaResult;
    const result = await this.deleteRole(
      userIds,
      "schema",
      schemaResult.payload.id
    );
    return result;
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
   * ========== Tables ==========
   */

  public async tables(
    schemaName: string,
    withColumns?: boolean
  ): Promise<ServiceResult> {
    const result = await this.dal.tables(schemaName);
    if (withColumns) {
      if (!result.success) return result;
      for (const table of result.payload) {
        const columnsResult = await this.columns(schemaName, table.name);
        if (!columnsResult.success) return columnsResult;
        table.columns = columnsResult.payload;
      }
    }
    return result;
  }

  public async tableBySchemaNameTableName(
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    return await this.dal.tableBySchemaNameTableName(schemaName, tableName);
  }

  public async addOrCreateTable(
    schemaName: string,
    tableName: string,
    tableLabel: string,
    create?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `addOrCreateTable(${schemaName},${tableName},${tableLabel},${create})`
    );
    if (!create) create = false;
    const tableResult = await this.dal.addOrCreateTable(
      schemaName,
      tableName,
      tableLabel,
      create
    );
    if (!tableResult.success) return tableResult;
    let result = await this.addDefaultTableUsersToTable(tableResult.payload);
    if (!result.success) return result;
    result = await this.deleteAndSetTablePermissions(tableResult.payload);
    if (!result.success) return result;
    tableResult.payload.schemaName = schemaName;
    return await this.trackTableWithPermissions(tableResult.payload);
  }

  public async removeOrDeleteTable(
    schemaName: string,
    tableName: string,
    del?: boolean
  ): Promise<ServiceResult> {
    if (!del) del = false;
    // 1. remove/delete columns
    let result = await this.dal.columns(schemaName, tableName);
    if (!result.success) return result;
    const columns = result.payload;
    for (const column of columns) {
      result = await this.removeOrDeleteColumn(
        schemaName,
        tableName,
        column.name,
        del,
        true
      );
      if (!result.success) return result;
    }
    const tableResult = await this.tableBySchemaNameTableName(
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    result = await this.untrackTableWithPermissions(tableResult.payload);
    if (!result.success) return result;
    // 3. remove user settings
    result = await this.dal.removeAllTableUsers(tableResult.payload.id);
    if (!result.success) return result;
    result = await this.deleteAndSetTablePermissions(tableResult.payload, true);
    if (!result.success) return result;
    // 4. remove/delete the table
    return await this.dal.removeOrDeleteTable(schemaName, tableName, del);
  }

  public async updateTable(
    schemaName: string,
    tableName: string,
    newTableName?: string,
    newTableLabel?: string
  ): Promise<ServiceResult> {
    let result: ServiceResult;
    const tableResult = await this.tableBySchemaNameTableName(
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    if (newTableName) {
      result = await this.tables(schemaName, false);
      if (!result.success) return result;
      const existingTableNames = result.payload.map(
        (table: { name: string }) => table.name
      );
      if (existingTableNames.includes(newTableName)) {
        return errResult({ wbCode: "WB_TABLE_NAME_EXISTS" } as ServiceResult);
      }
      result = await this.untrackTableWithPermissions(tableResult.payload);
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
      result = await this.trackTableWithPermissions(tableResult.payload);
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
      const tableResult = await this.addOrCreateTable(
        schemaName,
        tableName,
        v.titleCase(tableName.replaceAll("_", " ")),
        false
      );
      if (!tableResult.success) return tableResult;
      result = await this.untrackTableWithPermissions(tableResult.payload);
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
          false,
          undefined,
          true
        );
        if (!result.success) return result;
      }
      result = await this.trackTableWithPermissions(tableResult.payload);
      if (!result.success) return result;
    }
    return result;
  }

  public async addOrRemoveAllExistingRelationships(
    schemaName: string,
    remove?: boolean
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
          let result: ServiceResult;
          if (remove) {
            result = await this.removeOrDeleteForeignKey(
              schemaName,
              relationship.tableName,
              [relationship.columnName],
              relationship.relTableName
            );
          } else {
            result = await this.addOrCreateForeignKey(
              schemaName,
              relationship.tableName,
              [relationship.columnName],
              relationship.relTableName,
              [relationship.relColumnName]
            );
          }
          if (!result.success) return result;
        } else {
          return errResult({
            message:
              "addOrRemoveAllExistingRelationships: ConstraintId must have relTableName and relColumnName",
          } as ServiceResult);
        }
      }
    }
    return result;
  }

  public async addDefaultTablePermissions(
    table: Table
  ): Promise<ServiceResult> {
    log.info(`addDefaultTablePermissions(${JSON.stringify(table)})`);
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    let result = await this.columns(table.schemaName, table.name);
    if (!result.success) return result;
    // dont add permissions for tables with no columns
    if (result.payload.length == 0) return { success: true } as ServiceResult;
    const columnNames: string[] = result.payload.map(
      (table: { name: string }) => table.name
    );
    for (const permissionCheckAndType of Role.hasuraTablePermissionChecksAndTypes(
      table.id
    )) {
      result = await hasuraApi.createPermission(
        table.schemaName,
        table.name,
        permissionCheckAndType.permissionCheck,
        permissionCheckAndType.permissionType,
        "wbuser",
        columnNames
      );
      if (!result.success) return result;
    }
    return result;
  }

  public async removeDefaultTablePermissions(
    table: Table
  ): Promise<ServiceResult> {
    log.info(`addDefaultTablePermissions(${JSON.stringify(table)})`);
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    // If this table no longer has any columns, there will be no permissions
    let result = await this.columns(table.schemaName, table.name);
    if (!result.success) return result;
    if (result.payload.length == 0) {
      return { success: true, payload: true } as ServiceResult;
    }
    for (const permissionKeyAndType of Role.tablePermissionKeysAndTypes(
      table.id
    )) {
      result = await hasuraApi.deletePermission(
        table.schemaName,
        table.name,
        permissionKeyAndType.type,
        "wbuser"
      );
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
        return errResult({ wbCode: "WB_PK_EXISTS" } as ServiceResult);
      }
      result = await this.dal.createPrimaryKey(
        schemaName,
        tableName,
        columnNames
      );
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
    if (!result.success) return result;
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
        } else if (operation == "CREATE") {
          return errResult({
            wbCode: "WB_FK_EXISTS",
            values: [columnName],
          } as ServiceResult);
        }
      }
    }
    if (operation == "ADD" || operation == "CREATE") {
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

  public async trackTableWithPermissions(table: Table): Promise<ServiceResult> {
    log.info(`trackTableWithPermissions(${JSON.stringify(table)})`);
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    let result = await hasuraApi.trackTable(table.schemaName, table.name);
    if (!result.success) return result;
    return await this.addDefaultTablePermissions(table);
  }

  public async untrackTableWithPermissions(
    table: Table
  ): Promise<ServiceResult> {
    log.info(`untrackTableWithPermissions(${JSON.stringify(table)})`);
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    let result = await this.removeDefaultTablePermissions(table);
    if (!result.success) return result;
    result = await hasuraApi.untrackTable(table.schemaName, table.name);
    return result;
  }

  /**
   * ========== Table Users===========
   */

  public async tableUser(
    userEmail: string,
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    return this.dal.tableUser(userEmail, schemaName, tableName);
  }

  public async addDefaultTableUsersToTable(
    table: Table
  ): Promise<ServiceResult> {
    log.info(`addDefaultTableUsersToTable(${JSON.stringify(table)})`);
    return await this.dal.setTableUserRolesFromSchemaRoles(
      table.schemaId,
      Role.SCHEMA_TO_TABLE_ROLE_MAP,
      true,
      [table.id]
    );
  }

  public async setTableUsersRole(
    schemaName: string,
    tableName: string,
    userEmails: [string],
    role: string
  ): Promise<ServiceResult> {
    const tableResult = await this.tableBySchemaNameTableName(
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    const usersResult = await this.usersByEmails(userEmails);
    if (!usersResult.success || !usersResult.payload) return usersResult;
    if (usersResult.payload.length != userEmails.length) {
      return errResult({
        wbCode: "WB_USERS_NOT_FOUND",
        values: userEmails.filter(
          (x: string) => !usersResult.payload.includes(x)
        ),
      } as ServiceResult);
    }
    const userIds = usersResult.payload.map((user: { id: number }) => user.id);
    return await this.setRole(userIds, role, "table", tableResult.payload);
  }

  // not used yet
  public async removeUsersFromTable(
    userEmails: string[],
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    const usersResult = await this.usersByEmails(userEmails);
    if (!usersResult.success) return usersResult;
    // TBD do any checks against schema
    // const userIds = usersResult.payload.map((user: { id: number }) => user.id);
    // // check not all the admins will be removed
    // const adminsResult = await this.organizationUsers(organizationName, [
    //   "organization_administrator",
    // ]);
    // if (!adminsResult.success) return adminsResult;
    // const allAdminIds = adminsResult.payload.map(
    //   (user: { id: number }) => user.id
    // );
    // if (allAdminIds.every((elem: number) => userIds.includes(elem))) {
    //   return errResult({
    //     wbCode: "WB_ORGANIZATION_NO_ADMINS",
    //   } as ServiceResult);
    // }
    const tableResult = await this.tableBySchemaNameTableName(
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    const result = await this.deleteRole(
      usersResult.payload,
      "table",
      tableResult.payload.id
    );
    return result;
  }

  public async saveTableUserSettings(
    schemaName: string,
    tableName: string,
    userEmail: string,
    settings: object
  ): Promise<ServiceResult> {
    const tableResult = await this.tableBySchemaNameTableName(
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

  /**
   * ========== Columns ==========
   */

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

  public async addOrCreateColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    columnLabel: string,
    create?: boolean,
    columnType?: string,
    skipTracking?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `addOrCreateColumn(${schemaName},${tableName},${columnName},${columnLabel},${create},${columnType},${skipTracking})`
    );
    if (!create) create = false;
    let result: ServiceResult = errResult();
    const tableResult = await this.tableBySchemaNameTableName(
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    if (!skipTracking) {
      result = await this.untrackTableWithPermissions(tableResult.payload);
      if (!result.success) return result;
    }
    result = await this.dal.addOrCreateColumn(
      schemaName,
      tableName,
      columnName,
      columnLabel,
      create,
      columnType
    );
    if (result.success && !skipTracking) {
      result = await this.trackTableWithPermissions(tableResult.payload);
    }
    return result;
  }

  // Must enter and exit with tracked table, regardless of if there are columns
  public async removeOrDeleteColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    del?: boolean,
    skipTracking?: boolean
  ): Promise<ServiceResult> {
    log.debug(
      `removeOrDeleteColumn(${schemaName},${tableName},${columnName},${del})`
    );
    if (!del) del = false;
    let result: ServiceResult = errResult();
    const tableResult = await this.tableBySchemaNameTableName(
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    if (!skipTracking) {
      result = await this.untrackTableWithPermissions(tableResult.payload);
      if (!result.success) return result;
    }
    result = await this.dal.removeOrDeleteColumn(
      schemaName,
      tableName,
      columnName,
      del
    );
    if (result.success && !skipTracking) {
      result = await this.trackTableWithPermissions(tableResult.payload);
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
    // TBD: if this is a fk
    let result: ServiceResult;
    const tableResult = await this.tableBySchemaNameTableName(
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    if (newColumnName) {
      result = await this.columns(schemaName, tableName);
      if (!result.success) return result;
      const existingColumnNames = result.payload.map(
        (table: { name: string }) => table.name
      );
      if (existingColumnNames.includes(newColumnName)) {
        return errResult({ wbCode: "WB_COLUMN_NAME_EXISTS" } as ServiceResult);
      }
    }
    if (newColumnName || newType) {
      result = await this.untrackTableWithPermissions(tableResult.payload);
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
      result = await this.trackTableWithPermissions(tableResult.payload);
      if (!result.success) return result;
    }
    return result;
  }
}

/**
 * ========== Error Handling ==========
 */

export function errResult(result?: ServiceResult): ServiceResult {
  if (!result) {
    return {
      success: false,
      message: "Result has not been assigned",
    } as ServiceResult;
  }
  if (result.success == true) {
    result = {
      success: false,
      message:
        "WhitebrickCloud errResult: result is not an error (success==true)",
    };
  } else if (!("success" in result)) {
    result.success = false;
  }
  if (!result.message && result.wbCode) {
    result.message = WhitebrickCloud.WB_ERROR_CODES[result.wbCode][0];
    if (!result.message) {
      result = {
        success: false,
        message: `WhitebrickCloud errResult: Could not find message for wbCode=${result.wbCode}`,
      };
    }
  }
  if (result.values) {
    result.message = `${result.message} Values: ${result.values.join(", ")}`;
    delete result.values;
  }
  if (
    !result.apolloErrorCode &&
    result.wbCode &&
    Object.keys(WhitebrickCloud.WB_ERROR_CODES).includes(result.wbCode) &&
    WhitebrickCloud.WB_ERROR_CODES[result.wbCode].length == 2
  ) {
    result.apolloErrorCode = WhitebrickCloud.WB_ERROR_CODES[result.wbCode][1];
  } else if (
    !result.apolloErrorCode &&
    result.wbCode &&
    !Object.keys(WhitebrickCloud.WB_ERROR_CODES).includes(result.wbCode)
  ) {
    result = {
      success: false,
      message: `WhitebrickCloud err: Could not find apolloErrorCode for wbCode=${result.wbCode}`,
    };
  } else {
    result.apolloErrorCode = "INTERNAL_SERVER_ERROR";
  }
  return result;
}

export function apolloErr(result: ServiceResult): Error {
  result = errResult(result);
  if (result.success) {
    return new Error(
      "WhitebrickCloud.err: result is not an error (success==true)"
    );
  }
  const details: Record<string, string> = {};
  if (!result.message) result.message = "Unknown error.";
  if (result.refCode) details.refCode = result.refCode;
  if (result.wbCode) details.wbCode = result.wbCode;
  return new ApolloError(result.message, result.apolloErrorCode, details);
}
