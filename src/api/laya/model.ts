import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

const InstructionsSchema = z.union([z.string(), z.record(z.string(), z.unknown())]);

const ChoiceQuestionSchema = z
 .object({
  type: z.literal('choice'),
  instructions: InstructionsSchema,
  criteria: z
   .union([z.record(z.string(), z.string().nullable()), z.array(z.string())])
   .describe('option -> short description (or null), or a plain list of option names'),
 })
 .openapi('LayaChoiceQuestion');

const ScoreQuestionSchema = z
 .object({
  type: z.literal('score'),
  instructions: InstructionsSchema,
  criteria: z.array(z.string()).min(1).describe('ordered levels, index 0 = lowest'),
 })
 .openapi('LayaScoreQuestion');

const NoulQuestionSchema = z
 .object({
  type: z.literal('noul'),
  instructions: InstructionsSchema,
  criteria: z.object({ true: z.string().optional(), false: z.string().optional() }).optional(),
 })
 .openapi('LayaNoulQuestion');

export const LayaQuestionSchema = z.discriminatedUnion('type', [
 ChoiceQuestionSchema,
 ScoreQuestionSchema,
 NoulQuestionSchema,
]);

export const LayaClassifyTicketSchema = z.object({
 body: z.object({
  subject: z.string().min(1).describe('Ticket subject line'),
  body: z.string().min(1).describe('Ticket body text'),
  questions: z
   .record(z.string(), LayaQuestionSchema)
   .optional()
   .describe(
    'Question definitions keyed by name (choice / score / noul). Falls back to the built-in department/urgency/refundRisk set when omitted.'
   ),
 }),
});

const AnswerCommonSchema = { rl_agent: z.object({ act_probability: z.number() }) };

const ChoiceAnswerSchema = z.object({
 type: z.literal('choice'),
 choice: z.string(),
 probabilities: z.record(z.string(), z.number()),
 confidence: z.number(),
 ...AnswerCommonSchema,
});

const ScoreAnswerSchema = z.object({
 type: z.literal('score'),
 score: z.number(),
 legend: z.record(z.string(), z.string()),
 probabilities: z.record(z.string(), z.number()),
 confidence: z.number(),
 ...AnswerCommonSchema,
});

const NoulAnswerSchema = z.object({
 type: z.literal('noul'),
 noul: z.number().describe('P(true)'),
 ...AnswerCommonSchema,
});

const AnswerSchema = z.union([ChoiceAnswerSchema, ScoreAnswerSchema, NoulAnswerSchema]);

export const LayaClassifyTicketResponseSchema = z.object({
 answers: z.record(z.string(), AnswerSchema).describe("One answer per question key, typed by that question's type"),
 usage: z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
 }),
});
