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
    wbSignUp(userAuthId: String!, userObj: JSON!): Boolean
    wbAuth(userAuthId: String!): JSON
    wbCreateUser(
      authId: String
      email: String
      firstName: String
      lastName: String
    ): User
    wbUpdateMyProfile(firstName: String, lastName: String): User
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
    wbSignUp: async (_, { userAuthId, userObj }, context) => {
      const result = await context.wbCloud.signUp(userAuthId, userObj);
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
    wbAuth: async (_, { userAuthId }, context) => {
      const result = await context.wbCloud.auth(userAuthId);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbCreateUser: async (
      _,
      { authId, email, firstName, lastName },
      context
    ) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.createUser(
        currentUser,
        authId,
        email,
        firstName,
        lastName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbUpdateMyProfile: async (_, { firstName, lastName }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.updateUser(
        currentUser,
        currentUser.id,
        undefined,
        firstName,
        lastName
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
};
