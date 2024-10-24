import { NextFunction, Response } from 'express';

import { logger } from '@/server';

import { RequestProps } from '../interfaces/common';

export const userMiddleWare = (test) => (_req: RequestProps, _res: Response, next: NextFunction) => {
 logger.info(test());
 next();
 return;
 logger.info('here2');
};
