import { ApolloServer, ApolloError } from "apollo-server-lambda";
import { Logger } from "tslog";
import { DAL } from "./dal";
import { hasuraApi } from "./hasura-api";
import { ConstraintId, schema, ServiceResult } from "./types";
import v = require("voca");
import { userMessages } from "./environment";

import {
  Column,
  Organization,
  Role,
  RoleLevel,
  Schema,
  Table,
  User,
} from "./entity";
import { CurrentUser } from "./entity/CurrentUser";
import { DEFAULT_POLICY } from "./policy";

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

export class WhitebrickCloud {
  dal = new DAL();

  public err(result: ServiceResult): Error {
    return apolloErr(result);
  }

  // only async for testing - for the most part static
  public async uidFromHeaders(
    headers: Record<string, string>
  ): Promise<ServiceResult> {
    //log.debug("========== HEADERS: " + JSON.stringify(headers));
    const headersLowerCase = Object.entries(headers).reduce(
      (acc: Record<string, string>, [key, val]) => (
        (acc[key.toLowerCase()] = val), acc
      ),
      {}
    );
    let result: ServiceResult = errResult();
    // if x-hasura-admin-secret is present and valid hasura sets role to admin
    if (
      headersLowerCase["x-hasura-role"] &&
      headersLowerCase["x-hasura-role"].toLowerCase() == "admin"
    ) {
      log.debug("========== FOUND ADMIN USER");
      return {
        success: true,
        payload: User.SYS_ADMIN_ID,
      } as ServiceResult;
    } else if (
      process.env.NODE_ENV == "development" &&
      headersLowerCase["x-test-user-id"]
    ) {
      result = await this.userByEmail(
        CurrentUser.getSysAdmin(this),
        headersLowerCase["x-test-user-id"]
      );
      if (result.success) result.payload = result.payload.id;
      log.debug(
        `========== FOUND TEST USER: ${headersLowerCase["x-test-user-id"]}`
      );
    } else if (headersLowerCase["x-hasura-user-id"]) {
      result = {
        success: true,
        payload: parseInt(headersLowerCase["x-hasura-user-id"]),
      } as ServiceResult;
      log.debug(
        `========== FOUND USER: ${headersLowerCase["x-hasura-user-id"]}`
      );
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
        organization: Role.SYSROLES_ORGANIZATIONS,
        schema: Role.SYSROLES_SCHEMAS,
        table: Role.SYSROLES_TABLES,
      },
      policy: DEFAULT_POLICY,
    };
  }

  /**
   * ========== Test ==========
   */

  public async resetTestData(): Promise<ServiceResult> {
    log.debug(`resetTestData()`);
    let result = await this.schemas(
      CurrentUser.getSysAdmin(this),
      undefined,
      undefined,
      "test_%"
    );
    if (!result.success) return result;
    for (const schema of result.payload) {
      result = await this.removeOrDeleteSchema(
        CurrentUser.getSysAdmin(this),
        schema.name,
        true
      );
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

  public async auth(userAuthId: string): Promise<ServiceResult> {
    const result = await this.dal.userIdFromAuthId(userAuthId);
    if (!result.success) return result;
    const hasuraUserId: number = result.payload;
    return {
      success: true,
      payload: {
        "X-Hasura-Allowed-Roles": ["wbuser"],
        "X-Hasura-Default-Role": "wbuser",
        "X-Hasura-User-Id": hasuraUserId,
        "X-Hasura-Authenticated-At": Date().toString(),
      },
    } as ServiceResult;
  }

  /**
   * ========== Roles & Permissions ==========
   */

  public async roleByName(
    cU: CurrentUser,
    name: string
  ): Promise<ServiceResult> {
    return this.dal.roleByName(name);
  }

  public async deleteAndSetTablePermissions(
    cU: CurrentUser,
    table: Table,
    deleteOnly?: boolean
  ): Promise<ServiceResult> {
    return await this.dal.deleteAndSetTablePermissions(table.id);
  }

  public async setRole(
    cU: CurrentUser,
    userIds: number[],
    roleName: string,
    roleLevel: RoleLevel,
    object: Organization | Schema | Table
  ): Promise<ServiceResult> {
    log.debug(
      `setRole(${userIds},${roleName},${roleLevel},${JSON.stringify(object)})`
    );
    if (!Role.isRole(roleName, roleLevel)) {
      return errResult({
        message: `${roleName} is not a valid name for an ${roleLevel} Role.`,
      });
    }
    let result = errResult();
    switch (roleLevel) {
      case "organization":
        switch (roleName) {
          case "organization_user":
            // are any of these user currently admins getting demoted?
            result = await this.organizationUsers(cU, object.name, undefined, [
              "organization_administrator",
            ]);
            if (!result.success) return result;
            const currentAdminIds = result.payload.map(
              (organizationUser: { userId: number }) => organizationUser.userId
            );
            const demotedAdmins: number[] = userIds.filter((id: number) =>
              currentAdminIds.includes(id)
            );
            if (demotedAdmins.length > 0) {
              // completely remove them (will raise error if no admins)
              result = await this.removeUsersFromOrganization(
                cU,
                object.name,
                demotedAdmins
              );
              if (!result.success) return result;
            }
            // add orgnaization_user
            result = await this.dal.setRole(
              userIds,
              roleName,
              roleLevel,
              object.id
            );
            break;
          case "organization_administrator":
            result = await this.dal.setRole(
              userIds,
              roleName,
              roleLevel,
              object.id
            );
            if (!result.success) return result;
            result = await this.dal.setSchemaUserRolesFromOrganizationRoles(
              object.id,
              Role.sysRoleMap(
                "organization" as RoleLevel,
                "schema" as RoleLevel
              ),
              undefined,
              userIds
            );
            if (!result.success) return result;
            result = await this.schemasByOrganizationOwner(cU, object.id);
            if (!result.success) return result;
            for (const schema of result.payload) {
              result = await this.dal.setTableUserRolesFromSchemaRoles(
                schema.id,
                Role.sysRoleMap("schema" as RoleLevel, "table" as RoleLevel),
                undefined,
                userIds
              );
              if (!result.success) return result;
            }
            break;
          case "organization_external_user":
            result = await this.dal.setRole(
              userIds,
              roleName,
              roleLevel,
              object.id
            );
            break;
        }
        break;
      case "schema":
        // add schema_user
        result = await this.dal.setRole(
          userIds,
          roleName,
          roleLevel,
          object.id
        );
        if (!result.success) return result;
        // Changing role at the schema level resets all
        // table roles to the schema default inheritence
        result = await this.dal.setTableUserRolesFromSchemaRoles(
          object.id,
          Role.sysRoleMap("schema" as RoleLevel, "table" as RoleLevel), // eg { schema_owner: "table_administrator" }
          undefined,
          userIds
        );
        break;
      case "table":
        result = await this.dal.setRole(
          userIds,
          roleName,
          roleLevel,
          object.id
        );
        break;
    }
    return result;
  }

  public async deleteRole(
    cU: CurrentUser,
    userIds: number[],
    roleLevel: RoleLevel,
    objectId: number
  ): Promise<ServiceResult> {
    let result = await this.dal.deleteRole(userIds, roleLevel, objectId);
    if (!result.success) return result;
    switch (roleLevel) {
      case "organization":
        // Delete schema admins implicitly set from organization admins
        result = await this.dal.deleteRole(
          userIds,
          "schema",
          undefined,
          objectId, // parentObjectId ie the organization id
          ["organization_administrator"]
        );
        if (!result.success) return result;
        // Delete table admins implicitly set from schema admins
        result = await this.schemasByOrganizationOwner(cU, objectId);
        if (!result.success) return result;
        for (const schema of result.payload) {
          result = await this.dal.deleteRole(
            userIds,
            "table",
            undefined,
            schema.id, // parentObjectId ie the schema id
            ["schema_administrator"]
          );
          if (!result.success) return result;
        }
        break;
      case "schema":
        // Delete table users implicitly set from schema users
        result = await this.dal.deleteRole(
          userIds,
          "table",
          undefined,
          objectId, // parentObjectId ie the schema id
          Object.keys(
            Role.sysRoleMap("schema" as RoleLevel, "table" as RoleLevel)
          )
        );
        break;
    }
    return result;
  }

  public async roleAndIdForUserObject(
    userId: number,
    roleLevel: RoleLevel,
    objectIdOrName: number | string,
    parentObjectName?: string
  ): Promise<ServiceResult> {
    return this.dal.roleAndIdForUserObject(
      userId,
      roleLevel,
      objectIdOrName,
      parentObjectName
    );
  }

  /**
   * ========== Users ==========
   */

  public async deleteTestUsers(): Promise<ServiceResult> {
    log.debug(`deleteTestUsers()`);
    return this.dal.deleteTestUsers();
  }

  public async usersByIds(
    cU: CurrentUser,
    ids: number[]
  ): Promise<ServiceResult> {
    return this.dal.users(ids);
  }

  public async userById(cU: CurrentUser, id: number): Promise<ServiceResult> {
    const result = await this.usersByIds(cU, [id]);
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

  // searchPattern across multiple fields
  public async usersBySearchPattern(
    cU: CurrentUser,
    searchPattern: string
  ): Promise<ServiceResult> {
    return this.dal.users(undefined, undefined, searchPattern);
  }

  public async usersByEmails(
    cU: CurrentUser,
    userEmails: string[]
  ): Promise<ServiceResult> {
    return this.dal.users(undefined, userEmails);
  }

  public async userByEmail(
    cU: CurrentUser,
    email: string
  ): Promise<ServiceResult> {
    const result = await this.usersByEmails(cU, [email]);
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
    cU: CurrentUser,
    email: string,
    firstName: string,
    lastName: string
  ): Promise<ServiceResult> {
    // TBD: authentication, save password
    return this.dal.createUser(email, firstName, lastName);
  }

  public async updateUser(
    cU: CurrentUser,
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
    cU: CurrentUser,
    organizationIds?: number[],
    organizationNames?: string[],
    organizationNamePattern?: string
  ): Promise<ServiceResult> {
    const result = await this.dal.organizations(
      organizationIds,
      organizationNames,
      organizationNamePattern
    );
    return result;
  }

  public async organizationsByIds(
    cU: CurrentUser,
    ids: number[]
  ): Promise<ServiceResult> {
    return this.organizations(cU, ids);
  }

  public async organizationById(
    cU: CurrentUser,
    id: number
  ): Promise<ServiceResult> {
    const result = await this.organizationsByIds(cU, [id]);
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

  public async organizationsByNames(
    cU: CurrentUser,
    names: string[]
  ): Promise<ServiceResult> {
    return this.organizations(cU, undefined, names);
  }

  public async organizationByName(
    cU: CurrentUser,
    name: string
  ): Promise<ServiceResult> {
    const result = await this.organizationsByNames(cU, [name]);
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

  public async organizationByNamePattern(
    cU: CurrentUser,
    namePattern: string
  ): Promise<ServiceResult> {
    const result = await this.organizations(
      cU,
      undefined,
      undefined,
      namePattern
    );
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_ORGANIZATION_NOT_FOUND",
          values: [namePattern],
        });
      }
    }
    return result;
  }

  public async accessibleOrganizationByName(
    cU: CurrentUser,
    organizationName: string,
    withSettings?: boolean
  ): Promise<ServiceResult> {
    const result = await this.dal.organizationsByUsers(
      [cU.id],
      undefined,
      [organizationName],
      withSettings
    );
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_ORGANIZATION_NOT_FOUND",
          values: [organizationName],
        });
      }
    }
    return result;
  }

  public async accessibleOrganizations(
    cU: CurrentUser,
    withSettings?: boolean
  ): Promise<ServiceResult> {
    return await this.dal.organizationsByUsers(
      [cU.id],
      undefined,
      undefined,
      withSettings
    );
  }

  public async createOrganization(
    cU: CurrentUser,
    name: string,
    label: string
  ): Promise<ServiceResult> {
    log.debug(`createOrganization(${cU.id}, ${name}, ${label})`);
    if (cU.isSignedOut()) return cU.mustBeSignedIn();
    const checkNameResult = await this.organizationByName(cU, name);
    if (checkNameResult.success) {
      return errResult({
        wbCode: "WB_ORGANIZATION_NAME_TAKEN",
      } as ServiceResult);
      // ie WB_ORGANIZATION_NOT_FOUND is the desired result
    } else if (checkNameResult.wbCode != "WB_ORGANIZATION_NOT_FOUND") {
      return checkNameResult;
    }
    const createOrganizationResult = await this.dal.createOrganization(
      name,
      label
    );
    if (!createOrganizationResult.success) return createOrganizationResult;
    const result = await this.setOrganizationUsersRole(
      CurrentUser.getSysAdmin(this),
      name,
      "organization_administrator",
      [cU.id]
    );
    if (!result.success) return result;
    return createOrganizationResult;
  }

  public async updateOrganization(
    cU: CurrentUser,
    name: string,
    newName?: string,
    newLabel?: string
  ): Promise<ServiceResult> {
    if (await cU.cant("edit_organization", name)) return cU.denied();
    return this.dal.updateOrganization(name, newName, newLabel);
  }

  public async deleteOrganization(
    cU: CurrentUser,
    name: string
  ): Promise<ServiceResult> {
    log.debug(`deleteOrganization(${cU.id},${name})`);
    if (await cU.cant("edit_organization", name)) {
      return cU.denied();
    }
    const result = await this.organizationUsers(cU, name, undefined, [
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
    cU: CurrentUser,
    name?: string,
    id?: number,
    roles?: string[],
    userEmails?: string[],
    withSettings?: boolean
  ): Promise<ServiceResult> {
    let result: ServiceResult = errResult();
    if (name) {
      result = await this.organizationByName(cU, name);
    } else if (id) {
      result = await this.organizationById(cU, id);
    }
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
    let userIds = undefined;
    if (userEmails) {
      const usersResult = await this.usersByEmails(cU, userEmails);
      if (!usersResult.success || !usersResult.payload) return usersResult;
      userIds = usersResult.payload.map((user: { id: number }) => user.id);
    }
    return this.dal.organizationUsers(name, id, roles, userIds, withSettings);
  }

  public async setOrganizationUsersRole(
    cU: CurrentUser,
    organizationName: string,
    roleName: string,
    userIds?: number[],
    userEmails?: string[]
  ): Promise<ServiceResult> {
    log.debug(
      `setOrganizationUsersRole(${cU.id},${organizationName},${roleName},${userIds},${userEmails})`
    );
    if (await cU.cant("manage_access_to_organization", organizationName)) {
      return cU.denied();
    }
    const organizationResult = await this.organizationByName(
      cU,
      organizationName
    );
    if (!organizationResult.success) return organizationResult;
    let result: ServiceResult = errResult();
    let userIdsFound: number[] = [];
    let usersRequested: (string | number)[] = [];
    if (userIds) {
      usersRequested = userIds;
      result = await this.usersByIds(cU, userIds);
    } else if (userEmails) {
      usersRequested = userEmails;
      result = await this.usersByEmails(cU, userEmails);
    }
    if (!result.success || !result.payload) return result;
    userIdsFound = result.payload.map((user: { id: number }) => user.id);
    if (usersRequested.length != userIdsFound.length) {
      return errResult({
        wbCode: "WB_USERS_NOT_FOUND",
        values: [
          `Requested ${usersRequested.length}: ${usersRequested.join(",")}`,
          `Found ${userIdsFound.length}: ${userIdsFound.join(",")}`,
        ],
      } as ServiceResult);
    }
    return await this.setRole(
      cU,
      userIdsFound,
      roleName,
      "organization",
      organizationResult.payload
    );
  }

  public async removeUsersFromOrganization(
    cU: CurrentUser,
    organizationName: string,
    userIds?: number[],
    userEmails?: string[]
  ): Promise<ServiceResult> {
    log.debug(
      `removeUsersFromOrganization(${cU.id},${organizationName},${userIds},${userEmails})`
    );
    if (await cU.cant("manage_access_to_organization", organizationName)) {
      return cU.denied();
    }
    let result: ServiceResult = errResult();
    let userIdsToBeRemoved: number[] = [];
    if (userIds) userIdsToBeRemoved = userIds;
    if (userEmails) {
      result = await this.usersByEmails(cU, userEmails);
      if (!result.success) return result;
      userIdsToBeRemoved = result.payload.map(
        (user: { id: number }) => user.id
      );
    }
    // check not all the admins will be removed
    result = await this.organizationUsers(cU, organizationName, undefined, [
      "organization_administrator",
    ]);
    if (!result.success) return result;
    const allAdminIds = result.payload.map(
      (organizationUser: { userId: number }) => organizationUser.userId
    );
    if (
      allAdminIds.every((elem: number) => userIdsToBeRemoved.includes(elem))
    ) {
      return errResult({
        wbCode: "WB_ORGANIZATION_NO_ADMINS",
      } as ServiceResult);
    }
    const organizationResult = await this.organizationByName(
      cU,
      organizationName
    );
    if (!organizationResult.success) return organizationResult;
    result = await this.deleteRole(
      cU,
      userIdsToBeRemoved,
      "organization",
      organizationResult.payload.id
    );
    return result;
  }

  public async saveSchemaUserSettings(
    cU: CurrentUser,
    schemaName: string,
    settings: object
  ): Promise<ServiceResult> {
    const schemaResult = await this.schemaByName(cU, schemaName);
    if (!schemaResult.success) return schemaResult;
    return this.dal.saveSchemaUserSettings(
      schemaResult.payload.id,
      cU.id,
      settings
    );
  }

  /**
   * ========== Schemas ==========
   */

  public async schemas(
    cU: CurrentUser,
    schemaIds?: number[],
    schemaNames?: string[],
    schemaNamePattern?: string
  ): Promise<ServiceResult> {
    const result = await this.dal.schemas(
      schemaIds,
      schemaNames,
      schemaNamePattern
    );
    return result;
  }

  public async schemasByIds(
    cU: CurrentUser,
    ids: number[]
  ): Promise<ServiceResult> {
    return this.schemas(cU, ids);
  }

  public async schemaById(cU: CurrentUser, id: number): Promise<ServiceResult> {
    const result = await this.schemasByIds(cU, [id]);
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_SCHEMA_NOT_FOUND",
          values: [id.toString()],
        });
      }
    }
    return result;
  }

  public async schemasByNames(
    cU: CurrentUser,
    names: string[]
  ): Promise<ServiceResult> {
    return this.schemas(cU, undefined, names);
  }

  public async schemaByName(
    cU: CurrentUser,
    name: string
  ): Promise<ServiceResult> {
    const result = await this.schemasByNames(cU, [name]);
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

  public async schemaByNamePattern(
    cU: CurrentUser,
    namePattern: string
  ): Promise<ServiceResult> {
    const result = await this.schemas(cU, undefined, undefined, namePattern);
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_ORGANIZATION_NOT_FOUND",
          values: [namePattern],
        });
      }
    }
    return result;
  }

  public async schemasByUserOwner(
    cU: CurrentUser,
    userId?: number,
    userEmail?: string
  ): Promise<ServiceResult> {
    return this.dal.schemasByUserOwner(userId, userEmail);
  }

  public async schemasByOrganizationOwner(
    cU: CurrentUser,
    organizationId?: number,
    organizationName?: string
  ): Promise<ServiceResult> {
    return this.dal.schemasByOrganizationOwner(
      organizationId,
      organizationName
    );
  }

  public async schemasByOrganizationOwnerAdmin(
    cU: CurrentUser,
    userId?: number,
    userEmail?: string
  ): Promise<ServiceResult> {
    return this.dal.schemasByOrganizationOwnerAdmin(userId, userEmail);
  }

  public async accessibleSchemaByName(
    cU: CurrentUser,
    schemaName: string,
    withSettings?: boolean
  ): Promise<ServiceResult> {
    const result = await this.dal.schemasByUsers(
      [cU.id],
      undefined,
      [schemaName],
      withSettings
    );
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_SCHEMA_NOT_FOUND",
          values: [schemaName],
        });
      }
    }
    return result;
  }

  public async accessibleSchemas(
    cU: CurrentUser,
    withSettings?: boolean
  ): Promise<ServiceResult> {
    return await this.dal.schemasByUsers(
      [cU.id],
      undefined,
      undefined,
      withSettings
    );
  }

  // If organizationOwner organization admins are implicitly granted schema admin roles
  public async createSchema(
    cU: CurrentUser,
    name: string,
    label: string,
    organizationOwnerId?: number,
    organizationOwnerName?: string
  ): Promise<ServiceResult> {
    log.debug(
      `createSchema(${cU.id},${name},${label},${organizationOwnerId},${organizationOwnerName})`
    );
    let result: ServiceResult = errResult();
    let userOwnerId: number | undefined = undefined;
    // run checks for organization owner
    if (organizationOwnerId || organizationOwnerName) {
      if (!organizationOwnerId && organizationOwnerName) {
        result = await this.organizationByName(cU, organizationOwnerName);
        if (!result.success) return result;
        organizationOwnerId = result.payload.id;
      }
      if (
        cU.isNotSysAdmin() &&
        organizationOwnerId &&
        (await cU.cant("access_organization", organizationOwnerId))
      ) {
        return errResult({
          wbCode: "WB_USER_NOT_IN_ORG",
          values: [cU.toString(), organizationOwnerId.toString()],
        }) as ServiceResult;
      }
    } else {
      userOwnerId = cU.id;
    }
    // Check name
    if (name.startsWith("pg_") || Schema.SYS_SCHEMA_NAMES.includes(name)) {
      return errResult({ wbCode: "WB_BAD_SCHEMA_NAME" } as ServiceResult);
    }
    const schemaResult = await this.dal.createSchema(
      name,
      label,
      organizationOwnerId,
      userOwnerId
    );
    if (!schemaResult.success) return schemaResult;
    if (organizationOwnerId) {
      // If owner is an organization and current user is not an admin of the organization,
      // add the user as a schema admin so they dont lose access
      if (
        cU.isNotSysAdmin() &&
        (await cU.can("administer_organization", organizationOwnerId))
      ) {
        result = await this.setRole(
          cU,
          [cU.id],
          "schema_administrator",
          "schema" as RoleLevel,
          schemaResult.payload
        );
        if (!result.success) return result;
      }
      // Every organization admin is implicitly also a schema admin
      result = await this.dal.setSchemaUserRolesFromOrganizationRoles(
        organizationOwnerId,
        Role.sysRoleMap("organization" as RoleLevel, "schema" as RoleLevel),
        [schemaResult.payload.id]
      );
    } else {
      // If owner is a user, add them to schema_users to save settings
      result = await this.setRole(
        cU,
        [cU.id],
        "schema_owner",
        "schema" as RoleLevel,
        schemaResult.payload
      );
    }
    if (!result.success) return result;
    return schemaResult;
  }

  public async removeOrDeleteSchema(
    cU: CurrentUser,
    schemaName: string,
    del: boolean
  ): Promise<ServiceResult> {
    log.debug(`removeOrDeleteSchema(${schemaName},${del})`);
    let result = await this.addOrRemoveAllExistingRelationships(
      cU,
      schemaName,
      true
    );
    if (!result.success) return result;
    result = await this.dal.tables(schemaName);
    if (!result.success) return result;
    for (const table of result.payload) {
      result = await this.removeOrDeleteTable(cU, schemaName, table.name, del);
      if (!result.success) return result;
    }
    result = await this.dal.removeAllUsersFromSchema(schemaName);
    if (!result.success) return result;
    return await this.dal.removeOrDeleteSchema(schemaName, del);
  }

  /**
   * ========== Schema Users ==========
   */

  public async schemaUsers(
    cU: CurrentUser,
    schemaName: string,
    userEmails?: string[],
    withSettings?: boolean
  ): Promise<ServiceResult> {
    let userIds = undefined;
    if (userEmails) {
      const usersResult = await this.usersByEmails(cU, userEmails);
      if (!usersResult.success || !usersResult.payload) return usersResult;
      userIds = usersResult.payload.map((user: { id: number }) => user.id);
    }
    return this.dal.schemaUsers(schemaName, userIds, withSettings);
  }

  public async setSchemaUsersRole(
    cU: CurrentUser,
    schemaName: string,
    userEmails: string[],
    roleName: string
  ): Promise<ServiceResult> {
    const schemaResult = await this.schemaByName(cU, schemaName);
    if (!schemaResult.success) return schemaResult;
    const usersResult = await this.usersByEmails(cU, userEmails);
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
      cU,
      userIds,
      roleName,
      "schema",
      schemaResult.payload
    );
  }

  public async removeSchemaUsers(
    cU: CurrentUser,
    schemaName: string,
    userEmails: string[]
  ): Promise<ServiceResult> {
    const usersResult = await this.usersByEmails(cU, userEmails);
    if (!usersResult.success) return usersResult;
    const userIds = usersResult.payload.map((user: { id: number }) => user.id);
    const schemaResult = await this.schemaByName(cU, schemaName);
    if (!schemaResult.success) return schemaResult;
    if (
      schemaResult.payload.user_owner_id &&
      userIds.includes(schemaResult.payload.user_owner_id)
    ) {
      return errResult({
        wbCode: "WB_CANT_REMOVE_SCHEMA_USER_OWNER",
      } as ServiceResult);
    }
    const result = await this.deleteRole(
      cU,
      userIds,
      "schema",
      schemaResult.payload.id
    );
    return result;
  }

  public async saveOrganizationUserSettings(
    cU: CurrentUser,
    organizationName: string,
    settings: object
  ): Promise<ServiceResult> {
    const organizationResult = await this.organizationByName(
      cU,
      organizationName
    );
    if (!organizationResult.success) return organizationResult;
    return this.dal.saveOrganizationUserSettings(
      organizationResult.payload.id,
      cU.id,
      settings
    );
  }

  /**
   * ========== Tables ==========
   */

  public async tables(
    cU: CurrentUser,
    schemaName: string,
    withColumns?: boolean
  ): Promise<ServiceResult> {
    const result = await this.dal.tables(schemaName);
    if (withColumns) {
      if (!result.success) return result;
      for (const table of result.payload) {
        const columnsResult = await this.columns(cU, schemaName, table.name);
        if (!columnsResult.success) return columnsResult;
        table.columns = columnsResult.payload;
      }
    }
    return result;
  }

  public async tableBySchemaNameTableName(
    cU: CurrentUser,
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    return await this.dal.tableBySchemaNameTableName(schemaName, tableName);
  }

  public async accessibleTableByName(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    withColumns?: boolean,
    withSettings?: boolean
  ): Promise<ServiceResult> {
    const result = await this.dal.tablesByUsers(
      schemaName,
      [cU.id],
      undefined,
      [tableName],
      withSettings
    );
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_TABLE_NOT_FOUND",
          values: [tableName],
        });
      }
      if (withColumns) {
        const columnsResult = await this.columns(
          cU,
          schemaName,
          result.payload.name
        );
        if (!columnsResult.success) return columnsResult;
        result.payload.columns = columnsResult.payload;
      }
    }
    return result;
  }

  public async accessibleTables(
    cU: CurrentUser,
    schemaName: string,
    withColumns?: boolean,
    withSettings?: boolean
  ): Promise<ServiceResult> {
    const result = await this.dal.tablesByUsers(
      schemaName,
      [cU.id],
      undefined,
      undefined,
      withSettings
    );
    if (withColumns) {
      if (!result.success) return result;
      for (const table of result.payload) {
        const columnsResult = await this.columns(cU, schemaName, table.name);
        if (!columnsResult.success) return columnsResult;
        table.columns = columnsResult.payload;
      }
    }
    return result;
  }

  public async addOrCreateTable(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    tableLabel: string,
    create?: boolean
  ): Promise<ServiceResult> {
    log.debug(
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
    let result = await this.addDefaultTableUsersToTable(
      cU,
      tableResult.payload
    );
    if (!result.success) return result;
    result = await this.deleteAndSetTablePermissions(cU, tableResult.payload);
    if (!result.success) return result;
    tableResult.payload.schemaName = schemaName;
    return await this.trackTableWithPermissions(cU, tableResult.payload);
  }

  public async removeOrDeleteTable(
    cU: CurrentUser,
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
        cU,
        schemaName,
        tableName,
        column.name,
        del,
        true
      );
      if (!result.success) return result;
    }
    const tableResult = await this.tableBySchemaNameTableName(
      cU,
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    result = await this.untrackTableWithPermissions(cU, tableResult.payload);
    if (!result.success) return result;
    // 3. remove user settings
    result = await this.dal.removeAllTableUsers(tableResult.payload.id);
    if (!result.success) return result;
    result = await this.deleteAndSetTablePermissions(
      cU,
      tableResult.payload,
      true
    );
    if (!result.success) return result;
    // 4. remove/delete the table
    return await this.dal.removeOrDeleteTable(schemaName, tableName, del);
  }

  public async updateTable(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    newTableName?: string,
    newTableLabel?: string
  ): Promise<ServiceResult> {
    let result: ServiceResult;
    const tableResult = await this.tableBySchemaNameTableName(
      cU,
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    if (newTableName) {
      result = await this.tables(cU, schemaName, false);
      if (!result.success) return result;
      const existingTableNames = result.payload.map(
        (table: { name: string }) => table.name
      );
      if (existingTableNames.includes(newTableName)) {
        return errResult({ wbCode: "WB_TABLE_NAME_EXISTS" } as ServiceResult);
      }
      result = await this.untrackTableWithPermissions(cU, tableResult.payload);
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
      result = await this.trackTableWithPermissions(cU, tableResult.payload);
      if (!result.success) return result;
    }
    return result;
  }

  public async addAllExistingTables(
    cU: CurrentUser,
    schemaName: string
  ): Promise<ServiceResult> {
    let result = await this.dal.discoverTables(schemaName);
    if (!result.success) return result;
    const tableNames = result.payload;
    for (const tableName of tableNames) {
      const tableResult = await this.addOrCreateTable(
        cU,
        schemaName,
        tableName,
        v.titleCase(tableName.replaceAll("_", " ")),
        false
      );
      if (!tableResult.success) return tableResult;
      result = await this.untrackTableWithPermissions(cU, tableResult.payload);
      if (!result.success) return result;
      result = await this.dal.discoverColumns(schemaName, tableName);
      if (!result.success) return result;
      const columns = result.payload;
      for (const column of columns) {
        result = await this.addOrCreateColumn(
          cU,
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
      result = await this.trackTableWithPermissions(cU, tableResult.payload);
      if (!result.success) return result;
    }
    return result;
  }

  public async addOrRemoveAllExistingRelationships(
    cU: CurrentUser,
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
              cU,
              schemaName,
              relationship.tableName,
              [relationship.columnName],
              relationship.relTableName
            );
          } else {
            result = await this.addOrCreateForeignKey(
              cU,
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
    cU: CurrentUser,
    table: Table
  ): Promise<ServiceResult> {
    log.debug(`addDefaultTablePermissions(${JSON.stringify(table)})`);
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    let result = await this.columns(cU, table.schemaName, table.name);
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
    cU: CurrentUser,
    table: Table
  ): Promise<ServiceResult> {
    log.debug(`addDefaultTablePermissions(${JSON.stringify(table)})`);
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    // If this table no longer has any columns, there will be no permissions
    let result = await this.columns(cU, table.schemaName, table.name);
    if (!result.success) return result;
    if (result.payload.length == 0) {
      return { success: true, payload: true } as ServiceResult;
    }
    for (const permissionKeyAndType of Role.tablePermissionKeysAndActions(
      table.id
    )) {
      result = await hasuraApi.deletePermission(
        table.schemaName,
        table.name,
        permissionKeyAndType.action,
        "wbuser"
      );
      if (!result.success) return result;
    }
    return result;
  }

  // Pass empty columnNames[] to clear
  public async createOrDeletePrimaryKey(
    cU: CurrentUser,
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
    cU: CurrentUser,
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
      cU,
      schemaName,
      tableName,
      columnNames,
      parentTableName,
      parentColumnNames,
      operation
    );
  }

  public async removeOrDeleteForeignKey(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    columnNames: string[],
    parentTableName: string,
    del?: boolean
  ): Promise<ServiceResult> {
    let operation: string = "DELETE";
    if (!del) operation = "REMOVE";
    return await this.setForeignKey(
      cU,
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
    cU: CurrentUser,
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

  public async trackTableWithPermissions(
    cU: CurrentUser,
    table: Table
  ): Promise<ServiceResult> {
    log.debug(`trackTableWithPermissions(${JSON.stringify(table)})`);
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    let result = await hasuraApi.trackTable(table.schemaName, table.name);
    if (!result.success) return result;
    return await this.addDefaultTablePermissions(cU, table);
  }

  public async untrackTableWithPermissions(
    cU: CurrentUser,
    table: Table
  ): Promise<ServiceResult> {
    log.debug(`untrackTableWithPermissions(${JSON.stringify(table)})`);
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    let result = await this.removeDefaultTablePermissions(cU, table);
    if (!result.success) return result;
    result = await hasuraApi.untrackTable(table.schemaName, table.name);
    return result;
  }

  /**
   * ========== Table Users===========
   */

  public async tableUsers(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    userEmails?: string[],
    withSettings?: boolean
  ): Promise<ServiceResult> {
    let userIds = undefined;
    if (userEmails) {
      const usersResult = await this.usersByEmails(cU, userEmails);
      if (!usersResult.success || !usersResult.payload) return usersResult;
      userIds = usersResult.payload.map((user: { id: number }) => user.id);
    }
    return this.dal.tableUsers(schemaName, tableName, userIds, withSettings);
  }

  public async addDefaultTableUsersToTable(
    cU: CurrentUser,
    table: Table
  ): Promise<ServiceResult> {
    log.debug(`addDefaultTableUsersToTable(${JSON.stringify(table)})`);
    return await this.dal.setTableUserRolesFromSchemaRoles(
      table.schemaId,
      Role.sysRoleMap("schema" as RoleLevel, "table" as RoleLevel),
      [table.id]
    );
  }

  public async setTableUsersRole(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    userEmails: [string],
    roleName: string
  ): Promise<ServiceResult> {
    const tableResult = await this.tableBySchemaNameTableName(
      cU,
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    const usersResult = await this.usersByEmails(cU, userEmails);
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
      cU,
      userIds,
      roleName,
      "table",
      tableResult.payload
    );
  }

  // not used yet
  public async removeUsersFromTable(
    cU: CurrentUser,
    userEmails: string[],
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    const usersResult = await this.usersByEmails(cU, userEmails);
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
      cU,
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    const result = await this.deleteRole(
      cU,
      usersResult.payload,
      "table",
      tableResult.payload.id
    );
    return result;
  }

  public async saveTableUserSettings(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    settings: object
  ): Promise<ServiceResult> {
    const tableResult = await this.tableBySchemaNameTableName(
      cU,
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    return this.dal.saveTableUserSettings(
      tableResult.payload.id,
      cU.id,
      settings
    );
  }

  /**
   * ========== Columns ==========
   */

  public async columns(
    cU: CurrentUser,
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
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    columnName: string,
    columnLabel: string,
    create?: boolean,
    columnType?: string,
    skipTracking?: boolean
  ): Promise<ServiceResult> {
    log.debug(
      `addOrCreateColumn(${schemaName},${tableName},${columnName},${columnLabel},${create},${columnType},${skipTracking})`
    );
    if (!create) create = false;
    let result: ServiceResult = errResult();
    const tableResult = await this.tableBySchemaNameTableName(
      cU,
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    if (!skipTracking) {
      result = await this.untrackTableWithPermissions(cU, tableResult.payload);
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
      result = await this.trackTableWithPermissions(cU, tableResult.payload);
    }
    return result;
  }

  // Must enter and exit with tracked table, regardless of if there are columns
  public async removeOrDeleteColumn(
    cU: CurrentUser,
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
      cU,
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    if (!skipTracking) {
      result = await this.untrackTableWithPermissions(cU, tableResult.payload);
      if (!result.success) return result;
    }
    result = await this.dal.removeOrDeleteColumn(
      schemaName,
      tableName,
      columnName,
      del
    );
    if (result.success && !skipTracking) {
      result = await this.trackTableWithPermissions(cU, tableResult.payload);
    }
    return result;
  }

  public async updateColumn(
    cU: CurrentUser,
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
      cU,
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    if (newColumnName) {
      result = await this.columns(cU, schemaName, tableName);
      if (!result.success) return result;
      const existingColumnNames = result.payload.map(
        (table: { name: string }) => table.name
      );
      if (existingColumnNames.includes(newColumnName)) {
        return errResult({ wbCode: "WB_COLUMN_NAME_EXISTS" } as ServiceResult);
      }
    }
    if (newColumnName || newType) {
      result = await this.untrackTableWithPermissions(cU, tableResult.payload);
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
      result = await this.trackTableWithPermissions(cU, tableResult.payload);
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
    result.message = userMessages[result.wbCode][0];
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
    Object.keys(userMessages).includes(result.wbCode) &&
    userMessages[result.wbCode].length == 2
  ) {
    result.apolloErrorCode = userMessages[result.wbCode][1];
  } else if (
    !result.apolloErrorCode &&
    result.wbCode &&
    !Object.keys(userMessages).includes(result.wbCode)
  ) {
    result = {
      success: false,
      message: `WhitebrickCloud err: Could not find apolloErrorCode for wbCode=${result.wbCode}`,
    };
  } else if (!result.apolloErrorCode) {
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
