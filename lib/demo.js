'use strict';
/**
 * Demo scenario — a realistic "fragmented multi-VoIP setup", the exact
 * situation this tool is built to diagnose: three WABAs with one number
 * each, mixed quality ratings, an unverified VoIP number, missing webhook
 * subscriptions and one legacy On-Premise number.
 *
 * It runs through the SAME findings engine as a live audit, so the demo
 * report is structurally identical to a real one.
 */

const { buildFindings } = require('./findings');

function demoReport() {
  const report = {
    mode: 'demo',
    graph_version: 'v21.0',
    generated_at: new Date().toISOString(),
    identity: { id: '10203040506070', name: 'Demo System User' },
    token_scopes: ['whatsapp_business_management', 'whatsapp_business_messaging', 'business_management'],
    token_meta: { app_id: '998877', type: 'SYSTEM_USER', expires_at: 0, valid: true },
    businesses: [
      { id: '114455', name: 'Acme Group (Demo)', verification_status: 'verified', created_time: '2022-03-11T09:24:00+0000' },
    ],
    wabas: [
      {
        id: 'waba_1001',
        name: 'Main — Sales EU',
        account_review_status: 'APPROVED',
        timezone_id: '71',
        business_id: '114455',
        business_name: 'Acme Group (Demo)',
        relation: 'owned',
        phone_numbers: [
          {
            id: 'pn_01', display_phone_number: '+33 7 45 12 89 60', verified_name: 'Acme Sales',
            quality_rating: 'GREEN', code_verification_status: 'VERIFIED', name_status: 'APPROVED',
            status: 'CONNECTED', platform_type: 'CLOUD_API', throughput: { level: 'STANDARD' },
            is_official_business_account: false,
          },
        ],
        subscribed_apps: [{ id: 'app_01', name: 'Acme Router (Zoho Flow)', link: 'https://developers.facebook.com' }],
        templates: { approved: 6, pending: 1, rejected: 0, total: 7 },
      },
      {
        id: 'waba_1002',
        name: 'Support — Legacy',
        account_review_status: 'APPROVED',
        timezone_id: '71',
        business_id: '114455',
        business_name: 'Acme Group (Demo)',
        relation: 'owned',
        phone_numbers: [
          {
            id: 'pn_02', display_phone_number: '+1 786 555 0142', verified_name: 'Acme Support',
            quality_rating: 'YELLOW', code_verification_status: 'NOT_VERIFIED', name_status: 'PENDING_REVIEW',
            status: 'PENDING', platform_type: 'CLOUD_API', throughput: { level: 'STANDARD' },
            is_official_business_account: false,
          },
        ],
        subscribed_apps: [],
        templates: { approved: 2, pending: 0, rejected: 1, total: 3 },
      },
      {
        id: 'waba_1003',
        name: 'Old Campaigns 2023',
        account_review_status: 'APPROVED',
        timezone_id: '71',
        business_id: '114455',
        business_name: 'Acme Group (Demo)',
        relation: 'owned',
        phone_numbers: [
          {
            id: 'pn_03', display_phone_number: '+44 7700 900123', verified_name: 'Acme Promo',
            quality_rating: 'RED', code_verification_status: 'VERIFIED', name_status: 'APPROVED',
            status: 'FLAGGED', platform_type: 'ON_PREMISE', throughput: { level: 'STANDARD' },
            is_official_business_account: false,
          },
        ],
        subscribed_apps: [],
        templates: { approved: 3, pending: 0, rejected: 2, total: 5 },
      },
    ],
    log: [
      'Demo scenario loaded — fragmented multi-VoIP setup (3 WABAs × 1 number).',
      'This mirrors the typical situation before consolidation.',
    ],
  };

  return buildFindings(report);
}

module.exports = { demoReport };
