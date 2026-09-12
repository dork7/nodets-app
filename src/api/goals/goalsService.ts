import { StatusCodes } from 'http-status-codes';

import { getDefaultChatModel, OPENROUTER_PROVIDER } from '@/api/chat/chatService';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { env } from '@/common/utils/envConfig';
import { openai } from '@/config/openaiConfig';
import { openRouterAIInstance } from '@/config/openaiConfig/providers/openRouterAI';
import { logger } from '@/server';

import { Course, DerivedStats, Goal, LogEntry, Topic, TopicSuggestion } from './goalsModel';
import { goalsRepository } from './goalsRepository';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const YOUTUBE_VIDEOS_URL = 'https://www.googleapis.com/youtube/v3/videos';

const round2 = (value: number): number => Math.round(value * 100) / 100;

const slugify = (value: string): string =>
 value
  .toLowerCase()
  .trim()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/(^-|-$)/g, '') || 'goal';

const toUtcDate = (value: string): Date => {
 const [year, month, day] = value.slice(0, 10).split('-').map(Number);
 return new Date(Date.UTC(year, (month || 1) - 1, day || 1));
};

const todayUtc = (): Date => {
 const now = new Date();
 return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
};

const daysBetween = (from: Date, to: Date): number => Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);

const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

const computeDerived = (goal: Pick<Goal, 'topics' | 'log' | 'targetDeadline'>): DerivedStats => {
 const totalEstimatedHours = goal.topics.reduce((sum, topic) => sum + (topic.estimatedHours ?? 0), 0);
 const totalLoggedHours = goal.log.reduce((sum, entry) => sum + entry.hours, 0);
 const remainingHours = Math.max(totalEstimatedHours - totalLoggedHours, 0);

 const today = todayUtc();
 const firstLogDate =
  goal.log.length > 0 ? toUtcDate([...goal.log].sort((a, b) => a.date.localeCompare(b.date))[0].date) : null;

 const daysSinceStart = firstLogDate ? Math.max(1, daysBetween(firstLogDate, today) + 1) : 0;
 const actualPaceHoursPerDay = daysSinceStart > 0 ? totalLoggedHours / daysSinceStart : 0;

 let projectedCompletionDate: string | null = null;
 if (totalEstimatedHours > 0 && remainingHours <= 0) {
  projectedCompletionDate = formatDate(today);
 } else if (actualPaceHoursPerDay > 0) {
  const daysNeeded = Math.ceil(remainingHours / actualPaceHoursPerDay);
  projectedCompletionDate = formatDate(new Date(today.getTime() + daysNeeded * MS_PER_DAY));
 }

 let requiredPaceHoursPerDay: number | null = null;
 let onTrack: boolean | null = null;
 if (goal.targetDeadline) {
  const deadline = toUtcDate(goal.targetDeadline);
  const daysUntilDeadline = daysBetween(today, deadline);
  if (remainingHours <= 0) {
   requiredPaceHoursPerDay = 0;
   onTrack = true;
  } else if (daysUntilDeadline <= 0) {
   requiredPaceHoursPerDay = null;
   onTrack = false;
  } else {
   requiredPaceHoursPerDay = round2(remainingHours / daysUntilDeadline);
   onTrack = actualPaceHoursPerDay >= requiredPaceHoursPerDay;
  }
 }

 const status: DerivedStats['status'] =
  totalEstimatedHours > 0 && remainingHours <= 0 ? 'completed' : totalLoggedHours > 0 ? 'in-progress' : 'not-started';

 return {
  totalEstimatedHours: round2(totalEstimatedHours),
  totalLoggedHours: round2(totalLoggedHours),
  remainingHours: round2(remainingHours),
  actualPaceHoursPerDay: round2(actualPaceHoursPerDay),
  projectedCompletionDate,
  requiredPaceHoursPerDay,
  onTrack,
  status,
  lastRecalculated: new Date().toISOString(),
 };
};

const recalc = (goal: Goal): Goal => ({ ...goal, derived: computeDerived(goal) });

