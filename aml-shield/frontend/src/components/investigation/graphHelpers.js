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
