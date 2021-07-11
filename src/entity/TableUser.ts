import { QueryResult } from "pg";
import { Role, RoleLevel } from ".";

export class TableUser {
  tableId!: number;
  userId!: number;
  roleId!: number;
  impliedFromroleId?: number;
  settings!: object;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  role!: Role;
  schemaName?: string;
  tableName?: string;
  userEmail?: string;
  userFirstName?: string;
  userLastName?: string;

  public static parseResult(data: QueryResult | null): Array<TableUser> {
    if (!data) throw new Error("TableUser.parseResult: input is null");
    const tableUsers = Array<TableUser>();
    data.rows.forEach((row: any) => {
      tableUsers.push(TableUser.parse(row));
    });
    return tableUsers;
  }

  public static parse(data: Record<string, any>): TableUser {
    if (!data) throw new Error("TableUser.parse: input is null");
    const tableUser = new TableUser();
    tableUser.tableId = parseInt(data.table_id);
    tableUser.userId = parseInt(data.user_id);
    tableUser.roleId = parseInt(data.role_id);
    if (data.implied_from_role_id) {
      tableUser.impliedFromroleId = parseInt(data.implied_from_role_id);
    }
    tableUser.settings = data.settings;
    tableUser.createdAt = data.created_at;
    tableUser.updatedAt = data.updated_at;
    if (data.schema_name) tableUser.schemaName = data.schema_name;
    if (data.table_name) tableUser.tableName = data.table_name;
    if (data.user_email) tableUser.userEmail = data.user_email;
    if (data.user_first_name) tableUser.userFirstName = data.user_first_name;
    if (data.user_last_name) tableUser.userLastName = data.user_last_name;
    if (data.role_name) {
      tableUser.role = new Role(data.role_name, "table" as RoleLevel);
      if (data.role_implied_from) {
        tableUser.role.impliedFrom = data.role_implied_from;
      }
    }
    return tableUser;
  }
}
