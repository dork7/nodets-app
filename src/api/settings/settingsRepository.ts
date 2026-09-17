import { Model } from 'mongoose';

import { SettingItem } from './settingsModel';

interface NamedDoc {
 name: string;
 createdAt: Date;
 updatedAt: Date;
}

const toSettingItem = (doc: NamedDoc & { _id: unknown }): SettingItem => ({
 id: String(doc._id),
 name: doc.name,
 createdAt: doc.createdAt,
 updatedAt: doc.updatedAt,
});

export const createSettingsRepository = <T extends NamedDoc>(model: Model<T>) => ({
 findAllAsync: async (): Promise<SettingItem[]> => {
  const docs = await model.find().sort({ name: 1 }).lean();
  return docs.map((doc) => toSettingItem(doc as unknown as NamedDoc & { _id: unknown }));
 },

 addAsync: async (name: string): Promise<SettingItem> => {
  const doc = await model.create({ name } as Partial<T>);
  return toSettingItem(doc.toObject());
 },

 deleteAsync: async (id: string): Promise<boolean> => {
  const result = await model.findByIdAndDelete(id);
  return result !== null;
 },
});
