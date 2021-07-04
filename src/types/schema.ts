import { gql, IResolvers } from "apollo-server-lambda";
import { CurrentUser } from "../entity/CurrentUser";
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
    userRoleImpliedFrom: String
    organizationOwnerName: String
    userOwnerEmail: String
  }

  type SchemaUser {
    schemaId: Int!
    userId: Int!
    roleId: Int!
    impliedFromRoleId: Int
    schemaName: String
    userEmail: String
    role: String
    userRoleImpliedFrom: String
    settings: JSON
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Schemas
    """
    wbSchemas: [Schema]
    """
    Schema Users
    """
    wbSchemaUsers(schemaName: String!, userEmails: [String]): [SchemaUser]
  }

  extend type Mutation {
    """
    Schemas
    """
    wbCreateSchema(
      name: String!
      label: String!
      organizationOwnerId: Int
      organizationOwnerName: String
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
    wbSchemas: async (_, __, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.accessibleSchemas(currentUser);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    // Schema Users
    wbSchemaUsers: async (_, { schemaName, userEmails }, context) => {
      const result = await context.wbCloud.schemaUsers(schemaName, userEmails);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
  Mutation: {
    // Schemas
    wbCreateSchema: async (
      _,
      { name, label, organizationOwnerId, organizationOwnerName },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.createSchema(
        currentUser,
        name,
        label,
        organizationOwnerId,
        organizationOwnerName
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
