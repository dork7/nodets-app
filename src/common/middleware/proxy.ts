import { NextFunction, Response } from 'express';

import { RequestProps } from '../interfaces/common';

export const proxyList = [{ url: '/v1/catalogue' }];

export const proxyHandler = (req: RequestProps, res: Response, next: NextFunction) => {
 const found = proxyList.find((item) => item.url === req.originalUrl.split('?')[0]);
 if (found) {
  req.enableKafkaLog = true;
  res.setHeader('x-kafka-logging', 'TRUE');
 }
 next();
};
