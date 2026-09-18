// The error type every public API handler throws, extracted from
// `proyectos-registros-api.ts` so modules that need to throw one do not have to
// import that 2.600-line file (which pulls in `db`, `auth` and every metrics
// view, and would close an import cycle with `rate-limit.ts`).
//
// `proyectos-registros-api.ts` re-exports it, so existing call sites are
// unchanged and `handleApiError` remains the single place that turns one of
// these into a Response.

export type HeaderMap = Record<string, string>;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    // Extra response headers for this specific failure — `Retry-After` on a 429.
    // `handleApiError` merges them over the CORS headers.
    readonly headers?: HeaderMap,
  ) {
    super(message);
  }
}
