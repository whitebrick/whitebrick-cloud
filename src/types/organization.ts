import { gql, IResolvers } from "apollo-server-lambda";
import { ApolloError } from "apollo-server-lambda";

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
    wbOrganizations(userEmail: String): [Organization]
    wbOrganizationById(id: ID!): Organization
    wbOrganizationByName(name: String!): Organization
  }

  extend type Mutation {
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
  }
`;

export const resolvers: IResolvers = {
  Query: {
    wbOrganizations: async (_, { userEmail }, context) => {
      const result = await context.wbCloud.organizations(
        undefined,
        userEmail,
        undefined
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbOrganizationById: async (_, { id }, context) => {
      const result = await context.wbCloud.organizationById(id);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
    wbOrganizationByName: async (_, { name }, context) => {
      const result = await context.wbCloud.organizationByName(name);
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
  Mutation: {
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
  },
};
