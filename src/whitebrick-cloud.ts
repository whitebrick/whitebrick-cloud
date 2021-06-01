import { ApolloServer } from "apollo-server-lambda";
import { Logger } from "tslog";
import { DAL } from "./dal";
import { hasuraApi } from "./hasura-api";
import { schema, ServiceResult } from "./types";
import v = require("voca");
import { Schema } from "./entity";

export const graphqlHandler = new ApolloServer({
  schema,
  introspection: true,
  context: function () {
    return {
      wbCloud: new WhitebrickCloud(),
    };
  },
}).createHandler();

export const log: Logger = new Logger({
  minLevel: "debug",
});

class WhitebrickCloud {
  dal = new DAL();

  /**
   * Test
   */

  public async resetTestData(): Promise<ServiceResult> {
    let result = await this.dal.schemas("test_%");
    if (!result.success) return result;
    for (const schema of result.payload) {
      result = await this.removeOrDeleteSchema(schema.name, true);
      if (!result.success) return result;
    }
    result = await this.dal.deleteTestTenants();
    if (!result.success) return result;
    result = await this.dal.deleteTestUsers();
    return result;
  }

  /**
   * Tenants
   * TBD: validate name ~ [a-z]{1}[a-z0-9]{2,}
   */

  public async tenants(): Promise<ServiceResult> {
    return this.dal.tenants();
  }

  public async tenantById(id: number): Promise<ServiceResult> {
    return this.dal.tenantById(id);
  }

  public async tenantByName(name: string): Promise<ServiceResult> {
    return this.dal.tenantByName(name);
  }

  public async createTenant(
    name: string,
    label: string
  ): Promise<ServiceResult> {
    return this.dal.createTenant(name, label);
  }

  public async updateTenant(
    id: number,
    name: string,
    label: string
  ): Promise<ServiceResult> {
    return this.dal.updateTenant(id, name, label);
  }

  public async deleteTestTenants(): Promise<ServiceResult> {
    return this.dal.deleteTestTenants();
  }

  /**
   * Tenant-User-Roles
   */

  public async addUserToTenant(
    tenantName: string,
    userEmail: string,
    tenantRole: string
  ): Promise<ServiceResult> {
    log.debug(
      `whitebrickCloud.addUserToTenant: ${tenantName}, ${userEmail}, ${tenantRole}`
    );
    const userResult = await this.dal.userByEmail(userEmail);
    if (!userResult.success) return userResult;
    const tenantResult = await this.dal.tenantByName(tenantName);
    if (!tenantResult.success) return tenantResult;
    const roleResult = await this.dal.roleByName(tenantRole);
    if (!roleResult.success) return roleResult;
    const result = await this.dal.addUserToTenant(
      tenantResult.payload.id,
      userResult.payload.id,
      roleResult.payload.id
    );
    if (!result.success) return result;
    return userResult;
  }

  /**
   * Users
   */

  public async usersByTenantId(tenantId: number): Promise<ServiceResult> {
    return this.dal.usersByTenantId(tenantId);
  }

  public async userById(id: number): Promise<ServiceResult> {
    return this.dal.userById(id);
  }

  public async userByEmail(email: string): Promise<ServiceResult> {
    return this.dal.userByEmail(email);
  }

  public async createUser(
    email: string,
    firstName: string,
    lastName: string
  ): Promise<ServiceResult> {
    // TBD: authentication, save password
    return this.dal.createUser(email, firstName, lastName);
  }

  public async updateUser(
    id: number,
    email: string,
    firstName: string,
    lastName: string
  ): Promise<ServiceResult> {
    return this.dal.updateUser(id, email, firstName, lastName);
  }

  /**
   * Roles
   */

  public async roleByName(name: string): Promise<ServiceResult> {
    return this.dal.roleByName(name);
  }

  /**
   * Schemas
   * TBD: validate name ~ [a-z]{1}[_a-z0-9]{2,}
   */

