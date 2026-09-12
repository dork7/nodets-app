import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

export const CourseSchema = z.object({
 videoId: z.string().optional(),
 title: z.string(),
 url: z.string(),
 channelTitle: z.string().optional(),
 durationHours: z.number().nonnegative().optional(),
 viewCount: z.number().nonnegative().optional(),
 likeCount: z.number().nonnegative().optional(),
});
export type Course = z.infer<typeof CourseSchema>;

export const TopicSchema = z.object({
 name: z.string(),
 description: z.string().optional(),
 course: CourseSchema.nullable().default(null),
 estimatedHours: z.number().nonnegative().nullable().default(null),
 loggedHours: z.number().nonnegative().default(0),
});
export type Topic = z.infer<typeof TopicSchema>;

export const LogEntrySchema = z.object({
 date: z.string(),
 hours: z.number().positive(),
 topic: z.string().optional(),
 note: z.string().optional(),
 loggedAt: z.string(),
});
export type LogEntry = z.infer<typeof LogEntrySchema>;

export const DerivedStatsSchema = z.object({
 totalEstimatedHours: z.number(),
 totalLoggedHours: z.number(),
 remainingHours: z.number(),
 actualPaceHoursPerDay: z.number(),
 projectedCompletionDate: z.string().nullable(),
 requiredPaceHoursPerDay: z.number().nullable(),
 onTrack: z.boolean().nullable(),
 status: z.enum(['not-started', 'in-progress', 'completed']),
 lastRecalculated: z.string(),
});
export type DerivedStats = z.infer<typeof DerivedStatsSchema>;

export const GoalSchema = z.object({
 id: z.string(),
 title: z.string(),
 createdAt: z.string(),
 targetDeadline: z.string().nullable().default(null),
 topics: z.array(TopicSchema).default([]),
 log: z.array(LogEntrySchema).default([]),
 derived: DerivedStatsSchema,
});
export type Goal = z.infer<typeof GoalSchema>;

export const TopicSuggestionSchema = z.object({
 name: z.string(),
 description: z.string().optional(),
});
export type TopicSuggestion = z.infer<typeof TopicSuggestionSchema>;

export const createGoalSchema = z.object({
 body: z.object({
  title: z.string().min(1),
  targetDeadline: z.string().nullable().optional(),
 }),
});

export const getGoalSchema = z.object({
 params: z.object({ id: z.string() }),
});

export const deleteGoalSchema = z.object({
 params: z.object({ id: z.string() }),
});

export const suggestTopicsSchema = z.object({
 params: z.object({ id: z.string() }),
 body: z
  .object({
   count: z.number().int().min(1).max(15).optional(),
   provider: z.string().optional(),
  })
  .optional(),
});

export const addTopicsSchema = z.object({
 params: z.object({ id: z.string() }),
 body: z.object({ topics: z.array(TopicSuggestionSchema).min(1) }),
});

export const removeTopicSchema = z.object({
 params: z.object({ id: z.string(), topicIndex: z.coerce.number().int().min(0) }),
});

export const suggestCoursesSchema = z.object({
 params: z.object({ id: z.string(), topicIndex: z.coerce.number().int().min(0) }),
 query: z.object({ q: z.string().optional() }).optional(),
});

export const setTopicCourseSchema = z.object({
 params: z.object({ id: z.string(), topicIndex: z.coerce.number().int().min(0) }),
 body: z.object({
  course: CourseSchema.nullable().optional(),
  estimatedHours: z.number().nonnegative(),
 }),
});

export const updateTopicEstimateSchema = z.object({
 params: z.object({ id: z.string(), topicIndex: z.coerce.number().int().min(0) }),
 body: z.object({ estimatedHours: z.number().nonnegative() }),
});

export const logStudySchema = z.object({
 params: z.object({ id: z.string() }),
 body: z.object({
  hours: z.number().positive(),
  topic: z.string().optional(),
  note: z.string().optional(),
  date: z.string().optional(),
 }),
});

export const setDeadlineSchema = z.object({
 params: z.object({ id: z.string() }),
 body: z.object({ targetDeadline: z.string().nullable() }),
});
