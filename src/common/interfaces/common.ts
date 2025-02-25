import { Request } from 'express';

export interface RequestProps extends Request {
 hashKey?: string;
 cacheTTL?: number;
 enableKafkaLog?: boolean;
}