  public async createSchema(
    name: string,
    label: string,
    tenantOwnerId: number | null,
    tenantOwnerName: string | null,
    userOwnerId: number | null,
    userOwnerEmail: string | null
  ): Promise<ServiceResult> {
    log.info(`
      wbCloud.createSchema name=${name},
      label=${label},
      tenantOwnerId=${tenantOwnerId},
      tenantOwnerName=${tenantOwnerName},
      userOwnerId=${userOwnerId},
      userOwnerEmail=${userOwnerEmail}
    `);
    let result;
    if (!tenantOwnerId && !userOwnerId) {
      if (tenantOwnerName) {
        result = await this.dal.tenantByName(tenantOwnerName);
        if (!result.success) return result;
        tenantOwnerId = result.payload.id;
      } else if (userOwnerEmail) {
        result = await this.dal.userByEmail(userOwnerEmail);
        if (!result.success) return result;
        userOwnerId = result.payload.id;
      } else {
        return {
          success: false,
          message: "Owner could not be found",
        };
      }
    }
    if (name.startsWith("pg_") || Schema.SYS_SCHEMA_NAMES.includes(name)) {
      return {
        success: false,
        message: `Database name can not begin with 'pg_' or be in the reserved list: ${Schema.SYS_SCHEMA_NAMES.join(
          ", "
        )}`,
      };
    }
    return await this.dal.createSchema(name, label, tenantOwnerId, userOwnerId);
  }

  public async removeOrDeleteSchema(
    schemaName: string,
    del: boolean
  ): Promise<ServiceResult> {
    let result = await this.dal.discoverTables(schemaName);
    if (!result.success) return result;
    for (const tableName of result.payload) {
      result = await this.removeOrDeleteTable(schemaName, tableName, del);
      if (!result.success) return result;
    }
    result = await this.dal.removeAllUsersFromSchema(schemaName);
    if (!result.success) return result;
    return await this.dal.removeOrDeleteSchema(schemaName, del);
  }

  public async schemasByUserOwner(userEmail: string): Promise<ServiceResult> {
    return this.dal.schemasByUserOwner(userEmail);
  }

  /**
   * Schema-User-Roles
   */

  public async addUserToSchema(
    schemaName: string,
    userEmail: string,
    schemaRole: string
  ): Promise<ServiceResult> {
    const userResult = await this.dal.userByEmail(userEmail);
    if (!userResult.success) return userResult;
    const schemaResult = await this.dal.schemaByName(schemaName);
    if (!schemaResult.success) return schemaResult;
    const roleResult = await this.dal.roleByName(schemaRole);
    if (!roleResult.success) return roleResult;
    const result = await this.dal.addUserToSchema(
      schemaResult.payload.id,
      userResult.payload.id,
      roleResult.payload.id
    );
    if (!result.success) return result;
    return userResult;
  }

  public async accessibleSchemas(userEmail: string): Promise<ServiceResult> {
    const result = await this.schemasByUserOwner(userEmail);
    if (!result.success) return result;
    const userRolesResult = await this.dal.schemasByUser(userEmail);
    if (!userRolesResult.success) return userRolesResult;
    result.payload = result.payload.concat(userRolesResult.payload);
    return result;
  }

  /**
   * Tables
   * TBD: validate name ~ [a-z]{1}[_a-z0-9]{2,}
   */

  public async tables(schemaName: string): Promise<ServiceResult> {
    return this.dal.tables(schemaName);
  }

  public async columns(
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    return this.dal.columns(schemaName, tableName);
  }

  public async addOrCreateTable(
    schemaName: string,
    tableName: string,
    tableLabel: string,
    create?: boolean
  ): Promise<ServiceResult> {
    if (!create) create = false;
    let result = await this.dal.addOrCreateTable(
      schemaName,
      tableName,
      tableLabel,
      create
    );
    if (!result.success) return result;
    return await hasuraApi.trackTable(schemaName, tableName);
  }

