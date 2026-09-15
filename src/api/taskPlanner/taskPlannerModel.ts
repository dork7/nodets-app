import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

import { TASK_PRIORITIES } from '@/models/taskPlanner.model';

extendZodWithOpenApi(z);

export type TaskPlanner = z.infer<typeof TaskPlannerSchema>;

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'id must be a valid MongoDB ObjectId');

const common = {
 taskName: z.string().min(1, 'taskName is required'),
 developerName: z.string().min(1, 'developerName is required'),
 priority: z.enum(TASK_PRIORITIES),
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
  taskName: common.taskName.optional(),
  developerName: common.developerName.optional(),
  priority: common.priority.optional(),
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
