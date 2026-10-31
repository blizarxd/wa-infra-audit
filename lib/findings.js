'use strict';
/**
 * Findings engine — turns a raw inventory (businesses / WABAs / numbers /
 * webhook subscriptions) into prioritized findings, recommendations and a
 * health score. Used by BOTH the live audit and the demo scenario, so the
 * demo behaves exactly like a real one.
 */

const WEIGHT = { critical: 18, warning: 8, info: 3 };

function add(report, severity, area, title, detail, entity) {
  report.findings.push({ severity, area, title, detail, entity: entity || null });
}

function buildFindings(report) {
  report.findings = [];
  report.recommendations = [];

  const businesses = report.businesses || [];
  const wabas = report.wabas || [];
  const numbers = wabas.flatMap(w =>
    (w.phone_numbers || []).map(p => ({ ...p, waba_id: w.id, waba_name: w.name }))
  );

  // ── Totals (single source of truth for the dashboard) ──────────
  report.totals = {
    businesses: businesses.length,
    wabas: wabas.length,
    numbers: numbers.length,
    numbers_green: numbers.filter(p => String(p.quality_rating || '').toUpperCase() === 'GREEN').length,
    numbers_flagged: numbers.filter(p => ['YELLOW', 'RED'].includes(String(p.quality_rating || '').toUpperCase())).length,
  };

  // ── Token scopes ────────────────────────────────────────────────
  const scopes = report.token_scopes || [];
  if (scopes.length) {
    if (!scopes.includes('whatsapp_business_management')) {
      add(report, 'critical', 'token', 'Token lacks whatsapp_business_management',
        'Without this permission, WABA and phone-number management calls will fail. Regenerate the token with this scope.');
    }
    if (!scopes.includes('business_management')) {
      add(report, 'warning', 'token', 'Token lacks business_management',
        'Business Manager discovery may be incomplete — some assets can be invisible to this token.');
    }
  }

  // ── Business Managers ───────────────────────────────────────────
  if (businesses.length === 0) {
    add(report, 'warning', 'business', 'No Business Manager visible to this token',
      'The token may be WABA-scoped or missing business_management. Discovery may be partial; verify with an admin System User token.');
  }
  for (const b of businesses) {
    const v = String(b.verification_status || '').toLowerCase();
    if (v && v !== 'verified') {
      add(report, 'warning', 'business', `Business "${b.name}" is not verified (${v})`,
        'Unverified Business Managers face lower messaging limits and display-name/template restrictions.', b.id);
    }
  }

  // ── WABAs ───────────────────────────────────────────────────────
  for (const w of wabas) {
    const st = String(w.account_review_status || '').toUpperCase();
    if (st && st !== 'APPROVED') {
      add(report, 'critical', 'waba', `WABA "${w.name}" review status: ${st}`,
        'A WABA that is not APPROVED cannot message reliably. Resolve the review before wiring production traffic.', w.id);
    }
    const apps = w.subscribed_apps || [];
    if (apps.length === 0) {
      add(report, 'warning', 'webhooks', `WABA "${w.name}" has no webhook subscription`,
        'No app is subscribed: inbound messages and delivery statuses will never reach your router — Zoho and VAPI will see nothing.', w.id);
    }
    if (apps.length > 1) {
      add(report, 'info', 'webhooks', `WABA "${w.name}" has ${apps.length} subscribed apps`,
        'Multiple apps receive the same events. Confirm this is intentional to avoid double-processing in the CRM.', w.id);
    }
    if (w.templates && w.templates.rejected > 0) {
      add(report, 'info', 'templates', `${w.templates.rejected} rejected template(s) on "${w.name}"`,
        'Rejected templates point at content that violates policy — rewrite or retire them.', w.id);
    }
  }

  // ── Architecture: fragmentation check ──────────────────────────
  if (wabas.length > 1 && wabas.every(w => (w.phone_numbers || []).length <= 1)) {
    add(report, 'warning', 'architecture', `Fragmented setup: ${wabas.length} WABAs with ≤ 1 number each`,
      'One WABA supports up to 20 phone numbers, each keeping its own display name, quality rating and messaging tier. Consolidating reduces verification overhead, webhook duplication and ban surface.');
  }
  if (numbers.length === 0) {
    add(report, 'warning', 'numbers', 'No phone numbers found',
      'Either the WABAs are empty or the token cannot read the phone_numbers edge.');
  }

  // ── Phone numbers ───────────────────────────────────────────────
  for (const p of numbers) {
    const num = p.display_phone_number || p.id;
    const q = String(p.quality_rating || '').toUpperCase();
    if (q === 'RED') {
      add(report, 'critical', 'numbers', `${num} quality rating is RED`,
        'High block/report rate. Pause campaigns on this number immediately — it is one step from being restricted.', p.id);
    } else if (q === 'YELLOW') {
      add(report, 'warning', 'numbers', `${num} quality rating is YELLOW`,
        'Quality is degrading. Reduce volume and improve opt-in/content before it turns red.', p.id);
    }

    const cv = String(p.code_verification_status || '').toUpperCase();
    if (cv && cv !== 'VERIFIED') {
      add(report, 'warning', 'numbers', `${num} is not OTP-verified (${cv})`,
        'Classic VoIP pitfall: the number must be able to receive the SMS/voice verification code. Validate OTP delivery before any migration.', p.id);
    }

    const ns = String(p.name_status || '').toUpperCase();
    if (ns === 'DECLINED' || ns === 'EXPIRED') {
      add(report, 'warning', 'numbers', `Display name issue on ${num} (${ns})`,
        'The display name was declined or expired — resubmit a policy-compliant name.', p.id);
    }

    const s = String(p.status || '').toUpperCase();
    if (['FLAGGED', 'RESTRICTED', 'BANNED'].includes(s)) {
      add(report, 'critical', 'numbers', `${num} status: ${s}`,
        'This number is sanctioned by Meta. Appeal or replace it — do not route production traffic here.', p.id);
    } else if (s && !['CONNECTED', 'VERIFIED'].includes(s)) {
      add(report, 'info', 'numbers', `${num} status: ${s}`,
        'The number is not fully connected yet.', p.id);
    }

    if (String(p.platform_type || '').toUpperCase() === 'ON_PREMISE') {
      add(report, 'info', 'numbers', `${num} runs the On-Premise API`,
        'Meta has sunset the On-Premise API — migrate this number to Cloud API.', p.id);
    }
  }

  // ── Recommendations (ordered by impact) ─────────────────────────
  const rec = (title, detail) => report.recommendations.push({ title, detail });
  if (wabas.length > 1) {
    rec('Consolidate into a single WABA',
      'Target: 1 Business Manager → 1 WABA → up to 20 numbers. Each number keeps its own display name, quality rating and messaging tier. Fewer accounts = fewer Meta reviews = smaller ban surface.');
  }
  rec('Validate OTP on every VoIP number before migrating',
    'Meta must be able to deliver the verification code (SMS or voice call) to the number. Test this FIRST — it is the #1 blocker with VoIP providers.');
  rec('Use ONE webhook receiver and route internally',
    'Subscribe a single app per WABA. Your endpoint normalizes every event and routes it: conversations & leads → Zoho CRM, voice-eligible flows → VAPI. One entry point = zero data conflicts between tools.');
  rec('Monitor quality ratings weekly',
    'Green / Yellow / Red per number drives real send capacity (messaging tier). Alert on any transition away from GREEN.');
  if (businesses.some(b => String(b.verification_status || '').toLowerCase() !== 'verified')) {
    rec('Complete Business Manager verification',
      'Unlocks higher messaging limits, display-name approvals and more template categories.');
  }

  // ── Health score ────────────────────────────────────────────────
  let score = 100;
  for (const f of report.findings) score -= WEIGHT[f.severity] || 0;
  score = Math.max(5, Math.min(100, score));
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  report.health = { score, grade };

  const counts = { critical: 0, warning: 0, info: 0 };
  for (const f of report.findings) counts[f.severity] = (counts[f.severity] || 0) + 1;
  report.findings_summary = counts;

  return report;
}

module.exports = { buildFindings };
