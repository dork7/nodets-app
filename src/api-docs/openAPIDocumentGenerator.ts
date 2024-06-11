import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { healthCheckRegistry } from '@/api/healthCheck/healthCheckRouter';
import { redisRegistry } from '@/api/redis/redisRouter';
import { userRegistry } from '@/api/user/userRouter';

export function generateOpenAPIDocument() {
 const registry = new OpenAPIRegistry([healthCheckRegistry, userRegistry, redisRegistry]);
 const generator = new OpenApiGeneratorV3(registry.definitions);

 return generator.generateDocument({
  openapi: '3.0.0',
  info: {
   version: '1.0.0',
   title: 'Swagger API',
  },
  externalDocs: {
   description: 'View the raw OpenAPI Specification in JSON format',
   url: '/swagger.json',
  },
 });
}