const parseISO8601Duration = (iso: string): number => {
 const match = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
 if (!match) {
  return 0;
 }
 const [, h, m, s] = match;
 return (Number(h || 0) * 3600 + Number(m || 0) * 60 + Number(s || 0)) / 3600;
};

export const goalsService = {
 createGoal: async (title: string, targetDeadline?: string | null): Promise<ServiceResponse<Goal | null>> => {
  try {
   const baseSlug = slugify(title);
   let id = baseSlug;
   let suffix = 2;
   while (await goalsRepository.findById(id)) {
    id = `${baseSlug}-${suffix}`;
    suffix += 1;
   }

   const goal = recalc({
    id,
    title: title.trim(),
    createdAt: new Date().toISOString(),
    targetDeadline: targetDeadline ?? null,
    topics: [],
    log: [],
    derived: {} as DerivedStats,
   });

   await goalsRepository.save(goal);
   return new ServiceResponse<Goal>(ResponseStatus.Success, 'Goal created', goal, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error creating goal: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 listGoals: async (): Promise<ServiceResponse<Goal[]>> => {
  try {
   const goals = await goalsRepository.findAll();
   goals.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
   return new ServiceResponse<Goal[]>(ResponseStatus.Success, 'Goals retrieved', goals, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error listing goals: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, [], StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 getGoal: async (id: string): Promise<ServiceResponse<Goal | null>> => {
  try {
   const goal = await goalsRepository.findById(id);
   if (!goal) {
    return new ServiceResponse(ResponseStatus.Failed, 'Goal not found', null, StatusCodes.NOT_FOUND);
   }
   return new ServiceResponse<Goal>(ResponseStatus.Success, 'Goal retrieved', goal, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error retrieving goal ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 deleteGoal: async (id: string): Promise<ServiceResponse<{ deleted: boolean } | null>> => {
  try {
   const goal = await goalsRepository.findById(id);
   if (!goal) {
    return new ServiceResponse(ResponseStatus.Failed, 'Goal not found', null, StatusCodes.NOT_FOUND);
   }
   await goalsRepository.deleteById(id);
   return new ServiceResponse(ResponseStatus.Success, 'Goal deleted', { deleted: true }, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error deleting goal ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 suggestTopics: async (
  id: string,
  count = 8,
  provider?: string
 ): Promise<ServiceResponse<TopicSuggestion[] | null>> => {
  try {
   const goal = await goalsRepository.findById(id);
   if (!goal) {
    return new ServiceResponse(ResponseStatus.Failed, 'Goal not found', null, StatusCodes.NOT_FOUND);
   }

   const prompt = [
    `List ${count} key subtopics someone should learn to achieve this learning goal: "${goal.title}".`,
    'Order them roughly from beginner to advanced.',
    'Respond with ONLY a JSON array of objects like [{"name": "...", "description": "..."}].',
    'No prose, no markdown code fences, no extra keys.',
   ].join(' ');

   const useOpenRouter = provider?.trim().toLowerCase() === OPENROUTER_PROVIDER;
   const client = useOpenRouter ? openRouterAIInstance : openai;

   const completion = await client.chat.completions.create({
    model: getDefaultChatModel(provider),
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.4,
   });

   const raw = completion.choices[0]?.message?.content?.trim() ?? '[]';
   const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
   const parsed = JSON.parse(jsonText);

   if (!Array.isArray(parsed)) {
    throw new Error('Model did not return a JSON array');
   }

   const suggestions: TopicSuggestion[] = parsed
    .filter((item) => item && typeof item.name === 'string')
    .map((item) => ({
     name: item.name,
     description: typeof item.description === 'string' ? item.description : undefined,
    }));

   return new ServiceResponse<TopicSuggestion[]>(
    ResponseStatus.Success,
    'Topic suggestions generated',
    suggestions,
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Error suggesting topics for goal ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 addTopics: async (id: string, topics: TopicSuggestion[]): Promise<ServiceResponse<Goal | null>> => {
  try {
   const goal = await goalsRepository.findById(id);
   if (!goal) {
    return new ServiceResponse(ResponseStatus.Failed, 'Goal not found', null, StatusCodes.NOT_FOUND);
   }

   const newTopics: Topic[] = topics.map((topic) => ({
    name: topic.name,
    description: topic.description,
    course: null,
    estimatedHours: null,
    loggedHours: 0,
   }));

   const updated = recalc({ ...goal, topics: [...goal.topics, ...newTopics] });
   await goalsRepository.save(updated);
   return new ServiceResponse<Goal>(ResponseStatus.Success, 'Topics added', updated, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error adding topics to goal ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 removeTopic: async (id: string, topicIndex: number): Promise<ServiceResponse<Goal | null>> => {
  try {
   const goal = await goalsRepository.findById(id);
   if (!goal) {
    return new ServiceResponse(ResponseStatus.Failed, 'Goal not found', null, StatusCodes.NOT_FOUND);
   }
   if (!goal.topics[topicIndex]) {
    return new ServiceResponse(ResponseStatus.Failed, 'Topic not found', null, StatusCodes.NOT_FOUND);
   }

   const topics = goal.topics.filter((_, index) => index !== topicIndex);
   const updated = recalc({ ...goal, topics });
   await goalsRepository.save(updated);
   return new ServiceResponse<Goal>(ResponseStatus.Success, 'Topic removed', updated, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error removing topic from goal ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 suggestCourses: async (
  id: string,
  topicIndex: number,
  queryOverride?: string
 ): Promise<ServiceResponse<Course[] | null>> => {
  try {
   const goal = await goalsRepository.findById(id);
   if (!goal) {
    return new ServiceResponse(ResponseStatus.Failed, 'Goal not found', null, StatusCodes.NOT_FOUND);
   }
   const topic = goal.topics[topicIndex];
   if (!topic) {
    return new ServiceResponse(ResponseStatus.Failed, 'Topic not found', null, StatusCodes.NOT_FOUND);
   }

   if (!env.YOUTUBE_API_KEY) {
    return new ServiceResponse(
     ResponseStatus.Failed,
     'YOUTUBE_API_KEY is not configured on the server. Set it in .env to enable course search.',
     null,
     StatusCodes.SERVICE_UNAVAILABLE
    );
   }

   const query = queryOverride?.trim() || `${topic.name} ${goal.title} tutorial`;

   const searchParams = new URLSearchParams({
    key: env.YOUTUBE_API_KEY,
    q: query,
    part: 'snippet',
    type: 'video',
    maxResults: '15',
    order: 'viewCount',
    relevanceLanguage: 'en',
   });
   const searchRes = await fetch(`${YOUTUBE_SEARCH_URL}?${searchParams.toString()}`);
   if (!searchRes.ok) {
    throw new Error(`YouTube search failed with status ${searchRes.status}`);
   }
   const searchJson: any = await searchRes.json();
   const videoIds: string[] = (searchJson.items || []).map((item: any) => item.id?.videoId).filter(Boolean);

   if (videoIds.length === 0) {
    return new ServiceResponse<Course[]>(ResponseStatus.Success, 'No videos found', [], StatusCodes.OK);
   }

   const videosParams = new URLSearchParams({
    key: env.YOUTUBE_API_KEY,
    id: videoIds.join(','),
    part: 'snippet,contentDetails,statistics',
   });
   const videosRes = await fetch(`${YOUTUBE_VIDEOS_URL}?${videosParams.toString()}`);
   if (!videosRes.ok) {
    throw new Error(`YouTube video lookup failed with status ${videosRes.status}`);
   }
   const videosJson: any = await videosRes.json();

   const courses: Course[] = (videosJson.items || [])
    .map((item: any) => ({
     videoId: item.id,
     title: item.snippet?.title ?? 'Untitled video',
     channelTitle: item.snippet?.channelTitle,
     url: `https://www.youtube.com/watch?v=${item.id}`,
     durationHours: round2(parseISO8601Duration(item.contentDetails?.duration ?? 'PT0S')),
     viewCount: Number(item.statistics?.viewCount ?? 0),
     likeCount: item.statistics?.likeCount !== undefined ? Number(item.statistics.likeCount) : undefined,
    }))
    // Rank by view count (the most reliable, always-available popularity signal) and
    // keep only the top 3 — the search API's own order=viewCount already sorts this
    // way, but videos.list can return items in a different order, so re-sort here.
    .sort((a: Course, b: Course) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, 3);

   return new ServiceResponse<Course[]>(ResponseStatus.Success, 'Courses found', courses, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error suggesting courses for goal ${id} topic ${topicIndex}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 setTopicCourse: async (
  id: string,
  topicIndex: number,
  course: Course | null | undefined,
  estimatedHours: number
 ): Promise<ServiceResponse<Goal | null>> => {
  try {
   const goal = await goalsRepository.findById(id);
   if (!goal) {
    return new ServiceResponse(ResponseStatus.Failed, 'Goal not found', null, StatusCodes.NOT_FOUND);
   }
   if (!goal.topics[topicIndex]) {
    return new ServiceResponse(ResponseStatus.Failed, 'Topic not found', null, StatusCodes.NOT_FOUND);
   }

   const topics = goal.topics.map((topic, index) =>
    index === topicIndex ? { ...topic, course: course ?? topic.course, estimatedHours } : topic
   );

   const updated = recalc({ ...goal, topics });
   await goalsRepository.save(updated);
   return new ServiceResponse<Goal>(ResponseStatus.Success, 'Topic course updated', updated, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error setting course for goal ${id} topic ${topicIndex}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 updateTopicEstimate: async (
  id: string,
  topicIndex: number,
  estimatedHours: number
 ): Promise<ServiceResponse<Goal | null>> => {
  try {
   const goal = await goalsRepository.findById(id);
   if (!goal) {
    return new ServiceResponse(ResponseStatus.Failed, 'Goal not found', null, StatusCodes.NOT_FOUND);
   }
   if (!goal.topics[topicIndex]) {
    return new ServiceResponse(ResponseStatus.Failed, 'Topic not found', null, StatusCodes.NOT_FOUND);
   }

   const topics = goal.topics.map((topic, index) => (index === topicIndex ? { ...topic, estimatedHours } : topic));
   const updated = recalc({ ...goal, topics });
   await goalsRepository.save(updated);
   return new ServiceResponse<Goal>(ResponseStatus.Success, 'Estimate updated', updated, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error updating estimate for goal ${id} topic ${topicIndex}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 logStudy: async (
  id: string,
  input: { hours: number; topic?: string; note?: string; date?: string }
 ): Promise<ServiceResponse<Goal | null>> => {
  try {
   const goal = await goalsRepository.findById(id);
   if (!goal) {
    return new ServiceResponse(ResponseStatus.Failed, 'Goal not found', null, StatusCodes.NOT_FOUND);
   }

   const entry: LogEntry = {
    date: input.date ?? formatDate(todayUtc()),
    hours: input.hours,
    topic: input.topic,
    note: input.note,
    loggedAt: new Date().toISOString(),
   };

   const topics = goal.topics.map((topic) =>
    topic.name === input.topic ? { ...topic, loggedHours: round2(topic.loggedHours + input.hours) } : topic
   );

   const updated = recalc({ ...goal, topics, log: [...goal.log, entry] });
   await goalsRepository.save(updated);
   return new ServiceResponse<Goal>(ResponseStatus.Success, 'Study time logged', updated, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error logging study time for goal ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 setDeadline: async (id: string, targetDeadline: string | null): Promise<ServiceResponse<Goal | null>> => {
  try {
   const goal = await goalsRepository.findById(id);
   if (!goal) {
    return new ServiceResponse(ResponseStatus.Failed, 'Goal not found', null, StatusCodes.NOT_FOUND);
   }

   const updated = recalc({ ...goal, targetDeadline });
   await goalsRepository.save(updated);
   return new ServiceResponse<Goal>(ResponseStatus.Success, 'Deadline updated', updated, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Error setting deadline for goal ${id}: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },
};
