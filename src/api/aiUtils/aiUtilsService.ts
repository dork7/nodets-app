import { execFile } from 'child_process';
import { StatusCodes } from 'http-status-codes';
import { promisify } from 'util';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { getLLMModels } from '@/common/utils/getDockerLLMS';
import { logger } from '@/server';
import { redis } from '@/services/redisStore';

const execFileAsync = promisify(execFile);

interface TokenUsage {
 prompt_tokens?: number;
 completion_tokens?: number;
 total_tokens?: number;
}

interface UnloadModelResult {
 model: string;
 success: boolean;
 message: string;
}

interface UnloadModelsResponse {
 unloaded: string[];
 failed: UnloadModelResult[];
 results: UnloadModelResult[];
}

const TOKEN_USAGE_KEY_PREFIX = 'token_usage_';

export const aiUtilsService = {
 async getChatHistory(userId: string): Promise<ServiceResponse<any[] | null>> {
  try {
   const history = await redis.getValue(`chat_history_${userId}`);
   const historyArray = history || [];

   if (!Array.isArray(historyArray)) {
    return new ServiceResponse(ResponseStatus.Success, 'No chat history found', [], StatusCodes.OK);
   }

   // Filter to only include user messages
   let userMessages = historyArray.filter((msg: any) => msg.role === 'user');

   if (userMessages.length === 0) {
    return new ServiceResponse(ResponseStatus.Success, 'No user messages found in chat history', [], StatusCodes.OK);
   }
   userMessages = userMessages.reverse();
   return new ServiceResponse<any[]>(
    ResponseStatus.Success,
    'Chat history retrieved successfully',
    userMessages,
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Error retrieving chat history for user ${userId}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 async getTokenUsage(userId: string): Promise<ServiceResponse<TokenUsage | null>> {
  try {
   const usageKey = `${TOKEN_USAGE_KEY_PREFIX}${userId}`;
   const usage = await redis.getValue(usageKey);

   if (!usage || typeof usage !== 'object' || !('prompt_tokens' in usage)) {
    return new ServiceResponse<TokenUsage>(
     ResponseStatus.Success,
     'No token usage found',
     { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
     StatusCodes.OK
    );
   }

   const tokenUsage = usage as TokenUsage;
   return new ServiceResponse<TokenUsage>(
    ResponseStatus.Success,
    'Token usage retrieved successfully',
    {
     prompt_tokens: tokenUsage.prompt_tokens || 0,
     completion_tokens: tokenUsage.completion_tokens || 0,
     total_tokens: tokenUsage.total_tokens || 0,
    },
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Error retrieving token usage for user ${userId}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 async unloadLLMModels(): Promise<ServiceResponse<UnloadModelsResponse | null>> {
  try {
   const dockerLLMS = await getLLMModels();
   if (dockerLLMS === undefined) {
    return new ServiceResponse(
     ResponseStatus.Failed,
     'Unable to retrieve LLM models',
     null,
     StatusCodes.INTERNAL_SERVER_ERROR
    );
   }

   const models = String(dockerLLMS ?? '')
    .split(',')
    .map((model: string) => model.trim())
    .filter(Boolean);

   if (models.length === 0) {
    return new ServiceResponse<UnloadModelsResponse>(
     ResponseStatus.Success,
     'No LLM models found to unload',
     { unloaded: [], failed: [], results: [] },
     StatusCodes.OK
    );
   }

   const results: UnloadModelResult[] = [];

   for (const model of models) {
    try {
     const { stdout, stderr } = await execFileAsync('docker', ['model', 'unload', model]);
     results.push({
      model,
      success: true,
      message: stdout.trim() || stderr.trim() || 'Model unloaded successfully',
     });
    } catch (error) {
     const message = error instanceof Error ? error.message : String(error);
     logger.error(`Error unloading LLM model ${model}: ${message}`);
     results.push({
      model,
      success: false,
      message,
     });
    }
   }

   const failed = results.filter((result) => !result.success);
   const unloaded = results.filter((result) => result.success).map((result) => result.model);
   const responseObject = { unloaded, failed, results };

   if (failed.length > 0) {
    return new ServiceResponse<UnloadModelsResponse>(
     ResponseStatus.Failed,
     'One or more LLM models failed to unload',
     responseObject,
     StatusCodes.INTERNAL_SERVER_ERROR
    );
   }

   return new ServiceResponse<UnloadModelsResponse>(
    ResponseStatus.Success,
    'LLM models unloaded successfully',
    responseObject,
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Error unloading LLM models: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },
};
