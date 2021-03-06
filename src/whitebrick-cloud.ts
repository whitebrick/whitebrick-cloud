import { ApolloServer, ApolloError } from "apollo-server-lambda";
import { Logger } from "tslog";
import { DAL } from "./dal";
import { BgQueue } from "./bg-queue";
import { hasuraApi } from "./hasura-api";
import { ConstraintId, schema, ServiceResult } from "./types";
import v from "voca";
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
import { mailer } from "./mailer";

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
  displayFilePath: "hidden",
  displayFunctionName: false,
  displayLogLevel: false,
});

export class WhitebrickCloud {
  dal = new DAL();
  bgQueue = new BgQueue(this, this.dal);

  public err(result: ServiceResult): Error {
    return apolloErr(result);
  }

  /**
   * ========== Auth ==========
   */

  public async auth(
    cU: CurrentUser,
    userAuthId: string,
    userObj: Record<string, any>
  ): Promise<ServiceResult> {
    log.info(`auth(${userAuthId})`);
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    let hasuraUserId;
    let result = await this.dal.userIdFromAuthId(userAuthId);
    /* User doesn't exist, if coming from social connection try sign up */
    if (result.success) {
      hasuraUserId = result.payload;
    } else {
      result = await this.signUp(cU, userAuthId, userObj);
      if (!result.success) return result;
      hasuraUserId = result.payload.id;
    }
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
    log.info(`signUp(${userAuthId},${JSON.stringify(userObj)})`);
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
      const demoResult = await this.assignDemoSchema(result.payload.id);
      if (!demoResult.success) {
        log.error(`ERROR assigning demo prefix ${JSON.stringify(demoResult)}`);
      }
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
    log.info(`roleByName(${cU.id},${name})`);
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
    log.info(
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
    table?: Table,
    schemaName?: string,
    deleteOnly?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `deleteAndSetTablePermissions(${cU.id},${table},${schemaName},${deleteOnly})`
    );
    let tables: Table[] = [];
    if (table) {
      if (await cU.cant("manage_access_to_table", table.id)) return cU.denied();
      tables = [table];
    } else if (schemaName) {
      if (await cU.cant("manage_access_to_schema", schemaName)) {
        return cU.denied();
      }
      const tablesResult = await this.tables(cU, schemaName);
      if (!tablesResult.success) return tablesResult;
      tables = tablesResult.payload;
    }
    if (tables.length == 0) {
      log.info(`deleteAndSetTablePermissions tables.length==0 - nothing to do`);
      return { success: true } as ServiceResult;
    }
    let result = errResult();
    for (const table of tables) {
      result = await this.dal.deleteAndSetTablePermissions(table.id);
      if (!result.success) return result;
    }
    return result;
  }

  // sometimes when setting schema roles, child tables are added asynchronously in the background
  // in this case use doNotPropogate and re-call against tables after bg process completes
  public async setRole(
    cU: CurrentUser,
    userIds: number[],
    roleName: string,
    roleLevel: RoleLevel,
    object: Organization | Schema | Table,
    doNotPropogate?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `setRole(${cU.id},${userIds},${roleName},${roleLevel},${JSON.stringify(
        object
      )},${doNotPropogate})`
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
        if (!doNotPropogate) {
          result = await this.deleteAndSetTablePermissions(
            cU,
            undefined,
            object.name
          );
        }
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
    log.info(`deleteRole(${cU.id},${userIds},${roleLevel},${objectId})`);
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
    log.info(`deleteTestUsers()`);
    return this.dal.deleteTestUsers();
  }

