import { userMutations, userQuery } from './user';

export const resolvers = {
 Query: {
  ...userQuery,
 },
 Mutation: {
  ...userMutations,
 },
};
