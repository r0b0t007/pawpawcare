// Privacy filters for crash reports. This app holds pet medical records, so a
// Sentry event may carry only what's needed to fix a crash: stack traces,
// route names, templated API paths and the user's id. Pure functions — wired
// into Sentry.init in services/sentry.js and unit-tested on their own.

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const NUMERIC_SEGMENT = /\/\d+(?=\/|$)/g;
const CREDENTIAL_PARAM =
  /([?&](?:t|[A-Za-z0-9_.-]*(?:token|key|secret|signature|sig|password|passwd|pwd|code|expires|auth|session)[A-Za-z0-9_.-]*)=)[^&\s"'<>)]+/gi;

// Breadcrumb categories that can echo screen content or user input.
const DROPPED_CATEGORIES = new Set(['console', 'touch', 'ui.click', 'ui.input']);
// Data keys that hold navigation params (record ids, pet names, free text).
const PARAM_KEYS = new Set(['params', 'route.params', 'previous_route.params']);

/** "https://api.x/pets/9f…/documents/12?signature=…" → "https://api.x/pets/:id/documents/:id" */
export function scrubUrl(url) {
  if (typeof url !== 'string') return url;
  const cut = url.search(/[?#]/);
  const base = cut === -1 ? url : url.slice(0, cut);
  return base.replace(UUID, ':id').replace(NUMERIC_SEGMENT, '/:id');
}

/** Redacts URLs, emails, bearer tokens, JWTs and credential-like params in free text. */
export function scrubText(text) {
  if (typeof text !== 'string') return text;
  return text
    .replace(/\bhttps?:\/\/[^\s"'<>)]+/gi, (m) => scrubUrl(m))
    .replace(CREDENTIAL_PARAM, '$1[redacted]')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[jwt]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]');
}

const URL_KEYS = new Set(['url', 'http.url', 'to', 'from']);

function scrubValue(value) {
  if (typeof value === 'string') return scrubText(value);
  if (Array.isArray(value)) return value.map(scrubValue);
  if (value && typeof value === 'object') return scrubData(value);
  return value;
}

function scrubData(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) return data.map(scrubValue);
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (PARAM_KEYS.has(key) || key === 'http.query' || key === 'http.fragment') continue;
    // URLs: template ids/drop the query, then redact anything left in the path
    // (e.g. an email in /users/by-email/…).
    out[key] = URL_KEYS.has(key) && typeof value === 'string' ? scrubText(scrubUrl(value)) : scrubValue(value);
  }
  return out;
}

/** beforeBreadcrumb: drop content-bearing categories, template the rest. */
export function scrubBreadcrumb(breadcrumb) {
  if (!breadcrumb || DROPPED_CATEGORIES.has(breadcrumb.category)) return null;
  return {
    ...breadcrumb,
    message: scrubText(breadcrumb.message),
    data: scrubData(breadcrumb.data),
  };
}

// API responses that are normal outcomes, not bugs: unauthenticated,
// forbidden (e.g. a revoked share), conflict and rate-limited. Other 4xx — a
// 404 from a wrong path, a 400/422 from a malformed request — usually mean a
// client bug and are reported.
const EXPECTED_STATUSES = new Set([401, 403, 409, 429]);
const EXPECTED_CODES = new Set(['upgrade_required']);

/** Errors the app already handles and shows to the user — not bugs. */
export function isExpectedError(error) {
  if (!error) return false;
  if (error.message === 'SESSION_EXPIRED') return true;
  if (error.isNetworkError) return true;
  if (error.code && EXPECTED_CODES.has(error.code)) return true;
  return EXPECTED_STATUSES.has(error.status);
}

function scrubStringsIn(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [k, typeof v === 'string' ? scrubText(v) : v]),
  );
}

/** beforeSend: drop expected errors; keep the user's id only; scrub all text. */
export function scrubEvent(event, hint) {
  if (isExpectedError(hint?.originalException)) return null;

  const out = { ...event };
  out.user = event.user?.id ? { id: String(event.user.id) } : undefined;
  delete out.request;
  if (out.message) out.message = scrubText(out.message);
  if (out.exception?.values) {
    out.exception = {
      ...out.exception,
      values: out.exception.values.map((v) => ({ ...v, value: scrubText(v.value) })),
    };
  }
  if (out.breadcrumbs) out.breadcrumbs = out.breadcrumbs.map(scrubBreadcrumb).filter(Boolean);
  if (out.extra) out.extra = scrubData(out.extra);
  if (out.tags) out.tags = scrubStringsIn(out.tags);
  return out;
}

/** beforeSendTransaction: templated transaction/span names, no params or queries. */
export function scrubTransaction(event) {
  const out = scrubEvent(event, undefined) ?? event;
  if (out.transaction) out.transaction = scrubUrl(out.transaction);
  if (out.spans) {
    out.spans = out.spans.map((span) => ({
      ...span,
      description: scrubText(span.description),
      data: scrubData(span.data),
    }));
  }
  if (out.contexts?.trace?.data) {
    out.contexts = {
      ...out.contexts,
      trace: { ...out.contexts.trace, data: scrubData(out.contexts.trace.data) },
    };
  }
  return out;
}
