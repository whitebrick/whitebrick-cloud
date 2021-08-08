import { ApolloServer, ApolloError } from "apollo-server-lambda";
import { Logger } from "tslog";
import { DAL } from "./dal";
import { hasuraApi } from "./hasura-api";
import { ConstraintId, schema, ServiceResult } from "./types";
import v = require("voca");
import { environment, USER_MESSAGES } from "./environment";

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
    // if x-hasura-admin-secret hasura sets role to admin
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
        CurrentUser.getSysAdmin(),
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
      userMessages: USER_MESSAGES,
    };
  }

  /**
   * ========== Auth ==========
   */

  public async auth(
    cU: CurrentUser,
    userAuthId: string
  ): Promise<ServiceResult> {
    log.debug(`auth(${userAuthId})`);
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
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

  public async signUp(
    cU: CurrentUser,
    userAuthId: string,
    userObj: Record<string, any>
  ): Promise<ServiceResult> {
    log.debug(`signUp(${userAuthId},${JSON.stringify(userObj)})`);
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    let email: string | undefined = undefined;
    let firstName: string | undefined = undefined;
    let lastName: string | undefined = undefined;
    // https://auth0.com/docs/rules/user-object-in-rules
    if (userObj.email && userObj.email.length > 0) email = userObj.email;
    if (userObj.given_name && userObj.given_name.length > 0) {
      firstName = userObj.given_name;
    }
    if (userObj.family_name && userObj.family_name.length > 0) {
      lastName = userObj.family_name;
    }
    if (!firstName && !lastName) {
      if (userObj.name && userObj.name.length > 0) {
        const split: string[] = userObj.name.split(" ");
        firstName = split.shift();
        lastName = split.join(" ");
      } else if (userObj.nickname && userObj.nickname.length > 0) {
        firstName = userObj.nickname;
      }
    }
    let result = await this.createUser(
      CurrentUser.getSysAdmin(),
      userAuthId,
      email,
      firstName,
      lastName
    );
    if (!result.success) return result;
    if (environment.demoDBPrefix) {
      result = await this.assignDemoSchema(result.payload.id);
    }
    return result;
  }

  /**
   * ========== Roles & Permissions ==========
   */

  public async roleByName(
    cU: CurrentUser,
    name: string
  ): Promise<ServiceResult> {
    log.debug(`roleByName(${cU.id},${name})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.dal.roleByName(name);
  }

  public async roleAndIdForUserObject(
    cU: CurrentUser,
    userId: number,
    roleLevel: RoleLevel,
    objectIdOrName: number | string,
    parentObjectName?: string
  ): Promise<ServiceResult> {
    log.debug(
      `roleAndIdForUserObject(${cU.id},${userId},${roleLevel},${objectIdOrName},${parentObjectName})`
    );
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    return this.dal.roleAndIdForUserObject(
      userId,
      roleLevel,
      objectIdOrName,
      parentObjectName
    );
  }

  public async deleteAndSetTablePermissions(
    cU: CurrentUser,
    table: Table,
    deleteOnly?: boolean
  ): Promise<ServiceResult> {
    log.debug(`deleteAndSetTablePermissions(${cU.id},${table},${deleteOnly})`);
    if (await cU.cant("manage_access_to_table", table.id)) return cU.denied();
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
      `setRole(${cU.id},${userIds},${roleName},${roleLevel},${JSON.stringify(
        object
      )})`
    );
    // RBAC in switch below
    if (!Role.isRole(roleName, roleLevel)) {
      return errResult({
        message: `${roleName} is not a valid name for an ${roleLevel} Role.`,
      });
    }
    let result = errResult();
    switch (roleLevel) {
      case "organization" as RoleLevel:
        if (await cU.cant("manage_access_to_organization", object.id)) {
          return cU.denied();
        }
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
      case "schema" as RoleLevel:
        if (await cU.cant("manage_access_to_schema", object.id)) {
          return cU.denied();
        }
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
      case "table" as RoleLevel:
        if (await cU.cant("manage_access_to_table", object.id)) {
          return cU.denied();
        }
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
    log.debug(`deleteRole(${cU.id},${userIds},${roleLevel},${objectId})`);
    // permission checks in switch below
    let result: ServiceResult = errResult();
    switch (roleLevel) {
      case "organization" as RoleLevel:
        if (await cU.cant("manage_access_to_organization", objectId)) {
          return cU.denied();
        }
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
        result = await this.dal.deleteRole(userIds, roleLevel, objectId);
        break;
      case "schema" as RoleLevel:
        if (await cU.cant("manage_access_to_schema", objectId)) {
          return cU.denied();
        }
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
        result = await this.dal.deleteRole(userIds, roleLevel, objectId);
        break;
      case "table" as RoleLevel:
        if (await cU.cant("manage_access_to_table", objectId)) {
          return cU.denied();
        }
        result = await this.dal.deleteRole(userIds, roleLevel, objectId);
        break;
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

  public async usersByIds(
    cU: CurrentUser,
    ids: number[]
  ): Promise<ServiceResult> {
    log.debug(`usersByIds(${cU.id},${ids})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    // TBD: mask sensitive information
    return this.dal.users(ids);
  }

  public async userById(cU: CurrentUser, id: number): Promise<ServiceResult> {
    log.debug(`userById(${cU.id},${id})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(`usersBySearchPattern(${cU.id},${searchPattern})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.dal.users(undefined, undefined, searchPattern);
  }

  public async usersByEmails(
    cU: CurrentUser,
    userEmails: string[]
  ): Promise<ServiceResult> {
    log.debug(`usersByEmails(${cU.id},${userEmails})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.dal.users(undefined, userEmails);
  }

  public async userByEmail(
    cU: CurrentUser,
    email: string
  ): Promise<ServiceResult> {
    log.debug(`userByEmail(${cU.id},${email})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    authId?: string,
    email?: string,
    firstName?: string,
    lastName?: string
  ): Promise<ServiceResult> {
    log.debug(
      `createUser(${cU.id},${authId},${email},${firstName},${lastName})`
    );
    // a test user can only create anohter test user
    if (
      email &&
      email.toLowerCase().endsWith(environment.testUserEmailDomain) &&
      cU.isntTestUser() &&
      cU.isntSysAdmin()
    ) {
      return cU.mustBeSysAdminOrTestUser();
    } else if (cU.isntSysAdmin()) {
      return cU.mustBeSysAdmin();
    }
    let existingUserResult: ServiceResult = errResult();
    let errValue: string = "";
    if (authId) {
      existingUserResult = await this.dal.userIdFromAuthId(authId);
      errValue = authId;
    } else if (email) {
      existingUserResult = await this.userByEmail(
        CurrentUser.getSysAdmin(),
        email
      );
      errValue = email;
    }
    // We don't want to find any existing users
    if (existingUserResult.success) {
      return errResult({
        wbCode: "WB_USER_EXISTS",
        values: [errValue],
      });
    }
    return this.dal.createUser(authId, email, firstName, lastName);
  }

  public async updateUser(
    cU: CurrentUser,
    id: number,
    email: string,
    firstName: string,
    lastName: string
  ): Promise<ServiceResult> {
    log.debug(`updateUser(${cU.id},${id},${email},${firstName},${lastName})`);
    if (cU.isntSysAdmin() && cU.idIsnt(id)) {
      return cU.mustBeSysAdminOrSelf();
    }
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
    log.debug(
      `organizations(${cU.id},${organizationIds},${organizationNames},${organizationNamePattern})`
    );
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(`organizationsByIds(${cU.id},${ids})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.organizations(cU, ids);
  }

  public async organizationById(
    cU: CurrentUser,
    id: number
  ): Promise<ServiceResult> {
    log.debug(`organizationByIds(${cU.id},${id})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(`organizationsByNames(${cU.id},${names})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.organizations(cU, undefined, names);
  }

  public async organizationByName(
    cU: CurrentUser,
    name: string
  ): Promise<ServiceResult> {
    log.debug(`organizationByName(${cU.id},${name})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(`organizationByNamePattern(${cU.id},${namePattern})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(
      `accessibleOrganizationByName(${cU.id},${organizationName},${withSettings})`
    );
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    let result = await this.dal.organizationsByUsers(
      [cU.id],
      undefined,
      [organizationName],
      withSettings
    );
    if (!result.success) return result;
    result.payload = result.payload[0];
    if (!result.payload) {
      // does this organization exist at all (regardless of access)
      result = await this.organizationByName(
        CurrentUser.getSysAdmin(),
        organizationName
      );
      // return organization not found
      if (!result.success) return result;
      // otherwise return forbidden
      return errResult({
        wbCode: "WB_FORBIDDEN",
        values: [organizationName],
      });
    }

    return result;
  }

  public async accessibleOrganizations(
    cU: CurrentUser,
    withSettings?: boolean
  ): Promise<ServiceResult> {
    log.debug(`accessibleOrganizations(${cU.id},${withSettings})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(`createOrganization(${cU.id},${name},${label})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
      CurrentUser.getSysAdmin(),
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
    log.debug(`updateOrganization(${cU.id},${name},${newName},${newLabel})`);
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

  public async deleteTestOrganizations(
    cU: CurrentUser
  ): Promise<ServiceResult> {
    log.debug(`deleteTestOrganizations(${cU.id})`);
    if (cU.isntSysAdmin() && cU.isntTestUser()) {
      return cU.mustBeSysAdminOrTestUser();
    }
    return this.dal.deleteTestOrganizations();
  }

  /**
   * ========== Organization Users ==========
   */

  public async organizationUsers(
    cU: CurrentUser,
    name?: string,
    id?: number,
    roleNames?: string[],
    userEmails?: string[],
    withSettings?: boolean
  ): Promise<ServiceResult> {
    log.debug(
      `organizationUsers(${cU.id},${name},${id},${roleNames},${userEmails},${withSettings})`
    );
    let organizationRef: string | number = "";
    let result: ServiceResult = errResult();
    if (name) {
      result = await this.organizationByName(cU, name);
      organizationRef = name;
    } else if (id) {
      result = await this.organizationById(cU, id);
      organizationRef = id;
    }
    if (!result.success) return result;
    if (await cU.cant("access_organization", organizationRef)) {
      return cU.denied();
    }
    if (!result.payload) {
      return errResult({
        wbCode: "WB_ORGANIZATION_NOT_FOUND",
      } as ServiceResult);
    }
    if (roleNames && !Role.areRoles(roleNames)) {
      return errResult({
        message:
          "organizationUsers: roles contains one or more unrecognized strings",
        values: roleNames,
      } as ServiceResult);
    }
    let userIds = undefined;
    if (userEmails) {
      const usersResult = await this.usersByEmails(cU, userEmails);
      if (!usersResult.success || !usersResult.payload) return usersResult;
      userIds = usersResult.payload.map((user: { id: number }) => user.id);
    }
    return this.dal.organizationUsers(
      name,
      id,
      roleNames,
      userIds,
      withSettings
    );
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
    log.debug(`saveSchemaUserSettings(${cU.id},${schemaName},${settings})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(
      `schemas(${cU.id},${schemaIds},${schemaNames},${schemaNamePattern})`
    );
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(`schemas(${cU.id},${ids})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.schemas(cU, ids);
  }

  public async schemaById(cU: CurrentUser, id: number): Promise<ServiceResult> {
    log.debug(`schemaById(${cU.id},${id})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(`schemasByNames(${cU.id},${names})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.schemas(cU, undefined, names);
  }

  public async schemaByName(
    cU: CurrentUser,
    name: string
  ): Promise<ServiceResult> {
    log.debug(`schemaByName(${cU.id},${name})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    const result = await this.schemasByNames(cU, [name]);
    if (result.success) {
      result.payload = result.payload[0];
      if (!result.payload) {
        return errResult({
          wbCode: "WB_SCHEMA_NOT_FOUND",
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
    log.debug(`schemaByNamePattern(${cU.id},${namePattern})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(`schemasByUserOwner(${cU.id},${userId},${userEmail})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.dal.schemasByUserOwner(userId, userEmail);
  }

  public async schemasByOrganizationOwner(
    cU: CurrentUser,
    organizationId?: number,
    organizationName?: string
  ): Promise<ServiceResult> {
    log.debug(
      `schemasByOrganizationOwner(${cU.id},${organizationId},${organizationName})`
    );
    let result: ServiceResult = errResult();
    let organizationRef: number | string = "";
    // does this organization exist at all (regardless of access)
    if (organizationId) {
      result = await this.organizationById(
        CurrentUser.getSysAdmin(),
        organizationId
      );
      organizationRef = organizationId;
    } else if (organizationName) {
      organizationRef = organizationName;
      result = await this.organizationByName(
        CurrentUser.getSysAdmin(),
        organizationName
      );
    }
    // return organization not found
    if (!result.success) return result;
    if (await cU.cant("access_organization", organizationRef)) {
      return cU.denied();
    }
    return this.dal.schemasByOrganizationOwner(
      cU.id,
      organizationId,
      organizationName
    );
  }

  public async schemasByOrganizationOwnerAdmin(
    cU: CurrentUser,
    userId?: number,
    userEmail?: string
  ): Promise<ServiceResult> {
    log.debug(
      `schemasByOrganizationOwnerAdmin(${cU.id},${userId},${userEmail})`
    );
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.dal.schemasByOrganizationOwnerAdmin(userId, userEmail);
  }

  public async accessibleSchemaByName(
    cU: CurrentUser,
    schemaName: string,
    organizationName?: string,
    withSettings?: boolean
  ): Promise<ServiceResult> {
    log.debug(
      `accessibleSchemaByName(${cU.id},${schemaName},${organizationName},${withSettings})`
    );
    const organizationResult: ServiceResult = errResult();
    // if it's from an organization URL, check it exists
    if (organizationName) {
      const organizationResult = await this.organizationByName(
        CurrentUser.getSysAdmin(),
        organizationName
      );
      // returns organization not found
      if (!organizationResult.success) return organizationResult;
    }
    // now check schema exists
    const schemaResult = await this.schemaByName(
      CurrentUser.getSysAdmin(),
      schemaName
    );
    // returns schema not found
    if (!schemaResult.success) return schemaResult;
    // now if it's from an organization URL, check for correct owner
    if (organizationName && organizationResult.success) {
      if (
        schemaResult.payload.organization_owner_id !=
        organizationResult.payload.id
      ) {
        return errResult({
          wbCode: "WB_SCHEMA_NOT_FOUND",
          values: [
            `${schemaName} not found for organization owner ${organizationName}.`,
          ],
        });
      }
    }
    if (await cU.cant("read_schema", schemaName)) return cU.denied();
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
          wbCode: "WB_FORBIDDEN",
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
    log.debug(`accessibleSchemas(${cU.id},${withSettings})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return await this.dal.schemasByUsers(
      [cU.id],
      undefined,
      undefined,
      withSettings
    );
  }

  // If organizationOwner organization admins are implicitly granted schema admin roles
  public async addOrCreateSchema(
    cU: CurrentUser,
    name: string,
    label: string,
    organizationOwnerId?: number,
    organizationOwnerName?: string,
    userOwnerId?: number,
    userOwnerEmail?: string,
    create?: boolean
  ): Promise<ServiceResult> {
    log.debug(
      `addOrCreateSchema(${cU.id},${name},${label},${organizationOwnerId},${organizationOwnerName},${userOwnerId},${userOwnerEmail},${create})`
    );
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    let result: ServiceResult = errResult();
    // run checks for organization owner
    if (organizationOwnerId || organizationOwnerName) {
      if (!organizationOwnerId && organizationOwnerName) {
        result = await this.organizationByName(cU, organizationOwnerName);
        if (!result.success) return result;
        organizationOwnerId = result.payload.id;
      }
      if (
        organizationOwnerId &&
        (await cU.cant("access_organization", organizationOwnerId))
      ) {
        return errResult({
          wbCode: "WB_USER_NOT_IN_ORG",
          values: [cU.toString(), organizationOwnerId.toString()],
        }) as ServiceResult;
      }
    } else if (userOwnerEmail) {
      result = await this.userByEmail(cU, userOwnerEmail);
      if (!result.success) return result;
      userOwnerId = result.payload.id;
    } else if (!userOwnerId) {
      userOwnerId = cU.id;
    }
    if (name.startsWith("pg_") || Schema.SYS_SCHEMA_NAMES.includes(name)) {
      return errResult({ wbCode: "WB_BAD_SCHEMA_NAME" } as ServiceResult);
    }
    result = await this.schemaByName(cU, name);
    if (result.success) {
      return errResult({
        wbCode: "WB_SCHEMA_NAME_EXISTS",
      } as ServiceResult);
    }
    const schemaResult = await this.dal.addOrCreateSchema(
      name,
      label,
      organizationOwnerId,
      userOwnerId,
      create
    );
    if (!schemaResult.success) return schemaResult;
    if (organizationOwnerId) {
      // If owner is an organization and current user is not an admin of the organization
      // add the user as a schema admin so they dont lose access
      if (await cU.cant("administer_organization", organizationOwnerId)) {
        result = await this.setRole(
          CurrentUser.getSysAdmin(),
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
        CurrentUser.getSysAdmin(),
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
    log.debug(`removeOrDeleteSchema(${cU.id},${schemaName},${del})`);
    if (await cU.cant("alter_schema", schemaName)) return cU.denied();
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

  public async updateSchema(
    cU: CurrentUser,
    name: string,
    newSchemaName?: string,
    newSchemaLabel?: string,
    newOrganizationOwnerName?: string,
    newOrganizationOwnerId?: number,
    newUserOwnerEmail?: string,
    newUserOwnerId?: number
  ): Promise<ServiceResult> {
    log.debug(
      `updateSchema(${cU.id},${name},${newSchemaName},${newSchemaLabel},${newOrganizationOwnerName},${newOrganizationOwnerId},${newUserOwnerEmail},${newUserOwnerId})`
    );
    if (await cU.cant("alter_schema", name)) return cU.denied();
    let result: ServiceResult;
    const schemaResult = await this.schemaByName(cU, name);
    if (!schemaResult.success) return schemaResult;
    let schemaTables = [];
    if (newSchemaName) {
      if (
        newSchemaName.startsWith("pg_") ||
        Schema.SYS_SCHEMA_NAMES.includes(newSchemaName)
      ) {
        return errResult({ wbCode: "WB_BAD_SCHEMA_NAME" } as ServiceResult);
      }
      result = await this.schemaByName(cU, newSchemaName);
      if (result.success) {
        return errResult({
          wbCode: "WB_SCHEMA_NAME_EXISTS",
        } as ServiceResult);
      }
      result = await this.tables(cU, name, false);
      if (!result.success) return result;
      schemaTables = result.payload;
      for (const table of schemaTables) {
        result = await this.untrackTableWithPermissions(cU, table);
        if (!result.success) return result;
      }
    }
    if (newOrganizationOwnerName) {
      result = await this.organizationByName(cU, newOrganizationOwnerName);
      if (!result.success) return result;
      newOrganizationOwnerId = result.payload.id;
    }
    if (newUserOwnerEmail) {
      result = await this.userByEmail(cU, newUserOwnerEmail);
      if (!result.success) return result;
      newUserOwnerId = result.payload.id;
    }
    // TBD checks so user doesn't lose permissions
    const updatedSchemaResult = await this.dal.updateSchema(
      schemaResult.payload,
      newSchemaName,
      newSchemaLabel,
      newOrganizationOwnerId,
      newUserOwnerId
    );
    if (!updatedSchemaResult.success) return updatedSchemaResult;
    if (newSchemaName) {
      for (const table of schemaTables) {
        result = await this.trackTableWithPermissions(cU, table);
        if (!result.success) return result;
      }
    }
    if (newOrganizationOwnerId || newUserOwnerId) {
      // if the old schema was owned by an org
      if (schemaResult.payload.organization_owner_id) {
        // Clear old implied admins
        const impliedAdminsResult = await this.schemaUsers(
          cU,
          updatedSchemaResult.payload.name,
          ["schema_administrator"],
          undefined,
          "organization_administrator"
        );
        if (!impliedAdminsResult.success) return impliedAdminsResult;
        const oldImpliedAdminUserIds = impliedAdminsResult.payload.map(
          (schemaUser: { user_id: number }) => schemaUser.user_id
        );
        result = await this.deleteRole(
          cU,
          oldImpliedAdminUserIds,
          "schema" as RoleLevel,
          schemaResult.payload.id
        );
        // otherwise old schema was owned by user
      } else {
        result = await this.deleteRole(
          cU,
          [schemaResult.payload.user_owner_id],
          "schema" as RoleLevel,
          schemaResult.payload.id
        );
      }
      if (!result.success) return result;
      if (newOrganizationOwnerId) {
        // Every organization admin is implicitly also a schema admin
        result = await this.dal.setSchemaUserRolesFromOrganizationRoles(
          newOrganizationOwnerId,
          Role.sysRoleMap("organization" as RoleLevel, "schema" as RoleLevel),
          [schemaResult.payload.id]
        );
      } else if (newUserOwnerId) {
        result = await this.setRole(
          CurrentUser.getSysAdmin(),
          [newUserOwnerId],
          "schema_owner",
          "schema" as RoleLevel,
          schemaResult.payload
        );
      }
      if (!result.success) return result;
    }
    return updatedSchemaResult;
  }

  public async assignDemoSchema(userId: number): Promise<ServiceResult> {
    let result = await this.dal.nextUnassignedDemoSchema(
      `${environment.demoDBPrefix}%`
    );
    if (!result.success) return result;
    result = await this.updateSchema(
      CurrentUser.getSysAdmin(),
      result.payload.name,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      userId
    );
    if (!result.success) return result;
    return this.deleteRole(
      CurrentUser.getSysAdmin(),
      [User.SYS_ADMIN_ID],
      "schema" as RoleLevel,
      result.payload.id
    );
  }

  public async addNextDemoSchema(cU: CurrentUser): Promise<ServiceResult> {
    log.debug(`addNextDemoSchema(${cU.id})`);
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    let result = await this.dal.schemas(
      undefined,
      undefined,
      `${environment.demoDBPrefix}%`,
      "name desc",
      1,
      true
    );
    if (!result.success) return result;
    if (result.payload.length !== 1) {
      return errResult({
        message: `addNextDemoSchema: can not find demo DB matching ${environment.demoDBPrefix}%`,
      } as ServiceResult);
    }
    const split = result.payload[0].name.split("_demo");
    const lastDemoNumber = parseInt(split[1]);
    const schemaName = `${environment.demoDBPrefix}${lastDemoNumber + 1}`;
    const schemaResult = await this.addOrCreateSchema(
      cU,
      schemaName,
      environment.demoDBLabel,
      undefined,
      undefined,
      cU.id
    );
    if (!schemaResult.success) return schemaResult;
    result = await this.addAllExistingTables(cU, schemaName);
    if (!result.success) return result;
    return schemaResult;
  }

  /**
   * ========== Schema Users ==========
   */
  public async schemaUsers(
    cU: CurrentUser,
    schemaName: string,
    roleNames?: string[],
    userEmails?: string[],
    impliedFromRoleName?: string,
    withSettings?: boolean
  ): Promise<ServiceResult> {
    log.debug(
      `schemaUsers(${cU.id},${schemaName},${roleNames},${userEmails},${impliedFromRoleName},${withSettings})`
    );
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    if (roleNames && !Role.areRoles(roleNames)) {
      return errResult({
        message: "schemaUsers: roles contains one or more unrecognized strings",
        values: roleNames,
      } as ServiceResult);
    }
    let userIds = undefined;
    if (userEmails) {
      const usersResult = await this.usersByEmails(cU, userEmails);
      if (!usersResult.success || !usersResult.payload) return usersResult;
      userIds = usersResult.payload.map((user: { id: number }) => user.id);
      if (userIds.length == 0) {
        return errResult({
          wbCode: "WB_USERS_NOT_FOUND",
        } as ServiceResult);
      }
    }
    let impliedFromRoleId: number | undefined = undefined;
    if (impliedFromRoleName) {
      const roleResult = await this.roleByName(cU, impliedFromRoleName);
      if (!roleResult.success) return roleResult;
      impliedFromRoleId = roleResult.payload.id;
    }
    return this.dal.schemaUsers(
      schemaName,
      roleNames,
      userIds,
      impliedFromRoleId,
      withSettings
    );
  }

  public async setSchemaUsersRole(
    cU: CurrentUser,
    schemaName: string,
    userEmails: string[],
    roleName: string
  ): Promise<ServiceResult> {
    log.debug(
      `setSchemaUsersRole(${cU.id},${schemaName},${userEmails},${roleName})`
    );
    if (await cU.cant("manage_access_to_schema", schemaName)) {
      return cU.denied();
    }
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
    log.debug(`removeSchemaUsers(${cU.id},${schemaName},${userEmails})`);
    if (await cU.cant("manage_access_to_schema", schemaName)) {
      return cU.denied();
    }
    const usersResult = await this.usersByEmails(cU, userEmails);
    if (!usersResult.success) return usersResult;
    const userIds: number[] = usersResult.payload.map(
      (user: { id: number }) => user.id
    );
    const schemaResult = await this.schemaByName(cU, schemaName);
    if (!schemaResult.success) return schemaResult;
    // can't remove schema user owner
    if (
      schemaResult.payload.user_owner_id &&
      userIds.includes(schemaResult.payload.user_owner_id)
    ) {
      return errResult({
        wbCode: "WB_CANT_REMOVE_SCHEMA_USER_OWNER",
      } as ServiceResult);
    }
    // can't remove all admins (must be atleast one)
    const adminsResult = await this.schemaUsers(cU, schemaName, [
      "schema_administrator",
    ]);
    if (!adminsResult.success) return adminsResult;
    const schemaAdminIds: number[] = adminsResult.payload.map(
      (user: { id: number }) => user.id
    );
    if (
      userIds.filter((userId) => schemaAdminIds.includes(userId)).length ==
      schemaAdminIds.length
    ) {
      return errResult({
        wbCode: "WB_SCHEMA_NO_ADMINS",
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
    log.debug(
      `saveOrganizationUserSettings(${cU.id},${organizationName},${settings})`
    );
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(`tables(${cU.id},${schemaName},${withColumns})`);
    if (await cU.cant("read_schema", schemaName)) {
      return cU.denied();
    }
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
    log.debug(
      `tableBySchemaNameTableName(${cU.id},${schemaName},${tableName})`
    );
    if (await cU.cant("read_table", tableName, schemaName)) {
      return cU.denied();
    }
    return await this.dal.tableBySchemaNameTableName(schemaName, tableName);
  }

  public async accessibleTableByName(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    withColumns?: boolean,
    withSettings?: boolean
  ): Promise<ServiceResult> {
    log.debug(
      `accessibleTableByName(${cU.id},${schemaName},${tableName},${withColumns},${withSettings})`
    );
    if (await cU.cant("read_schema", schemaName)) {
      return cU.denied();
    }
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
    log.debug(
      `accessibleTables(${cU.id},${schemaName},${withColumns},${withSettings})`
    );
    if (await cU.cant("read_schema", schemaName)) return cU.denied();
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
      `addOrCreateTable(${cU.id},${schemaName},${tableName},${tableLabel},${create})`
    );
    if (await cU.cant("alter_schema", schemaName)) {
      return cU.denied();
    }
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
    result = await this.trackTableWithPermissions(cU, tableResult.payload);
    if (!result.success) return result;
    return tableResult;
  }

  public async removeOrDeleteTable(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    del?: boolean
  ): Promise<ServiceResult> {
    log.debug(
      `removeOrDeleteTable(${cU.id},${schemaName},${tableName},${del})`
    );
    if (await cU.cant("alter_table", tableName, schemaName)) {
      return cU.denied();
    }
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
      CurrentUser.getSysAdmin(),
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
    log.debug(
      `updateTable(${cU.id},${schemaName},${tableName},${newTableName},${newTableLabel})`
    );
    if (await cU.cant("alter_table", tableName, schemaName)) {
      return cU.denied();
    }
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
    const updatedTableResult = await this.dal.updateTable(
      schemaName,
      tableName,
      newTableName,
      newTableLabel
    );
    if (!updatedTableResult.success) return updatedTableResult;
    if (newTableName) {
      result = await this.trackTableWithPermissions(
        cU,
        updatedTableResult.payload
      );
      if (!result.success) return result;
    }
    return updatedTableResult;
  }

  public async addAllExistingTables(
    cU: CurrentUser,
    schemaName: string
  ): Promise<ServiceResult> {
    log.debug(`addAllExistingTables(${cU.id},${schemaName})`);
    if (await cU.cant("alter_schema", schemaName)) {
      return cU.denied();
    }
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
    log.debug(
      `addOrRemoveAllExistingRelationships(${cU.id},${schemaName},${remove})`
    );
    if (await cU.cant("alter_schema", schemaName)) {
      return cU.denied();
    }
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
    log.debug(`addDefaultTablePermissions(${cU.id},${JSON.stringify(table)})`);
    if (await cU.cant("alter_table", table.id)) return cU.denied();
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
    log.debug(
      `removeDefaultTablePermissions(${cU.id},${JSON.stringify(table)})`
    );
    if (await cU.cant("alter_table", table.id)) return cU.denied();
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
    log.debug(
      `createOrDeletePrimaryKey(${cU.id},${schemaName},${tableName},${columnNames},${del})`
    );
    if (await cU.cant("alter_table", tableName, schemaName)) {
      return cU.denied();
    }
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
    log.debug(
      `addOrCreateForeignKey(${cU.id},${schemaName},${tableName},${columnNames},${parentTableName},${parentColumnNames},${create})`
    );
    if (await cU.cant("alter_table", tableName, schemaName)) {
      return cU.denied();
    }
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
    log.debug(
      `removeOrDeleteForeignKey(${cU.id},${schemaName},${tableName},${columnNames},${parentTableName},${del})`
    );
    if (await cU.cant("alter_table", tableName, schemaName)) {
      return cU.denied();
    }
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
    log.debug(
      `setForeignKey(${cU.id},${schemaName},${tableName},${columnNames},${parentTableName},${parentColumnNames},${operation})`
    );
    if (await cU.cant("alter_table", tableName, schemaName)) {
      return cU.denied();
    }
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
    log.debug(`trackTableWithPermissions(${cU.id}, ${JSON.stringify(table)})`);
    if (await cU.cant("alter_table", table.id)) {
      return cU.denied();
    }
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
    log.debug(
      `untrackTableWithPermissions(${cU.id}, ${JSON.stringify(table)})`
    );
    if (await cU.cant("alter_table", table.id)) {
      return cU.denied();
    }
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
    log.debug(
      `tableUsers(${cU.id},${schemaName},${tableName},${userEmails},${withSettings})`
    );
    if (await cU.cant("read_table", tableName, schemaName)) return cU.denied();
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
    log.debug(
      `setTableUsersRole(${cU.id},${schemaName},${tableName},${userEmails},${roleName})`
    );
    if (await cU.cant("manage_access_to_table", tableName, schemaName)) {
      return cU.denied();
    }
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

  public async removeTableUsers(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    userEmails: string[]
  ): Promise<ServiceResult> {
    log.debug(
      `removeTableUsers(${cU.id},${schemaName},${tableName},${userEmails})`
    );
    if (await cU.cant("manage_access_to_table", tableName, schemaName)) {
      return cU.denied();
    }
    const usersResult = await this.usersByEmails(cU, userEmails);
    if (!usersResult.success) return usersResult;
    const userIds: number[] = usersResult.payload.map(
      (user: { id: number }) => user.id
    );
    // can't remove schema administrators from individual tables
    // remove them from the whole schema only
    const adminsResult = await this.schemaUsers(cU, schemaName, [
      "schema_administrator",
    ]);
    if (!adminsResult.success) return adminsResult;
    const schemaAdminIds: number[] = adminsResult.payload.map(
      (user: { id: number }) => user.id
    );
    if (
      userIds.filter((userId) => schemaAdminIds.includes(userId)).length > 0
    ) {
      return errResult({
        wbCode: "WB_CANT_REMOVE_SCHEMA_ADMIN",
      } as ServiceResult);
    }
    const tableResult = await this.tableBySchemaNameTableName(
      cU,
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    const result = await this.deleteRole(
      cU,
      userIds,
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
    log.debug(
      `saveTableUserSettings(${cU.id},${schemaName},${tableName},${settings})`
    );
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
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
    log.debug(`columns(${cU.id},${schemaName},${tableName})`);
    if (await cU.cant("read_table", tableName, schemaName)) {
      return cU.denied();
    }
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
      `addOrCreateColumn(${cU.id},${schemaName},${tableName},${columnName},${columnLabel},${create},${columnType},${skipTracking})`
    );
    if (await cU.cant("alter_table", tableName, schemaName)) {
      return cU.denied();
    }
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
    const columnResult = await this.dal.addOrCreateColumn(
      schemaName,
      tableName,
      columnName,
      columnLabel,
      create,
      columnType
    );
    if (columnResult.success && !skipTracking) {
      result = await this.trackTableWithPermissions(cU, tableResult.payload);
      if (!result.success) return result;
    }
    return columnResult;
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
      `removeOrDeleteColumn(${cU.id},${schemaName},${tableName},${columnName},${del},${skipTracking})`
    );
    if (await cU.cant("alter_table", tableName, schemaName)) {
      return cU.denied();
    }
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
    log.debug(
      `updateColumn(${cU.id},${schemaName},${tableName},${columnName},${newColumnName},${newColumnLabel},${newType})`
    );
    if (await cU.cant("alter_table", tableName, schemaName)) {
      return cU.denied();
    }
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

  public async addOrRemoveColumnSequence(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    columnName: string,
    nextSeqNumber?: number,
    remove?: boolean
  ): Promise<ServiceResult> {
    let result = await this.schemaByName(cU, schemaName);
    if (!result.success) return result;
    const schema = result.payload;
    result = await this.tableBySchemaNameTableName(cU, schemaName, tableName);
    if (!result.success) return result;
    const table = result.payload;
    result = await this.dal.columnBySchemaNameTableNameColumnName(
      schemaName,
      tableName,
      columnName
    );
    if (!result.success) return result;
    const column = result.payload;

    if (remove) {
      result = await this.dal.removeSequenceFromColumn(schema, table, column);
    } else {
      result = await this.dal.addSequenceToColumn(
        schema,
        table,
        column,
        nextSeqNumber
      );
    }
    return result;
  }

  /**
   * ========== Util ==========
   */

  public async util(
    cU: CurrentUser,
    fn: string,
    vals: object
  ): Promise<ServiceResult> {
    log.debug(`util(${cU.id},${fn},${JSON.stringify(vals)})`);
    // defer access control to called methods
    let result = errResult();
    switch (fn) {
      case "addNextDemoSchema":
        result = await this.addNextDemoSchema(cU);
        break;
      case "resetTestData":
        result = await this.resetTestData(cU);
        break;
    }
    return result;
  }

  /**
   * ========== Test ==========
   */

  public async resetTestData(cU: CurrentUser): Promise<ServiceResult> {
    log.debug(`resetTestData()`);
    if (cU.isntSysAdmin() && cU.isntTestUser()) {
      return cU.mustBeSysAdminOrTestUser();
    }
    let result = await this.schemas(
      CurrentUser.getSysAdmin(),
      undefined,
      undefined,
      "test_%"
    );
    if (!result.success) return result;
    for (const schema of result.payload) {
      result = await this.removeOrDeleteSchema(
        CurrentUser.getSysAdmin(),
        schema.name,
        true
      );
      if (!result.success) return result;
    }
    result = await this.deleteTestOrganizations(CurrentUser.getSysAdmin());
    if (!result.success) return result;
    result = await this.deleteTestUsers();
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
    result.message = USER_MESSAGES[result.wbCode][0];
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
    Object.keys(USER_MESSAGES).includes(result.wbCode) &&
    USER_MESSAGES[result.wbCode].length == 2
  ) {
    result.apolloErrorCode = USER_MESSAGES[result.wbCode][1];
  } else if (
    !result.apolloErrorCode &&
    result.wbCode &&
    !Object.keys(USER_MESSAGES).includes(result.wbCode)
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

export const bgHandler = async (event: any = {}): Promise<any> => {
  log.info("== bgHandler ==\nCall async event here...");
  // Can be used to call async events without waiting for return, eg from elsewhere:
  // import Lambda from "aws-sdk/clients/lambda";
  // import AWS from "aws-sdk";
  // const lambda = new Lambda({
  //   endpoint: new AWS.Endpoint("http://localhost:3000"),
  // });
  // const params = {
  //   FunctionName: "whitebrick-cloud-dev-bg",
  //   InvocationType: "Event",
  //   Payload: JSON.stringify({ hello: "World" }),
  // };
  // const r = await lambda.invoke(params).promise();
};
