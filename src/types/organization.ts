import { gql, IResolvers } from "apollo-server-lambda";
import { CurrentUser } from "../entity";
import { log } from "../whitebrick-cloud";

export const typeDefs = gql`
  type Organization {
    id: ID!
    name: String!
    label: String!
    userRole: String
    userRoleImpliedFrom: String
    settings: JSON
    createdAt: String!
    updatedAt: String!
  }

  type OrganizationUser {
    organizationId: Int!
    userId: Int!
    roleId: Int!
    impliedFromRoleId: Int
    organizationName: String!
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
    Organizations
    """
    wbMyOrganizations(withSettings: Boolean): [Organization]
    wbMyOrganizationByName(name: String!, withSettings: Boolean): Organization
    wbOrganizationByName(name: String!): Organization
    """
    Organization Users
    """
    wbOrganizationUsers(
      organizationName: String!
      roles: [String]
      userEmails: [String]
      withSettings: Boolean
    ): [OrganizationUser]
  }

  extend type Mutation {
    """
    Organizations
    """
    wbCreateOrganization(name: String!, label: String!): Organization
    wbUpdateOrganization(
      name: String!
      newName: String
      newLabel: String
    ): Organization
    wbDeleteOrganization(name: String!): Boolean
    """
    Organization Users
    """
    wbSetOrganizationUsersRole(
      organizationName: String!
      userEmails: [String]!
      role: String!
    ): Boolean
    wbRemoveUsersFromOrganization(
      userEmails: [String]!
      organizationName: String!
    ): Boolean
    wbSaveOrganizationUserSettings(
      organizationName: String!
      settings: JSON!
    ): Boolean!
  }
`;

export const resolvers: IResolvers = {
  Query: {
    // Organizations
    wbMyOrganizations: async (_, { withSettings }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.accessibleOrganizations(
        currentUser,
        withSettings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbMyOrganizationByName: async (_, { name, withSettings }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.accessibleOrganizationByName(
        currentUser,
        name,
        withSettings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbOrganizationByName: async (_, { name }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.organizationByName(
        currentUser,
        name
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    // Organization Users
    wbOrganizationUsers: async (
      _,
      { organizationName, roles, userEmails, withSettings },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.organizationUsers(
        currentUser,
        organizationName,
        undefined,
        roles,
        userEmails,
        withSettings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
  Mutation: {
    // Organizations
    wbCreateOrganization: async (_, { name, label }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.createOrganization(
        currentUser,
        name,
        label
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUpdateOrganization: async (_, { name, newName, newLabel }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.updateOrganization(
        currentUser,
        name,
        newName,
        newLabel
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbDeleteOrganization: async (_, { name }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.deleteOrganization(
        currentUser,
        name
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    // Organization Users
    wbSetOrganizationUsersRole: async (
      _,
      { organizationName, userEmails, role },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.setOrganizationUsersRole(
        currentUser,
        organizationName,
        role,
        undefined,
        userEmails
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbRemoveUsersFromOrganization: async (
      _,
      { userEmails, organizationName },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.removeUsersFromOrganization(
        currentUser,
        organizationName,
        undefined,
        userEmails
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbSaveOrganizationUserSettings: async (
      _,
      { organizationName, settings },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.saveSchemaUserSettings(
        currentUser,
        organizationName,
        settings
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
  },
};
