import { Request, Response } from 'express';

export interface RequestProps extends Request {
 hashKey?: string;
 cacheTTL?: number;
 enableKafkaLog?: boolean;
}

export interface ResponseProps extends Response {
 headers?: string;
 cacheTTL?: number;
 enableKafkaLog?: boolean;
}
