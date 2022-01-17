import { QueryResult } from "pg";
import { ConstraintId, ServiceResult } from "../types";

export class Column {
  static COMMON_TYPES: Record<string, Record<string, any>> = {
    Text: { pgType: "text", egValue: "My Value" },
    Numeric: { pgType: "numeric", egValue: 0 },
    Decimal: { pgType: "decimal", egValue: 0.0 },
    Boolean: { pgType: "boolean", egValue: false },
    Date: { pgType: "date", egValue: "2022-01-31" },
    "Date & Time": { pgType: "timestamp", egValue: "2022-01-31 13:59:59" },
  };

  static PG_TYPE_TO_COMMON_TYPE: Record<string, string> = {
    numeric: "Numeric",
    integer: "Numeric",
    decimal: "Decimal",
    boolean: "Boolean",
    text: "Text",
    date: "Date",
  };

  id!: number;
  tableId!: number;
  name!: string;
  label!: string;
  createdAt!: Date;
  updatedAt!: Date;
  // pg data
  type!: string;
  default?: string;
  isNotNullable?: boolean;
  // not persisted
  isPrimaryKey!: boolean;
  foreignKeys!: [ConstraintId];
  referencedBy!: [ConstraintId];

  public static egValueFromPgType(pgType: string) {
    pgType = pgType.toLowerCase();
    if (!Object.keys(this.PG_TYPE_TO_COMMON_TYPE).includes(pgType)) {
      throw new Error(
        `pgType ${pgType} does not have an entry in Column.PG_TYPE_TO_COMMON_TYPE`
      );
    }
    return this.COMMON_TYPES[this.PG_TYPE_TO_COMMON_TYPE[pgType]].egValue;
  }

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
    if (data.default) column.default = data.default;
    if (data.is_nullable) column.isNotNullable = data.is_nullable === "NO";
    return column;
  }
}
