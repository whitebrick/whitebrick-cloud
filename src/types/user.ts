import { gql, IResolvers } from "apollo-server-lambda";
import { CurrentUser } from "../entity";
import { log } from "../whitebrick-cloud";

/**
 * Only fields related to an isolated user or role objects live here
 * For organization-users, schema-users, table-users see respective classes
 */

export const typeDefs = gql`
  type User {
    id: ID!
    email: String!
    firstName: String
    lastName: String
    createdAt: String!
    updatedAt: String!
  }

  type Role {
    name: String!
    impliedFrom: String
    permissions: JSON
  }

  extend type Query {
    """
    Users
    """
    wbUserById(id: ID!): User
    wbUserByEmail(email: String!): User
    wbUsersBySearchPattern(searchPattern: String!): [User]
  }

  extend type Mutation {
    """
    Users
    """
    wbCreateUser(email: String!, firstName: String, lastName: String): User
    wbUpdateUser(
      id: ID!
      email: String
      firstName: String
      lastName: String
    ): User
  }
`;

export const resolvers: IResolvers = {
  Query: {
    // Users
    wbUserById: async (_, { id }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.userById(currentUser, id);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUserByEmail: async (_, { email }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.userByEmail(currentUser, email);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUsersBySearchPattern: async (_, { searchPattern }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.usersBySearchPattern(
        currentUser,
        searchPattern
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
  Mutation: {
    // Users
    wbCreateUser: async (_, { email, firstName, lastName }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.createUser(
        currentUser,
        email,
        firstName,
        lastName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUpdateUser: async (_, { id, email, firstName, lastName }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.updateUser(
        currentUser,
        id,
        email,
        firstName,
        lastName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
};
