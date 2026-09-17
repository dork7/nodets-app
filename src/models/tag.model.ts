import { model, Schema } from 'mongoose';

export interface TagDoc {
 name: string;
 createdAt: Date;
 updatedAt: Date;
}

const tagSchema = new Schema<TagDoc>(
 { name: { type: String, required: true, trim: true, unique: true } },
 { timestamps: true }
);

export const TagModel = model<TagDoc>('Tag', tagSchema, 'tags');
