import { ApolloServer, ApolloError } from "apollo-server-lambda";
import { Logger } from "tslog";
import { DAL } from "./dal";
import { hasuraApi } from "./hasura-api";
import { ConstraintId, schema, ServiceResult } from "./types";
import v = require("voca");
import { Column, Schema } from "./entity";
import { isThisTypeNode } from "typescript";

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

  public err(result: ServiceResult): Error {
    if (result.success) {
      return new Error(
        "WhitebrickCloud.err: result is not an error (success==true)"
      );
    }
    let apolloError = "INTERNAL_SERVER_ERROR";
    if (result.apolloError) apolloError = result.apolloError;
    return new ApolloError(result.message, apolloError, {
      ref: result.code,
    });
  }

  public addSchemaContext(schema: Schema): Schema {
    schema.context = {
      defaultColumnTypes: Column.COMMON_TYPES,
    };
    return schema;
  }

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
    tenantOwnerId?: number,
    tenantOwnerName?: string,
    userOwnerId?: number,
    userOwnerEmail?: string
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
    const schemaOwnerResult = await this.schemasByUserOwner(userEmail);
    if (!schemaOwnerResult.success) return schemaOwnerResult;
    const userRolesResult = await this.dal.schemasByUser(userEmail);
    if (!userRolesResult.success) return userRolesResult;
    const schemas: Schema[] = [];
    for (const schema of schemaOwnerResult.payload.concat(
      userRolesResult.payload
    )) {
      schemas.push(this.addSchemaContext(schema));
    }
    return {
      success: true,
      payload: schemas,
    };
  }

  /**
   * Tables
   * TBD: validate name ~ [a-z]{1}[_a-z0-9]{2,}
   */

  public async tables(schemaName: string): Promise<ServiceResult> {
    const result = await this.dal.tables(schemaName);
    if (!result.success) return result;
    for (const table of result.payload) {
      const columnsResult = await this.columns(schemaName, table.name);
      if (!columnsResult.success) return columnsResult;
      table.columns = columnsResult.payload;
    }
    return result;
  }

  public async columns(
    schemaName: string,
    tableName: string
  ): Promise<ServiceResult> {
    let result = await this.dal.primaryKeys(schemaName, tableName);
    if (!result.success) return result;
    const pKColsConstraints: Record<string, string> = result.payload;
    const pKColumnNames: string[] = Object.keys(pKColsConstraints);
    result = await this.dal.columns(schemaName, tableName);
    if (!result.success) return result;
    for (const column of result.payload) {
      column.isPrimaryKey = pKColumnNames.includes(column.name);
      const foreignKeysResult = await this.dal.foreignKeysOrReferences(
        schemaName,
        tableName,
        column.name,
        "FOREIGN_KEYS"
      );
      if (!foreignKeysResult.success) return result;
      column.foreignKeys = foreignKeysResult.payload;
      const referencesResult = await this.dal.foreignKeysOrReferences(
        schemaName,
        tableName,
        column.name,
        "REFERENCES"
      );
      if (!referencesResult.success) return result;
      column.referencedBy = referencesResult.payload;
    }
    return result;
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
      result = await this.tables(schemaName);
      if (!result.success) return result;
      const existingTableNames = result.payload.map(
        (table: { name: string }) => table.name
      );
      if (existingTableNames.includes(newTableName)) {
        return {
          success: false,
          message: "The new table name must be unique",
          code: "WB_TABLE_NAME_EXISTS",
          apolloError: "BAD_USER_INPUT",
        };
      }
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

  public async addAllExistingRelationships(
    schemaName: string
  ): Promise<ServiceResult> {
    log.warn("********** All existing relationships:");
    let result = await this.dal.foreignKeysOrReferences(
      schemaName,
      "%",
      "%",
      "ALL"
    );
    if (!result.success) return result;
    const relationships: ConstraintId[] = result.payload;
    if (relationships.length > 0) {
      for (const relationship of relationships) {
        log.warn(JSON.stringify(relationship));
        // TBD: Call addOrCreateForeignKey with the correct table/parentTable col/parentCol combinations
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
    let result = await this.dal.addOrCreateColumn(
      schemaName,
      tableName,
      columnName,
      columnLabel,
      create,
      columnType
    );
    if (!result.success) return result;
    if (create) {
      result = await hasuraApi.untrackTable(schemaName, tableName);
      if (!result.success) return result;
      result = await hasuraApi.trackTable(schemaName, tableName);
    }
    return result;
  }

  // Pass empty columnNames[] to clear
  public async createOrDeletePrimaryKey(
    schemaName: string,
    tableName: string,
    columnNames: string[],
    del?: boolean
  ): Promise<ServiceResult> {
    if (!del) del = false;
    let result = await this.dal.primaryKeys(schemaName, tableName);
    if (!result.success) return result;
    const existingConstraintNames = Object.values(result.payload);
    if (del) {
      if (existingConstraintNames.length > 0) {
        // multiple coulmn primary keys will all have same constraint name
        result = await this.dal.deleteConstraint(
          schemaName,
          tableName,
          existingConstraintNames[0] as string
        );
      }
    } else {
      if (existingConstraintNames.length > 0) {
        return {
          success: false,
          message: "Remove existing primary key first",
          code: "WB_PK_EXISTS",
          apolloError: "BAD_USER_INPUT",
        };
      }
      result = await hasuraApi.untrackTable(schemaName, tableName);
      if (!result.success) return result;
      result = await this.dal.createPrimaryKey(
        schemaName,
        tableName,
        columnNames
      );
      if (!result.success) return result;
      result = await hasuraApi.trackTable(schemaName, tableName);
    }
    return result;
  }

  public async addOrCreateForeignKey(
    schemaName: string,
    tableName: string,
    columnNames: string[],
    parentTableName: string,
    parentColumnNames: string[],
    create?: boolean
  ): Promise<ServiceResult> {
    let operation: string = "CREATE";
    if (!create) operation = "ADD";
    return await this.setForeignKey(
      schemaName,
      tableName,
      columnNames,
      parentTableName,
      parentColumnNames,
      operation
    );
  }

  public async removeOrDeleteForeignKey(
    schemaName: string,
    tableName: string,
    columnNames: string[],
    parentTableName: string,
    del?: boolean
  ): Promise<ServiceResult> {
    let operation: string = "DELETE";
    if (!del) operation = "REMOVE";
    return await this.setForeignKey(
      schemaName,
      tableName,
      columnNames,
      parentTableName,
      [],
      operation
    );
  }

  // operation = "ADD|CREATE|REMOVE|DELETE"
  public async setForeignKey(
    schemaName: string,
    tableName: string,
    columnNames: string[],
    parentTableName: string,
    parentColumnNames: string[],
    operation: string
  ): Promise<ServiceResult> {
    let result = await this.dal.foreignKeysOrReferences(
      schemaName,
      tableName,
      columnNames[0],
      "FOREIGN_KEYS"
    );
    if (!result.success) return result;
    const existingForeignKeys: Record<string, string> = {};
    for (const constraintId of result.payload) {
      existingForeignKeys[constraintId.columnName] =
        constraintId.constraintName;
    }
    // Check for existing foreign keys
    for (const columnName of columnNames) {
      if (Object.keys(existingForeignKeys).includes(columnName)) {
        if (operation == "REMOVE" || operation == "DELETE") {
          result = await hasuraApi.dropRelationships(
            schemaName,
            tableName,
            parentTableName
          );
          if (result.success && operation == "DELETE") {
            result = await this.dal.deleteConstraint(
              schemaName,
              tableName,
              existingForeignKeys[columnName] as string
            );
          }
          return result;
        } else {
          return {
            success: false,
            message: `Remove existing foreign key on ${columnName} first`,
            code: "WB_FK_EXISTS",
            apolloError: "BAD_USER_INPUT",
          };
        }
      }
    }
    if (operation == "ADD" || operation == "CREATE") {
      // result = await hasuraApi.untrackTable(schemaName, tableName);
      // if (!result.success) return result;
      if (operation == "CREATE") {
        result = await this.dal.createForeignKey(
          schemaName,
          tableName,
          columnNames,
          parentTableName,
          parentColumnNames
        );
        if (!result.success) return result;
      }
      result = await hasuraApi.createObjectRelationship(
        schemaName,
        tableName, // posts
        columnNames[0], // author_id
        parentTableName // authors
      );
      if (!result.success) return result;
      result = await hasuraApi.createArrayRelationship(
        schemaName,
        parentTableName, // authors
        tableName, // posts
        columnNames // author_id
      );
      if (!result.success) return result;
    }
    return result;
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
    const tableResult = await this.dal.tableBySchemaTable(
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
}
