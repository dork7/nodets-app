import { NextFunction, Response } from 'express';

import { TKafka } from '@/api/kafka/kafkaModel';
import { sendKafkaMessage } from '@/services/kafkaService';

import { RequestProps } from '../interfaces/common';

export const reqLoggerKafka = (req: RequestProps, res: Response, next: NextFunction) => {
 next();
 if (req.enableKafkaLog) {
  const oldJson = res.send;
  res.send = (body) => {
   const reqLogBody: TKafka = {
    config: { topic: 'logging', key: 'logKey' },
    data: {
     nativeResponseBody: body,
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
 }
};
