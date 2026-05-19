// ═══════════════════════════════════════════════════════════════════════════
// CCEG graph — shared helpers and constants.
//
// Extracted from the EntityGraphModal monolith as part of the architectural
// split. Pure functions only; no React, no DOM, no fetching.
// ═══════════════════════════════════════════════════════════════════════════

// Person → bright blue (sky-500), Company / Counterparty → yellow
// (yellow-500). ACCOUNT / CASE colours retained for downstream surfaces
// that still reference them (CASE no longer renders on the canvas).
export const COLORS = {
  PERSON:  '#0EA5E9',
  COMPANY: '#EAB308',
  ACCOUNT: '#185FA5',
  CASE:    '#534AB7',
  SAR:     '#A32D2D'
};

export const TYPE_LABEL = {
  PERSON:  'Person',
  COMPANY: 'Company',
  ACCOUNT: 'Account',
  CASE:    'Case',
  SAR:     'SAR'
};

export const NODE_RADIUS = {
  FOCUS:        14,
  COUNTERPARTY: 10,
  NEIGHBOUR:    10,
  CASE:         8,
  SAR:          8,
  ACCOUNT:      7,
  DEFAULT:      8
};

// Hypothesis-group palette (cycled). Used by the annotation layer that
// ships in a later sprint; exported here so multiple call sites stay in
// sync if/when both colour palettes need to coexist.
export const HYPOTHESIS_COLOURS = ['#7C3AED', '#0891B2', '#D97706', '#059669', '#DC2626'];

export function radiusFor(node) {
  if (node.is_focus) return NODE_RADIUS.FOCUS;
  // C-10: counterparty nodes scale by log of global txn_count in Phase B
  // so a node that transacts with many customers visually stands out.
  if (node.is_counterparty && node.counterparty_id) {
    const cnt = Number(node.txn_count) || 0;
    return Math.max(6, Math.min(20, 6 + Math.log(cnt + 1) * 2));
  }
  if (node.is_counterparty) return NODE_RADIUS.COUNTERPARTY;
  if (node.is_neighbour) return NODE_RADIUS.NEIGHBOUR;
  if (node.type === 'CASE') return NODE_RADIUS.CASE;
  if (node.type === 'SAR') return NODE_RADIUS.SAR;
  if (node.type === 'ACCOUNT') return NODE_RADIUS.ACCOUNT;
  return NODE_RADIUS.DEFAULT;
}

// C-10: a counterparty is a Phase-B first-class entity when the
// backend handed us a counterparty_id. Phase A nodes stay as circles
// so the visual upgrade only kicks in once the dedup backfill has run.
export function isPhaseBCounterparty(node) {
  return !!(node?.is_counterparty && node?.counterparty_id);
}

export function fmtVolumeShort(n) {
  if (n == null) return '—';
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function fmtMoney(n) {
  if (n == null) return '—';
  return `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

export function truncateLabel(s, n = 18) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export function readUser() {
  try { return JSON.parse(localStorage.getItem('aml_shield_user') || 'null'); } catch (_e) { return null; }
}

export function rolePrefixFor(role) {
  if (role === 'bsa_officer')        return '/bsa';
  if (role === 'compliance_manager') return '/manager';
  return '/employee';
}

export function initialsOf(name) {
  return String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
}

// Used by both the canvas (label visibility rule) and the timeline.
export function shouldShowHoverLabel(node) {
  if (!node) return false;
  if (node.is_focus) return false;
  // Sanctions / PEP / high-risk-country nodes already get permanent
  // canvas labels; suppress the hover tooltip to avoid the duplicate.
  if (node.sanctions) return false;
  if (node.pep) return false;
  if (node.is_high_risk_country) return false;
  return true;
}

// Tone helpers used by the right-panel chips. Kept in the shared module
// because both CustomerDetails and AlertDetails reference them.
export function riskTone(rating) {
  switch (rating) {
    case 'Very High': return 'red';
    case 'High':      return 'orange';
    case 'Medium':    return 'amber';
    case 'Low':       return 'slate';
    default:          return 'slate';
  }
}

export function priorityTone(priority) {
  switch (priority) {
    case 'High':   return 'red';
    case 'Medium': return 'amber';
    case 'Low':    return 'slate';
    default:       return 'slate';
  }
}

// ─── Risk score (0–100) ────────────────────────────────────────────────
// Used by the canvas badge + right-panel bar. Customers use their server-
// assigned risk rating mapped to a numeric tier. Counterparties roll up
// from the risk_indicators object + OFAC + hub-popularity signals.
// Returns null when the node is not a customer / counterparty.
export function computeRiskScore(node) {
  if (!node) return null;
  // Customers (PERSON / COMPANY without is_counterparty)
  if ((node.type === 'PERSON' || node.type === 'COMPANY') && !node.is_counterparty) {
    if (node.sanctions) return 95;
    switch (node.risk) {
      case 'Very High': return 90;
      case 'High':      return 75;
      case 'Medium':    return 50;
      case 'Low':       return 20;
      default:          return null;
    }
  }
  // Counterparties
  if (node.is_counterparty) {
    let s = 5;                                       // baseline
    if (node.risk_indicators?.sanctions_hit)         s = Math.max(s, 100);
    if (node.ofac_flagged)                           s = Math.max(s, 100);
    if (node.risk_indicators?.pep)                   s = Math.max(s, 80);
    if (node.risk_indicators?.high_risk_jurisdiction) s = Math.max(s, 70);
    if (node.is_high_risk_country)                   s = Math.max(s, 55);
    if (Number(node.shared_with_customer_count) >= 5) s = Math.max(s, 50);
    else if (Number(node.shared_with_customer_count) >= 3) s = Math.max(s, 35);
    if (Number(node.alerted_txn_count) > 0)          s = Math.max(s, 60);
    return s;
  }
  return null;
}

// Risk tier → tailwind tone bucket. Used by the right-panel chip / bar.
export function riskScoreTone(score) {
  if (score == null) return 'slate';
  if (score >= 80) return 'red';
  if (score >= 55) return 'orange';
  if (score >= 30) return 'amber';
  return 'slate';
}

// Canvas-side colour (badge fill) — matches riskScoreTone but with
// explicit hex so the canvas doesn't have to round-trip through CSS.
export function riskScoreCanvasColor(score) {
  if (score == null) return null;
  if (score >= 80) return '#DC2626';
  if (score >= 55) return '#F97316';
  if (score >= 30) return '#F59E0B';
  return '#64748B';
}
