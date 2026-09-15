import { model, Schema } from 'mongoose';

export const TASK_PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskPlannerDoc {
 taskName: string;
 developerName: string;
 priority: TaskPriority;
 startDate: Date;
 endDate: Date;
 createdAt: Date;
 updatedAt: Date;
}

const taskPlannerSchema = new Schema<TaskPlannerDoc>(
 {
  taskName: { type: String, required: true, trim: true },
  developerName: { type: String, required: true, trim: true },
  priority: { type: String, enum: TASK_PRIORITIES, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
 },
 { timestamps: true }
);

// Explicit collection name so it stays "taskPlanner" instead of mongoose's
// default pluralized/lowercased "taskplanners".
export const TaskPlannerModel = model<TaskPlannerDoc>('TaskPlanner', taskPlannerSchema, 'taskPlanner');
