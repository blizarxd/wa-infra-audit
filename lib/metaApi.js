'use strict';
/**
 * Minimal Meta Graph API client — zero dependencies (Node 18+ global fetch).
 * The access token is only ever held in memory; it is never written to disk.
 */

const GRAPH_VERSION = process.env.GRAPH_VERSION || 'v21.0';
const BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

class MetaApiError extends Error {
  constructor(err, pathname) {
    super(err.message || 'Meta Graph API error');
    this.name = 'MetaApiError';
    this.code = err.code;
    this.type = err.type;
    this.subcode = err.error_subcode;
    this.fbtrace = err.fbtrace_id;
    this.path = pathname;
  }
}

/** GET a single Graph API node/edge. */
async function get(pathname, token, params = {}) {
  const url = new URL(BASE + pathname);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('access_token', token);
  let res;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new Error(`Network error reaching Graph API (${pathname}): ${e.message}`);
  }
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Non-JSON response from Graph API (HTTP ${res.status}) at ${pathname}`);
  }
  if (json.error) throw new MetaApiError(json.error, pathname);
  return json;
}

/** GET a list edge, following pagination up to `max` items. */
async function getAll(pathname, token, params = {}, max = 200) {
  const out = [];
  let page = await get(pathname, token, { ...params, limit: 50 });
  for (;;) {
    out.push(...(page.data || []));
    if (out.length >= max) break;
    const next = page.paging && page.paging.next;
    if (!next) break;
    const res = await fetch(next);
    page = await res.json();
    if (page.error) throw new MetaApiError(page.error, pathname);
  }
  return out.slice(0, max);
}

/**
 * GET a list with a rich field set; if the API rejects a field (code 100),
 * retry once with a conservative field set so the audit never hard-fails
 * on a Graph API field rename.
 */
async function getWithFieldFallback(pathname, token, richFields, safeFields, extraParams = {}) {
  try {
    return await getAll(pathname, token, { ...extraParams, fields: richFields });
  } catch (e) {
    if (e instanceof MetaApiError && e.code === 100) {
      return await getAll(pathname, token, { ...extraParams, fields: safeFields });
    }
    throw e;
  }
}

module.exports = { get, getAll, getWithFieldFallback, MetaApiError, GRAPH_VERSION };
