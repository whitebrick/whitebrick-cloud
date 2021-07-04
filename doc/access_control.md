# Access Control

Whitebrick uses a simple Role-based access control (RBAC) model but currently only supports default/preset Roles. Custom Roles are on the roadmap.

## Role Levels

Every Role has one single corresponding level from the list below. The Role name is prefixed with the role level eg. `table_manager`

- Organization
- Schema (Database)
- Table
- TBD: Column (See Roadmap)

# Organizations

- An organization is a group of Users, each with the Role `organization_administrator`, `organization_user`, `organization_external_user`.
- Only an `organization_administrator` can add, remove, promote or demote Users from an Organization.
- A Schema can be owned by either an individual User or an Organization.
- If a Schema is owned by an Organization, all Users with the Role `organization_administrator` are implicitly assigned the `schema_administrator` Role as well (see below).
- Regular Users in the Organization with the role `organization_user` or `organization_external_user` are **not** implicitly assigned any access to Schemas owned by the Organization.
- An Organization must always have at least one user with the `organization_administrator` Role.

# Schemas

- If a Schema is owned by an individual User, the User is assigned the `schema_owner` Role for that Schema.
- If a Schema is owned by an Organization, Roles are assigned as described above.
- TBD: Schema ownership can be changed

# Tables

- Table Roles are typically implied from Schema Roles (see below).
- Table Roles can be explicitly assigned to Users with no associated Schema or Organization roles. For example, a User can be explicitly assigned access to just one table of a Schema.

## Implicit Assignment

- The assignment or removal of a User to a Role can automatically imply additional assignment or removal of Roles. For example, assigning a User the `schema_manager` Role implicitly assigns `table_manager` Roles for all of the tables within the schema.
- Explicit assignment always takes precedence over implicit assignment. In the example above, if the User had already been explicitly assigned the `table_administrator` for `TableA`, then that Role will remain unaffected for `TableA` and the User will be granted `table_manager` for all other tables.

### `organization_administrator`

- When assigning the `organization_administrator` Role to a User for an Organization, the Roles below are implicitly assigned to the User.
- When demoting a User to `organization_user` or removing the User from the Organization, the Roles below are implicitly removed from the User.

1. `schema_administrator` for all Schemas **owned** by the corresponding organization
   - Any existing implicit Roles for the Schemas in are updated
   - Any existing explicit Roles for the Schemas in remain unchanged
2. `table_administrator` for all the Tables within the Schema in (1) above
   - Any existing implicit Roles for the Tables are updated
   - Any existing explicit Roles for the Tables remain unchanged

### `organization_user`, `organization_external_user`

- No implicit assignment for this Role.

### `schema_owner`

- A `schema_owner` is an alias for `schema_administrator` for the purpose of implicit assignment.

### `schema_administrator`, `schema_manager`, `schema_editor`, `schema_reader`

- When assigning any of the `schema_<role>` Roles to a User for an Schema, the Roles below are implicitly assigned to the User.
- When removing the User from the Schema, the Roles below are implicitly removed from the User.

1. `table_<role>` for all Tables within the Schema
   - Any existing implicit Roles for the Tables within the Schema are updated
   - Any existing explicit Roles for the Tables within the Schema remain unchanged

### `table_administrator`, `table_manager`, `table_editor`, `table_reader`

- No implicit assignment for these Roles.

## Data Operations

| Table Role            | Select | Insert | Update | Delete |
| --------------------- | ------ | ------ | ------ | ------ |
| `table_administrator` | [x]    | [x]    | [x]    | [x]    |
| `table_manager`       | [x]    | [x]    | [x]    | [x]    |
| `table_editor`        | [x]    | [x]    | [x]    | [x]    |
| `table_reader`        | [x]    | [ ]    | [ ]    | [ ]    |

## DDL Operations

TBD
