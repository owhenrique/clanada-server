const DATABASE_UNAVAILABLE_CODES: ReadonlySet<string> = new Set([
  "P1001",
  "P1002",
  "P1017",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ECONNRESET",
  "ENOTFOUND",
]);

const UNAVAILABLE_ADAPTER_KINDS: ReadonlySet<string> = new Set([
  "DatabaseNotReachable",
  "ConnectionClosed",
  "SocketTimeout",
  "TlsConnectionError",
]);

const MAX_DEPTH = 5;

export function isDatabaseUnavailableError(error: unknown, depth = 0): boolean {
  if (!(error instanceof Error) || depth > MAX_DEPTH) {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  if (typeof code === "string" && DATABASE_UNAVAILABLE_CODES.has(code)) {
    return true;
  }
  if (hasUnavailableAdapterKind((error as { meta?: unknown }).meta)) {
    return true;
  }
  if (error instanceof AggregateError && error.errors.some((inner) => isDatabaseUnavailableError(inner, depth + 1))) {
    return true;
  }
  return isDatabaseUnavailableError(error.cause, depth + 1);
}

function hasUnavailableAdapterKind(meta: unknown): boolean {
  if (typeof meta !== "object" || meta === null) {
    return false;
  }
  const adapterError = (meta as { driverAdapterError?: { cause?: { kind?: unknown } } }).driverAdapterError;
  const kind = adapterError?.cause?.kind;
  return typeof kind === "string" && UNAVAILABLE_ADAPTER_KINDS.has(kind);
}
