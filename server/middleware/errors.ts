import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import { inspect } from 'node:util'
import type { Logger } from '../lib/logger.ts'

// express.json() and HttpError both tag the error with the status to answer;
// MulterError is the one shape that carries only a code.
function statusOf(error: Error): number {
  if (error instanceof multer.MulterError) return 400
  const { status } = error as { status?: unknown }
  return typeof status === 'number' ? status : 500
}

function logFailure(log: Logger, status: number, error: Error): void {
  if (status < 500) {
    log.info('request failed', { status, error: error.message })
    return
  }
  // inspect, not .stack: it prints the cause chain too.
  log.error('request failed', { status, error: error.message, err: inspect(error) })
}

export function jsonErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  const error = err as Error
  const status = statusOf(error)
  logFailure(res.locals.log, status, error)

  // A response already under way can't change its status; cut it off so the
  // client sees a failed transfer rather than a truncated one.
  if (res.headersSent) {
    res.destroy()
    return
  }

  const { requestId } = res.locals
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: error.message, requestId })
    return
  }
  res.status(500).json({ error: 'internal server error', requestId })
}
