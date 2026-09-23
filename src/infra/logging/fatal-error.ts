export type FatalLogger = { fatal: (obj: { err: Error }, message: string) => void };

export function reportFatalError(
  logger: FatalLogger,
  exit: (code: number) => void,
  error: unknown,
  message: string,
): void {
  logger.fatal({ err: error instanceof Error ? error : new Error(String(error)) }, message);
  exit(1);
}
