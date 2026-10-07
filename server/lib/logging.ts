export interface RequestLine {
  method: string
  path: string
}

export function logError(request: RequestLine, status: number, error: Error): void {
  console.error(`${request.method} ${request.path} ${status} ${error.message}`)
  // The Error itself, not .stack: console.error prints its cause chain too.
  if (status >= 500) console.error(error)
}
