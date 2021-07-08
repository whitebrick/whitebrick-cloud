import { QueryResult } from "pg";
import { Column } from ".";

export class Table {
  id!: number;
  schemaId!: number;
  name!: string;
  label!: string;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  columns!: [Column];
  schemaName?: string;
  userRole?: string;
  userRoleImpliedFrom?: string;
  settings?: object;

  public static parseResult(data: QueryResult | null): Array<Table> {
    if (!data) throw new Error("Table.parseResult: input is null");
    const tables = Array<Table>();
    data.rows.forEach((row: any) => {
      tables.push(Table.parse(row));
    });
    return tables;
  }

  public static parse(data: Record<string, any>): Table {
    if (!data) throw new Error("Table.parse: input is null");
    const table = new Table();
    table.id = data.id;
    table.schemaId = data.schema_id;
    table.name = data.name;
    table.label = data.label;
    table.createdAt = data.created_at;
    table.updatedAt = data.updated_at;
    if (data.schema_name) table.schemaName = data.schema_name;
    if (data.user_role) table.userRole = data.user_role;
    if (data.user_role_implied_from) {
      table.userRoleImpliedFrom = data.user_role_implied_from;
    }
    if (data.settings) table.settings = data.settings;
    return table;
  }
}
