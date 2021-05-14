import { IResolvers } from "apollo-server-lambda";
import { ApolloError } from "apollo-server-lambda";
import { log } from "./whitebrick-cloud";

export const resolvers: IResolvers = {
  Query: {
    wbHealthCheck: () => "All good",
    // Tenants
    wbTenants: async (_, __, context) => {
      const result = await context.wbCloud.tenants();
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    wbTenantById: async (_, { id }, context) => {
      const result = await context.wbCloud.tenantById(id);
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    wbTenantByName: async (_, { name }, context) => {
      const result = await context.wbCloud.tenantByName(name);
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    // Users
    wbUsersByTenantId: async (_, { tenantId }, context) => {
      const result = await context.wbCloud.usersByTenantId(tenantId);
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    wbUserById: async (_, { id }, context) => {
      const result = await context.wbCloud.userById(id);
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    wbUserByEmail: async (_, { email }, context) => {
      const result = await context.wbCloud.userByEmail(email);
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    // Schemas
    wbSchemas: async (_, { userEmail }, context) => {
      const result = await context.wbCloud.accessibleSchemas(userEmail);
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    // Tables
    wbSchemaTableNames: async (_, { schemaName }, context) => {
      const result = await context.wbCloud.schemaTableNames(schemaName);
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
  },

  Mutation: {
    // Test
    wbResetTestData: async (_, __, context) => {
      const result = await context.wbCloud.resetTestData();
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.success;
    },
    // Tenants
    wbCreateTenant: async (_, { name, label }, context) => {
      const result = await context.wbCloud.createTenant(name, label);
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    wbUpdateTenant: async (_, { id, name, label }, context) => {
      const result = await context.wbCloud.updateTenant(id, name, label);
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    // Tenant-User-Roles
    wbAddUserToTenant: async (
      _,
      { tenantName, userEmail, tenantRole },
      context
    ) => {
      const result = await context.wbCloud.addUserToTenant(
        tenantName,
        userEmail,
        tenantRole
      );
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    // Users
    wbCreateUser: async (_, { email, firstName, lastName }, context) => {
      const result = await context.wbCloud.createUser(
        email,
        firstName,
        lastName
      );
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    wbUpdateUser: async (_, { id, email, firstName, lastName }, context) => {
      const result = await context.wbCloud.updateUser(
        id,
        email,
        firstName,
        lastName
      );
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    // Schemas
    wbCreateSchema: async (
      _,
      {
        name,
        label,
        tenantOwnerId,
        tenantOwnerName,
        userOwnerId,
        userOwnerEmail,
      },
      context
    ) => {
      const result = await context.wbCloud.createSchema(
        name,
        label,
        tenantOwnerId,
        tenantOwnerName,
        userOwnerId,
        userOwnerEmail
      );
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    // Tenant-Schema-Roles
    wbAddUserToSchema: async (
      _,
      { schemaName, userEmail, schemaRole },
      context
    ) => {
      const result = await context.wbCloud.addUserToSchema(
        schemaName,
        userEmail,
        schemaRole
      );
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.payload;
    },
    // Tables
    wbCreateTable: async (_, { schemaName, tableName }, context) => {
      const result = await context.wbCloud.createTable(schemaName, tableName);
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.success;
    },
    wbTrackAllTables: async (_, { schemaName }, context) => {
      const result = await context.wbCloud.trackAllTables(schemaName);
      if (!result.success)
        throw new ApolloError(result.message, _, { ref: result.code });
      return result.success;
    },
  },
};
