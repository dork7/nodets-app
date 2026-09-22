import { model, Schema } from 'mongoose';

export interface LocalFileDoc {
 fileId: string;
 name: string;
 folder: string;
 type?: string;
 size: number;
 mimetype: string;
 metadata?: Record<string, unknown>;
 ingested?: boolean;
 createdAt: Date;
}

const localFileSchema = new Schema<LocalFileDoc>(
 {
  fileId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  folder: { type: String, required: true },
  type: { type: String },
  size: { type: Number, required: true },
  mimetype: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed },
  ingested: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
 },
 { versionKey: false }
);

export const LocalFileModel = model<LocalFileDoc>('LocalFile', localFileSchema, 'localFiles');
