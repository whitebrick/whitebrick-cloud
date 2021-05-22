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

export const resolvers: IResolvers = {
  Query: {
    wbSchemaTableNames: async (_, { schemaName }, context) => {
      const result = await context.wbCloud.schemaTableNames(schemaName);
      if (!result.success) {
        throw new ApolloError(result.message, _, { ref: result.code });
      }
      return result.payload;
    },
  },
  Mutation: {
    wbCreateTable: async (_, { schemaName, tableName }, context) => {
      const result = await context.wbCloud.createTable(schemaName, tableName);
      if (!result.success) {
        throw new ApolloError(result.message, _, { ref: result.code });
      }
      return result.success;
    },
    wbTrackAllTables: async (_, { schemaName }, context) => {
      const result = await context.wbCloud.trackAllTables(schemaName);
      if (!result.success) {
        throw new ApolloError(result.message, _, { ref: result.code });
      }
      return result.success;
    },
  },
};
