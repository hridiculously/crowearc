// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for graphTypology.detectTypologies.
//
// Each test builds the minimum-viable graph that should trip exactly one
// detector, then asserts the kind / severity / nodeIds. Tests overlap
// intentionally to cover the sort-by-severity behaviour at the end.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { detectTypologies } from './graphTypology.js';

function focusNode(id = 'c-1', overrides = {}) {
  return { id, label: id, type: 'PERSON', is_focus: true, ...overrides };
}
function cp(id, overrides = {}) {
  return {
    id: `cp-${id}`,
    label: id,
    type: 'COMPANY',
    is_counterparty: true,
    ...overrides
  };
}
function link(s, t, overrides = {}) {
  return { source: s, target: t, type: 'TRANSACTS_WITH', ...overrides };
}

describe('detectTypologies', () => {
  it('returns [] for empty / nullish input', () => {
    expect(detectTypologies(null)).toEqual([]);
    expect(detectTypologies({ nodes: [] })).toEqual([]);
  });

  it('flags hub counterparty when shared_with_customer_count >= 3', () => {
    const data = {
      nodes: [
        focusNode(),
        cp('hub', { shared_with_customer_count: 7 })
      ],
      links: []
    };
    const out = detectTypologies(data);
    const hub = out.find(t => t.kind === 'hub');
    expect(hub).toBeDefined();
    expect(hub.severity).toBe('high');   // ≥5 → high
    expect(hub.nodeIds).toEqual(['cp-hub']);
  });

  it('flags structuring on $9k–$9,999 multi-txn edges', () => {
    const data = {
      nodes: [focusNode(), cp('mule')],
      links: [link('c-1', 'cp-mule', { total_amount: 9500, txn_count: 5 })]
    };
    const out = detectTypologies(data);
    const s = out.find(t => t.kind === 'structuring');
    expect(s).toBeDefined();
    expect(s.severity).toBe('high');
    expect(s.nodeIds).toEqual(['c-1', 'cp-mule']);
  });

  it('does NOT flag structuring when only 1 txn (no pattern)', () => {
    const data = {
      nodes: [focusNode(), cp('mule')],
      links: [link('c-1', 'cp-mule', { total_amount: 9500, txn_count: 1 })]
    };
    expect(detectTypologies(data).find(t => t.kind === 'structuring')).toBeUndefined();
  });

  it('flags fan-out when focus has >= 6 counterparties', () => {
    const cps = Array.from({ length: 6 }, (_, i) => cp(`cp-${i}`));
    const data = {
      nodes: [focusNode(), ...cps],
      links: cps.map(c => link('c-1', c.id))
    };
    const out = detectTypologies(data);
    const fan = out.find(t => t.kind === 'fan_out');
    expect(fan).toBeDefined();
    expect(fan.severity).toBe('medium');
  });

  it('escalates fan-out to high at 12+ counterparties', () => {
    const cps = Array.from({ length: 12 }, (_, i) => cp(`cp-${i}`));
    const data = {
      nodes: [focusNode(), ...cps],
      links: cps.map(c => link('c-1', c.id))
    };
    expect(detectTypologies(data).find(t => t.kind === 'fan_out').severity).toBe('high');
  });

  it('flags sanctions_proximity from ofac_flagged or risk_indicators.sanctions_hit', () => {
    const data = {
      nodes: [
        focusNode(),
        cp('hit', { risk_indicators: { sanctions_hit: true } })
      ],
      links: []
    };
    const out = detectTypologies(data);
    const sanc = out.find(t => t.kind === 'sanctions_proximity');
    expect(sanc).toBeDefined();
    expect(sanc.severity).toBe('high');
  });

  it('flags bidirectional U-turn when both sides >= $5k', () => {
    const data = {
      nodes: [focusNode(), cp('utn')],
      links: [link('c-1', 'cp-utn', {
        direction: 'bidirectional',
        inflow_amount: 12000,
        outflow_amount: 8000,
        total_amount: 20000,
        txn_count: 4
      })]
    };
    const out = detectTypologies(data);
    const u = out.find(t => t.kind === 'bidirectional_pair');
    expect(u).toBeDefined();
    expect(u.severity).toBe('medium');
  });

  it('returns matches sorted with all "high" before any "medium"', () => {
    const data = {
      nodes: [
        focusNode(),
        cp('h1', { shared_with_customer_count: 7 }),    // high (hub ≥5)
        cp('h2', { risk_indicators: { sanctions_hit: true } }),  // high
      ],
      links: [link('c-1', 'cp-h1', {
        direction: 'bidirectional',
        inflow_amount: 6000,
        outflow_amount: 6000,
        total_amount: 12000
      })]   // medium bidirectional
    };
    const out = detectTypologies(data);
    expect(out.length).toBeGreaterThan(1);
    const severities = out.map(t => t.severity);
    // Once we see a non-high, no more high should follow.
    const firstNonHigh = severities.findIndex(s => s !== 'high');
    if (firstNonHigh !== -1) {
      expect(severities.slice(firstNonHigh).includes('high')).toBe(false);
    }
  });
});
