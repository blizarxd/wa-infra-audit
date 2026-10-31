'use strict';
/**
 * Live audit pipeline — walks the client's Meta assets with their token:
 *
 *   token → /me (identity)
 *         → /debug_token (scopes, best effort)
 *         → /me/businesses (Business Managers)
 *         → owned + client WhatsApp Business Accounts per business
 *         → phone numbers, webhook subscriptions and templates per WABA
 *         → findings engine (score + recommendations)
 *
 * Read-only: this tool performs GET requests only. It never mutates the
 * client's infrastructure and never stores the token.
 */

const { get, getAll, getWithFieldFallback, GRAPH_VERSION } = require('./metaApi');
const { buildFindings } = require('./findings');

const NUMBER_FIELDS_RICH =
  'id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,status,platform_type,throughput,is_official_business_account';
const NUMBER_FIELDS_SAFE =
  'id,display_phone_number,verified_name,quality_rating,code_verification_status,status';

async function runAudit(token) {
  const report = {
    mode: 'live',
    graph_version: GRAPH_VERSION,
    generated_at: new Date().toISOString(),
    identity: null,
    token_scopes: [],
    token_meta: null,
    businesses: [],
    wabas: [],
    log: [],
  };
  const log = m => report.log.push(m);

  // 1) Identity — also validates the token
  const me = await get('/me', token, { fields: 'id,name' });
  report.identity = me;
  log(`Token OK — authenticated as ${me.name || me.id}`);

  // 2) Scopes (best effort — some token types can't self-inspect)
  let granular = [];
  try {
    const dbg = await get('/debug_token', token, { input_token: token });
    const d = dbg.data || {};
    report.token_scopes = d.scopes || [];
    report.token_meta = { app_id: d.app_id, type: d.type, expires_at: d.expires_at, valid: d.is_valid };
    granular = d.granular_scopes || [];
    log(`Scopes: ${report.token_scopes.join(', ') || '(none reported)'}`);
  } catch (e) {
    log('Scope inspection unavailable for this token type — continuing.');
  }

  // 3) Business Managers
  try {
    report.businesses = await getAll('/me/businesses', token, {
      fields: 'id,name,verification_status,created_time',
    });
    log(`Business Managers found: ${report.businesses.length}`);
  } catch (e) {
    log(`Could not list Business Managers: ${e.message}`);
  }

  // 4) Collect WABAs — owned + shared per business
  const wabaMap = new Map();
  for (const b of report.businesses) {
    for (const edge of ['owned_whatsapp_business_accounts', 'client_whatsapp_business_accounts']) {
      try {
        const list = await getAll(`/${b.id}/${edge}`, token, {
          fields: 'id,name,account_review_status,timezone_id',
        });
        for (const w of list) {
          wabaMap.set(w.id, {
            ...w,
            business_id: b.id,
            business_name: b.name,
            relation: edge.startsWith('owned') ? 'owned' : 'client',
          });
        }
      } catch (e) {
        log(`Edge ${edge} unavailable on "${b.name}": ${e.message}`);
      }
    }
  }

  // 4b) Fallback: WABA ids granted directly on the token (WABA-scoped tokens)
  for (const g of granular) {
    if (g.scope === 'whatsapp_business_management' && Array.isArray(g.target_ids)) {
      for (const id of g.target_ids) {
        if (wabaMap.has(id)) continue;
        try {
          const w = await get(`/${id}`, token, { fields: 'id,name,account_review_status,timezone_id' });
          wabaMap.set(id, { ...w, relation: 'token-scoped' });
        } catch { /* not readable — skip */ }
      }
    }
  }
  log(`WhatsApp Business Accounts found: ${wabaMap.size}`);

  // 5) Per WABA: phone numbers, webhook subscriptions, template stats
  for (const [id, waba] of wabaMap) {
    const w = {
      ...waba,
      phone_numbers: [],
      subscribed_apps: [],
      templates: { approved: 0, pending: 0, rejected: 0, total: 0 },
    };

    try {
      w.phone_numbers = await getWithFieldFallback(
        `/${id}/phone_numbers`, token, NUMBER_FIELDS_RICH, NUMBER_FIELDS_SAFE
      );
    } catch (e) {
      log(`Phone numbers unavailable for WABA "${waba.name || id}": ${e.message}`);
    }

    try {
      const apps = await getAll(`/${id}/subscribed_apps`, token, {});
      w.subscribed_apps = apps.map(a => a.whatsapp_business_api_data || a);
    } catch (e) {
      log(`Webhook subscriptions unavailable for "${waba.name || id}": ${e.message}`);
    }

    try {
      const tpl = await getAll(`/${id}/message_templates`, token, { fields: 'name,status' }, 250);
      w.templates.total = tpl.length;
      for (const t of tpl) {
        const s = String(t.status || '').toUpperCase();
        if (s === 'APPROVED') w.templates.approved++;
        else if (s === 'REJECTED') w.templates.rejected++;
        else w.templates.pending++;
      }
    } catch { /* templates are optional context */ }

    report.wabas.push(w);
  }

  // 6) Findings, recommendations, health score
  buildFindings(report);
  log(`Audit complete — health ${report.health.score}/100 (${report.health.grade})`);
  return report;
}

module.exports = { runAudit };
