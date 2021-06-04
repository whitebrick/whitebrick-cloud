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
  }

  extend type Query {
    wbUsersByTenantId(tenantId: ID!): [User]
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
    Tenant-User-Roles
    """
    wbAddUserToTenant(
      tenantName: String!
      userEmail: String!
      tenantRole: String!
    ): User
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
    wbUsersByTenantId: async (_, { tenantId }, context) => {
      const result = await context.wbCloud.usersByTenantId(tenantId);
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
    // Tenant-User-Roles
    wbAddUserToTenant: async (
      _,
      { tenantName, userEmail, tenantRole },
      context
    ) => {
      const result = await context.wbCloud.addUserToTenant(
        tenantName,
        userEmail,
        tenantRole
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    // Tenant-Schema-Roles
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
