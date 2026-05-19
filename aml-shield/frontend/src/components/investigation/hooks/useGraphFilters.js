// ═══════════════════════════════════════════════════════════════════════════
// useGraphFilters — owns the Tableau-style filter state for the graph.
//
// Today this is just the keep-only / exclude / reset modes wired to the
// right-click context menu. Subsequent sprints layer additional filter
// dimensions on top (edge filters, time window, multi-select, etc.); when
// they ship they go inside this hook so the simulation hook has a single
// authoritative source of which-nodes-are-hidden.
// ═══════════════════════════════════════════════════════════════════════════

import { useState } from 'react';

export function useGraphFilters() {
  // mode='all'      — full graph (default).
  // mode='keepOnly' — show only the first-order neighbourhood of one node.
  // mode='exclude'  — hide the listed nodes (and edges touching them).
  // Excluded ids accumulate; Reset returns to 'all'.
  const [filter, setFilter] = useState({ mode: 'all', ids: [] });

  const filterKeepOnly = (nodeId) => {
    setFilter({ mode: 'keepOnly', ids: [nodeId] });
  };

  const filterExclude = (nodeId) => {
    setFilter(prev => {
      if (prev.mode === 'exclude') {
        const ids = Array.from(new Set([...prev.ids, nodeId]));
        return { mode: 'exclude', ids };
      }
      return { mode: 'exclude', ids: [nodeId] };
    });
  };

  const filterReset = () => {
    setFilter({ mode: 'all', ids: [] });
  };

  return {
    filter,
    setFilter,
    filterKeepOnly,
    filterExclude,
    filterReset
  };
}
