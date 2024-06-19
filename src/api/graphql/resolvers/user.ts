let DATA_SET = 'test';

export const userQuery = {
 hello: () => 'Hello from GraphQL!',
 hi: () => DATA_SET,
};

export const userMutations = {
 hi: (_: any, helloData: any) => {
  DATA_SET = helloData.message;
  return DATA_SET;
 },
};
