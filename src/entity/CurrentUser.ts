import { Organization, Schema, Table, User } from ".";
import { ServiceResult } from "../types";
import { errResult, log, WhitebrickCloud } from "../whitebrick-cloud";
import { Role } from "./Role";

export class CurrentUser {
  wbCloud!: WhitebrickCloud;
  user!: User;
  id!: number;
  organizations: Record<number, Organization> = {};
  actionHistory: string[] = [];

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
    //this.record("IS_SIGNED_IN");
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

  public async initOrganizationsIfEmpty() {
    if (Object.keys(this.organizations).length == 0) {
      const organizationsResult = await this.wbCloud.organizationById(this.id);
      // TBD try raise error below
      if (!organizationsResult.success) return false;
      for (const organization of organizationsResult.payload) {
        this.organizations[organization.id] = organization;
      }
    }
  }

  public async isInOrganization(organizationId: number): Promise<boolean> {
    await this.initOrganizationsIfEmpty();
    return this.organizations.hasOwnProperty(organizationId);
  }

  public async isNotInOrganization(organizationId: number) {
    return !this.isInOrganization(organizationId);
  }

  public async is(role: string, objectId: number): Promise<boolean> {
    switch (role) {
      case "organization_administrator":
        await this.initOrganizationsIfEmpty();
        return (
          this.organizations.hasOwnProperty(objectId) &&
          this.organizations[objectId].userRole == role
        );
    }
    return false;
  }

  public async isNot(role: string, objectId: any): Promise<boolean> {
    return !this.is(role, objectId);
  }

  //if(cU.cant("edit_table", table.id)) return cU.denied();

  // async only required for testing
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
