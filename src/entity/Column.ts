import { QueryResult } from "pg";
import { ConstraintId, ServiceResult } from "../types";

export class Column {
  static COMMON_TYPES: Record<string, string> = {
    Text: "text",
    Number: "integer",
    Decimal: "decimal",
    Boolean: "boolean",
    Date: "date",
    "Date & Time": "timestamp",
  };

  id!: number;
  tableId!: number;
  name!: string;
  label!: string;
  type!: string;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  isPrimaryKey!: boolean;
  foreignKeys!: [ConstraintId];
  referencedBy!: [ConstraintId];

  public static parseResult(data: QueryResult | null): Array<Column> {
    if (!data) throw new Error("Column.parseResult: input is null");
    const columns = Array<Column>();
    data.rows.forEach((row: any) => {
      columns.push(Column.parse(row));
    });
    return columns;
  }

  public static parse(data: Record<string, any>): Column {
    if (!data) throw new Error("Column.parse: input is null");
    const column = new Column();
    column.id = parseInt(data.id);
    column.tableId = parseInt(data.table_id);
    column.name = data.name;
    column.label = data.label;
    column.type = data.type;
    column.createdAt = data.created_at;
    column.updatedAt = data.updated_at;
    return column;
  }
}
