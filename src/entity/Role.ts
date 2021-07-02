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

  static SYSROLES_SCHEMAS: Record<string, Record<string, any>> = {
    schema_owner: { label: "DB Owner" },
    schema_administrator: { label: "DB Administrator" },
    schema_manager: { label: "DB Manager" },
    schema_editor: { label: "DB Editor" },
    schema_reader: { label: "DB Reader" },
  };

  static SYSROLES_TABLES: Record<string, Record<string, any>> = {
    table_administrator: {
      label: "Table Administrator",
      permissionPrefixes: ["s", "i", "u", "d"],
    },
    table_manager: {
      label: "Table Manager",
      permissionPrefixes: ["s", "i", "u", "d"],
    },
    table_editor: {
      label: "Table Editor",
      permissionPrefixes: ["s", "i", "u", "d"],
    },
    table_reader: {
      label: "Table Reader",
      permissionPrefixes: ["s"],
    },
  };

  static SCHEMA_TO_TABLE_ROLE_MAP: Record<string, string> = {
    schema_owner: "table_administrator",
    schema_administrator: "table_administrator",
    schema_manager: "table_manager",
    schema_editor: "table_editor",
    schema_reader: "table_reader",
  };

  static ORGANIZATION_TO_SCHEMA_ROLE_MAP: Record<string, string> = {
    organization_administrator: "schema_administrator",
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

  public static isRole(roleName: string, roleLevel?: RoleLevel): boolean {
    switch (roleLevel) {
      case "organization":
        return Object.keys(Role.SYSROLES_ORGANIZATIONS).includes(roleName);
      case "schema":
        return Object.keys(Role.SYSROLES_SCHEMAS).includes(roleName);
      case "table":
        return Object.keys(Role.SYSROLES_TABLES).includes(roleName);
      default:
        return (
          Object.keys(Role.SYSROLES_ORGANIZATIONS).includes(roleName) ||
          Object.keys(Role.SYSROLES_SCHEMAS).includes(roleName) ||
          Object.keys(Role.SYSROLES_TABLES).includes(roleName)
        );
    }
  }

  public static areRoles(roleNames: string[]): boolean {
    for (const roleName of roleNames) {
      if (!Role.isRole(roleName)) return false;
    }
    return true;
  }

  // eg {
  // permissionKey: s1234, type: "select"
  // permissionKey: i1234, type: "insert"
  // permissionKey: u1234, type: "update"
  // permissionKey: d1234, type: "delete"
  // }
  public static tablePermissionKeysAndTypes(
    tableId: number
  ): Record<string, string>[] {
    const PERMISSION_PREFIXES_TYPES: Record<string, string> = {
      s: "select",
      i: "insert",
      u: "update",
      d: "delete",
    };
    const permissionKeysAndTypes: Record<string, string>[] = [];
    for (const prefix of Object.keys(PERMISSION_PREFIXES_TYPES)) {
      permissionKeysAndTypes.push({
        permissionKey: Role.tablePermissionKey(prefix, tableId),
        type: PERMISSION_PREFIXES_TYPES[prefix],
      });
    }
    return permissionKeysAndTypes;
  }

  public static tablePermissionKey(
    permissionPrefix: string,
    tableId: number
  ): string {
    return `${permissionPrefix}${tableId}`;
  }

  // Used to generate the Hasura table permission
  public static hasuraTablePermissionChecksAndTypes(
    tableId: number
  ): Record<string, any>[] {
    const hasuraPermissionsAndTypes: Record<string, any>[] = [];
    for (const permissionKeysAndType of Role.tablePermissionKeysAndTypes(
      tableId
    )) {
      hasuraPermissionsAndTypes.push({
        permissionCheck: {
          _exists: {
            _table: { schema: "wb", name: "table_permissions" },
            _where: {
              _and: [
                {
                  table_permission_key: {
                    _eq: permissionKeysAndType.permissionKey,
                  },
                },
                { user_id: { _eq: "X-Hasura-User-Id" } },
              ],
            },
          },
        },
        permissionType: permissionKeysAndType.type,
      });
    }
    return hasuraPermissionsAndTypes;
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
