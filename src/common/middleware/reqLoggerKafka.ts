import { NextFunction, Request, Response } from 'express';

import { TKafka } from '@/api/kafka/kafkaModel';
import { sendKafkaMessage } from '@/services/kafkaService';

export const reqLoggerKafka = (req: Request, res: Response, next: NextFunction) => {
 next();

 const oldJson = res.send;
 res.send = (body) => {
  const reqLogBody: TKafka = {
   config: { topic: 'logging', key: 'logKey' },
   data: {
    nativeRequestBody: req.url,
    nativeResponseBody: body,
   },
  };
  sendKafkaMessage(reqLogBody, res.getHeaders()['x-request-id'] as string);
  res.locals.body = body;
  return oldJson.call(res, body);
 };

 console.log("t")
};
