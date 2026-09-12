const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_API_URL) {
  // This is the single most common cause of "Failed to fetch" on a deployed
  // build: NEXT_PUBLIC_API_URL is a build-time env var, so it must be set in
  // Vercel's project settings (not just a local .env) and the project
  // rebuilt afterwards. Without it, every deployed visitor's browser tries
  // to reach *their own* http://localhost:8000, which almost never exists.
  console.warn(
    "[MISP Bank] NEXT_PUBLIC_API_URL is not set — falling back to http://localhost:8000. " +
    "In a deployed build this will fail for every visitor. Set it in your hosting " +
    "provider's environment variables and redeploy."
  );
}

export class ApiError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, options?: { code?: string; status?: number }) {
    super(message);
    this.name = "ApiError";
    this.code = options?.code;
    this.status = options?.status;
  }
}

const REQUEST_TIMEOUT_MS = 15000;

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("mispbank_token") : null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) },
    });
  } catch (cause) {
    // fetch() itself throws (never reaches an HTTP response) for network-
    // level failures: DNS/connection refused, CORS rejected at the preflight,
    // mixed-content blocked, or our own timeout abort above. The browser's
    // own message for most of these is the unhelpful literal "Failed to
    // fetch" — surface something a user can act on instead, and keep the
    // real cause in the console for debugging.
    console.error(`[MISP Bank] Network error calling ${path}:`, cause);
    const timedOut = cause instanceof DOMException && cause.name === "AbortError";
    throw new ApiError(
      timedOut
        ? "The server took too long to respond. Please try again."
        : "Could not reach the server. Check your connection, or that the API is running and reachable, and try again.",
      { code: timedOut ? "TIMEOUT" : "NETWORK_ERROR" }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    let detail: { error?: string; code?: string } = {};
    try {
      const body = await response.json();
      detail = body?.detail || body || {};
    } catch {
      // Non-JSON error body (e.g. a proxy's own HTML error page) — fall
      // through to the generic message below rather than throwing a
      // confusing JSON-parse error.
    }
    throw new ApiError(detail.error || `Request failed (${response.status})`, { code: detail.code, status: response.status });
  }

  return response.json();
}
