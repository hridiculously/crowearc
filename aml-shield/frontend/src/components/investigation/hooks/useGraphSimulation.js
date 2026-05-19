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

export function useGraphSimulation(data, filter) {
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

    return {
      ...data,
      nodes: (data.nodes || []).filter(n => !hiddenIds.has(n.id)),
      links: (data.links || []).filter(l => {
        const s = typeof l.source === 'object' ? l.source.id : l.source;
        const t = typeof l.target === 'object' ? l.target.id : l.target;
        return !hiddenIds.has(s) && !hiddenIds.has(t);
      })
    };
  }, [data, filter]);

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
