import { redisClient } from '@/config/redisStore';
import { redis } from '@/services/redisStore';

import { Goal } from './goalsModel';

const GOAL_KEY_PREFIX = 'goal:';
const GOALS_INDEX_KEY = 'goals:index';

const goalKey = (id: string) => `${GOAL_KEY_PREFIX}${id}`;

export const goalsRepository = {
 save: async (goal: Goal): Promise<void> => {
  // ttl 0 -> redis.setValue omits EX, storing the goal with no expiry
  await redis.setValue(goalKey(goal.id), goal, 0);
  await redisClient.sAdd(GOALS_INDEX_KEY, goal.id);
 },

 findById: async (id: string): Promise<Goal | null> => {
  return (await redis.getValue(goalKey(id))) as unknown as Goal | null;
 },

 findAll: async (): Promise<Goal[]> => {
  const ids = await redisClient.sMembers(GOALS_INDEX_KEY);
  if (ids.length === 0) {
   return [];
  }
  const goals = await Promise.all(ids.map((id) => goalsRepository.findById(id)));
  return goals.filter((goal): goal is Goal => goal !== null);
 },

 deleteById: async (id: string): Promise<void> => {
  await redisClient.del(goalKey(id));
  await redisClient.sRem(GOALS_INDEX_KEY, id);
 },
};
