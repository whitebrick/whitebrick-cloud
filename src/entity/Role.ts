import { QueryResult } from "pg";
import { Column } from "./Column";

/**
 * SCHEMA
 * - If a schema is owned by an organization
 *   - All administrators of the organization have implicit admin access
 *   - There are no exceptions
 * - If a schema is owned by a user, the user has implicit admin access
 *   - Additional users can be granted admin access explicitly
 */

export type RoleLevel = "organization" | "schema" | "table";

export class Role {
  static SYSROLES_ORGANIZATIONS: Record<string, Record<string, string>> = {
    organization_administrator: {
      syscode: "oa",
      label: "Organization Administrator",
    },
    organization_user: { syscode: "ou", label: "Organization User" },
    organization_external_user: {
      syscode: "oe",
      label: "Organization External User",
    },
  };

  static SYSROLES_SCHEMAS: Record<string, Record<string, string>> = {
    schema_owner: { syscode: "so", label: "DB Owner" },
    schema_administrator: { syscode: "sa", label: "DB Administrator" },
    schema_manager: { syscode: "sm", label: "DB Manager" },
    schema_editor: { syscode: "se", label: "DB Editor" },
    schema_reader: { syscode: "sr", label: "DB Reader" },
  };

  static SYSROLES_TABLES: Record<string, Record<string, string>> = {
    table_inherit: { syscode: "ti", label: "Inherit Table Role From DB" },
    table_administrator: { syscode: "ta", label: "Table Administrator" },
    table_manager: { syscode: "tm", label: "Table Manager" },
    table_editor: { syscode: "te", label: "Table Editor" },
    table_reader: { syscode: "tr", label: "Table Reader" },
  };

  id!: number;
  name!: string;
  syscode: string | undefined;
  label!: string;
  createdAt!: Date;
  updatedAt!: Date;
  // not persisted
  schemaId?: number;
  schemaName?: string;
  tableId?: number;
  tableName?: string;

  public static isRole(roleName: string): boolean {
    return (
      Object.keys(Role.SYSROLES_ORGANIZATIONS).includes(roleName) ||
      Object.keys(Role.SYSROLES_SCHEMAS).includes(roleName) ||
      Object.keys(Role.SYSROLES_TABLES).includes(roleName)
    );
  }

  public static areRoles(roleNames: string[]): boolean {
    for (const roleName of roleNames) {
      if (!Role.isRole(roleName)) return false;
    }
    return true;
  }

  public static parseResult(data: QueryResult | null): Array<Role> {
    if (!data) throw new Error("Role.parseResult: input is null");
    const roles = Array<Role>();
    data.rows.forEach((row: any) => {
      roles.push(Role.parse(row));
    });
    return roles;
  }

  public static parse(data: Record<string, any>): Role {
    if (!data) throw new Error("Role.parse: input is null");
    const role = new Role();
    role.id = data.id;
    role.name = data.name;
    if (data.syscode) role.syscode = data.syscode;
    role.label = data.label;
    role.createdAt = data.created_at;
    role.updatedAt = data.updated_at;
    if (data.schemaId) role.schemaId = data.schemaId;
    if (data.schemaName) role.schemaName = data.schemaName;
    if (data.tableId) role.tableId = data.tableId;
    if (data.tableName) role.tableName = data.tableName;
    return role;
  }
}
