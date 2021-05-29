# whitebrick-cloud test data

## tenants

- A tenant is a group of users in the same organization/company
- There is 1 test tenant: `name=test_donnas-media` `label="Donna's Media"`
- `test_donnas-media` has the following users and roles
  | user | tenant_users role |
  | ----- | ---- |
  | test_donna@test.whitebrick.com | tenant_admin
  | test_debbie@test.whitebrick.com | tenant_user
  | test_daisy@test.whitebrick.com | tenant_user

## users

- Users can be associated with zero, one or multiple tenants (eg Nick North below is not associated with any tenants)
- There are 4 test users
  | email | firstName | lastName | tenants |
  | ----- | --------- | -------- | ------- |
  | test_donna@test.whitebrick.com | Donna | Donna | Donnas Media
  | test_debbie@test.whitebrick.com | Debbie | Debbie | Donnas Media
  | test_daisy@test.whitebrick.com | Daisy | Daisy | Donnas Media
  | test_nick_north@test.whitebrick.com | Nick | North |

## schemas

- A schema is presented to the user as a separate isolated database
- A schema must be owned by either a tenant or a user
- There are 3 test schemas
  | schema | name | owner |
  | ------ | ---- | ----- |
  | `test_donnasdvd` | Donnas DVD DB | tenant: `test_donnas-media`
  | `test_chinook` | Chinook Music DB | tenant: `test_donnas-media`
  | `test_northwind` | Northwind Supplies DB | user: `test_nick_north@test.whitebrick.com`

## roles

- A role is a defined set of access controls - TBA
  | name | label |
  | ---- | ----- |
  |tenant_user | Organization User
  |tenant_admin | Organization Admin
  |schema_owner | DB Owner
  |schema_administrator | DB Administrator
  |schema_editor | DB Editor
  |schema_commenter | DB Commenter
  |schema_reader | DB Reader

## schema_users

- If an individual user is the owner of a schema they have the role `schema_owner`
- All other user's roles are defined in schema_users
  | user | schema access |
  | ---- | --------- |
  | test_donna@test.whitebrick.com | `schema_administrator:test_chinook`, `schema_administrator:test_donnasdvd`
  | test_debbie@test.whitebrick.com | `schema_editor:test_donnasdvd`, `schema_reader:test_chinook`, `schema_reader:test_northwind`
  | test_daisy@test.whitebrick.com | `schema_editor:test_chinook`, `schema_reader:test_donnasdvd`
  | test_nick_north@test.whitebrick.com | `schema_owner:test_northwind`

---

![whitebrick-cloud DB ERD](../doc/whitebrick-db-erd.png)
