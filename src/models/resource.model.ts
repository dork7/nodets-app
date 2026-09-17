import { model, Schema } from 'mongoose';

export interface ResourceDoc {
 name: string;
 createdAt: Date;
 updatedAt: Date;
}

const resourceSchema = new Schema<ResourceDoc>(
 { name: { type: String, required: true, trim: true, unique: true } },
 { timestamps: true }
);

export const ResourceModel = model<ResourceDoc>('Resource', resourceSchema, 'resources');
