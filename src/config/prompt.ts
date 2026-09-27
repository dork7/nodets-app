import { ChoiceQuestion, NoulQuestion, ScoreQuestion } from '@receptron/laya';

// ===== Chatbot (chatAI WS handler) =====

export const DEFAULT_CHAT_PROMPT = 'Hello, AI!';

export const buildRagGuardrailPrompt = (extractedText: string): string =>
 `Answer the user's question using only the context below. Donot add According to the context in your reply ` +
 `If the context does not contain the answer, treat the users prompt as a normal question and continue giving answer with your own knowledge,\n\nContext:\n${extractedText}`;
//  `If the context does not contain the answer, say you don't know. IF THE VALUE PROVIDED IN THE CONTEXT IS EMPTY OR DOESNOT PROVIDE ENOUGH CONTEXT YOU MUST RETURN I DONT KNOW,\n\nContext:\n${extractedText}`;

// ===== Relation-check classifier (chatbot conversation continuity) =====

export const buildRelationCheckPrompt = (previousMessage: string, currentMessage: string): string =>
 [
  'You classify whether a NEW message relates to the PRIOR conversation.',
  'Respond with ONLY "yes" or "no". No explanation.',
  '',
  `<prior>${previousMessage}</prior>`,
  `<new>${currentMessage}</new>`,
  'Related?',
 ].join('\n');

// ===== RAG relevance check (query vs. retrieved vector-store context) =====

export const buildRagRelevancePrompt = (query: string, retrievedContext: string): string =>
 [
  'You classify whether the RETRIEVED CONTEXT is relevant to answering the USER QUERY.',
  'Respond with ONLY "yes" or "no". No explanation.',
  '',
  `<query>${query}</query>`,
  `<context>${retrievedContext}</context>`,
  'Is the context relevant to the query?',
 ].join('\n');

// ===== Vision / image analysis =====

export const DEFAULT_VISION_PROMPT =
 'Analyze this image and describe what you see in detail, including any text present in it.';

// ===== Goals: topic suggestion =====

export const buildTopicSuggestionPrompt = (count: number, goalTitle: string): string =>
 [
  `List ${count} key subtopics someone should learn to achieve this learning goal: "${goalTitle}".`,
  'Order them roughly from beginner to advanced.',
  'Respond with ONLY a JSON array of objects like [{"name": "...", "description": "..."}].',
  'No prose, no markdown code fences, no extra keys.',
 ].join(' ');

// ===== Laya support-ticket triage =====

// Default support-ticket triage, used when the caller doesn't supply its own
// `questions`: which department should own it, how urgent it is, and whether
// the customer is asking for a refund.
export const DEFAULT_TICKET_QUESTIONS: { department: ChoiceQuestion; urgency: ScoreQuestion; refundRisk: NoulQuestion } = {
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
