import { QueryResult } from "pg";

export type RoleName =
  | "tenant_user"
  | "tenant_admin"
  | "schema_owner"
  | "schema_administrator"
  | "schema_editor"
  | "schema_commenter"
  | "schema_reader";

export class Role {
  id!: number;
  name!: string;

  public static parseResult(data: QueryResult | null): Array<Role> {
    if (!data) throw new Error("Role.parseResult: input is null");
    const roles = Array<Role>();
    data.rows.forEach((row: any) => {
      roles.push(Role.parse(row));
    });
    return roles;
  }

  public static parse(data: Record<string, any>): Role {
    if (!data) throw new Error("Role.parse: input is null");
    const role = new Role();
    role.id = data.id;
    role.name = data.name;
    return role;
  }
}
