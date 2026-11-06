import type { NextFunction, Request, RequestHandler, Response } from 'express';
import mongoose from 'mongoose';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export const ah = (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => { fn(req, res, next).catch(next); };

export const oid = (id: string) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError(400, 'BAD_ID', 'Invalid id');
  return id;
};
