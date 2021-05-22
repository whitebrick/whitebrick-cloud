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
      name: String!
      label: String!
      tenantOwnerId: Int
      tenantOwnerName: String
      userOwnerId: Int
      userOwnerEmail: String
    ): Schema
  }
`;
//@constraint(minLength: 3)

export const resolvers: IResolvers = {
  Query: {
    wbSchemas: async (_, { userEmail }, context) => {
      const result = await context.wbCloud.accessibleSchemas(userEmail);
      if (!result.success) {
        throw new ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
          ref: result.code,
        });
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
        throw new ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
          ref: result.code,
        });
      }
      return result.payload;
    },
  },
};
