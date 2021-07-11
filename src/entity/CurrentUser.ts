import { User } from ".";
import { ServiceResult } from "../types";
import { errResult, log, WhitebrickCloud } from "../whitebrick-cloud";
import { RoleLevel, UserActionPermission } from "./Role";
import { DEFAULT_POLICY } from "../policy";

export class CurrentUser {
  wbCloud!: WhitebrickCloud;
  user!: User;
  id!: number;
  actionHistory: UserActionPermission[] = [];

  // { roleLevel: { objectId: { userAction: { checkedForRoleName: string, permitted: true/false} } } }
  objectPermissionsLookup: Record<
    RoleLevel,
    Record<string, Record<string, Record<string, any>>>
  > = {
    organization: {},
    schema: {},
    table: {},
  };

  constructor(wbCloud: WhitebrickCloud, user: User) {
    this.wbCloud = wbCloud;
    this.user = user;
    this.id = user.id;
  }

  public static getSysAdmin(wbCloud: WhitebrickCloud) {
    return new CurrentUser(wbCloud, User.getSysAdminUser());
  }

  public static getPublic(wbCloud: WhitebrickCloud) {
    return new CurrentUser(wbCloud, User.getPublicUser());
  }

  public isSignedIn() {
    return this.user.id !== User.PUBLIC_ID;
  }

  public isSignedOut() {
    return this.user.id == User.PUBLIC_ID;
  }

  public isPublic() {
    return !this.isSignedIn();
  }

  public isSysAdmin() {
    return this.user.id === User.SYS_ADMIN_ID;
  }

  public isNotSysAdmin() {
    return !this.isSysAdmin;
  }

  public idIs(otherId: number) {
    return this.user.id == otherId;
  }

  public idIsNot(otherId: number) {
    return !this.idIs(otherId);
  }

  public denied() {
    let message = "INTERNAL ERROR: Last UserActionPermission not recorded. ";
    let values: string[] = [];
    const lastUAP = this.actionHistory.pop();
    if (lastUAP) {
      message = `You do not have permission to ${lastUAP.description}.`;
      let userStr = `userId=${this.id}`;
      if (this.user && this.user.email) {
        userStr = `userEmail=${this.user.email}, ${userStr}`;
      }
      values = [
        userStr,
        `objectId=${lastUAP.objectId}`,
        `userAction=${lastUAP.userAction}`,
        `checkedForRoleName=${lastUAP.checkedForRoleName}`,
        `checkedAt=${lastUAP.checkedAt}`,
      ];
    }
    return errResult({
      success: false,
      message: message,
      values: values,
      wbCode: "WB_FORBIDDEN",
    });
  }

  public mustBeSignedIn() {
    return errResult({
      success: false,
      message: "You must be signed-in to perform this action.",
      wbCode: "WB_FORBIDDEN",
    });
  }

  // TBD move to ElastiCache
  private getObjectPermission(
    roleLevel: RoleLevel,
    userAction: string,
    key: string
  ) {
    if (
      this.objectPermissionsLookup[roleLevel][key] &&
      this.objectPermissionsLookup[roleLevel][key][userAction]
    ) {
      return {
        roleLevel: roleLevel,
        userAction: userAction,
        objectKey: key,
        objectId:
          this.objectPermissionsLookup[roleLevel][key][userAction].obkectId,
        checkedForRoleName:
          this.objectPermissionsLookup[roleLevel][key][userAction]
            .checkedForRoleName,
        permitted:
          this.objectPermissionsLookup[roleLevel][key][userAction].permitted,
        description:
          this.objectPermissionsLookup[roleLevel][key][userAction].description,
      } as UserActionPermission;
    } else {
      return null;
    }
  }

  // TBD move to ElastiCache
  private setObjectPermission(uAP: UserActionPermission) {
    if (!this.objectPermissionsLookup[uAP.roleLevel][uAP.objectId]) {
      this.objectPermissionsLookup[uAP.roleLevel][uAP.objectId] = {};
    }
    this.objectPermissionsLookup[uAP.roleLevel][uAP.objectId][uAP.userAction] =
      {
        permitted: uAP.permitted,
        checkedForRoleName: uAP.checkedForRoleName,
        description: uAP.description,
      };
    return uAP;
  }

  private recordActionHistory(uAP: UserActionPermission) {
    uAP.checkedAt = new Date();
    this.actionHistory.push(uAP);
  }

  public static getUserActionPolicy(
    policy: Record<string, any>[],
    userAction: string
  ) {
    for (const userActionPolicy of policy) {
      if (userActionPolicy.userAction == userAction) {
        return userActionPolicy;
      }
    }
  }

  private getObjectLookupKey(
    objectIdOrName: number | string,
    parentObjectName?: string
  ) {
    let key: string = objectIdOrName.toString();
    if (typeof objectIdOrName === "number") {
      key = `id${objectIdOrName}`;
    } else if (parentObjectName) {
      key = `${parentObjectName}.${objectIdOrName}`;
    }
    return key;
  }

