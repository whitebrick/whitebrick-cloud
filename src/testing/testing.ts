import { log } from "../apollo-server";
import { makeExecutableSchema } from '@graphql-tools/schema';
import { addMocksToSchema } from '@graphql-tools/mock';
import { graphql } from 'graphql';
import { typeDefs } from '../type-defs';
import { mutation, query } from './testQueryAndMutation';

const schemaString = typeDefs;
const schema = makeExecutableSchema({ typeDefs: schemaString });

// Create a new schema with mocks
const schemaWithMocks = addMocksToSchema({ schema });

export const testMutation = graphql(schemaWithMocks, mutation).then((result) => log.info('Got mutation result', result)).catch((err) => {
  log.error("error", err)
});
export const testQuery = graphql(schemaWithMocks, query).then((result) => log.info('Got query result', result)).catch((err) => {
  log.error("error", err)
});