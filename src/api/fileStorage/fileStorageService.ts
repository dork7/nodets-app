import axios from 'axios';
import { StatusCodes } from 'http-status-codes';

import { LocalFileListItem } from '@/api/localStorage/localStorageModel';
import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { env } from '@/common/utils/envConfig';
import { logger } from '@/server';

export type FileStorageUploadResult = { id: string; url: string; name: string };

export type FileStorageUploadOptions = {
 folder?: string;
 type?: string;
 metadata?: Record<string, unknown>;
};

// This is the ONLY file that knows the current storage backend is the
// `/localStorage` endpoint, reached over HTTP. Everything else in the app talks
// to `fileStorageService`/`fileStorageRouter`; swapping the backend (S3, GCS,
// Minio, ...) later means changing only the request-building below - the
// service's exported shape and every caller stay the same.
const STORAGE_BASE_URL = `http://localhost:${env.PORT}/v1/localStorage`;

const buildWrapperFileUrl = (id: string): string => `/v1/fs-util/${id}`;

const appendUploadFields = (form: FormData, options: FileStorageUploadOptions): void => {
 if (options.folder) form.append('folder', options.folder);
 if (options.type) form.append('type', options.type);
 if (options.metadata) form.append('metadata', JSON.stringify(options.metadata));
};

const toFileStorageResult = (raw: FileStorageUploadResult): FileStorageUploadResult => ({
 ...raw,
 url: buildWrapperFileUrl(raw.id),
});

/** Wraps a failed backend call into a `ServiceResponse`, passing through the backend's own status/message when available. */
const passthroughError = <T>(ex: unknown, fallbackMessage: string): ServiceResponse<T | null> => {
 if (axios.isAxiosError(ex) && ex.response) {
  const body = ex.response.data as Partial<ServiceResponse<T>> | undefined;
  logger.error(`${fallbackMessage}: ${body?.message ?? ex.message}`);
  return new ServiceResponse<T | null>(
   ResponseStatus.Failed,
   body?.message ?? fallbackMessage,
   null,
   ex.response.status
  );
 }
 logger.error(`${fallbackMessage}: ${(ex as Error).message}`);
 return new ServiceResponse<T | null>(ResponseStatus.Failed, fallbackMessage, null, StatusCodes.INTERNAL_SERVER_ERROR);
};

export const fileStorageService = {
 uploadFile: async (
  file: Express.Multer.File,
  options: FileStorageUploadOptions = {}
 ): Promise<ServiceResponse<FileStorageUploadResult | null>> => {
  try {
   const form = new FormData();
   form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
   appendUploadFields(form, options);

   const { data } = await axios.post(`${STORAGE_BASE_URL}/upload`, form);

   return new ServiceResponse<FileStorageUploadResult>(
    ResponseStatus.Success,
    data.message ?? 'File uploaded successfully',
    toFileStorageResult(data.responseObject),
    StatusCodes.OK
   );
  } catch (ex) {
   return passthroughError(ex, 'Failed to upload file');
  }
 },

 uploadMultipleFiles: async (
  files: Express.Multer.File[],
  options: FileStorageUploadOptions = {}
 ): Promise<ServiceResponse<FileStorageUploadResult[] | null>> => {
  try {
   const form = new FormData();
   files.forEach((file) => {
    form.append('files', new Blob([file.buffer], { type: file.mimetype }), file.originalname);
   });
   appendUploadFields(form, options);

   const { data } = await axios.post(`${STORAGE_BASE_URL}/upload/multiple`, form);

   return new ServiceResponse<FileStorageUploadResult[]>(
    ResponseStatus.Success,
    data.message ?? 'Files uploaded successfully',
    (data.responseObject as FileStorageUploadResult[]).map(toFileStorageResult),
    StatusCodes.OK
   );
  } catch (ex) {
   return passthroughError(ex, 'Failed to upload files');
  }
 },

 listFiles: async (): Promise<ServiceResponse<LocalFileListItem[] | null>> => {
  try {
   const { data } = await axios.get(`${STORAGE_BASE_URL}/files`);
   const files: LocalFileListItem[] = (data.responseObject ?? []).map((file: LocalFileListItem) => ({
    ...file,
    url: buildWrapperFileUrl(file.id),
   }));
   return new ServiceResponse<LocalFileListItem[]>(
    ResponseStatus.Success,
    data.message ?? 'Files found',
    files,
    StatusCodes.OK
   );
  } catch (ex) {
   return passthroughError(ex, 'Failed to list files');
  }
 },

 getFile: async (id: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null> => {
  try {
   const response = await axios.get(`${STORAGE_BASE_URL}/${id}`, { responseType: 'stream' });
   return {
    stream: response.data,
    contentType: (response.headers['content-type'] as string | undefined) ?? 'application/octet-stream',
   };
  } catch (ex) {
   logger.error(`Failed to get file: ${(ex as Error).message}`);
   return null;
  }
 },

 deleteFile: async (id: string): Promise<ServiceResponse<boolean | null>> => {
  try {
   const { data } = await axios.delete(`${STORAGE_BASE_URL}/${id}`);
   return new ServiceResponse<boolean>(
    ResponseStatus.Success,
    data.message ?? 'File deleted successfully',
    data.responseObject,
    StatusCodes.OK
   );
  } catch (ex) {
   return passthroughError(ex, 'Failed to delete file');
  }
 },

 deleteAllFiles: async (folder?: string): Promise<ServiceResponse<number | null>> => {
  try {
   const { data } = await axios.delete(`${STORAGE_BASE_URL}/all`, { params: folder ? { folder } : undefined });
   return new ServiceResponse<number>(
    ResponseStatus.Success,
    data.message ?? 'All files deleted successfully',
    data.responseObject ?? 0,
    StatusCodes.OK
   );
  } catch (ex) {
   return passthroughError(ex, 'Failed to delete all files');
  }
 },
};
