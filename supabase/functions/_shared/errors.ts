// A typed error that carries the HTTP answer. The message is the machine code, so older handlers that
// compare `error.message === "unauthorized"` keep working.
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown>;

  constructor(status: number, code: string, extra: Record<string, unknown> = {}) {
    super(code);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const isHttpError = (e: unknown): e is HttpError => e instanceof HttpError;
