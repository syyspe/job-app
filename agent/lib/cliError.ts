// The one agent error type: a failure the user can act on, printed as one
// stderr line with no stack. Anything else is our fault and keeps its stack.
export class CliError extends Error {
  readonly exitCode: number

  constructor(exitCode: number, message: string, options?: ErrorOptions) {
    super(message, options)
    this.exitCode = exitCode
  }
}

export async function runCommand(main: () => Promise<void>): Promise<void> {
  try {
    await main()
  } catch (err) {
    if (!(err instanceof CliError)) throw err
    console.error(err.message)
    process.exitCode = err.exitCode
  }
}
