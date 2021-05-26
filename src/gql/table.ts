import { gql, IResolvers } from "apollo-server-lambda";
import { ApolloError } from "apollo-server-lambda";
import { GraphQLJSON } from "graphql-type-json";

export const typeDefs = gql`
  scalar JSON

  extend type Query {
    wbSchemaTableNames(schemaName: String!): [String]
    wbTableUserSettings(
      userEmail: String!
      schemaName: String!
      tableName: String!
    ): JSON
  }

  extend type Mutation {
    wbTrackAllTables(schemaName: String!): Boolean!
    wbCreateTable(schemaName: String!, tableName: String!): Boolean!
    wbSaveTableUserSettings(
      userEmail: String!
      schemaName: String!
      tableName: String!
      settings: JSON!
    ): Boolean!
  }
`;
// TBD-SG
// Edit gql above to include wbTrackTableRelationships

export const resolvers: IResolvers = {
  JSON: GraphQLJSON,
  Query: {
    wbSchemaTableNames: async (_, { schemaName }, context) => {
      const result = await context.wbCloud.schemaTableNames(schemaName);
      if (!result.success) {
        throw new ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
          ref: result.code,
        });
      }
      return result.payload;
    },
    wbTableUserSettings: async (
      _,
      { schemaName, tableName, userEmail },
      context
    ) => {
      const result = await context.wbCloud.tableUserSettings(
        userEmail,
        schemaName,
        tableName
      );
      if (!result.success) {
        throw new ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
          ref: result.code,
        });
      }
      return result.payload;
    },
  },
  Mutation: {
    wbCreateTable: async (_, { schemaName, tableName }, context) => {
      const result = await context.wbCloud.createTable(schemaName, tableName);
      if (!result.success) {
        throw new ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
          ref: result.code,
        });
      }
      return result.success;
    },
    wbTrackAllTables: async (_, { schemaName }, context) => {
      const result = await context.wbCloud.trackAllTables(schemaName);
      if (!result.success) {
        throw new ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
          ref: result.code,
        });
      }
      return result.success;
    },
    wbSaveTableUserSettings: async (
      _,
      { schemaName, tableName, userEmail, settings },
      context
    ) => {
      const result = await context.wbCloud.saveTableUserSettings(
        schemaName,
        tableName,
        userEmail,
        settings
      );
      if (!result.success) {
        throw new ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
          ref: result.code,
        });
      }
      return result.success;
    },
    // TBD-SG
    // Add resolver for wbTrackTableRelationships
  },
};
