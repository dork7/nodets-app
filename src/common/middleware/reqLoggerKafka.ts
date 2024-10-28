import { NextFunction, Request, Response } from 'express';
import * as zlib from 'zlib';

import { TKafka } from '@/api/kafka/kafkaModel';
import { sendKafkaMessage } from '@/services/kafkaService';

export const reqLoggerKafka = (req: Request, res: Response, next: NextFunction) => {
 next();

 const oldJson = res.send;
 res.send = (body) => {
  const reqLogBody: TKafka = {
   config: { topic: 'logging', key: 'logKey' },
   data: {
    nativeResponseBody: zlib.gzipSync(body).toString('base64'),
    nativeHeader: req.headers,
    nativeRequestURL: req.baseUrl,
    apiURL: `${req.hostname}${req.baseUrl}`,
    nativeRequestBody: req.body,
    nativeRequestQuery: req.query,
    nativeRequestParams: req.params,
    nativeResponseHeaders: res.getHeaders(),
   },
  };
  sendKafkaMessage(reqLogBody, res.getHeaders()['x-request-id'] as string);
  return oldJson.call(res, body);
 };
};
