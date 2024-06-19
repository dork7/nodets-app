import { GraphQLSchema } from 'graphql';
import { makeExecutableSchema } from 'graphql-tools';

import { resolvers } from './resolvers';
import { typeDefs } from './typedefs';

export const schema: GraphQLSchema = makeExecutableSchema({
 typeDefs,
 resolvers,
});
