import { gql, IResolvers } from "apollo-server-lambda";
import { ApolloError } from "apollo-server-lambda";
import { GraphQLJSON } from "graphql-type-json";

export const typeDefs = gql`
  scalar JSON

  type Table {
    id: ID!
    schemaId: Int!
    name: String!
    label: String!
    createdAt: String!
    updatedAt: String!
  }

  type TableUser {
    tableId: Int!
    userId: Int!
    roleId: Int!
    settings: JSON
    createdAt: String!
    updatedAt: String!
  }

  extend type Query {
    wbTables(schemaName: String!): [Table]
    wbTableUser(
      userEmail: String!
      schemaName: String!
      tableName: String!
    ): TableUser
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
    wbTables: async (_, { schemaName }, context) => {
      const result = await context.wbCloud.tables(schemaName);
      if (!result.success) {
        throw new ApolloError(result.message, "INTERNAL_SERVER_ERROR", {
          ref: result.code,
        });
      }
      return result.payload;
    },
    wbTableUser: async (_, { schemaName, tableName, userEmail }, context) => {
      const result = await context.wbCloud.tableUser(
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
