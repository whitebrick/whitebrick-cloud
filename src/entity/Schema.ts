import { QueryResult } from "pg";
import { Role, RoleLevel } from ".";

export class Schema {
  static WB_SYS_SCHEMA_ID: number = 1;
  static SYS_SCHEMA_NAMES: string[] = [
    "public",
    "information_schema",
    "hdb_catalog",
    "wb",
  ];

  id!: number;
  name!: string;
  label!: string;
  organizationOwnerId?: number;
  userOwnerId?: number;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  role?: Role;
  organizationOwnerName?: string;
  userOwnerEmail?: string;
  settings?: object;

  public static parseResult(data: QueryResult | null): Array<Schema> {
    if (!data) throw new Error("Schema.parseResult: input is null");
    const schemas = Array<Schema>();
    data.rows.forEach((row: any) => {
      schemas.push(Schema.parse(row));
    });
    return schemas;
  }

  public static parse(data: Record<string, any>): Schema {
    if (!data) throw new Error("Schema.parse: input is null");
    const schema = new Schema();
    schema.id = parseInt(data.id);
    schema.name = data.name;
    schema.label = data.label;
    schema.organizationOwnerId = data.organization_owner_id;
    schema.userOwnerId = data.user_owner_id;
    schema.createdAt = data.created_at;
    schema.updatedAt = data.updated_at;
    if (data.organization_owner_name) {
      schema.organizationOwnerName = data.organization_owner_name;
    }
    if (data.user_owner_email) schema.userOwnerEmail = data.user_owner_email;
    if (data.settings) schema.settings = data.settings;
    if (data.role_name) {
      schema.role = new Role(data.role_name, "schema" as RoleLevel);
      if (data.role_implied_from) {
        schema.role.impliedFrom = data.role_implied_from;
      }
    }
    return schema;
  }
}
