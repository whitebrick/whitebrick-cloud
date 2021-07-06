import { gql, IResolvers } from "apollo-server-lambda";
import { CurrentUser } from "../entity/CurrentUser";
import { log } from "../whitebrick-cloud";

export const typeDefs = gql`
  type Organization {
    id: ID!
    name: String!
    label: String!
    userRole: String
    userRoleImpliedFrom: String
    createdAt: String!
    updatedAt: String!
  }

  type OrganizationUser {
    organizationId: Int!
    userId: Int!
    roleId: Int!
    impliedFromRoleId: Int
    organizationName: String
    userEmail: String
    role: String
    roleImpliedFrom: String
    settings: JSON
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    """
    Organizations
    """
    wbOrganizations: [Organization]
    wbOrganizationById(id: ID!): Organization
    wbOrganizationByName(currentUserEmail: String!, name: String!): Organization
    """
    Organization Users
    """
    wbOrganizationUsers(
      organizationName: String!
      roles: [String]
      userEmails: [String]
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
  }
`;

export const resolvers: IResolvers = {
  Query: {
    // Organizations
    wbOrganizations: async (_, __, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.accessibleOrganizations(currentUser);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbOrganizationByName: async (_, { currentUserEmail, name }, context) => {
      const result = await context.wbCloud.organizationByName(name);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbOrganizationById: async (_, { id }, context) => {
      const result = await context.wbCloud.organizationById(id);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    // Organization Users
    wbOrganizationUsers: async (
      _,
      { organizationName, roles, userEmails },
      context
    ) => {
      const result = await context.wbCloud.organizationUsers(
        organizationName,
        undefined,
        roles,
        userEmails
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
      const result = await context.wbCloud.removeUsersFromOrganization(
        organizationName,
        undefined,
        userEmails
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
  },
};
