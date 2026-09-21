import { OpenApiGeneratorV3, OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';

import { aiProvidersRegistry } from '@/api/aiProviders/aiProvidersRouter';
import { aiUtilsRegistry } from '@/api/aiUtils/aiUtilsRouter';
import { catalogueRegistery } from '@/api/catalogue/catalogueRouter';
import { chatRegistry } from '@/api/chat/chatRouter';
import { goalsRegistry } from '@/api/goals/goalsRouter';
import { healthCheckRegistry } from '@/api/healthCheck/healthCheckRouter';
import { kafkaRegistry } from '@/api/kafka/kafkaRouter';
import { llamaIndexRegistry } from '@/api/llamaIndex/router';
import { ragRegistry } from '@/api/rag/ragRouter';
import { redisRegistry } from '@/api/redis/redisRouter';
import { settingsRegistry } from '@/api/settings/settingsRouter';
import { taskPlannerRegistry } from '@/api/taskPlanner/taskPlannerRouter';
import { visionRegistry } from '@/api/vision/visionRouter';

export function generateOpenAPIDocument() {
 const registry = new OpenAPIRegistry([
  healthCheckRegistry,
  aiUtilsRegistry,
  catalogueRegistery,
  chatRegistry,
  ragRegistry,
  llamaIndexRegistry,
  redisRegistry,
  kafkaRegistry,
  aiProvidersRegistry,
  visionRegistry,
  taskPlannerRegistry,
  settingsRegistry,
  goalsRegistry,
 ]);
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
