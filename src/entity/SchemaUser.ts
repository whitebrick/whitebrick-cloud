import { QueryResult } from "pg";

export class SchemaUser {
  schemaId!: number;
  userId!: number;
  roleId!: number;
  impliedFromRoleId?: number;
  settings!: object;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  schemaName?: string;
  userEmail?: string;
  role?: string;
  roleImpliedFrom?: string;

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
    schemaUser.userId = data.user_id;
    schemaUser.roleId = data.role_id;
    if (data.implied_from_role_id) {
      schemaUser.impliedFromRoleId = data.implied_from_role_id;
    }
    schemaUser.settings = data.settings;
    schemaUser.createdAt = data.created_at;
    schemaUser.updatedAt = data.updated_at;
    if (data.schema_name) schemaUser.schemaName = data.schema_name;
    if (data.user_email) schemaUser.userEmail = data.user_email;
    if (data.role) schemaUser.role = data.role;
    if (data.role_implied_from) {
      schemaUser.roleImpliedFrom = data.role_implied_from;
    }
    return schemaUser;
  }
}
