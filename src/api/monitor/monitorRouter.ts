import express, { Request, Response, Router } from 'express';
import { StatusCodes } from 'http-status-codes';

import { ResponseStatus, ServiceResponse } from '@/common/models/serviceResponse';
import { handleServiceResponse } from '@/common/utils/httpHandlers';
import { AiCallLog, ModelMetricsSnapshot, monitorService } from '@/services/monitorService';

export const monitorRouter: Router = (() => {
 const router = express.Router();

 // The global helmet() CSP is `script-src 'self'`, which blocks this page's
 // inline bootstrap script and the Chart.js CDN. Relax it for the dashboard
 // HTML only (JSON API routes below keep the strict global policy).
 router.get('/dashboard', (_req: Request, res: Response) => {
  res.setHeader(
   'Content-Security-Policy',
   [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "connect-src 'self'",
   ].join('; ')
  );
  res.render('monitor');
 });

 router.get('/logs', async (_req: Request, res: Response) => {
  const logs = await monitorService.getRecentLogs();
  handleServiceResponse(
   new ServiceResponse<AiCallLog[]>(ResponseStatus.Success, 'Logs retrieved', logs, StatusCodes.OK),
   res
  );
 });

 router.get('/models', async (_req: Request, res: Response) => {
  const snapshot = await monitorService.getModelMetrics();
  handleServiceResponse(
   new ServiceResponse<ModelMetricsSnapshot>(
    ResponseStatus.Success,
    'Model metrics retrieved',
    snapshot,
    StatusCodes.OK
   ),
   res
  );
 });

 router.get('/stats/:model', async (req: Request, res: Response) => {
  const stats = await monitorService.getModelStats(req.params.model);

  if (!stats) {
   return handleServiceResponse(
    new ServiceResponse(ResponseStatus.Failed, 'Stats not found', null, StatusCodes.NOT_FOUND),
    res
   );
  }

  handleServiceResponse(
   new ServiceResponse(ResponseStatus.Success, 'Stats retrieved', stats, StatusCodes.OK),
   res
  );
 });

 return router;
})();

export default monitorRouter;
