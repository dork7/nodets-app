import { GraphQLSchema } from 'graphql';
import { makeExecutableSchema } from 'graphql-tools';

let DATA_SET = 'test';

const typeDefs = `
    type Query {
        hello: String
        hi : String
    }
    type Mutation {
        hello: String
        hi(message: String) : String
    }
`;

const resolvers = {
 Query: {
  hello: () => 'Hello from GraphQL!',
  hi: () => DATA_SET,
 },
 Mutation: {
  hi: (_: any, helloData: any) => {
   DATA_SET = helloData.message;
   return DATA_SET;
  },
 },
};

export const schema: GraphQLSchema = makeExecutableSchema({
 typeDefs,
 resolvers,
});
