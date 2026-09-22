import fs from 'fs';
import fsPromises from 'fs/promises';
import { StatusCodes } from 'http-status-codes';
import multer from 'multer';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

import { LocalFileListItem, LocalFileReference } from '@/api/localStorage/localStorageModel';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { LocalFileDoc, LocalFileModel } from '@/models/localFile.model';
import { logger } from '@/server';

export type LocalStorageUploadResult = { id: string; url: string; name: string };

const STORAGE_ROOT = path.join(process.cwd(), process.env.LOCAL_STORAGE_DIR || 'localStorage');
const DEFAULT_FOLDER = process.env.LOCAL_STORAGE_FOLDER || 'uploads';

const upload = multer({
 storage: multer.memoryStorage(),
 limits: {
  fileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
 },
});

const ensureFolder = async (folder: string): Promise<string> => {
 const dir = path.join(STORAGE_ROOT, folder);
 await fsPromises.mkdir(dir, { recursive: true });
 return dir;
};

const buildFileUrl = (id: string): string => `/v1/localStorage/${id}`;

const toReference = (
 doc: Pick<LocalFileDoc, 'fileId' | 'name' | 'folder' | 'size' | 'mimetype' | 'createdAt'>
): LocalFileReference => ({
 id: doc.fileId,
 name: doc.name,
 folder: doc.folder,
 size: doc.size,
 mimetype: doc.mimetype,
 createdAt: doc.createdAt,
});

export const localStorageService = {
 uploadFile: async (
  file: Express.Multer.File,
  folder?: string,
  type?: string,
  metadata?: Record<string, unknown>
 ): Promise<ServiceResponse<LocalStorageUploadResult | null>> => {
  try {
   const targetFolder = folder || DEFAULT_FOLDER;
   const dir = await ensureFolder(targetFolder);
   const id = uuidv4();
   const filename = `${id}-${file.originalname}`;

   await fsPromises.writeFile(path.join(dir, filename), file.buffer);
   await LocalFileModel.create({
    fileId: id,
    name: filename,
    folder: targetFolder,
    type,
    size: file.size,
    mimetype: file.mimetype,
    metadata,
   });

   return new ServiceResponse<LocalStorageUploadResult>(
    ResponseStatus.Success,
    'File uploaded successfully',
    { id, url: buildFileUrl(id), name: filename },
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Failed to upload file to local storage: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 uploadMultipleFiles: async (
  files: Express.Multer.File[],
  folder?: string,
  type?: string,
  metadata?: Record<string, unknown>
 ): Promise<ServiceResponse<LocalStorageUploadResult[] | null>> => {
  try {
   const targetFolder = folder || DEFAULT_FOLDER;
   const dir = await ensureFolder(targetFolder);

   const uploadResults = await Promise.all(
    files.map(async (file) => {
     const id = uuidv4();
     const filename = `${id}-${file.originalname}`;

     await fsPromises.writeFile(path.join(dir, filename), file.buffer);
     await LocalFileModel.create({
      fileId: id,
      name: filename,
      folder: targetFolder,
      type,
      size: file.size,
      mimetype: file.mimetype,
      metadata,
     });

     return { id, url: buildFileUrl(id), name: filename };
    })
   );

   return new ServiceResponse<LocalStorageUploadResult[]>(
    ResponseStatus.Success,
    'Files uploaded successfully',
    uploadResults,
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Failed to upload files to local storage: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 listFiles: async (): Promise<ServiceResponse<LocalFileListItem[]>> => {
  try {
   const docs = await LocalFileModel.find().sort({ createdAt: -1 }).lean();
   const files: LocalFileListItem[] = docs.map((doc) => ({
    id: doc.fileId,
    name: doc.name,
    folder: doc.folder,
    size: doc.size,
    mimetype: doc.mimetype,
    url: buildFileUrl(doc.fileId),
    type: doc.type,
    metadata: doc.metadata,
    ingested: doc.ingested,
    createdAt: doc.createdAt,
   }));
   return new ServiceResponse<LocalFileListItem[]>(ResponseStatus.Success, 'Files found', files, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Failed to list files: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 getFile: async (id: string): Promise<{ stream: fs.ReadStream; reference: LocalFileReference } | null> => {
  const doc = await LocalFileModel.findOne({ fileId: id }).lean();
  if (!doc) {
   return null;
  }

  const filePath = path.join(STORAGE_ROOT, doc.folder, doc.name);
  try {
   await fsPromises.access(filePath);
  } catch {
   return null;
  }

  return { stream: fs.createReadStream(filePath), reference: toReference(doc) };
 },

 // Used internally by RAG loaders - reads the file's bytes straight off disk.
 getFileBuffer: async (id: string): Promise<{ buffer: Buffer; reference: LocalFileReference } | null> => {
  const doc = await LocalFileModel.findOne({ fileId: id }).lean();
  if (!doc) {
   return null;
  }

  const filePath = path.join(STORAGE_ROOT, doc.folder, doc.name);
  try {
   const buffer = await fsPromises.readFile(filePath);
   return { buffer, reference: toReference(doc) };
  } catch {
   return null;
  }
 },

 deleteFile: async (id: string): Promise<ServiceResponse<boolean>> => {
  try {
   const doc = await LocalFileModel.findOne({ fileId: id }).lean();
   if (!doc) {
    return new ServiceResponse(ResponseStatus.Failed, 'File not found', null, StatusCodes.NOT_FOUND);
   }

   const filePath = path.join(STORAGE_ROOT, doc.folder, doc.name);
   await fsPromises.rm(filePath, { force: true });
   await LocalFileModel.deleteOne({ fileId: id });

   return new ServiceResponse<boolean>(ResponseStatus.Success, 'File deleted successfully', true, StatusCodes.OK);
  } catch (ex) {
   const errorMessage = `Failed to delete file from local storage: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse(ResponseStatus.Failed, errorMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
  }
 },

 // With `folder`, only files in that folder are removed (mirrors minio's
 // per-bucket delete-all); without it, every file is removed.
 deleteAllFiles: async (folder?: string): Promise<ServiceResponse<number>> => {
  try {
   const filter = folder ? { folder } : {};
   const docs = await LocalFileModel.find(filter).lean();

   await Promise.all(docs.map((doc) => fsPromises.rm(path.join(STORAGE_ROOT, doc.folder, doc.name), { force: true })));
   await LocalFileModel.deleteMany(filter);

   logger.info(`Deleted ${docs.length} files from local storage${folder ? ` (folder: ${folder})` : ''}`);

   return new ServiceResponse<number>(
    ResponseStatus.Success,
    'All files deleted successfully',
    docs.length,
    StatusCodes.OK
   );
  } catch (ex) {
   const errorMessage = `Failed to delete all files from local storage: ${(ex as Error).message}`;
   logger.error(errorMessage);
   return new ServiceResponse<number>(
    ResponseStatus.Failed,
    errorMessage,
    null as unknown as number,
    StatusCodes.INTERNAL_SERVER_ERROR
   );
  }
 },
};

export const localStorageUpload = {
 single: upload.single('file'),
 multiple: upload.array('files', 10),
};