  public async usersByIds(
    cU: CurrentUser,
    ids: number[]
  ): Promise<ServiceResult> {
    log.info(`usersByIds(${cU.id},${ids})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    // TBD: mask sensitive information
    return this.dal.users(ids);
  }

  public async userById(cU: CurrentUser, id: number): Promise<ServiceResult> {
    log.info(`userById(${cU.id},${id})`);
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
    log.info(`usersBySearchPattern(${cU.id},${searchPattern})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.dal.users(undefined, undefined, searchPattern);
  }

  public async usersByEmails(
    cU: CurrentUser,
    userEmails: string[]
  ): Promise<ServiceResult> {
    log.info(`usersByEmails(${cU.id},${userEmails})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.dal.users(undefined, userEmails);
  }

  public async userByEmail(
    cU: CurrentUser,
    email: string
  ): Promise<ServiceResult> {
    log.info(`userByEmail(${cU.id},${email})`);
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
    log.info(
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
    log.info(`updateUser(${cU.id},${id},${email},${firstName},${lastName})`);
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
    log.info(
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
    log.info(`organizationsByIds(${cU.id},${ids})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.organizations(cU, ids);
  }

  public async organizationById(
    cU: CurrentUser,
    id: number
  ): Promise<ServiceResult> {
    log.info(`organizationByIds(${cU.id},${id})`);
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
    log.info(`organizationsByNames(${cU.id},${names})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.organizations(cU, undefined, names);
  }

  public async organizationByName(
    cU: CurrentUser,
    name: string
  ): Promise<ServiceResult> {
    log.info(`organizationByName(${cU.id},${name})`);
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
    log.info(`organizationByNamePattern(${cU.id},${namePattern})`);
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
    log.info(
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
    log.info(`accessibleOrganizations(${cU.id},${withSettings})`);
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
    log.info(`createOrganization(${cU.id},${name},${label})`);
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
    log.info(`updateOrganization(${cU.id},${name},${newName},${newLabel})`);
    if (await cU.cant("edit_organization", name)) return cU.denied();
    return this.dal.updateOrganization(name, newName, newLabel);
  }

  public async deleteOrganization(
    cU: CurrentUser,
    name: string
  ): Promise<ServiceResult> {
    log.info(`deleteOrganization(${cU.id},${name})`);
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
    log.info(`deleteTestOrganizations(${cU.id})`);
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
    log.info(
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
    log.info(
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
    log.info(
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
    log.info(`saveSchemaUserSettings(${cU.id},${schemaName},${settings})`);
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
    log.info(
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
    log.info(`schemas(${cU.id},${ids})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.schemas(cU, ids);
  }

  public async schemaById(cU: CurrentUser, id: number): Promise<ServiceResult> {
    log.info(`schemaById(${cU.id},${id})`);
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
    log.info(`schemasByNames(${cU.id},${names})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.schemas(cU, undefined, names);
  }

  public async schemaByName(
    cU: CurrentUser,
    name: string
  ): Promise<ServiceResult> {
    log.info(`schemaByName(${cU.id},${name})`);
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
    log.info(`schemaByNamePattern(${cU.id},${namePattern})`);
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
    log.info(`schemasByUserOwner(${cU.id},${userId},${userEmail})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return this.dal.schemasByUserOwner(userId, userEmail);
  }

  public async schemasByOrganizationOwner(
    cU: CurrentUser,
    organizationId?: number,
    organizationName?: string
  ): Promise<ServiceResult> {
    log.info(
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
    log.info(
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
    log.info(
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
    log.info(`accessibleSchemas(${cU.id},${withSettings})`);
    if (cU.isntSignedIn()) return cU.mustBeSignedIn();
    return await this.dal.schemasByUsers(
      [cU.id],
      undefined,
      undefined,
      withSettings
    );
  }

  // If organizationOwner organization admins are implicitly granted schema admin roles
  // Adding a schema does no automatically assign roles for child tables setRole(doNotPropagate=true)
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
    log.info(
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
          schemaResult.payload,
          true
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
        schemaResult.payload,
        true
      );
    }
    if (!result.success) return result;
    return schemaResult;
  }

  public async removeOrDeleteSchema(
    cU: CurrentUser,
    schemaName: string,
    del?: boolean
  ): Promise<ServiceResult> {
    log.info(`removeOrDeleteSchema(${cU.id},${schemaName},${del})`);
    if (await cU.cant("alter_schema", schemaName)) return cU.denied();
    // -- this is now dropped all-at-once in removeOrDeleteSchema --
    // let result = await this.addOrRemoveAllExistingRelationships(
    //   cU,
    //   schemaName,
    //   undefined,
    //   true
    // );
    // if (!result.success) return result;
    // result = await this.dal.tables(schemaName);
    // if (!result.success) return result;
    // for (const table of result.payload) {
    //   result = await this.removeOrDeleteTable(cU, schemaName, table.name, del);
    //   if (!result.success) return result;
    // }
    // result = await this.dal.removeAllUsersFromSchema(schemaName);
    // if (!result.success) return result;
    const schemaResult = await this.schemaByName(cU, schemaName);
    if (!schemaResult.success) return schemaResult;

    let result = await this.untrackAllTables(cU, schemaName);

    result = await this.bgQueue.removeAllForSchema(schemaResult.payload.id);
    if (!result.success) return result;
    return await this.dal.removeOrDeleteSchema(
      schemaName,
      schemaResult.payload.id,
      del
    );
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
    log.info(
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
        result = await this.untrackTable(cU, table);
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
        result = await this.trackTableWithPermissions(cU, table, true);
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

  public async addDemoSchema(
    cU: CurrentUser,
    schemaName: string
  ): Promise<ServiceResult> {
    log.info(`addDemoSchema(${cU.id}, ${schemaName})`);
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    let result = await this.dal.discoverSchemas(schemaName);
    if (!result.success) return result;
    if (result.payload.length !== 1) {
      return errResult({
        message: `addNextDemoSchema: can not find demo DB matching ${environment.demoDBPrefix}%`,
      } as ServiceResult);
    }
    return await this.addOrCreateSchema(
      cU,
      schemaName,
      environment.demoDBLabel,
      undefined,
      undefined,
      cU.id
    );
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
    log.info(
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
    log.info(
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
    log.info(`removeSchemaUsers(${cU.id},${schemaName},${userEmails})`);
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
    log.info(
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

  // background job
  public async importSchema(
    cU: CurrentUser,
    schemaName: string
  ): Promise<ServiceResult> {
    log.info(`importSchema(${cU.id},${schemaName})`);
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    const schemaResult = await this.schemaByName(cU, schemaName);
    if (!schemaResult.success) return schemaResult;
    let result = await this.bgQueue.queue(
      cU.id,
      schemaResult.payload.id,
      "bgImportSchema",
      {
        schemaName: schemaName,
      }
    );
    if (!result.success) return result;
    return await this.bgQueue.invoke(schemaResult.payload.id);
  }

  // background job
  public async retrackSchema(
    cU: CurrentUser,
    schemaName: string
  ): Promise<ServiceResult> {
    log.info(`retrackSchema(${cU.id},${schemaName})`);
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    const schemaResult = await this.schemaByName(cU, schemaName);
    if (!schemaResult.success) return schemaResult;
    let result = await this.bgQueue.queue(
      cU.id,
      schemaResult.payload.id,
      "bgRetrackSchema",
      {
        schemaName: schemaName,
      }
    );
    if (!result.success) return result;
    return await this.bgQueue.invoke(schemaResult.payload.id);
  }

  /**
   * ========== Tables ==========
   */

  public async tables(
    cU: CurrentUser,
    schemaName: string,
    withColumns?: boolean
  ): Promise<ServiceResult> {
    log.info(`tables(${cU.id},${schemaName},${withColumns})`);
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
    log.info(`tableBySchemaNameTableName(${cU.id},${schemaName},${tableName})`);
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
    log.info(
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
    log.info(
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
    log.info(
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
    result = await this.trackTableWithPermissions(
      cU,
      tableResult.payload,
      false,
      true
    );
    if (!result.success) return result;
    return tableResult;
  }

  public async initTableData(
    cU: CurrentUser,
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    log.info(`initTableData(${cU.id},${schemaName},${tableName})`);
    if (await cU.cant("read_and_write_table_records", tableName, schemaName)) {
      return cU.denied();
    }
    let result = await this.dal.tableIsEmpty(schemaName, tableName);
    if (!result.success || result.payload === false) return result;
    result = await this.dal.columns(schemaName, tableName);
    if (!result.success) return result;
    const columns = result.payload;
    if (columns.length == 0) {
      result.payload = false;
      return result;
    }
    let initRow: Record<string, any> = {};
    for (const column of columns) {
      if ((columns.length == 1 || column.isNotNullable) && !column.default) {
        let value = Column.egValueFromPgType(column.type);
        if (typeof value === "string") value = `'${value}'`;
        initRow[column.name] = value;
      } else {
        initRow[column.name] = "NULL";
      }
    }
    result = await this.dal.insert(schemaName, tableName, [initRow]);
    if (result.success) result.payload = true;
    return result;
  }

  public async removeOrDeleteTable(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    del?: boolean
  ): Promise<ServiceResult> {
    log.info(`removeOrDeleteTable(${cU.id},${schemaName},${tableName},${del})`);
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
        false,
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
    // TBD move this to bg
    result = await this.untrackTableWithPermissions(
      cU,
      tableResult.payload,
      true
    );
    if (!result.success) return result;
    // 3. remove user settings
    result = await this.dal.removeAllTableUsers(tableResult.payload.id);
    if (!result.success) return result;
    result = await this.deleteAndSetTablePermissions(
      CurrentUser.getSysAdmin(),
      tableResult.payload,
      undefined,
      true
    );
    if (!result.success) return result;
    // 4. remove/delete the table
    return await this.dal.removeOrDeleteTable(schemaName, tableName, del);
  }

  public async addAllExistingTables(
    cU: CurrentUser,
    schemaName: string
  ): Promise<ServiceResult> {
    log.info(`addAllExistingTables(${cU.id},${schemaName})`);
    if (await cU.cant("alter_schema", schemaName)) {
      return cU.denied();
    }
    let result = await this.dal.discoverTables(schemaName);
    if (!result.success) return result;
    const tableNames = result.payload;
    for (const tableName of tableNames) {
      result = await this.addExistingTable(cU, schemaName, tableName, true);
      if (!result.success) return result;
    }
    return result;
  }

  public async addExistingTable(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    withColumns?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `addExistingTable(${cU.id},${schemaName},${tableName},${withColumns})`
    );
    if (await cU.cant("alter_schema", schemaName)) {
      return cU.denied();
    }
    const tableResult = await this.addOrCreateTable(
      cU,
      schemaName,
      tableName,
      v.titleCase(tableName.toString().replace(/_/g, " ")),
      false
    );
    // stop here if not adding columns
    if (!withColumns || !tableResult.success) return tableResult;
    let result = await this.untrackTableWithPermissions(
      cU,
      tableResult.payload,
      true
    );
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
        v.titleCase(column.name.toString().replace(/_/g, " ")),
        false,
        undefined,
        undefined,
        false,
        true // skip tracking
      );
      if (!result.success) return result;
    }
    result = await this.trackTableWithPermissions(
      cU,
      tableResult.payload,
      false,
      true
    );
    return result;
  }

  public async updateTable(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    newTableName?: string,
    newTableLabel?: string
  ): Promise<ServiceResult> {
    log.info(
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
      result = await this.untrackTable(cU, tableResult.payload);
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
      result = await this.trackTable(cU, updatedTableResult.payload);
      if (!result.success) return result;
    }
    return updatedTableResult;
  }

  public async addOrRemoveAllExistingRelationships(
    cU: CurrentUser,
    schemaName: string,
    tableNamePattern?: string,
    remove?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `addOrRemoveAllExistingRelationships(${cU.id},${schemaName},${tableNamePattern},${remove})`
    );
    if (await cU.cant("alter_schema", schemaName)) {
      return cU.denied();
    }
    if (!tableNamePattern) tableNamePattern = "%";
    // TBD: discover per table
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
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    log.info(`addDefaultTablePermissions(${cU.id},${schemaName},${tableName})`);
    if (await cU.cant("alter_table", tableName, schemaName)) return cU.denied();
    let result = await this.columns(cU, schemaName, tableName);
    if (!result.success) return result;
    // dont add permissions for tables with no columns
    if (result.payload.length == 0) return { success: true } as ServiceResult;
    const columnNames: string[] = result.payload.map(
      (table: { name: string }) => table.name
    );
    result = await this.tableBySchemaNameTableName(cU, schemaName, tableName);
    if (!result.success) return result;
    for (const permissionCheckAndType of Role.hasuraTablePermissionChecksAndTypes(
      result.payload.id
    )) {
      result = await hasuraApi.createPermission(
        schemaName,
        tableName,
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
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    log.info(
      `removeDefaultTablePermissions(${cU.id},${schemaName},${tableName})`
    );
    if (await cU.cant("alter_table", tableName, schemaName)) return cU.denied();
    // If this table no longer has any columns, there will be no permissions
    let result = await this.columns(cU, schemaName, tableName);
    if (!result.success) return result;
    if (result.payload.length == 0) {
      return { success: true, payload: true } as ServiceResult;
    }
    result = await this.tableBySchemaNameTableName(cU, schemaName, tableName);
    if (!result.success) return result;
    for (const permissionKeyAndType of Role.tablePermissionKeysAndActions(
      result.payload.id
    )) {
      result = await hasuraApi.deletePermission(
        schemaName,
        tableName,
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
    log.info(
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
    log.info(
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
    log.info(
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
    log.info(
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

  public async trackTable(
    cU: CurrentUser,
    table: Table,
    untrackFirst?: boolean
  ): Promise<ServiceResult> {
    log.info(`trackTable(${cU.id},${JSON.stringify(table)})`);
    if (await cU.cant("alter_table", table.id)) {
      return cU.denied();
    }
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    let result = errResult();
    if (untrackFirst) {
      result = await this.untrackTable(cU, table);
      if (!result.success) return result;
    }
    result = await hasuraApi.trackTable(table.schemaName, table.name);
    return result;
  }

  public async trackAllTables(
    cU: CurrentUser,
    schemaName: string
  ): Promise<ServiceResult> {
    log.info(`trackAllTables(${cU.id},${schemaName})`);
    if (await cU.cant("alter_schema", schemaName)) {
      return cU.denied();
    }
    const tablesResult = await this.tables(cU, schemaName);
    if (!tablesResult.success) return tablesResult;
    let result = errResult();
    for (const table of tablesResult.payload) {
      result = await hasuraApi.trackTable(schemaName, table.name);
      if (!result.success) return result;
    }
    return result;
  }

  public async trackTableWithPermissions(
    cU: CurrentUser,
    table: Table,
    resetPermissions?: boolean,
    sync?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `trackTableWithPermissions(${cU.id}, ${JSON.stringify(
        table
      )},${resetPermissions},${sync})`
    );
    if (await cU.cant("alter_table", table.id)) {
      return cU.denied();
    }
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    let result = errResult();
    if (sync) {
      result = await this.trackTable(cU, table);
      if (!result.success) return result;
      if (resetPermissions) {
        result = await this.removeDefaultTablePermissions(
          cU,
          table.schemaName,
          table.name
        );
        if (!result.success) return result;
      }
      result = await this.addDefaultTablePermissions(
        cU,
        table.schemaName,
        table.name
      );
    } else {
      let fn = "bgTrackAndAddDefaultTablePermissions";
      if (resetPermissions) {
        fn = "bgTrackAndRemoveAndAddDefaultTablePermissions";
      }
      result = await this.bgQueue.queue(cU.id, table.schemaId, fn, {
        schemaName: table.schemaName,
        tableName: table.name,
      });
      if (!result.success) return result;
      result = await this.bgQueue.invoke(table.schemaId);
    }
    return result;
  }

  public async untrackTable(
    cU: CurrentUser,
    table: Table
  ): Promise<ServiceResult> {
    log.info(`untrackTable(${cU.id},${JSON.stringify(table)})`);
    if (await cU.cant("alter_table", table.id)) {
      return cU.denied();
    }
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    return await hasuraApi.untrackTable(table.schemaName, table.name);
  }

  public async untrackAllTables(
    cU: CurrentUser,
    schemaName: string
  ): Promise<ServiceResult> {
    log.info(`untrackAllTables(${cU.id},${schemaName})`);
    if (await cU.cant("alter_schema", schemaName)) {
      return cU.denied();
    }
    const tablesResult = await this.tables(cU, schemaName);
    if (!tablesResult.success) return tablesResult;
    let result = errResult();
    for (const table of tablesResult.payload) {
      result = await hasuraApi.untrackTable(schemaName, table.name);
      if (!result.success) return result;
    }
    return result;
  }

  public async untrackTableWithPermissions(
    cU: CurrentUser,
    table: Table,
    sync?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `untrackTableWithPermissions(${cU.id},${JSON.stringify(table)},${sync})`
    );
    if (await cU.cant("alter_table", table.id)) {
      return cU.denied();
    }
    if (!table.schemaName) {
      return errResult({ message: "schemaName not set" } as ServiceResult);
    }
    let result = errResult();
    if (sync) {
      result = await this.untrackTable(cU, table);
      if (!result.success) return result;
      result = await this.removeDefaultTablePermissions(
        cU,
        table.schemaName,
        table.name
      );
    } else {
      result = await this.bgQueue.queue(
        cU.id,
        table.schemaId,
        "bgTrackAndRemoveDefaultTablePermissions",
        {
          schemaName: table.schemaName,
          tableName: table.name,
        }
      );
      if (!result.success) return result;
      result = await this.bgQueue.invoke(table.schemaId);
    }
    return result;
  }

  public async retrackTableWithPermissions(
    cU: CurrentUser,
    schemaName: string,
    tableName: string,
    sync?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `retrackTableWithPermissions(${cU.id},${schemaName},${tableName},${sync})`
    );
    let result = await this.tableBySchemaNameTableName(
      cU,
      schemaName,
      tableName
    );
    if (!result.success) return result;
    result = await this.trackTableWithPermissions(
      cU,
      result.payload,
      true,
      sync
    );
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
    log.info(
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
    log.info(`addDefaultTableUsersToTable(${JSON.stringify(table)})`);
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
    log.info(
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
    log.info(
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
    log.info(
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
    log.info(`columns(${cU.id},${schemaName},${tableName})`);
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
    isNotNullable?: boolean,
    skipTracking?: boolean,
    sync?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `addOrCreateColumn(${cU.id},${schemaName},${tableName},${columnName},${columnLabel},${create},${columnType},${isNotNullable},${skipTracking},${sync})`
    );
    if (await cU.cant("alter_table", tableName, schemaName)) {
      return cU.denied();
    }
    const checkColNotAlreadyAddedResult =
      await this.dal.columnBySchemaNameTableNameColumnName(
        schemaName,
        tableName,
        columnName
      );
    if (!checkColNotAlreadyAddedResult.success) {
      // expecting the column to be not found
      if (checkColNotAlreadyAddedResult.wbCode != "WB_COLUMN_NOT_FOUND") {
        return checkColNotAlreadyAddedResult;
      }
    } else {
      return errResult({
        wbCode: "WB_COLUMN_NAME_EXISTS",
      } as ServiceResult);
    }
    if (!create) {
      create = false;
      // if its not being created check it exists
      const checkColExistsResult = await this.dal.discoverColumns(
        schemaName,
        tableName,
        columnName
      );
      if (!checkColExistsResult.success) return checkColExistsResult;
      if (checkColExistsResult.payload.length == 0) {
        return errResult({
          wbCode: "WB_COLUMN_NOT_FOUND",
        } as ServiceResult);
      }
    } else if (!columnType) {
      columnType = "TEXT";
    }
    let result: ServiceResult = errResult();
    const tableResult = await this.tableBySchemaNameTableName(
      cU,
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    if (!skipTracking) {
      result = await this.untrackTable(cU, tableResult.payload);
      if (!result.success) return result;
    }
    const columnResult = await this.dal.addOrCreateColumn(
      schemaName,
      tableName,
      columnName,
      columnLabel,
      create,
      columnType,
      isNotNullable
    );
    if (columnResult.success && !skipTracking) {
      result = await this.trackTableWithPermissions(
        cU,
        tableResult.payload,
        true,
        sync
      );
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
    skipTracking?: boolean,
    sync?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `removeOrDeleteColumn(${cU.id},${schemaName},${tableName},${columnName},${del},${skipTracking},${sync})`
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
      result = await this.untrackTable(cU, tableResult.payload);
      if (!result.success) return result;
    }
    result = await this.dal.removeOrDeleteColumn(
      schemaName,
      tableName,
      columnName,
      del
    );
    if (result.success && !skipTracking) {
      result = await this.trackTableWithPermissions(
        cU,
        tableResult.payload,
        true,
        sync
      );
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
    newType?: string,
    newIsNotNullable?: boolean,
    skipTracking?: boolean,
    sync?: boolean
  ): Promise<ServiceResult> {
    log.info(
      `updateColumn(${cU.id},${schemaName},${tableName},${columnName},${newColumnName},${newColumnLabel},${newType},${newIsNotNullable},${skipTracking},${sync})`
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
      if (!skipTracking) {
        result = await this.untrackTable(cU, tableResult.payload);
        if (!result.success) return result;
      }
    }
    result = await this.dal.updateColumn(
      schemaName,
      tableName,
      columnName,
      newColumnName,
      newColumnLabel,
      newType,
      newIsNotNullable
    );
    if (result.success && (newColumnName || newType) && !skipTracking) {
      result = await this.trackTableWithPermissions(
        cU,
        tableResult.payload,
        true,
        sync
      );
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

  public async hasuraHealthCheck() {
    let result = errResult();
    try {
      result = await hasuraApi.healthCheck();
    } catch (error: any) {
      result = errResult({
        message: error.message,
        values: [JSON.stringify(error)],
      });
    }
    return result;
  }

  public async dbHealthCheck() {
    let result = errResult();
    try {
      result = await this.dal.healthCheck();
    } catch (error: any) {
      result = errResult({
        message: error.message,
        values: [JSON.stringify(error)],
      });
    }
    return result;
  }

  public async listBgQueue(
    cU: CurrentUser,
    schemaName: string,
    limit?: number
  ) {
    log.info(`listBgQueue(${cU.id},${schemaName},${limit})`);
    if (schemaName == "wb" && cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    const schemaIdResult = await this.schemaByName(cU, schemaName);
    if (!schemaIdResult.success) return schemaIdResult;
    const lsResult = await this.bgQueue.ls(schemaIdResult.payload.id, limit);
    return lsResult;
  }

  public async util(
    cU: CurrentUser,
    fn: string,
    vals: Record<string, any>
  ): Promise<ServiceResult> {
    log.info(`util(${cU.id},${fn},${JSON.stringify(vals)})`);
    // defer access control to called methods
    let result = errResult();
    switch (fn) {
      case "addDemoSchema":
        result = await this.addDemoSchema(cU, vals.schemaName as string);
        break;
      case "assignDemoSchema": // used for testing
        result = await this.assignDemoSchema(vals.userId);
        break;
      case "resetTestData":
        result = await this.resetTestData(cU);
        break;
      case "processDbRestore":
        result = await this.processDbRestore(cU);
        break;
      case "resetTablePermissions":
        result = await this.tableBySchemaNameTableName(
          cU,
          vals.schemaName,
          vals.tableName
        );
        if (result.success) {
          result = await this.trackTableWithPermissions(
            cU,
            result.payload,
            true
          );
        }
        break;
      case "invokeBg":
        result = await this.bgQueue.process(vals.schemaId);
        break;
      default:
        log.error(`Can not find fn ${fn}`);
    }
    if (result.success && result.payload && result.payload._types) {
      result.payload._types = "(pruned by WhitebrickCloud)";
    }
    return result;
  }

  public async processDbRestore(cU: CurrentUser): Promise<ServiceResult> {
    log.info(`processDbRestore(${cU.id})`);
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    let result = await this.bgQueue.queue(
      cU.id,
      Schema.WB_SYS_SCHEMA_ID,
      "bgReplaceProdWithStagingRemoteSchema"
    );
    if (!result.success) return result;
    return await this.bgQueue.invoke(Schema.WB_SYS_SCHEMA_ID);
  }

  public async replaceProdWithStagingRemoteSchema(
    cU: CurrentUser
  ): Promise<ServiceResult> {
    log.info(`replaceProdWithStagingRemoteSchema(${cU.id})`);
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    let result = errResult();
    if (environment.wbStagingRemoteSchemaName) {
      result = await hasuraApi.setRemoteSchema(
        environment.wbStagingRemoteSchemaName,
        environment.wbStagingRemoteSchemaURL,
        environment.wbProdRemoteSchemaName
      );
    } else {
      log.info(`environment.wbStagingRemoteSchemaName NOT FOUND`);
    }
    if (environment.wbaRemoteSchemaName) {
      result = await hasuraApi.setRemoteSchema(
        environment.wbaRemoteSchemaName,
        environment.wbaRemoteSchemaURL
      );
    }
    return result;
  }

  public async reloadMetadata(cU: CurrentUser): Promise<ServiceResult> {
    log.info(`reloadMetadata(${cU.id})`);
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    return await hasuraApi.reloadMetadata();
  }

  public async dropInconsistentMetadata(
    cU: CurrentUser
  ): Promise<ServiceResult> {
    log.info(`dropInconsistentMetadata(${cU.id})`);
    if (cU.isntSysAdmin()) return cU.mustBeSysAdmin();
    return await hasuraApi.dropInconsistentMetadata();
  }

  /**
   * ========== Test ==========
   */

  public async resetTestData(cU: CurrentUser): Promise<ServiceResult> {
    log.info(`resetTestData(${cU.id})`);
    if (cU.isntSysAdmin() && cU.isntTestUser()) {
      return cU.mustBeSysAdminOrTestUser();
    }
    let result = await this.schemas(
      CurrentUser.getSysAdmin(),
      undefined,
      undefined,
      "test\\_%"
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
  log.info(`== bgHandler event: ${JSON.stringify(event)}`);
  const wbCloud = new WhitebrickCloud();
  const result = await wbCloud.bgQueue.process(event.schemaId);
  log.info(`== bgHandler result: ${JSON.stringify(result)}`);
  return result;
};
