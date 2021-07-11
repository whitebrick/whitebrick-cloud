import { QueryResult } from "pg";
import { Role, RoleLevel } from ".";

export class Organization {
  id!: number;
  name!: string;
  label!: string;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  role?: Role;
  settings?: object;

  public static parseResult(data: QueryResult | null): Array<Organization> {
    if (!data) throw new Error("Organization.parseResult: input is null");
    const organizations = Array<Organization>();
    data.rows.forEach((row: any) => {
      organizations.push(Organization.parse(row));
    });
    return organizations;
  }

  public static parse(data: Record<string, any>): Organization {
    if (!data) throw new Error("Organization.parse: input is null");
    const organization = new Organization();
    organization.id = data.id;
    organization.name = data.name;
    organization.label = data.label;
    organization.createdAt = data.created_at;
    organization.updatedAt = data.updated_at;
    if (data.settings) organization.settings = data.settings;
    if (data.role_name) {
      organization.role = new Role(data.role_name, "organization" as RoleLevel);
      if (data.role_implied_from) {
        organization.role.impliedFrom = data.role_implied_from;
      }
    }
    return organization;
  }
}
