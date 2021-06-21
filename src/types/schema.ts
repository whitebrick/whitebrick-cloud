import { gql, IResolvers } from "apollo-server-lambda";
import { ApolloError } from "apollo-server-lambda";
import { log } from "../whitebrick-cloud";

export const typeDefs = gql`
  type Schema {
    id: ID!
    name: String!
    label: String!
    organizationOwnerId: Int
    userOwnerId: Int
    userRole: String
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    wbSchemas(userEmail: String!): [Schema]
  }

  extend type Mutation {
    wbCreateSchema(
      currentUserEmail: String!
      name: String!
      label: String!
      organizationOwnerId: Int
      organizationOwnerName: String
      userOwnerId: Int
      userOwnerEmail: String
    ): Schema
  }
`;

export const resolvers: IResolvers = {
  Query: {
    wbSchemas: async (_, { userEmail }, context) => {
      const uidResult = await context.wbCloud.uidFromHeaders(context.headers);
      if (!uidResult.success) return context.wbCloud.err(uidResult);
      // uidResult.payload
      const result = await context.wbCloud.accessibleSchemas(userEmail);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
  Mutation: {
    wbCreateSchema: async (
      _,
      {
        currentUserEmail,
        name,
        label,
        organizationOwnerId,
        organizationOwnerName,
        userOwnerId,
        userOwnerEmail,
      },
      context
    ) => {
      // const uidResult = await context.wbCloud.uidFromHeaders(context.headers);
      // if (!uidResult.success) return context.wbCloud.err(uidResult);
      const uidResult = await context.wbCloud.userByEmail(currentUserEmail);
      if (!uidResult.success) return context.wbCloud.err(uidResult);
      const result = await context.wbCloud.createSchema(
        uidResult.payload.id,
        name,
        label,
        organizationOwnerId,
        organizationOwnerName,
        userOwnerId,
        userOwnerEmail
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
};
