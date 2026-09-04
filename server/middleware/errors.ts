import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'

export function jsonErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: err.message })
    return
  }
  res.status(500).json({ error: 'internal server error' })
}
