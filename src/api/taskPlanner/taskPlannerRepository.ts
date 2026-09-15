import { TaskPlannerDoc, TaskPlannerModel } from '@/models/taskPlanner.model';

import { TaskPlanner } from './taskPlannerModel';

const toTaskPlanner = (doc: TaskPlannerDoc & { _id: unknown }): TaskPlanner =>
 ({
  id: String(doc._id),
  taskName: doc.taskName,
  developerName: doc.developerName,
  priority: doc.priority,
  startDate: doc.startDate,
  endDate: doc.endDate,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
 }) as TaskPlanner;

export const taskPlannerRepository = {
 findAllAsync: async (): Promise<TaskPlanner[]> => {
  const docs = await TaskPlannerModel.find().sort({ startDate: 1 }).lean();
  return docs.map(toTaskPlanner);
 },

 findByIdAsync: async (id: string): Promise<TaskPlanner | null> => {
  const doc = await TaskPlannerModel.findById(id).lean();
  return doc ? toTaskPlanner(doc) : null;
 },

 addAsync: async (task: Omit<TaskPlanner, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskPlanner> => {
  const doc = await TaskPlannerModel.create(task);
  return toTaskPlanner(doc.toObject());
 },

 updateAsync: async (
  id: string,
  updates: Partial<Omit<TaskPlanner, 'id' | 'createdAt' | 'updatedAt'>>
 ): Promise<TaskPlanner | null> => {
  const doc = await TaskPlannerModel.findByIdAndUpdate(id, updates, { new: true, runValidators: true }).lean();
  return doc ? toTaskPlanner(doc) : null;
 },

 deleteAsync: async (id: string): Promise<boolean> => {
  const result = await TaskPlannerModel.findByIdAndDelete(id);
  return result !== null;
 },
};
