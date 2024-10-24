export const cacheRules = [
 { url: '/v1/catalogue', body: [], query: ['id'], ttl: 3600 },
 { url: '/v1/catalogue', body: [], query: [], ttl: 3600 },
];
