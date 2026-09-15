import { model, Schema } from 'mongoose';

export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = ['Not Started', 'In Progress', 'Done', 'Deleted'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface TaskPlannerDoc {
 projectName: string;
 resources: string[];
 tags: string[];
 priority: TaskPriority;
 status: TaskStatus;
 progress: number;
 startDate: Date;
 endDate: Date;
 createdAt: Date;
 updatedAt: Date;
}

const taskPlannerSchema = new Schema<TaskPlannerDoc>(
 {
  projectName: { type: String, required: true, trim: true },
  resources: { type: [String], required: true, validate: (v: string[]) => v.length > 0 },
  tags: { type: [String], default: [] },
  priority: { type: String, enum: TASK_PRIORITIES, required: true },
  status: { type: String, enum: TASK_STATUSES, default: 'Not Started' },
  progress: { type: Number, min: 0, max: 100, default: 0 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
 },
 { timestamps: true }
);

// Explicit collection name so it stays "taskPlanner" instead of mongoose's
// default pluralized/lowercased "taskplanners".
export const TaskPlannerModel = model<TaskPlannerDoc>('TaskPlanner', taskPlannerSchema, 'taskPlanner');
