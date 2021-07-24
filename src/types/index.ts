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
  columnName: string;
  relTableName?: string;
  relColumnName?: string;
};

const typeDefs = gql`
  type Query {
    wbHealthCheck: JSON!
    wbCloudContext: JSON!
  }

  type Mutation {
    wbResetTestData: Boolean!
  }
`;

const resolvers: IResolvers = {
  Query: {
    wbHealthCheck: async (_, __, context) => {
      return {
        headers: context.headers,
        multiValueHeaders: context.headers,
      };
    },
    wbCloudContext: async (_, __, context) => {
      return context.wbCloud.cloudContext();
    },
  },
  Mutation: {
    wbResetTestData: async (_, __, context) => {
      const currentUser = await CurrentUser.fromContext(context);
      const result = await context.wbCloud.resetTestData(currentUser);
      if (!result.success) throw context.wbCloud.err(result);
      return result.success;
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
