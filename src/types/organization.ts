import { gql, IResolvers } from "apollo-server-lambda";
import { log } from "../whitebrick-cloud";

export const typeDefs = gql`
  type Organization {
    id: ID!
    name: String!
    label: String!
    userRole: String
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Organizations
    """
    wbOrganizations(userEmail: String): [Organization]
    wbOrganizationById(id: ID!): Organization
    wbOrganizationByName(currentUserEmail: String!, name: String!): Organization
    """
    Organization Users
    """
    wbOrganizationUsers(name: String!, roles: [String]): [User]
  }

  extend type Mutation {
    """
    Organizations
    """
    wbCreateOrganization(
      currentUserEmail: String!
      name: String!
      label: String!
    ): Organization
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
  }
`;

export const resolvers: IResolvers = {
  Query: {
    // Organizations
    wbOrganizations: async (_, { userEmail }, context) => {
      const result = await context.wbCloud.organizations(
        undefined,
        userEmail,
        undefined
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbOrganizationByName: async (_, { currentUserEmail, name }, context) => {
      const result = await context.wbCloud.organization(
        undefined,
        currentUserEmail,
        undefined,
        name
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbOrganizationById: async (_, { id }, context) => {
      const result = await context.wbCloud.organizationById(id);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    // Organization Users
    wbOrganizationUsers: async (_, { name, roles }, context) => {
      const result = await context.wbCloud.organizationUsers(name, roles);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
  Mutation: {
    // Organizations
    wbCreateOrganization: async (
      _,
      { currentUserEmail, name, label },
      context
    ) => {
      const result = await context.wbCloud.createOrganization(
        currentUserEmail,
        name,
        label
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUpdateOrganization: async (_, { name, newName, newLabel }, context) => {
      const result = await context.wbCloud.updateOrganization(
        name,
        newName,
        newLabel
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbDeleteOrganization: async (_, { name }, context) => {
      const result = await context.wbCloud.deleteOrganization(name);
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    // Organization Users
    wbSetOrganizationUsersRole: async (
      _,
      { organizationName, userEmails, role },
      context
    ) => {
      const result = await context.wbCloud.setOrganizationUsersRole(
        organizationName,
        userEmails,
        role
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbRemoveUsersFromOrganization: async (
      _,
      { userEmails, organizationName },
      context
    ) => {
      const result = await context.wbCloud.removeUsersFromOrganization(
        userEmails,
        organizationName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
  },
};
