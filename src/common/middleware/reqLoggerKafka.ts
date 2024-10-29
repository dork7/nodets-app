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
     nativeResponse: body,
     nativeHeader: req.headers,
     nativeRequestURL: req.originalUrl,
     apiURL: `${req.hostname}${req.originalUrl}`,
     nativeRequestBody: req.body,
     nativeRequestQuery: req.query,
     nativeRequestParams: req.params,
     nativeResponseHeaders: res.getHeaders(),
     'X-Request-Id': req.headers['X-Request-Id'],
     requestId: req.headers['X-Request-Id'],
    },
   };

   oldJson.call(res, body);
   sendKafkaMessage(reqLogBody, res.getHeaders()['x-request-id'] as string);
   return;
  };
 }
};
