import { Answer, ChoiceQuestion, Laya, NoulQuestion, Question, ScoreQuestion } from '@receptron/laya';
import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
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

// Default support-ticket triage, used when the caller doesn't supply its own
// `questions`: which department should own it, how urgent it is, and whether
// the customer is asking for a refund.
const DEFAULT_TICKET_QUESTIONS: { department: ChoiceQuestion; urgency: ScoreQuestion; refundRisk: NoulQuestion } = {
 department: {
  type: 'choice',
  instructions: 'Which department should handle this support ticket?',
  criteria: {
   billing: 'Payment, invoicing, subscription, or refund issues',
   technical: 'Bugs, errors, or product functionality issues',
   general: 'Account questions, feedback, or anything else',
  },
 },
 urgency: {
  type: 'score',
  instructions: 'How urgently does this ticket need a response?',
  criteria: ['low', 'medium', 'high', 'critical'],
 },
 refundRisk: {
  type: 'noul',
  instructions: 'Is the customer asking for a refund?',
 },
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
