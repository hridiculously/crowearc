// ═══════════════════════════════════════════════════════════════════════════
// Unit tests for graphClusters.computeClusters.
//
// Pure function — no React, no DOM. Run with `npm test` (vitest) inside
// aml-shield/frontend.
// ═══════════════════════════════════════════════════════════════════════════

import { describe, it, expect } from 'vitest';
import { computeClusters } from './graphClusters.js';
import { HYPOTHESIS_COLOURS } from './graphHelpers.js';

function mkData(nodeIds, links = []) {
  return {
    nodes: nodeIds.map(id => ({ id })),
    links: links.map(([s, t, type = 'TRANSACTS_WITH']) => ({ source: s, target: t, type }))
  };
}

describe('computeClusters', () => {
  it('returns empty result for empty or null data', () => {
    expect(computeClusters(null).clusters).toEqual([]);
    expect(computeClusters({ nodes: [] }).clusters).toEqual([]);
  });

  it('drops singletons (components with only one node)', () => {
    const data = mkData(['a', 'b', 'c']);   // no links → all singletons
    const out = computeClusters(data);
    expect(out.clusters).toHaveLength(0);
    expect(out.clusterByNodeId.size).toBe(3);  // ids still tracked but cluster id unused
  });

  it('groups connected nodes into a single cluster', () => {
    const data = mkData(['a', 'b', 'c'], [['a', 'b'], ['b', 'c']]);
    const out = computeClusters(data);
    expect(out.clusters).toHaveLength(1);
    expect(out.clusters[0].size).toBe(3);
    expect(new Set(out.clusters[0].nodeIds)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('detects multiple disjoint components', () => {
    const data = mkData(
      ['a', 'b', 'c', 'd', 'e'],
      [['a', 'b'], ['c', 'd'], ['d', 'e']]
    );
    const out = computeClusters(data);
    expect(out.clusters).toHaveLength(2);
    // Largest first — the {c,d,e} cluster wins.
    expect(out.clusters[0].size).toBe(3);
    expect(out.clusters[1].size).toBe(2);
    expect(out.clusters[0].color).toBe(HYPOTHESIS_COLOURS[0]);
    expect(out.clusters[1].color).toBe(HYPOTHESIS_COLOURS[1]);
  });

  it('ignores HOLDS_ACCOUNT edges (structural, not behavioural)', () => {
    // Customer → account edge alone should NOT cluster them together.
    const data = mkData(['c-1', 'acc-1'], [['c-1', 'acc-1', 'HOLDS_ACCOUNT']]);
    const out = computeClusters(data);
    expect(out.clusters).toHaveLength(0);
  });

  it('counts CO_OCCURS_WITH and TRANSACTS_VIA for cluster membership', () => {
    const data = mkData(
      ['a', 'b', 'c'],
      [['a', 'b', 'CO_OCCURS_WITH'], ['b', 'c', 'TRANSACTS_VIA']]
    );
    const out = computeClusters(data);
    expect(out.clusters).toHaveLength(1);
    expect(out.clusters[0].size).toBe(3);
  });
});
