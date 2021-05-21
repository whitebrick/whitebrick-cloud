import { ApolloServer } from "apollo-server-lambda";
import { makeExecutableSchema } from "graphql-tools";
import {
  constraintDirective,
  constraintDirectiveTypeDefs,
} from "graphql-constraint-directive";
import { resolvers } from "./resolvers";
import { typeDefs } from "./type-defs";
import { Logger } from "tslog";
import { DAL } from "./dal";
import { hasuraApi } from "./hasura-api";
import { Schema } from "./entity/Schema";
import { RoleName } from "./entity/Role";

const schema = makeExecutableSchema({
  resolvers,
  typeDefs: [constraintDirectiveTypeDefs, typeDefs],
  schemaTransforms: [constraintDirective()],
});

export const graphqlHandler = new ApolloServer({
  schema,
  introspection: true,
  context: function () {
    return {
      wbCloud: new WhitebrickCloud(),
    };
  },
}).createHandler();

// Couldn't get this working (https://www.apollographql.com/blog/graphql-validation-using-directives-4908fd5c1055/)
// const ConstraintDirective = require("graphql-constraint-directive");

// export const schema = makeExecutableSchema({
//   typeDefs,
//   schemaDirectives: { constraint: ConstraintDirective },
// });

export const log: Logger = new Logger({
  minLevel: "debug",
});

class WhitebrickCloud {
  dal = new DAL();

  /**
   * Test
   */

  public async resetTestData() {
    let result = await this.dal.schemas("test_%");
    if (!result.success) return result;
    for (const schema of result.payload) {
      result = await this.deleteSchema(schema.name);
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

  public async tenants() {
    return this.dal.tenants();
  }

  public async tenantById(id: number) {
    return this.dal.tenantById(id);
  }

  public async tenantByName(name: string) {
    return this.dal.tenantByName(name);
  }

  public async createTenant(name: string, label: string) {
    return this.dal.createTenant(name, label);
  }

  public async updateTenant(id: number, name: string, label: string) {
    return this.dal.updateTenant(id, name, label);
  }

  public async deleteTestTenants() {
    return this.dal.deleteTestTenants();
  }

  /**
   * Tenant-User-Roles
   */

  public async addUserToTenant(
    tenantName: string,
    userEmail: string,
    tenantRole: string
  ) {
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

  public async usersByTenantId(tenantId: number) {
    return this.dal.usersByTenantId(tenantId);
  }

  public async userById(id: number) {
    return this.dal.userById(id);
  }

  public async userByEmail(email: string) {
    return this.dal.userByEmail(email);
  }

  public async createUser(email: string, firstName: string, lastName: string) {
    // TBD: authentication, save password
    return this.dal.createUser(email, firstName, lastName);
  }

  public async updateUser(
    id: number,
    email: string,
    firstName: string,
    lastName: string
  ) {
    return this.dal.updateUser(id, email, firstName, lastName);
  }

  /**
   * Roles
   */

  public async roleByName(name: string) {
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
  ) {
    log.info(
      `wbCloud.createSchema name=${name}, label=${label}, tenantOwnerId=${tenantOwnerId}, tenantOwnerName=${tenantOwnerName}, userOwnerId=${userOwnerId}, userOwnerEmail=${userOwnerEmail}`
    );
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
    return await this.dal.createSchema(name, label, tenantOwnerId, userOwnerId);
  }

  public async deleteSchema(schemaName: string) {
    let result = await this.schemaTableNames(schemaName);
    if (!result.success) return result;
    for (const tableName of result.payload) {
      result = await this.deleteTable(schemaName, tableName);
      if (!result.success) return result;
    }
    result = await this.dal.removeAllUsersFromSchema(schemaName);
    if (!result.success) return result;
    return await this.dal.deleteSchema(schemaName);
  }

  public async schemasByUserOwner(userEmail: string) {
    return this.dal.schemasByUserOwner(userEmail);
  }

  /**
   * Schema-User-Roles
   */

  public async addUserToSchema(
    schemaName: string,
    userEmail: string,
    schemaRole: string
  ) {
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

  public async accessibleSchemas(userEmail: string) {
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

  public async createTable(schemaName: string, tableName: string) {
    const result = await this.dal.createTable(schemaName, tableName);
    if (!result.success) return result;
    return await hasuraApi.trackTable(schemaName, tableName);
  }

  public async deleteTable(schemaName: string, tableName: string) {
    const result = await this.dal.deleteTable(schemaName, tableName);
    if (!result.success) return result;
    return await hasuraApi.untrackTable(schemaName, tableName);
  }

  public async schemaTableNames(schemaName: string) {
    return this.dal.schemaTableNames(schemaName);
  }

  public async trackAllTables(schemaName: string) {
    let result = await this.schemaTableNames(schemaName);
    if (!result.success) return result;
    for (const tableName of result.payload) {
      result = await hasuraApi.trackTable(schemaName, tableName);
      if (!result.success) return result;
    }
    return result;
  }
}
