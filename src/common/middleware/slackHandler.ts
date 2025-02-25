import { NextFunction } from 'express';

import { RequestProps } from '../interfaces/common';

export const slackHandler = (req: RequestProps, res: Response, next: NextFunction) => {
 next();
};
