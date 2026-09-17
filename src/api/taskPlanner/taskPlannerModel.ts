import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { TASK_PRIORITIES, TASK_STATUSES } from '@/models/taskPlanner.model';

extendZodWithOpenApi(z);

export type TaskPlanner = z.infer<typeof TaskPlannerSchema>;

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'id must be a valid MongoDB ObjectId');

const common = {
 projectName: z.string().min(1, 'projectName is required'),
 resources: z.array(z.string().min(1)).min(1, 'at least one resource is required'),
 tags: z.array(z.string().min(1)).default([]),
 priority: z.enum(TASK_PRIORITIES),
 status: z.enum(TASK_STATUSES).default('Not Started'),
 progress: z.coerce.number().min(0).max(100).default(0),
 startDate: z.coerce.date(),
 endDate: z.coerce.date(),
};

export const TaskPlannerSchema = z.object({
 id: objectId,
 ...common,
 createdAt: z.date(),
 updatedAt: z.date(),
});

export const AddTaskPlannerSchema = z.object({
 body: z.object({ ...common }),
});

export const UpdateTaskPlannerSchema = z.object({
 params: z.object({ id: objectId }),
 body: z.object({
  projectName: common.projectName.optional(),
  resources: common.resources.optional(),
  tags: common.tags.optional(),
  priority: common.priority.optional(),
  status: common.status.optional(),
  progress: common.progress.optional(),
  startDate: common.startDate.optional(),
  endDate: common.endDate.optional(),
 }),
});

export const GetTaskPlannerSchema = z.object({
 params: z.object({ id: objectId }),
});

export const DeleteTaskPlannerSchema = z.object({
 params: z.object({ id: objectId }),
});
