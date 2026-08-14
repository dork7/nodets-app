import express, { Request, Response, Router } from 'express';
import multer from 'multer';

import { visionService } from '@/api/vision/visionService';
import { logger } from '@/server';

const upload = multer({
 storage: multer.memoryStorage(),
 limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
 fileFilter: (_req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
   return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'image'));
  }
  cb(null, true);
 },
});

interface FoodItemView {
 food_item: string;
 estimated_quantity?: string;
 calories?: number;
 protein_g?: number;
 fat_g?: number;
 carbohydrates_g?: number;
 fiber_g?: number;
}

interface ReportPayload {
 items: FoodItemView[];
 totals: { calories: number; protein: number; fat: number; carbs: number };
 itemCount: number;
 disclaimer?: string;
}

const fmtNum = (value: number | undefined): number => Math.round((value ?? 0) * 10) / 10;

const buildReport = (details: unknown): ReportPayload | null => {
 if (!Array.isArray(details)) {
  return null;
 }

 const items = details.filter((entry: any): entry is FoodItemView =>
  Boolean(entry && typeof entry.food_item === 'string')
 );
 const summary = details.find((entry: any) => entry && typeof entry.total_dish_estimate === 'string') ?? {};

 const useSummary = typeof summary.total_calories === 'number';
 const totals = {
  calories: useSummary ? summary.total_calories : items.reduce((sum, item) => sum + (item.calories ?? 0), 0),
  protein: useSummary ? summary.total_protein_g : items.reduce((sum, item) => sum + (item.protein_g ?? 0), 0),
  fat: useSummary ? summary.total_fat_g : items.reduce((sum, item) => sum + (item.fat_g ?? 0), 0),
  carbs: useSummary ? summary.total_carbs_g : items.reduce((sum, item) => sum + (item.carbohydrates_g ?? 0), 0),
 };

 return { items, totals, itemCount: items.length, disclaimer: summary.disclaimer };
};

export const nutritionRouter: Router = (() => {
 const router = express.Router();

 const renderEmpty = (res: Response, error?: string, prompt?: string) =>
  res.render('nutrition.ejs', {
   error: error ?? null,
   hasReport: false,
   items: [],
   totals: { calories: 0, protein: 0, fat: 0, carbs: 0 },
   prompt,
   disclaimer: '',
  });

 router.get('/', (_req: Request, res: Response) => {
  renderEmpty(res);
 });

 router.post('/', (req: Request, res: Response) => {
  const singleUpload = upload.single('image');
  singleUpload(req, res, async (err: unknown) => {
   if (err) {
    logger.warn(`[nutrition] upload error: ${(err as Error).message}`);
    return renderEmpty(res, 'Unable to process the uploaded image.', req.body?.prompt);
   }

   const serviceResponse = await visionService.extractImageDetails(
    req.file as Express.Multer.File | undefined,
    (req.body?.prompt as string | undefined) ?? undefined
   );

   if (!serviceResponse.success || !serviceResponse.responseObject) {
    return renderEmpty(res, serviceResponse.message, req.body?.prompt);
   }

   const report = buildReport(serviceResponse.responseObject.details);

   if (!report) {
    return renderEmpty(res, 'The AI response could not be parsed into a nutrition report.', req.body?.prompt);
   }

   const totalCal = report.totals.calories;
   const shareOf = (calories?: number): number => (totalCal > 0 ? Math.round(((calories ?? 0) / totalCal) * 100) : 0);

   res.render('nutrition.ejs', {
    error: null,
    hasReport: true,
    items: report.items,
    totals: report.totals,
    itemCount: report.itemCount,
    prompt: req.body?.prompt,
    disclaimer: report.disclaimer ?? '',
    fmtNum,
    shareOf,
    totalCal,
   });
  });
 });

 return router;
})();
