import { QueryResult } from "pg";

export class OrganizationUser {
  organizationId!: number;
  userId!: number;
  roleId!: number;
  impliedFromroleId?: number;
  settings!: object;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  organizationName?: string;
  userEmail?: string;
  role?: string;
  roleImpliedFrom?: string;

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
    organizationUser.userId = data.user_id;
    organizationUser.roleId = data.role_id;
    organizationUser.impliedFromroleId = data.implied_from_role_id;
    organizationUser.settings = data.settings;
    organizationUser.createdAt = data.created_at;
    organizationUser.updatedAt = data.updated_at;
    if (data.organization_name)
      organizationUser.organizationName = data.organization_name;
    if (data.user_email) organizationUser.userEmail = data.user_email;
    if (data.role) organizationUser.role = data.role;
    if (data.role_implied_from) {
      organizationUser.roleImpliedFrom = data.role_implied_from;
    }
    return organizationUser;
  }
}
