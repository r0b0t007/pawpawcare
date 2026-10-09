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

function scrubData(data) {
  if (!data || typeof data !== 'object') return data;
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (PARAM_KEYS.has(key)) continue;
    if (key === 'url' || key === 'http.url' || key === 'to' || key === 'from') {
      out[key] = typeof value === 'string' ? scrubUrl(value) : value;
    } else if (key === 'http.query' || key === 'http.fragment') {
      continue;
    } else if (typeof value === 'string') {
      out[key] = scrubText(value);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      out[key] = scrubData(value);
    } else {
      out[key] = value;
    }
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

/**
 * Errors the app already handles and shows to the user — not bugs:
 * expired sessions, 4xx API responses (validation, not found, forbidden)
 * and offline/network failures.
 */
export function isExpectedError(error) {
  if (!error) return false;
  if (error.message === 'SESSION_EXPIRED') return true;
  if (error.isNetworkError) return true;
  return typeof error.status === 'number' && error.status >= 400 && error.status < 500;
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
