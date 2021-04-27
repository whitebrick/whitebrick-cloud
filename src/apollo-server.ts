import { ApolloServer } from 'apollo-server-lambda';
import { resolvers } from './resolvers';
import { testMutation, testQuery } from './testing/testing';
import { typeDefs } from './type-defs';
import { Logger } from "tslog";
import { DAL } from "./dal";

const apolloServer = new ApolloServer({
  typeDefs,
  resolvers,
  introspection: true,
  context: function(){
    return {
      dal: (new DAL())
    }
  }
});

export const graphqlHandler = apolloServer.createHandler();

export const log: Logger = new Logger({
  minLevel: "debug"
});

// TESTING CODE
// testQuery
// testMutation
