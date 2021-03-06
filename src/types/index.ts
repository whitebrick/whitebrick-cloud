import { typeDefs as Schema, resolvers as schemaResolvers } from "./schema";
import {
  typeDefs as Organization,
  resolvers as organizationResolvers,
} from "./organization";
import { typeDefs as User, resolvers as userResolvers } from "./user";
import { typeDefs as Table, resolvers as tableResolvers } from "./table";
import { merge } from "lodash";
import { gql, IResolvers } from "apollo-server-lambda";
import {
  constraintDirective,
  constraintDirectiveTypeDefs,
} from "graphql-constraint-directive";
import { makeExecutableSchema } from "graphql-tools";
import { CurrentUser } from "../entity";
import { log } from "../whitebrick-cloud";
const isPortReachable = require("is-port-reachable");

export type ServiceResult =
  | { success: true; payload: any; message?: string }
  | {
      success?: false;
      message?: string;
      refCode?: string;
      wbCode?: string;
      apolloErrorCode?: string;
      values?: string[];
    };

export type QueryParams = {
  query: string;
  params?: any[];
};

export type ConstraintId = {
  constraintName: string;
  tableName: string;
  tableLabel: string;
  columnName: string;
  columnLabel: string;
  relTableName?: string;
  relTableLabel?: string;
  relColumnName?: string;
  relColumnLabel?: string;
};

const typeDefs = gql`
  type Query {
    wbHealthCheck: JSON!
    wbCloudContext: JSON!
    wbListBgQueue(schemaName: String!, limit: Int): JSON!
  }

  type Mutation {
    wbUtil(fn: String!, vals: JSON): JSON!
  }
`;

const resolvers: IResolvers = {
  Query: {
    wbHealthCheck: async (_, __, context) => {
      return {
        googlePortReachable: await isPortReachable(80, { host: "google.com" }),
        hasuraHealthCheck: await context.wbCloud.hasuraHealthCheck(),
        dbSelect: await context.wbCloud.dbHealthCheck(),
        headers: context.headers,
        multiValueHeaders: context.headers,
      };
    },
    wbCloudContext: async (_, __, context) => {
      return context.wbCloud.cloudContext();
    },
    wbListBgQueue: async (_, { schemaName, limit }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.listBgQueue(
        currentUser,
        schemaName,
        limit
      );
      if (!result.success) throw context.wbCloud.err(result);
      return result.payload;
    },
  },
  Mutation: {
    wbUtil: async (_, { fn, vals }, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.util(currentUser, fn, vals);
      if (!result.success) throw context.wbCloud.err(result);
      return result;
    },
  },
};

export const schema = makeExecutableSchema({
  typeDefs: [
    constraintDirectiveTypeDefs,
    typeDefs,
    Organization,
    User,
    Schema,
    Table,
  ],
  resolvers: merge(
    resolvers,
    organizationResolvers,
    userResolvers,
    schemaResolvers,
    tableResolvers
  ),
  schemaTransforms: [constraintDirective()],
});
