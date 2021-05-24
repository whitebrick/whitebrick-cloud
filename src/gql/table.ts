import { gql, IResolvers } from "apollo-server-lambda";
import { ApolloError } from "apollo-server-lambda";

export const typeDefs = gql`
  extend type Query {
    wbSchemaTableNames(schemaName: String!): [String]
  }

  extend type Mutation {
    wbTrackAllTables(schemaName: String!): Boolean!
    wbCreateTable(schemaName: String!, tableName: String!): Boolean!
  }
`;
// TBD-SG
// Edit gql above to include wbTrackTableRelationships

export const resolvers: IResolvers = {
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
    // TBD-SG
    // Add resolver for wbTrackTableRelationships
  },
};
