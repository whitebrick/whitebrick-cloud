import { QueryResult } from "pg";

export class TableUser {
  tableId!: number;
  userId!: number;
  roleId!: number;
  settings!: object;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  role?: string;

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
    tableUser.tableId = data.table_id;
    tableUser.userId = data.user_id;
    tableUser.roleId = data.role_id;
    tableUser.settings = data.settings;
    tableUser.createdAt = data.created_at;
    tableUser.updatedAt = data.updated_at;
    if (data.role) tableUser.role = data.role;
    return tableUser;
  }
}
