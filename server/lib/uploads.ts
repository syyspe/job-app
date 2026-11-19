import multer from 'multer'
import { mkdir } from 'node:fs'
import { extname } from 'node:path'
import { randomUUID } from 'node:crypto'

export function createUpload(uploadsDir: string): multer.Multer {
  return multer({
    storage: multer.diskStorage({
      // Callback-style so a failure reaches multer's error path, not busboy's listener.
      destination: (_req, _file, callback) => {
        mkdir(uploadsDir, { recursive: true }, (error) => callback(error, uploadsDir))
      },
      filename: (_req, file, callback) => {
        callback(null, `${randomUUID()}${extname(file.originalname)}`)
      },
    }),
    limits: { fileSize: 10 * 1024 * 1024 },
    // Browsers and fetch send the file name as raw UTF-8; multer assumes latin1.
    defParamCharset: 'utf8',
  })
}
