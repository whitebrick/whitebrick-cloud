import { QueryResult } from "pg";
import { Column, Role, RoleLevel } from ".";

export class Table {
  id!: number;
  schemaId!: number;
  name!: string;
  label!: string;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  role?: Role;
  columns!: [Column];
  schemaName?: string;
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
    if (data.settings) table.settings = data.settings;
    if (data.role_name) {
      table.role = new Role(data.role_name, "table" as RoleLevel);
      if (data.role_implied_from) {
        table.role.impliedFrom = data.role_implied_from;
      }
    }
    return table;
  }
}
