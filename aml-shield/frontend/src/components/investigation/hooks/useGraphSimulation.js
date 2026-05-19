// ═══════════════════════════════════════════════════════════════════════════
// useGraphSimulation — derives the canvas-ready dataset from the raw graph
// payload plus the active filter state.
//
// Two transformations applied in order:
//   1. CASE nodes are always stripped. Alerts/cases live in the right-panel
//      timeline now, not on the canvas. Their links are dropped too so the
//      simulation doesn't try to render dangling edges.
//   2. The Tableau-style filter (keepOnly / exclude) is applied on top.
//
// Also computes:
//   * adjacency  — node-id → Set of connected node-ids, used by the
//                  click-focus dimming rule in drawNode.
//   * networkCounts — { customers, counterparties, alerts, sars } pulled
//                  from the RAW data (alerts count is informational; they
//                  still don't render on canvas).
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react';

// Apply the configured edge filters to a single link. Returns true if
// the link should be drawn. The "showAll" master toggle short-circuits
// every other filter when off.
function passesEdgeFilters(link, edgeFilters) {
  if (!edgeFilters) return true;
  if (!edgeFilters.showAll) return false;

  // Link-type checkboxes.
  if (link.type === 'TRANSACTS_WITH' && !edgeFilters.transactsWith) return false;
  if (link.type === 'CO_OCCURS_WITH' && !edgeFilters.coOccursWith) return false;
  if (link.type === 'HOLDS_ACCOUNT' && !edgeFilters.holdsAccount) return false;

  // Direction (only meaningful on TRANSACTS_WITH).
  if (link.type === 'TRANSACTS_WITH') {
    if (link.direction === 'inflow' && !edgeFilters.inbound) return false;
    if (link.direction === 'outflow' && !edgeFilters.outbound) return false;
    if (link.direction === 'bidirectional' && !edgeFilters.bidirectional) return false;
  }

  // Alert status.
  if (link.alerted && !edgeFilters.alerted) return false;
  if (!link.alerted && link.type === 'TRANSACTS_WITH' && !edgeFilters.nonAlerted) return false;

  // Volume thresholds.
  if (edgeFilters.minTxnCount > 0 && (Number(link.txn_count) || 0) < edgeFilters.minTxnCount) return false;
  if (edgeFilters.minVolume   > 0 && (Number(link.total_amount) || 0) < edgeFilters.minVolume) return false;

  return true;
}

export function useGraphSimulation(data, filter, options = {}) {
  const { edgeFilters = null, subgraphFilter = null } = options;

  const displayData = useMemo(() => {
    if (!data) return null;
    // Step 1: always drop CASE nodes (they live in the right-panel timeline).
    const hiddenIds = new Set(
      (data.nodes || []).filter(n => n.type === 'CASE').map(n => n.id)
    );

    // Step 2: apply the Tableau-style filter on top.
    const filterIds = new Set(filter?.ids || []);
    if (filter?.mode === 'exclude' && filterIds.size > 0) {
      for (const id of filterIds) hiddenIds.add(id);
    } else if (filter?.mode === 'keepOnly' && filterIds.size > 0) {
      // Keep the listed nodes + every node connected to them by a direct
      // (CASE-free) link.
      const keep = new Set(filterIds);
      for (const l of data.links || []) {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        if (hiddenIds.has(s) || hiddenIds.has(t)) continue;
        if (filterIds.has(s)) keep.add(t);
        if (filterIds.has(t)) keep.add(s);
      }
      for (const n of data.nodes || []) {
        if (!keep.has(n.id) && !hiddenIds.has(n.id)) hiddenIds.add(n.id);
      }
    }

    // Step 3: edge filters strip individual links; nodes that end up
    // isolated as a result are kept on canvas (the analyst still needs
    // to see they exist), but the layout naturally pushes them away.
    const passingLinks = (data.links || []).filter(l => {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (hiddenIds.has(s) || hiddenIds.has(t)) return false;
      return passesEdgeFilters(l, edgeFilters);
    });

    // Step 4: subgraph filter (from multi-select "Build Subgraph"). When
    // set, anything outside the subgraph stays in `displayData.nodes`
    // (so the count chip stays honest) but is marked
    // `_dimmed=true` so the canvas drawer can render it at 8% opacity.
    const subgraphSet = subgraphFilter instanceof Set ? subgraphFilter : null;

    return {
      ...data,
      nodes: (data.nodes || [])
        .filter(n => !hiddenIds.has(n.id))
        .map(n => subgraphSet
          ? { ...n, _dimmed: !subgraphSet.has(n.id) }
          : n
        ),
      links: passingLinks
    };
  }, [data, filter, edgeFilters, subgraphFilter]);

  const adjacency = useMemo(() => {
    const map = new Map();
    if (!displayData) return map;
    for (const l of displayData.links || []) {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (!map.has(s)) map.set(s, new Set());
      if (!map.has(t)) map.set(t, new Set());
      map.get(s).add(t);
      map.get(t).add(s);
    }
    return map;
  }, [displayData]);

  const networkCounts = useMemo(() => {
    if (!data) return null;
    let customers = 0, counterparties = 0, alerts = 0, sars = 0;
    for (const n of data.nodes) {
      if (n.type === 'CASE') alerts++;
      else if (n.type === 'SAR') sars++;
      else if (n.is_counterparty) counterparties++;
      else if (n.type === 'PERSON' || n.type === 'COMPANY') customers++;
    }
    return { customers, counterparties, alerts, sars };
  }, [data]);

  return { displayData, adjacency, networkCounts };
}
