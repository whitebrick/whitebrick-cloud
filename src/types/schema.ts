import { gql, IResolvers } from "apollo-server-lambda";
import { CurrentUser, Schema } from "../entity";
import { log } from "../whitebrick-cloud";
import Lambda from "aws-sdk/clients/lambda";
import AWS from "aws-sdk";
import { environment } from "../environment";

export const typeDefs = gql`
  type Schema {
    id: ID!
    name: String!
    label: String!
    organizationOwnerId: Int
    userOwnerId: Int
    organizationOwnerName: String
    userOwnerEmail: String
    settings: JSON
    role: Role
    createdAt: String!
    updatedAt: String!
    status: String
  }

  type SchemaUser {
    schemaId: Int!
    userId: Int!
    schemaName: String
    userEmail: String!
    userFirstName: String
    userLastName: String
    settings: JSON
    role: Role
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Schemas
    """
    wbMySchemas(withSettings: Boolean): [Schema]
    wbMySchemaByName(
      name: String!
      organizationName: String
      withSettings: Boolean
    ): Schema
    wbSchemasByOrganizationOwner(organizationName: String!): [Schema]
    """
    Schema Users
    """
    wbSchemaUsers(
      schemaName: String!
      roleNames: [String]
      userEmails: [String]
      withSettings: Boolean
    ): [SchemaUser]
  }

  extend type Mutation {
    """
    Schemas
    """
    wbAddOrCreateSchema(
      name: String!
      label: String!
      organizationOwnerName: String
      userOwnerEmail: String
      create: Boolean
    ): Schema
    wbUpdateSchema(
      name: String!
      newSchemaName: String
      newSchemaLabel: String
      newOrganizationOwnerName: String
      newUserOwnerEmail: String
    ): Schema
    wbRemoveOrDeleteSchema(name: String!, del: Boolean, sync: Boolean): Boolean!
    wbImportSchema(schemaName: String!): Boolean!
    wbRetrackSchema(schemaName: String!): Boolean!
    """
    Schema Users
    """
    wbSetSchemaUsersRole(
      schemaName: String!
      userEmails: [String]!
      roleName: String!
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
    wbMySchemaByName: async (
      _,
      { name, organizationName, withSettings },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.accessibleSchemaByName(
        currentUser,
        name,
        organizationName,
        withSettings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbSchemasByOrganizationOwner: async (_, { organizationName }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.schemasByOrganizationOwner(
        currentUser,
        undefined,
        organizationName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    // Schema Users
    wbSchemaUsers: async (
      _,
      { schemaName, roleNames, userEmails, withSettings },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.schemaUsers(
        currentUser,
        schemaName,
        roleNames,
        userEmails,
        withSettings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
  Mutation: {
    // Schemas
    wbAddOrCreateSchema: async (
      _,
      { name, label, organizationOwnerName, userOwnerEmail, create },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.addOrCreateSchema(
        currentUser,
        name,
        label,
        undefined,
        organizationOwnerName,
        undefined,
        userOwnerEmail,
        create
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUpdateSchema: async (
      _,
      {
        name,
        newSchemaName,
        newSchemaLabel,
        newOrganizationOwnerName,
        newUserOwnerEmail,
      },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.updateSchema(
        currentUser,
        name,
        newSchemaName,
        newSchemaLabel,
        newOrganizationOwnerName,
        undefined,
        newUserOwnerEmail
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbRemoveOrDeleteSchema: async (_, { name, del, sync }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const schemaResult = await context.wbCloud.schemaByName(
        currentUser,
        name
      );
      let result;
      if (sync) {
        result = await context.wbCloud.removeOrDeleteSchema(
          currentUser,
          name,
          del
        );
      } else {
        result = await context.wbCloud.bgQueue.queue(
          currentUser.id,
          Schema.REMOVED_SCHEMA_ID,
          "bgRemoveSchema",
          {
            schemaName: name,
            del: del,
          }
        );
        if (!result.success) throw context.wbCloud.err(result);
        result = await context.wbCloud.bgQueue.invoke(Schema.REMOVED_SCHEMA_ID);
      }
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbImportSchema: async (_, { schemaName }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.importSchema(
        currentUser,
        schemaName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbRetrackSchema: async (_, { schemaName }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.retrackSchema(
        currentUser,
        schemaName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    // Schema Users
    wbSetSchemaUsersRole: async (
      _,
      { schemaName, userEmails, roleName },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.setSchemaUsersRole(
        currentUser,
        schemaName,
        userEmails,
        roleName
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
