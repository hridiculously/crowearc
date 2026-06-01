// ═══════════════════════════════════════════════════════════════════════════
// useGraphFilters — owns every filter / view-toggle dimension for the
// CCEG graph modal.
//
// State buckets:
//
//   filter          — Tableau-style keep-only / exclude (existing).
//   edgeFilters     — checkboxes that hide / show specific edge categories
//                     (direction, alert status, type, volume thresholds).
//   multiSelectMode — toolbar toggle. When true, single click adds to /
//                     removes from multiSelectNodes instead of replacing
//                     `selected`.
//   multiSelectNodes — Set of node IDs currently in the multi-select bag.
//   subgraphFilter  — set after the analyst confirms "Build Subgraph"
//                     from a multi-select. Drives an extra opacity gate
//                     in displayData.
//   showEdgeLabels  — toolbar toggle; consumed by GraphCanvas in a later
//                     PR (Part 6).
//   showAccountNodes — toolbar toggle; triggers a re-fetch with
//                     ?includeAccounts=true (Part 1b of the backend PR).
// (Cluster Mode + Sankey Flow View toolbar features retired —
//  showClusters / viewMode no longer carried here.)
//
// Setters and small action helpers are returned alongside the raw values.
// Hooks consume only what they need.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useState } from 'react';

const DEFAULT_EDGE_FILTERS = Object.freeze({
  showAll: true,
  inbound: true,
  outbound: true,
  bidirectional: true,
  alerted: true,
  nonAlerted: true,
  transactsWith: true,
  coOccursWith: true,
  holdsAccount: true,      // only meaningful when account nodes are on
  minTxnCount: 0,
  minVolume: 0
});

export function useGraphFilters() {
  const [filter, setFilter] = useState({ mode: 'all', ids: [] });
  const [edgeFilters, setEdgeFilters] = useState(DEFAULT_EDGE_FILTERS);

  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [multiSelectNodes, setMultiSelectNodes] = useState(() => new Set());
  const [subgraphFilter, setSubgraphFilter] = useState(null);

  const [showEdgeLabels, setShowEdgeLabels] = useState(false);
  const [showAccountNodes, setShowAccountNodes] = useState(false);
  // (showClusters + viewMode state retired with the Cluster Mode and
  // Sankey Flow View toolbar buttons.)

  // ── Filter actions (Tableau-style) ───────────────────────────────
  const filterKeepOnly = useCallback((nodeId) => {
    setFilter({ mode: 'keepOnly', ids: [nodeId] });
  }, []);

  const filterExclude = useCallback((nodeId) => {
    setFilter(prev => {
      if (prev.mode === 'exclude') {
        const ids = Array.from(new Set([...prev.ids, nodeId]));
        return { mode: 'exclude', ids };
      }
      return { mode: 'exclude', ids: [nodeId] };
    });
  }, []);

  const filterReset = useCallback(() => {
    setFilter({ mode: 'all', ids: [] });
  }, []);

  // ── Edge filter helpers ──────────────────────────────────────────
  const resetEdgeFilters = useCallback(() => {
    setEdgeFilters(DEFAULT_EDGE_FILTERS);
  }, []);

  const updateEdgeFilter = useCallback((key, value) => {
    setEdgeFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  // Active filter count for the toolbar badge dot. Counts every box
  // that diverges from the default-all-on state.
  const activeEdgeFilterCount =
    (!edgeFilters.showAll ? 1 : 0) +
    (!edgeFilters.inbound ? 1 : 0) +
    (!edgeFilters.outbound ? 1 : 0) +
    (!edgeFilters.bidirectional ? 1 : 0) +
    (!edgeFilters.alerted ? 1 : 0) +
    (!edgeFilters.nonAlerted ? 1 : 0) +
    (!edgeFilters.transactsWith ? 1 : 0) +
    (!edgeFilters.coOccursWith ? 1 : 0) +
    (!edgeFilters.holdsAccount ? 1 : 0) +
    (edgeFilters.minTxnCount > 0 ? 1 : 0) +
    (edgeFilters.minVolume > 0 ? 1 : 0);

  // ── Multi-select actions ─────────────────────────────────────────
  const toggleMultiSelectNode = useCallback((nodeId) => {
    setMultiSelectNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  const clearMultiSelect = useCallback(() => {
    setMultiSelectNodes(new Set());
    setSubgraphFilter(null);
  }, []);

  // Replace the entire multi-select set in one go — used by the
  // typology matcher and other features that need to highlight a
  // specific node group without driving the analyst through a
  // click-by-click bag fill.
  const replaceMultiSelectNodes = useCallback((ids) => {
    setMultiSelectNodes(new Set(Array.isArray(ids) ? ids : []));
    setSubgraphFilter(null);
  }, []);

  const exitMultiSelectMode = useCallback(() => {
    setMultiSelectMode(false);
    setMultiSelectNodes(new Set());
    setSubgraphFilter(null);
  }, []);

  return {
    // Tableau filter
    filter, setFilter,
    filterKeepOnly, filterExclude, filterReset,
    // Edge filters
    edgeFilters,
    updateEdgeFilter,
    resetEdgeFilters,
    activeEdgeFilterCount,
    // Multi-select
    multiSelectMode, setMultiSelectMode,
    multiSelectNodes, toggleMultiSelectNode, clearMultiSelect,
    replaceMultiSelectNodes,
    subgraphFilter, setSubgraphFilter,
    exitMultiSelectMode,
    // Toolbar toggles
    showEdgeLabels, setShowEdgeLabels,
    showAccountNodes, setShowAccountNodes,
    // (showClusters / viewMode setters dropped — features retired)
  };
}
