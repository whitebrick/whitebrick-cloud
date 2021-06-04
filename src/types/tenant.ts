import { gql, IResolvers } from "apollo-server-lambda";
import { ApolloError } from "apollo-server-lambda";

export const typeDefs = gql`
  type Tenant {
    id: ID!
    name: String!
    label: String!
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    wbTenants: [Tenant]
    wbTenantById(id: ID!): Tenant
    wbTenantByName(name: String!): Tenant
  }

  extend type Mutation {
    wbCreateTenant(name: String!, label: String!): Tenant
    wbUpdateTenant(id: ID!, name: String, label: String): Tenant
  }
`;

export const resolvers: IResolvers = {
  Query: {
    wbTenants: async (_, __, context) => {
      const result = await context.wbCloud.tenants();
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbTenantById: async (_, { id }, context) => {
      const result = await context.wbCloud.tenantById(id);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbTenantByName: async (_, { name }, context) => {
      const result = await context.wbCloud.tenantByName(name);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
  Mutation: {
    wbCreateTenant: async (_, { name, label }, context) => {
      const result = await context.wbCloud.createTenant(name, label);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUpdateTenant: async (_, { id, name, label }, context) => {
      const result = await context.wbCloud.updateTenant(id, name, label);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
};
