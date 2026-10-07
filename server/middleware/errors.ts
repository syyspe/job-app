import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { logError } from '../lib/logging.ts'

// express.json() and HttpError both tag the error with the status to answer;
// MulterError is the one shape that carries only a code.
function statusOf(error: Error): number {
  if (error instanceof multer.MulterError) return 400
  const { status } = error as { status?: unknown }
  return typeof status === 'number' ? status : 500
}

export function jsonErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
) {
  const error = err as Error
  const status = statusOf(error)
  logError(req, status, error)

  // A response already under way can't change its status; cut it off so the
  // client sees a failed transfer rather than a truncated one.
  if (res.headersSent) {
    res.destroy()
    return
  }

  if (status >= 400 && status < 500) {
    res.status(status).json({ error: error.message })
    return
  }
  res.status(500).json({ error: 'internal server error' })
}
