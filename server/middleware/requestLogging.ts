import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import type { Logger } from '../lib/logger.ts'

declare global {
  // res.locals is typed through Express.Locals; this declares its fields.
  namespace Express {
    interface Locals {
      log: Logger
      requestId: string
    }
  }
}

// Mounted first, so every request — even one whose body fails to parse — gets
// an ID, a logger carrying it, and one line when it finishes.
export function requestLogging(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const requestId = randomUUID()
    const log = logger.child({ requestId })
    const { method, path } = req
    const start = performance.now()

    res.set('X-Request-Id', requestId)
    res.locals.requestId = requestId
    res.locals.log = log
    res.on('close', () => {
      const durationMs = Math.round(performance.now() - start)
      log.info('request finished', { method, path, status: res.statusCode, durationMs })
    })
    next()
  }
}
