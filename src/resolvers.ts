import { IResolvers } from "apollo-server-lambda";
import { ApolloError } from "apollo-server-lambda"
import { log } from "./apollo-server";
// import "reflect-metadata";


export const resolvers: IResolvers = {
  Query: {
    wbHealthCheck: () => 'All good',
    // Tenants
    wbTenants: async (_, __, context) => {
      const result = await context.dal.tenants();
      if(!result.success){ throw new ApolloError(result.message, _, {ref: result.code}); }
      return result.payload;
    },
    wbTenantById: async (_, { id }, context) => {
      const result = await context.dal.tenantById(id);
      if(!result.success){ throw new ApolloError(result.message, _, {ref: result.code}); }
      return result.payload;
    },
    wbTenantByName: async (_, { name }, context) => {
      const result = await context.dal.tenantByName(name);
      if(!result.success){ throw new ApolloError(result.message, _, {ref: result.code}); }
      return result.payload;
    },
    // Users
    wbUsersByTenantId: async (_, { tenantId }, context) => {
      const result = await context.dal.usersByTenantId(tenantId);
      if(!result.success){ throw new ApolloError(result.message, _, {ref: result.code}); }
      return result.payload;
    },
    wbUserById: async (_, { id }, context) => {
      const result = await context.dal.userById(id);
      if(!result.success){ throw new ApolloError(result.message, _, {ref: result.code}); }
      return result.payload;
    },
    wbUserByEmail: async (_, { email }, context) => {
      const result = await context.dal.userByEmail(email);
      if(!result.success){ throw new ApolloError(result.message, _, {ref: result.code}); }
      return result.payload;
    },
  },

  Mutation: {
    // Tenants
    // wbCreateTenant: async (_, { name, label }: any, context) => {
    //   return await context.dal.createTenant(name, label);
    // },
    wbCreateTenant: async (_, { name, label }, context) => {
      const result = await context.dal.createTenant(name, label);
      if(!result.success){ throw new ApolloError(result.message, _, {ref: result.code}); }
      return result.payload;
    },
    wbUpdateTenant: async (_, { id, name, label }, context) => {
      const result = await context.dal.updateTenant(id, name, label);
      if(!result.success){ throw new ApolloError(result.message, _, {ref: result.code}); }
      return result.payload;
    },
    // Users
    wbCreateUser: async (_, { email, firstName, lastName }, context) => {
      const result = await context.dal.createUser(email, firstName, lastName);
      if(!result.success){ throw new ApolloError(result.message, _, {ref: result.code}); }
      return result.payload;
    },
    wbUpdateUser: async (_, { id, email, firstName, lastName }, context) => {
      const result = await context.dal.updateUser(id, email, firstName, lastName);
      if(!result.success){ throw new ApolloError(result.message, _, {ref: result.code}); }
      return result.payload;
    },
  },

};