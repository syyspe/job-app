export interface RequestLine {
  method: string
  path: string
}

export function logError(request: RequestLine, status: number, error: Error): void {
  console.error(`${request.method} ${request.path} ${status} ${error.message}`)
  if (status >= 500) console.error(error.stack)
}