  public async can(
    userAction: string,
    objectIdOrName: number | string,
    parentObjectName?: string
  ): Promise<boolean> {
    if (this.isSysAdmin()) return true;
    const policy = DEFAULT_POLICY[userAction];
    log.debug(
      `currentUser.can(${userAction},${objectIdOrName}) policy:${JSON.stringify(
        policy
      )}`
    );
    if (!policy) {
      const message = `No policy found for userAction=${userAction}`;
      log.error(message);
      throw new Error(message);
    }
    let key = this.getObjectLookupKey(objectIdOrName, parentObjectName);
    const alreadyChecked = this.getObjectPermission(
      policy.roleLevel,
      userAction,
      key
    );
    if (alreadyChecked !== null) {
      this.recordActionHistory(alreadyChecked);
      return alreadyChecked.permitted;
    }
    const roleResult = await this.wbCloud.roleAndIdForUserObject(
      this.id,
      policy.roleLevel,
      objectIdOrName,
      parentObjectName
    );
    if (!roleResult.success) {
      const message = `Error getting roleNameForUserObject(${this.id},${
        policy.roleLevel
      },${objectIdOrName},${parentObjectName}). ${JSON.stringify(roleResult)}`;
      log.error(message);
      throw new Error(message);
    }
    if (!roleResult.payload.objectId) {
      const message = `ObjectId could not be found`;
      log.error(message);
      throw new Error(message);
    }
    let permitted = false;
    if (
      roleResult.payload.roleName &&
      policy.permittedRoles.includes(roleResult.payload.roleName)
    ) {
      permitted = true;
    }
    const uAP: UserActionPermission = {
      roleLevel: policy.roleLevel,
      objectKey: key,
      objectId: roleResult.payload.objectId,
      userAction: userAction,
      permitted: permitted,
      description: policy.description,
    };
    if (roleResult.payload.roleName) {
      uAP.checkedForRoleName = roleResult.payload.roleName;
    }
    this.setObjectPermission(uAP);
    this.recordActionHistory(uAP);
    log.debug(
      `role: ${JSON.stringify(roleResult.payload)} permitted: ${permitted}`
    );
    return permitted;
  }

  public async cant(
    userAction: string,
    objectIdOrName: number | string,
    parentObjectName?: string
  ): Promise<boolean> {
    const can = await this.can(userAction, objectIdOrName, parentObjectName);
    return !can;
  }

  // async only required to lookup userId from email when testing
  public static async fromContext(context: any): Promise<CurrentUser> {
    //log.info("========== HEADERS: " + JSON.stringify(headers));
    const headersLowerCase = Object.entries(
      context.headers as Record<string, string>
    ).reduce(
      (acc: Record<string, string>, [key, val]) => (
        (acc[key.toLowerCase()] = val), acc
      ),
      {}
    );
    let result: ServiceResult = errResult();
    if (
      // process.env.NODE_ENV == "development" &&
      headersLowerCase["x-test-user-email"]
    ) {
      log.debug(
        `========== FOUND TEST USER: ${headersLowerCase["x-test-user-email"]}`
      );
      result = await context.wbCloud.userByEmail(
        this,
        headersLowerCase["x-test-user-email"]
      );
      if (result.success && result.payload && result.payload.id) {
        return new CurrentUser(context.wbCloud, result.payload);
      } else {
        log.error(
          `CurrentUser.fromContext: Couldn't find user for test email x-test-user-email=${headersLowerCase["x-test-user-email"]}`
        );
        return new CurrentUser(context.wbCloud, User.getPublicUser());
      }
    } else if (
      headersLowerCase["x-hasura-role"] &&
      headersLowerCase["x-hasura-role"].toLowerCase() == "admin"
    ) {
      log.debug("========== FOUND SYSADMIN USER");
      return new CurrentUser(context.wbCloud, User.getSysAdminUser());
    } else if (headersLowerCase["x-hasura-user-id"]) {
      log.debug(
        `========== FOUND USER: ${headersLowerCase["x-hasura-user-id"]}`
      );
      const result = await context.wbCloud.userById(
        this,
        parseInt(headersLowerCase["x-hasura-user-id"])
      );
      if (result.success && result.payload && result.payload.id) {
        return new CurrentUser(context.wbCloud, result.payload);
      } else {
        log.error(
          `CurrentUser.fromContext: Couldn't find user for x-hasura-user-id=${headersLowerCase["x-hasura-user-id"]}`
        );
        return new CurrentUser(context.wbCloud, User.getPublicUser());
      }
    } else {
      // TBD: support for public users
      log.debug(
        `CurrentUser.fromContext: Could not find headers for Admin, Test or User in: ${JSON.stringify(
          context.headers
        )}`
      );
      return new CurrentUser(context.wbCloud, User.getPublicUser());
    }
  }
}
