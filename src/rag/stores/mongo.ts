import mongoose from 'mongoose';

/** The connection the app (or the worker) already opened - this module never connects on its own. */
export function getDb() {
 const db = mongoose.connection.db;
 if (!db) throw new Error('MongoDB is not connected yet');
 return db;
}

export const blobBucket = () => new mongoose.mongo.GridFSBucket(getDb(), { bucketName: 'rag_blobs' });

export const toObjectId = (id: string) => new mongoose.mongo.ObjectId(id);
