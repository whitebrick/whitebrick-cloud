import { gql, IResolvers } from "apollo-server-lambda";
import { CurrentUser } from "../entity";
import { log } from "../whitebrick-cloud";

export const typeDefs = gql`
  type Schema {
    id: ID!
    name: String!
    label: String!
    organizationOwnerId: Int
    userOwnerId: Int
    userRole: String
    userRoleImpliedFrom: String
    settings: JSON
    organizationOwnerName: String
    userOwnerEmail: String
    createdAt: String!
    updatedAt: String!
  }

  type SchemaUser {
    schemaId: Int!
    userId: Int!
    roleId: Int!
    impliedFromRoleId: Int
    schemaName: String
    userEmail: String!
    userFirstName: String
    userLastName: String
    role: String!
    roleImpliedFrom: String
    settings: JSON
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Schemas
    """
    wbMySchemas(withSettings: Boolean): [Schema]
    wbMySchemaByName(name: String!, withSettings: Boolean): Schema
    """
    Schema Users
    """
    wbSchemaUsers(
      schemaName: String!
      userEmails: [String]
      withSettings: Boolean
    ): [SchemaUser]
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
    wbSaveSchemaUserSettings(schemaName: String!, settings: JSON!): Boolean!
  }
`;

export const resolvers: IResolvers = {
  Query: {
    // Schemas
    wbMySchemas: async (_, { withSettings }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.accessibleSchemas(
        currentUser,
        withSettings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbMySchemaByName: async (_, { name, withSettings }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.accessibleSchemaByName(
        currentUser,
        name,
        withSettings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    // Schema Users
    wbSchemaUsers: async (
      _,
      { schemaName, userEmails, withSettings },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.schemaUsers(
        currentUser,
        schemaName,
        userEmails,
        withSettings
      );
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
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.setSchemaUsersRole(
        currentUser,
        schemaName,
        userEmails,
        role
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbRemoveSchemaUsers: async (_, { schemaName, userEmails }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.removeSchemaUsers(
        currentUser,
        schemaName,
        userEmails
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbSaveSchemaUserSettings: async (_, { schemaName, settings }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.saveSchemaUserSettings(
        currentUser,
        schemaName,
        settings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
  },
};
