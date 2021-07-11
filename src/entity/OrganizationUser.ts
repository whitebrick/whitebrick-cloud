import { QueryResult } from "pg";
import { Role, RoleLevel } from ".";

export class OrganizationUser {
  organizationId!: number;
  userId!: number;
  roleId!: number;
  impliedFromroleId?: number;
  settings!: object;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  role!: Role;
  organizationName?: string;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;

  public static parseResult(data: QueryResult | null): Array<OrganizationUser> {
    if (!data) throw new Error("OrganizationUser.parseResult: input is null");
    const organizationUsers = Array<OrganizationUser>();
    data.rows.forEach((row: any) => {
      organizationUsers.push(OrganizationUser.parse(row));
    });
    return organizationUsers;
  }

  public static parse(data: Record<string, any>): OrganizationUser {
    if (!data) throw new Error("OrganizationUser.parse: input is null");
    const organizationUser = new OrganizationUser();
    organizationUser.organizationId = data.organization_id;
    organizationUser.userId = parseInt(data.user_id);
    organizationUser.roleId = parseInt(data.role_id);
    if (data.implied_from_role_id) {
      organizationUser.impliedFromroleId = parseInt(data.implied_from_role_id);
    }
    organizationUser.settings = data.settings;
    organizationUser.createdAt = data.created_at;
    organizationUser.updatedAt = data.updated_at;
    organizationUser.role = new Role(data.role_id);
    if (data.organization_name)
      organizationUser.organizationName = data.organization_name;
    if (data.user_email) organizationUser.userEmail = data.user_email;
    if (data.user_first_name)
      organizationUser.userFirstName = data.user_first_name;
    if (data.user_last_name)
      organizationUser.userLastName = data.user_last_name;
    if (data.role_name) {
      organizationUser.role = new Role(
        data.role_name,
        "organization" as RoleLevel
      );
      if (data.role_implied_from) {
        organizationUser.role.impliedFrom = data.role_implied_from;
      }
    }
    return organizationUser;
  }
}
