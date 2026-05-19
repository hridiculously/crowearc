// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for graphDiff.computeGraphDiff.
//
// Pure function — no React, no DOM. Run with `npm test` (vitest) inside
// aml-shield/frontend.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { computeGraphDiff } from './graphDiff.js';

function mkData(nodeIds, links = []) {
  return {
    focus_id: 'c-1',
    nodes: nodeIds.map(id => ({ id, label: id })),
    links: links.map(([s, t, type = 'TRANSACTS_WITH']) => ({ source: s, target: t, type })),
    meta: { graphPhase: 'normalised_matching' }
  };
}

describe('computeGraphDiff', () => {
  it('returns baseData unchanged when compareData is null', () => {
    const base = mkData(['a', 'b']);
    const out = computeGraphDiff(base, null);
    expect(out).toBe(base);
    expect(out.nodes.some(n => '_diffStatus' in n)).toBe(false);
  });

  it('returns compareData when baseData is null', () => {
    const compare = mkData(['x']);
    const out = computeGraphDiff(null, compare);
    expect(out).toBe(compare);
  });

  it('marks nodes only in base as removed and nodes only in compare as added', () => {
    const base    = mkData(['a', 'b']);
    const compare = mkData(['b', 'c']);
    const out = computeGraphDiff(base, compare);
    const byId = Object.fromEntries(out.nodes.map(n => [n.id, n._diffStatus]));
    expect(byId).toEqual({ a: 'removed', b: 'unchanged', c: 'added' });
  });

  it('canonicalises link keys so source/target order does not flip status', () => {
    const base    = mkData(['a', 'b'], [['a', 'b']]);
    const compare = mkData(['a', 'b'], [['b', 'a']]);   // swapped direction, same edge
    const out = computeGraphDiff(base, compare);
    expect(out.links).toHaveLength(1);
    expect(out.links[0]._diffStatus).toBe('unchanged');
  });

  it('treats different link types between same pair as distinct edges', () => {
    const base = mkData(['a', 'b'], [['a', 'b', 'TRANSACTS_WITH']]);
    const compare = mkData(['a', 'b'], [['a', 'b', 'CO_OCCURS_WITH']]);
    const out = computeGraphDiff(base, compare);
    expect(out.links).toHaveLength(2);
    const statuses = out.links.map(l => `${l.type}:${l._diffStatus}`).sort();
    expect(statuses).toEqual(['CO_OCCURS_WITH:added', 'TRANSACTS_WITH:removed']);
  });

  it('populates meta.compareCounts with accurate add/remove/unchanged tallies', () => {
    const base    = mkData(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]);
    const compare = mkData(['b', 'c', 'd'], [['b', 'c'], ['c', 'd']]);
    const out = computeGraphDiff(base, compare);
    expect(out.meta.compareApplied).toBe(true);
    expect(out.meta.compareCounts).toEqual({
      addedNodes: 1,      // d
      removedNodes: 1,    // a
      unchangedNodes: 2,  // b, c
      addedLinks: 1,      // c-d
      removedLinks: 1     // a-b
    });
  });

  it('preserves the base side details (alerted, amounts) on unchanged edges', () => {
    const base = {
      focus_id: 'c-1',
      nodes: [{ id: 'a' }, { id: 'b' }],
      links: [{ source: 'a', target: 'b', type: 'TRANSACTS_WITH', alerted: true, total_amount: 12000 }],
      meta: {}
    };
    const compare = {
      focus_id: 'c-1',
      nodes: [{ id: 'a' }, { id: 'b' }],
      links: [{ source: 'a', target: 'b', type: 'TRANSACTS_WITH', alerted: false, total_amount: 50 }],
      meta: {}
    };
    const out = computeGraphDiff(base, compare);
    const l = out.links[0];
    expect(l._diffStatus).toBe('unchanged');
    // Base-side wins when both have the edge.
    expect(l.alerted).toBe(true);
    expect(l.total_amount).toBe(12000);
  });
});
