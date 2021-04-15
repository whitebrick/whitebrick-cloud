import { ApolloServer } from 'apollo-server-lambda';

import { resolvers } from './resolvers';
import { typeDefs } from './type-defs';

const apolloServer = new ApolloServer({ resolvers, typeDefs });

export const graphqlHandler = apolloServer.createHandler();
