export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]
type LineLevel = Exclude<LogLevel, 'silent'>
type Fields = Record<string, unknown>
type Write = (line: string) => void
type LogCall = (msg: string, fields?: Fields) => void

export interface Logger {
  debug: LogCall
  info: LogCall
  warn: LogCall
  error: LogCall
  child: (fields: Fields) => Logger
}

export function createLogger(
  level: LogLevel,
  write: Write = (line) => process.stdout.write(line),
): Logger {
  return buildLogger(level, write, {})
}

function buildLogger(level: LogLevel, write: Write, bound: Fields): Logger {
  const at = (lineLevel: LineLevel): LogCall => (msg, fields) => {
    if (LOG_LEVELS.indexOf(lineLevel) < LOG_LEVELS.indexOf(level)) return
    const time = new Date().toISOString()
    write(JSON.stringify({ time, level: lineLevel, msg, ...bound, ...fields }) + '\n')
  }
  return {
    debug: at('debug'),
    info: at('info'),
    warn: at('warn'),
    error: at('error'),
    child: (fields) => buildLogger(level, write, { ...bound, ...fields }),
  }
}
