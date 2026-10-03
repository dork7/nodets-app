import { Answer, Laya, Question } from '@receptron/laya';
import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { DEFAULT_TICKET_QUESTIONS } from '@/config/prompt';
import { logger } from '@/server';

export type TicketInput = { subject: string; body: string };

export type TicketClassification = {
 answers: Record<string, Answer>;
 usage: { input_tokens: number; output_tokens: number };
};

// Loading the ONNX model/session is expensive, so it's done once and the same
// instance is reused for every request over the process lifetime.
let layaPromise: Promise<Laya> | null = null;

const getLaya = (): Promise<Laya> => {
 if (!layaPromise) {
  layaPromise = Laya.load().catch((ex) => {
   layaPromise = null;
   throw ex;
  });
 }
 return layaPromise;
};

export const layaService = {
 classifyTicket: async (
  ticket: TicketInput,
  questions?: Record<string, Question>
 ): Promise<ServiceResponse<TicketClassification | null>> => {
  try {
   const laya = await getLaya();
   const result = await laya.systemOne(
    ticket,
    questions && Object.keys(questions).length ? questions : DEFAULT_TICKET_QUESTIONS
   );

   return new ServiceResponse<TicketClassification>(
    ResponseStatus.Success,
    'Ticket classified successfully',
    { answers: result.answers, usage: result.usage },
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Failed to classify ticket: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },
};
