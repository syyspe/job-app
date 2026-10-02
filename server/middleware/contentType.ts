import type { NextFunction, Request, Response } from 'express'
import { HttpError } from '../lib/httpError.ts'

// The two types the API has a parser for: express.json() and multer.
const PARSED_TYPES = ['application/json', 'multipart/form-data']

export function requireParsableBody(req: Request, _res: Response, next: NextFunction) {
  // No Content-Type at all is not an unsupported one: a bodyless POST passes
  // through, so a login without a body stays a credentials check.
  const contentType = req.headers['content-type']
  if (contentType && !req.is(PARSED_TYPES)) {
    throw new HttpError(415, `unsupported content type: ${contentType}`)
  }
  next()
}
