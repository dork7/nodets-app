import { getModel, listModels } from '@/config/openaiConfig/registry';

export interface AIProviderInfo {
 name: string;
 baseURL: string;
}

export const getAIProviders = (): AIProviderInfo[] =>
 listModels().map((name) => {
  const handler = getModel(name) as { baseURL?: string } | undefined;
  return { name, baseURL: handler?.baseURL ?? '' };
 });
