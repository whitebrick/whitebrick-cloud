import { QueryResult } from "pg";
import { DEFAULT_POLICY } from "../policy";
import { log } from "../whitebrick-cloud";

/**
 * SCHEMA
 * - If a schema is owned by an organization
 *   - All administrators of the organization have implicit admin access
 * - If a schema is owned by a user, the user has implicit admin access
 *   - Additional users can be granted admin access explicitly
 */

export type RoleLevel = "organization" | "schema" | "table";

export type UserActionPermission = {
  roleLevel: RoleLevel;
  userAction: string;
  objectKey?: string;
  objectId: number;
  checkedForRoleName?: string;
  permitted: boolean;
  description: string;
  checkedAt?: Date;
};

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
    schema_administrator: {
      label: "DB Administrator",
      impliedFrom: ["organization_administrator"],
    },
    schema_manager: { label: "DB Manager" },
    schema_editor: { label: "DB Editor" },
    schema_reader: { label: "DB Reader" },
  };

  static SYSROLES_TABLES: Record<string, Record<string, any>> = {
    table_administrator: {
      label: "Table Administrator",
      impliedFrom: ["schema_owner", "schema_administrator"],
    },
    table_manager: {
      label: "Table Manager",
      impliedFrom: ["schema_manager"],
    },
    table_editor: {
      label: "Table Editor",
      impliedFrom: ["schema_editor"],
    },
    table_reader: {
      label: "Table Reader",
      impliedFrom: ["schema_reader"],
    },
  };

  static sysRoleMap(from: RoleLevel, to: RoleLevel) {
    let toRoleDefinitions: Record<string, Record<string, any>> = {};
    let map: Record<string, string> = {};
    switch (to) {
      case "table" as RoleLevel:
        toRoleDefinitions = Role.SYSROLES_TABLES;
        break;
      case "schema" as RoleLevel:
        toRoleDefinitions = Role.SYSROLES_SCHEMAS;
        break;
    }
    for (const toRoleName of Object.keys(toRoleDefinitions)) {
      if (toRoleDefinitions[toRoleName].impliedFrom) {
        for (const fromRoleName of toRoleDefinitions[toRoleName].impliedFrom) {
          map[fromRoleName] = toRoleName;
        }
      }
    }
    return map;
  }

  static HASURA_PREFIXES_ACTIONS: Record<string, string> = {
    s: "select",
    i: "insert",
    u: "update",
    d: "delete",
  };

  id?: number;
  name!: string;
  label?: string;
  createdAt?: Date;
  updatedAt?: Date;
  // not persisted
  impliedFrom?: String;
  permissions?: Record<string, boolean>;

  constructor(name: string, roleLevel?: RoleLevel) {
    this.name = name;
    this.permissions = Role.getPermissions(
      DEFAULT_POLICY,
      this.name,
      roleLevel
    );
  }

  public static getPermissions(
    policy: Record<string, Record<string, any>>,
    roleName: string,
    roleLevel?: RoleLevel
  ) {
    const permissions: Record<string, boolean> = {};
    for (const userAction of Object.keys(policy)) {
      if (
        roleLevel &&
        (policy[userAction].roleLevel as RoleLevel) != roleLevel
      ) {
        continue;
      }
      permissions[userAction] =
        policy[userAction].permittedRoles.includes(roleName);
    }
    return permissions;
  }

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

  public static tablePermissionPrefixes(roleName: string) {
    let actions: string[] = [];
    let prefixes: string[] = [];
    if (
      DEFAULT_POLICY["read_and_write_table_records"].permittedRoles.includes(
        roleName
      )
    ) {
      actions = DEFAULT_POLICY["read_and_write_table_records"].hasuraActions;
    } else if (
      DEFAULT_POLICY["read_table_records"].permittedRoles.includes(roleName)
    ) {
      actions = DEFAULT_POLICY["read_table_records"].hasuraActions;
    }
    for (const action of actions) {
      const prefix = Object.keys(Role.HASURA_PREFIXES_ACTIONS).find(
        (key) => Role.HASURA_PREFIXES_ACTIONS[key] === action
      );
      if (prefix) prefixes.push(prefix);
    }
    return prefixes;
  }

  // eg [{ permissionKey: s1234, action: "select"},
  // { permissionKey: i1234, action: "insert"}...
  public static tablePermissionKeysAndActions(
    tableId: number
  ): Record<string, string>[] {
    const permissionKeysAndActions: Record<string, string>[] = [];
    for (const prefix of Object.keys(Role.HASURA_PREFIXES_ACTIONS)) {
      permissionKeysAndActions.push({
        permissionKey: Role.tablePermissionKey(prefix, tableId),
        action: Role.HASURA_PREFIXES_ACTIONS[prefix],
      });
    }
    return permissionKeysAndActions;
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
    const hasuraPermissionsAndActions: Record<string, any>[] = [];
    for (const permissionKeysAndAction of Role.tablePermissionKeysAndActions(
      tableId
    )) {
      hasuraPermissionsAndActions.push({
        permissionCheck: {
          _exists: {
            _table: { schema: "wb", name: "table_permissions" },
            _where: {
              _and: [
                {
                  table_permission_key: {
                    _eq: permissionKeysAndAction.permissionKey,
                  },
                },
                { user_id: { _eq: "X-Hasura-User-Id" } },
              ],
            },
          },
        },
        permissionType: permissionKeysAndAction.action,
      });
    }
    return hasuraPermissionsAndActions;
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
    const role = new Role(data.name);
    role.id = parseInt(data.id);
    role.name = data.name;
    role.label = data.label;
    role.createdAt = data.created_at;
    role.updatedAt = data.updated_at;
    return role;
  }
}
