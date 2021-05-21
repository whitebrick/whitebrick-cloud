import { gql, IResolvers } from "apollo-server-lambda";
import { ApolloError } from "apollo-server-lambda";

export const typeDefs = gql`
  type Schema {
    id: ID!
    name: String!
    label: String!
    tenantOwnerId: Int
    userOwnerId: Int
    createdAt: String!
    updatedAt: String!
    userRole: String
  }

  extend type Query {
    wbSchemas(userEmail: String!): [Schema]
  }

  extend type Mutation {
    wbCreateSchema(
      name: String! @constraint(minLength: 3)
      label: String!
      tenantOwnerId: Int
      tenantOwnerName: String
      userOwnerId: Int
      userOwnerEmail: String
    ): Schema
  }
`;

export const resolvers: IResolvers = {
  Query: {
    wbTenants: async (_, __, context) => {
      const result = await context.wbCloud.tenants();
      if (!result.success) {
        throw new ApolloError(result.message, _, { ref: result.code });
      }
      return result.payload;
    },
    wbTenantById: async (_, { id }, context) => {
      const result = await context.wbCloud.tenantById(id);
      if (!result.success) {
        throw new ApolloError(result.message, _, { ref: result.code });
      }
      return result.payload;
    },
    wbTenantByName: async (_, { name }, context) => {
      const result = await context.wbCloud.tenantByName(name);
      if (!result.success) {
        throw new ApolloError(result.message, _, { ref: result.code });
      }
      return result.payload;
    },
  },
  Mutation: {
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
      if (!result.success) {
        throw new ApolloError(result.message, _, { ref: result.code });
      }
      return result.payload;
    },
  },
};
