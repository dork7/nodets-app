export const typeDefs = `
    type Query {
        hello: String
        hi : String
    }
    type Mutation {
        hello: String
        hi(message: String) : String
    }
`;
