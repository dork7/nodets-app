import { ErrorRequestHandler, RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';

import { sendSlackMessage } from '../utils/slack';

const unexpectedRequest: RequestHandler = (_req, res) => {
 res.sendStatus(StatusCodes.NOT_FOUND);
};

const addErrorToRequestLog: ErrorRequestHandler = (err, _req, res, next) => {
 res.locals.err = err;
 next(err);
};

export default () => [unexpectedRequest, addErrorToRequestLog];
