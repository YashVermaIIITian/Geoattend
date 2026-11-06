import { Router } from 'express';
import { z } from 'zod';
import { Class } from '../models/index.js';
import { requireAuth, requireRole, validate } from '../middleware/index.js';
import { ah } from '../utils/errors.js';

const r = Router();
r.use(requireAuth, requireRole('lecturer'));
r.post('/', validate(z.object({ name: z.string().min(2).max(120), code: z.string().min(2).max(20) })), ah(async (req, res) => {
  res.status(201).json(await Class.create({ ...req.body, lecturerId: req.user!.id }));
}));
r.get('/', ah(async (req, res) => {
  res.json(await Class.find({ lecturerId: req.user!.id }).select('-studentIds').sort('-createdAt'));
}));
export default r;
