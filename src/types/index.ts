import { typeDefs as Schema, resolvers as schemaResolvers } from "./schema";
import { typeDefs as Tenant, resolvers as tenantResolvers } from "./tenant";
import { typeDefs as User, resolvers as userResolvers } from "./user";
import { typeDefs as Table, resolvers as tableResolvers } from "./table";
import { merge } from "lodash";
import { gql, ApolloError, IResolvers } from "apollo-server-lambda";
import {
  constraintDirective,
  constraintDirectiveTypeDefs,
} from "graphql-constraint-directive";
import { makeExecutableSchema } from "graphql-tools";

export type ServiceResult =
  | { success: true; payload: any; message?: string }
  | { success: false; message: string; code?: string; apolloError?: string };

export type QueryParams = {
  query: string;
  params?: any[];
};

export type ConstraintId = {
  constraintName: string;
  tableName: string;
  columnName: string;
};

const typeDefs = gql`
  type Query {
    wbHealthCheck: String!
  }

  type Mutation {
    wbResetTestData: Boolean!
  }
`;

const resolvers: IResolvers = {
  Query: {
    wbHealthCheck: () => "All good",
  },
  Mutation: {
    wbResetTestData: async (_, __, context) => {
      const result = await context.wbCloud.resetTestData();
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
    },
  },
};

export const schema = makeExecutableSchema({
  typeDefs: [
    constraintDirectiveTypeDefs,
    typeDefs,
    Tenant,
    User,
    Schema,
    Table,
  ],
  resolvers: merge(
    resolvers,
    tenantResolvers,
    userResolvers,
    schemaResolvers,
    tableResolvers
  ),
  schemaTransforms: [constraintDirective()],
});
