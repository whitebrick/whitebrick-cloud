import { gql, IResolvers } from "apollo-server-lambda";
import { ApolloError } from "apollo-server-lambda";

export const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    firstName: String
    lastName: String
    createdAt: String!
    updatedAt: String!
    role: String
  }

  extend type Query {
    wbOrganizationUsers(name: String!, roles: [String]): [User]
    wbUsersByOrganizationId(organizationId: ID!): [User]
    wbUserById(id: ID!): User
    wbUserByEmail(email: String!): User
  }

  extend type Mutation {
    wbCreateUser(email: String!, firstName: String, lastName: String): User
    wbUpdateUser(
      id: ID!
      email: String
      firstName: String
      lastName: String
    ): User
    """
    Organization-User-Roles
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
    """
    Schema-User-Roles
    """
    wbAddUserToSchema(
      schemaName: String!
      userEmail: String!
      schemaRole: String!
    ): User
  }
`;

export const resolvers: IResolvers = {
  Query: {
    wbOrganizationUsers: async (_, { name, roles }, context) => {
      const result = await context.wbCloud.organizationUsers(name, roles);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUsersByOrganizationId: async (_, { organizationId }, context) => {
      const result = await context.wbCloud.usersByOrganizationId(
        organizationId
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUserById: async (_, { id }, context) => {
      const result = await context.wbCloud.userById(id);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUserByEmail: async (_, { email }, context) => {
      const result = await context.wbCloud.userByEmail(email);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
  Mutation: {
    // Users
    wbCreateUser: async (_, { email, firstName, lastName }, context) => {
      const result = await context.wbCloud.createUser(
        email,
        firstName,
        lastName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUpdateUser: async (_, { id, email, firstName, lastName }, context) => {
      const result = await context.wbCloud.updateUser(
        id,
        email,
        firstName,
        lastName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    // Organization-User-Roles
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
    // Organization-Schema-Roles
    wbAddUserToSchema: async (
      _,
      { schemaName, userEmail, schemaRole },
      context
    ) => {
      const result = await context.wbCloud.addUserToSchema(
        schemaName,
        userEmail,
        schemaRole
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
};
