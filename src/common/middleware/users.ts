import { NextFunction, Response } from 'express';

import { logger } from '@/server';

import { RequestProps } from '../interfaces/common';

export const userMiddleWare = (test: any) => async (_req: RequestProps, _res: Response, next: NextFunction) => {
 logger.info(test());

 
 next();
//  await new Promise((resolve) => setTimeout(resolve, 1000));
 //  return;
 logger.info('');
};
