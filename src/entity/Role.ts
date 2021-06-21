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
      label: "Organization Administrator",
    },
    organization_user: { label: "Organization User" },
    organization_external_user: {
      label: "Organization External User",
    },
  };

  static SYSROLES_SCHEMAS: Record<string, Record<string, string>> = {
    schema_owner: { label: "DB Owner" },
    schema_administrator: { label: "DB Administrator" },
    schema_manager: { label: "DB Manager" },
    schema_editor: { label: "DB Editor" },
    schema_reader: { label: "DB Reader" },
  };

  static SYSROLES_TABLES: Record<string, Record<string, string>> = {
    table_inherit: { label: "Inherit Table Role From DB" },
    table_administrator: { label: "Table Administrator" },
    table_manager: { label: "Table Manager" },
    table_editor: { label: "Table Editor" },
    table_reader: { label: "Table Reader" },
  };

  id!: number;
  name!: string;
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

  public static defaultTablePermissionRoles(
    tableId: number
  ): Record<string, string>[] {
    const readOnlyRole: string = `ro${tableId}`;
    const readWriteRole: string = `rw${tableId}`;
    return [
      { role: readOnlyRole, type: "select" } as Record<string, string>,
      { role: readWriteRole, type: "select" } as Record<string, string>,
      { role: readWriteRole, type: "insert" } as Record<string, string>,
      { role: readWriteRole, type: "update" } as Record<string, string>,
      { role: readWriteRole, type: "delete" } as Record<string, string>,
    ];
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