  public async removeOrDeleteTable(
    schemaName: string,
    tableName: string,
    del?: boolean
  ): Promise<ServiceResult> {
    if (!del) del = false;
    // 1. untrack
    let result = await hasuraApi.untrackTable(schemaName, tableName);
    if (!result.success) return result;
    // 2. remove/delete columns
    result = await this.dal.columns(schemaName, tableName);
    if (!result.success) return result;
    const columns = result.payload;
    for (const column of columns) {
      result = await this.removeOrDeleteColumn(
        schemaName,
        tableName,
        column.name,
        del
      );
      if (!result.success) return result;
    }
    // 3. remove user settings
    result = await this.dal.removeTableUsers(schemaName, tableName);
    if (!result.success) return result;
    // 4. remove/delete the table
    return await this.dal.removeOrDeleteTable(schemaName, tableName, del);
  }

  public async removeOrDeleteColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    del?: boolean
  ): Promise<ServiceResult> {
    if (!del) del = false;
    return await this.dal.removeOrDeleteColumn(
      schemaName,
      tableName,
      columnName,
      del
    );
  }

  public async updateTable(
    schemaName: string,
    tableName: string,
    newTableName?: string,
    newTableLabel?: string
  ): Promise<ServiceResult> {
    let result: ServiceResult;
    if (newTableName) {
      result = await hasuraApi.untrackTable(schemaName, tableName);
      if (!result.success) return result;
    }
    result = await this.dal.updateTable(
      schemaName,
      tableName,
      newTableName,
      newTableLabel
    );
    if (!result.success) return result;
    if (newTableName) {
      result = await hasuraApi.trackTable(schemaName, newTableName);
      if (!result.success) return result;
    }
    return result;
  }

  public async addAllExistingTables(
    schemaName: string
  ): Promise<ServiceResult> {
    let result = await this.dal.discoverTables(schemaName);
    if (!result.success) return result;
    const tableNames = result.payload;
    for (const tableName of tableNames) {
      result = await this.addOrCreateTable(
        schemaName,
        tableName,
        v.titleCase(tableName.replaceAll("_", " ")),
        false
      );
      if (!result.success) return result;
      result = await this.dal.discoverColumns(schemaName, tableName);
      if (!result.success) return result;
      const columns = result.payload;
      for (const column of columns) {
        result = await this.addOrCreateColumn(
          schemaName,
          tableName,
          column.name,
          v.titleCase(column.name.replaceAll("_", " ")),
          false
        );
        if (!result.success) return result;
      }
    }
    return result;
  }

  public async addOrCreateColumn(
    schemaName: string,
    tableName: string,
    columnName: string,
    columnLabel: string,
    create?: boolean,
    columnType?: string
  ): Promise<ServiceResult> {
    if (!create) create = false;
    return await this.dal.addOrCreateColumn(
      schemaName,
      tableName,
      columnName,
      columnLabel,
      create,
      columnType
    );
  }

  public async tableUser(
    userEmail: string,
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    return this.dal.tableUser(userEmail, schemaName, tableName);
  }

  public async saveTableUserSettings(
    schemaName: string,
    tableName: string,
    userEmail: string,
    settings: object
  ): Promise<ServiceResult> {
    const tableResult = await this.dal.tableBySchemaNameTableName(
      schemaName,
      tableName
    );
    if (!tableResult.success) return tableResult;
    const userResult = await this.dal.userByEmail(userEmail);
    if (!userResult.success) return userResult;
    const roleResult = await this.dal.roleByName("table_inherit");
    if (!roleResult.success) return roleResult;
    return this.dal.saveTableUserSettings(
      tableResult.payload.id,
      userResult.payload.id,
      roleResult.payload.id,
      settings
    );
  }

  // TBD-SG
  // use trackAllTables as tamplate
  // public async trackTableRelationships(schemaName: string, tableName: string) {
  //  1. Get all realtionships: this.dal.tableRelationships(schemaName, tableName)
  //  2. For each relationship: infer the object relationships and the array relationships
  //  3. Create the relationship:
  //     result = await hasuraApi.trackRelationship(schemaName, tableName, objectOrArray, relationshipName, constraintTable, constraintColumn)
}
