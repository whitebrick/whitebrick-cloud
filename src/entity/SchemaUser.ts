import { QueryResult } from "pg";
import { Role, RoleLevel } from ".";

export class SchemaUser {
  schemaId!: number;
  userId!: number;
  roleId!: number;
  impliedFromRoleId?: number;
  settings!: object;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  role!: Role;
  schemaName?: string;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;

  public static parseResult(data: QueryResult | null): Array<SchemaUser> {
    if (!data) throw new Error("SchemaUser.parseResult: input is null");
    const schemaUsers = Array<SchemaUser>();
    data.rows.forEach((row: any) => {
      schemaUsers.push(SchemaUser.parse(row));
    });
    return schemaUsers;
  }

  public static parse(data: Record<string, any>): SchemaUser {
    if (!data) throw new Error("SchemaUser.parse: input is null");
    const schemaUser = new SchemaUser();
    schemaUser.schemaId = data.schema_id;
    schemaUser.userId = parseInt(data.user_id);
    schemaUser.roleId = parseInt(data.role_id);
    if (data.implied_from_role_id) {
      schemaUser.impliedFromRoleId = parseInt(data.implied_from_role_id);
    }
    schemaUser.settings = data.settings;
    schemaUser.createdAt = data.created_at;
    schemaUser.updatedAt = data.updated_at;
    if (data.schema_name) schemaUser.schemaName = data.schema_name;
    if (data.user_email) schemaUser.userEmail = data.user_email;
    if (data.user_first_name) schemaUser.userFirstName = data.user_first_name;
    if (data.user_last_name) schemaUser.userLastName = data.user_last_name;
    if (data.role_name) {
      schemaUser.role = new Role(data.role_name, "schema" as RoleLevel);
      if (data.role_implied_from) {
        schemaUser.role.impliedFrom = data.role_implied_from;
      }
    }
    return schemaUser;
  }
}
