import { QueryResult } from "pg";
import { RoleName } from "./Role";

export class Schema {
  id!: number;
  name!: string;
  label!: string;
  tenantOwnerId: number | null | undefined;
  userOwnerId: number | null | undefined;
  createdAt!: Date;
  updatedAt!: Date;
  userRole: RoleName | null | undefined;

  public static parseResult(data: QueryResult | null): Array<Schema> {
    if (!data) throw new Error("Schema.parseResult: input is null");
    const schemas = Array<Schema>();
    data.rows.forEach((row: any) => {
      schemas.push(Schema.parse(row));
    });
    return schemas;
  }

  public static parse(data: any): Schema {
    if (!data) throw new Error("Schema.parse: input is null");
    const schema = new Schema();
    schema.id = data.id;
    schema.name = data.name;
    schema.label = data.label;
    schema.tenantOwnerId = data.tenantOwnerId;
    schema.userOwnerId = data.userOwnerId;
    schema.createdAt = data.created_at;
    schema.updatedAt = data.updated_at;
    return schema;
  }
}
