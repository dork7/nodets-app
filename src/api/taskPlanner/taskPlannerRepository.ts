import { TaskPlannerDoc, TaskPlannerModel } from '@/models/taskPlanner.model';

import { TaskPlanner } from './taskPlannerModel';

const toTaskPlanner = (doc: TaskPlannerDoc & { _id: unknown }): TaskPlanner =>
 ({
  id: String(doc._id),
  projectName: doc.projectName,
  resources: doc.resources,
  tags: doc.tags,
  priority: doc.priority,
  status: doc.status,
  progress: doc.progress,
  startDate: doc.startDate,
  endDate: doc.endDate,
  createdAt: doc.createdAt,
  updatedAt: doc.updatedAt,
 }) as TaskPlanner;

export const taskPlannerRepository = {
 // Deleted projects are soft-deleted (status: 'Deleted') and excluded here
 // rather than removed, so the change is traceable.
 findAllAsync: async (): Promise<TaskPlanner[]> => {
  const docs = await TaskPlannerModel.find({ status: { $ne: 'Deleted' } })
   .sort({ startDate: 1 })
   .lean();
  return docs.map(toTaskPlanner);
 },

 findByIdAsync: async (id: string): Promise<TaskPlanner | null> => {
  const doc = await TaskPlannerModel.findById(id).lean();
  return doc ? toTaskPlanner(doc) : null;
 },

 addAsync: async (project: Omit<TaskPlanner, 'id' | 'createdAt' | 'updatedAt'>): Promise<TaskPlanner> => {
  const doc = await TaskPlannerModel.create(project);
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
