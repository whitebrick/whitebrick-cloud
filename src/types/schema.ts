import { gql, IResolvers } from "apollo-server-lambda";
import { log } from "../whitebrick-cloud";

export const typeDefs = gql`
  type Schema {
    id: ID!
    name: String!
    label: String!
    organizationOwnerId: Int
    userOwnerId: Int
    createdAt: String!
    updatedAt: String!
    userRole: String
    organizationOwnerName: String
    userOwnerEmail: String
  }

  extend type Query {
    """
    Schemas
    """
    wbSchemas(userEmail: String!): [Schema]
  }

  extend type Mutation {
    """
    Schemas
    """
    wbCreateSchema(
      currentUserEmail: String!
      name: String!
      label: String!
      organizationOwnerId: Int
      organizationOwnerName: String
      userOwnerId: Int
      userOwnerEmail: String
    ): Schema
    """
    Schema Users
    """
    wbSetSchemaUsersRole(
      schemaName: String!
      userEmails: [String]!
      role: String!
    ): Boolean
    wbRemoveSchemaUsers(schemaName: String!, userEmails: [String]!): Boolean
  }
`;

export const resolvers: IResolvers = {
  Query: {
    // Schemas
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
    // Schemas
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
    // Schema Users
    wbSetSchemaUsersRole: async (
      _,
      { schemaName, userEmails, role },
      context
    ) => {
      const result = await context.wbCloud.setSchemaUsersRole(
        schemaName,
        userEmails,
        role
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbRemoveSchemaUsers: async (_, { schemaName, userEmails }, context) => {
      const result = await context.wbCloud.removeSchemaUsers(
        schemaName,
        userEmails
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
  },
};
