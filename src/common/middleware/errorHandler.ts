import { ErrorRequestHandler, RequestHandler } from 'express';
import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '../models/serviceResponse';
import { env } from '../utils/envConfig';
import { sendSlackNotification } from '../utils/slack';

const unexpectedRequest: RequestHandler = (_req, res) => {
 res.sendStatus(StatusCodes.NOT_FOUND);
};

const addErrorToRequestLog: ErrorRequestHandler = (err, _req, res, next) => {
 res.locals.err = err;
 next(err);
};

// Without this, an unhandled error (e.g. malformed JSON from express.json())
// falls through to Express's default handler, which sends an HTML stack
// trace instead of the JSON every other endpoint returns. `next` is unused
// but required so Express recognizes this as error-handling middleware (arity 4).
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const sendJsonError: ErrorRequestHandler = (err, _req, res, next) => {
 const statusCode =
  typeof err?.status === 'number'
   ? err.status
   : typeof err?.statusCode === 'number'
     ? err.statusCode
     : StatusCodes.INTERNAL_SERVER_ERROR;
 const message =
  statusCode === StatusCodes.INTERNAL_SERVER_ERROR ? 'Internal Server Error' : err?.message || 'Request failed';

 sendSlackNotification(err?.stack ?? message);
 res
  .status(statusCode)
  .json(
   new ServiceResponse(
    ResponseStatus.Failed,
    message,
    null,
    statusCode,
    env.NODE_ENV !== 'production' ? err : undefined
   )
  );
};

export default () => [unexpectedRequest, addErrorToRequestLog, sendJsonError];
