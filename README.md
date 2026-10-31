# WA Infra Audit

**WhatsApp Business infrastructure tracking tool** — audits an entire Meta / WhatsApp Business setup in seconds and produces a prioritized action plan.

Built for live consulting sessions: paste a client's access token, run the audit on screen, and walk through the findings together.

---

## What it audits

| Layer | Checks |
|---|---|
| **Access token** | Validity, type, required scopes (`whatsapp_business_management`, `business_management`) |
| **Business Managers** | Discovery, verification status |
| **WABAs** (WhatsApp Business Accounts) | Owned + shared accounts, review status, fragmentation across accounts |
| **Phone numbers** | Quality rating (green/yellow/red), OTP verification (the classic VoIP blocker), display-name status, connection status, Cloud API vs On-Premise, throughput tier |
| **Webhooks** | Subscribed apps per WABA — whether events can actually reach the CRM / voice stack |
| **Templates** | Approved / pending / rejected counts |

Everything feeds a **findings engine** that outputs:

- **Health score** (0–100) with letter grade
- **Findings** ranked critical → warning → info
- **Action plan** — ordered recommendations (consolidation, OTP validation, single-webhook routing, quality monitoring)
- **Target architecture diagram** — 1 BM → 1 WABA (up to 20 numbers) → one webhook receiver → routed to CRM (e.g. Zoho) and voice (e.g. VAPI)

## Quick start

```bash
node server.js
```

That's it — zero dependencies, Node 18+.

| URL | What you get |
|---|---|
| `http://localhost:3900` | Dashboard — paste a token and run a live audit |
| `http://localhost:3900/?demo=1` | Instant demo scenario (a typical fragmented multi-VoIP setup) |

Optionally put the token in `.env` (copy `.env.example`) instead of pasting it.

## Getting a token

Best practice: a **System User token** from Meta Business Settings with:

- `whatsapp_business_management`
- `business_management`

A temporary (24 h) token from a Meta developer app's *WhatsApp → API Setup* page also works for quick checks.

## Security model

- **Read-only** — the tool performs `GET` requests only; it never modifies any asset.
- The token is held **in memory for one audit**, never stored, never logged.
- Server binds to `localhost`. No analytics, no external calls other than `graph.facebook.com`.

## Export

**Export report** prints the dashboard through a dedicated light print stylesheet — save as PDF and hand it to the client as the session deliverable.

## Stack

Pure Node.js (built-in `http`) + vanilla HTML/CSS/JS. No frameworks, no build step, no `npm install`.

```
wa-infra-audit/
├── server.js           # zero-dependency web server + API
├── lib/
│   ├── metaApi.js      # Graph API client (pagination, field fallbacks)
│   ├── auditor.js      # live audit pipeline (read-only)
│   ├── findings.js     # findings engine: score, issues, recommendations
│   └── demo.js         # realistic demo scenario (same engine as live)
└── public/index.html   # dashboard
```
