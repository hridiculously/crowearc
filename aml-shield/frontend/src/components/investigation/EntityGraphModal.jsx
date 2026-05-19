// ═══════════════════════════════════════════════════════════════════════════
// Cross-Case Entity Network — orchestrator modal.
//
// This file is the top-level composition surface for the CCEG graph modal.
// All meaningful behaviour lives in the extracted hooks (useGraphData /
// useGraphSimulation / useGraphFilters / useGraphInteraction) and the two
// pane components (GraphCanvas on the left, GraphRightPanel on the right).
// This file's job is to:
//
//   * read the analyst's role + name from localStorage
//   * mount the hooks
//   * compose the toolbar + left + right panes
//   * render the modal chrome (header with zoom buttons + close)
//   * own the click router (single-click vs multi-select-add)
//   * render the top-level context menu overlay (it sits above both panes
//     and is positioned page-absolute, so it lives at the modal root)
//   * track the canvas container size for the force graph
//   * handle Escape-to-close (or Escape-to-exit-multi-select) and
//     body-scroll lock
//
// Anything that touches graph data, filter state, or drawing belongs in a
// hook or in GraphCanvas / GraphRightPanel — not here.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, Network } from 'lucide-react';
import GraphCanvas from './GraphCanvas.jsx';
import GraphRightPanel from './GraphRightPanel.jsx';
import GraphToolbar from './GraphToolbar.jsx';
import GraphEdgeFilterPanel from './GraphEdgeFilterPanel.jsx';
import GraphTimeWindowPanel from './GraphTimeWindowPanel.jsx';
import GraphSavedViewsPanel, { readSavedViews } from './GraphSavedViewsPanel.jsx';
import GraphSankeyView from './GraphSankeyView.jsx';
import { useGraphData } from './hooks/useGraphData.js';
import { useGraphFilters } from './hooks/useGraphFilters.js';
import { useGraphSimulation } from './hooks/useGraphSimulation.js';
import { useGraphInteraction } from './hooks/useGraphInteraction.js';
import { useGraphAnnotations, edgeKey } from './hooks/useGraphAnnotations.js';
import { useCompareGraphData } from './hooks/useCompareGraphData.js';
import { computeGraphDiff } from './graphDiff.js';
import { computeClusters } from './graphClusters.js';
import { readUser, rolePrefixFor } from './graphHelpers.js';
import { captureCanvasPng, downloadPng, blobToFile } from './graphExport.js';
import api from '../../api/client.js';

export default function EntityGraphModal({ customerId, customerName, alertId = null, onClose }) {
  // ── Toolbar/view state ──────────────────────────────────────────────
  // Toolbar toggles (account nodes + time window) drive the fetch params.
  // showAccountNodes triggers a re-fetch via the hook's paramsKey.
  const filters = useGraphFilters();
  const {
    filter, filterKeepOnly, filterExclude, filterReset,
    edgeFilters, updateEdgeFilter, resetEdgeFilters, activeEdgeFilterCount,
    multiSelectMode, setMultiSelectMode,
    multiSelectNodes, toggleMultiSelectNode, clearMultiSelect, exitMultiSelectMode,
    replaceMultiSelectNodes,
    subgraphFilter, setSubgraphFilter,
    showEdgeLabels, setShowEdgeLabels,
    showAccountNodes, setShowAccountNodes,
    showClusters, setShowClusters,
    viewMode, setViewMode
  } = filters;

  const [timeWindow, setTimeWindow] = useState(null);   // { from, to } or null
  // Compare window for the Part 11 diff overlay. Null = compare off.
  const [compareWindow, setCompareWindow] = useState(null);
  const [edgeFilterOpen, setEdgeFilterOpen] = useState(false);
  const [timeWindowOpen, setTimeWindowOpen] = useState(false);
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);
  // Counter that re-reads savedViews on close — drives the toolbar's
  // "has saved view" indicator without a global event bus.
  const [savedViewsRev, setSavedViewsRev] = useState(0);
  // Toast for export / evidence-capture results so the analyst gets
  // visible feedback without an alert(). { kind: 'success'|'error', text }
  const [toast, setToast] = useState(null);

  // ── Hub-ring threshold (visual-cleanup PR). Read from manager_settings
  //    on modal mount; the same value drives both the canvas hub ring
  //    and the right-panel "Network hub" warning so they always agree.
  //    Falls back to 5 if the fetch fails — never blocks the canvas.
  const [hubRingThreshold, setHubRingThreshold] = useState(5);
  useEffect(() => {
    let cancelled = false;
    api.get('/settings/manager')
      .then(r => {
        if (cancelled) return;
        const raw = r.data?.['graph.hub_ring_threshold'];
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 1) setHubRingThreshold(n);
      })
      .catch(() => { /* default 5 stands */ });
    return () => { cancelled = true; };
  }, []);

  const fetchParams = useMemo(() => ({
    from: timeWindow?.from || null,
    to:   timeWindow?.to   || null,
    includeAccounts: !!showAccountNodes
  }), [timeWindow, showAccountNodes]);

  // ── Hooks ───────────────────────────────────────────────────────────
  const {
    data, error, currentCustomerId, navHistory, recenterOn, navigateBack
  } = useGraphData(customerId, fetchParams);

  // Part 11 — second fetch for the compare window.
  const { compareData, compareError, compareLoading } = useCompareGraphData(
    currentCustomerId, compareWindow, showAccountNodes
  );

  // Merge the two snapshots when compare is on; otherwise pass the
  // base graph through unchanged. The diff helper stamps _diffStatus
  // on every node/link so the canvas can render adds/removes.
  const mergedData = useMemo(
    () => compareWindow ? computeGraphDiff(data, compareData) : data,
    [data, compareData, compareWindow]
  );

  const { displayData, adjacency, networkCounts } = useGraphSimulation(
    mergedData, filter, { edgeFilters, subgraphFilter }
  );

  const {
    selected, setSelected,
    hoveredNode, setHoveredNode,
    hoveredLink, setHoveredLink,
    cursorPos, setCursorPos,
    contextMenu, setContextMenu, onNodeContext,
    pathHistory, pushToPath, clearPath
  } = useGraphInteraction();

  // ── User identity (read once; needed by annotations + saved views) ──
  const user = useMemo(() => readUser(), []);
  const userRole = user?.role || null;
  const userName = user?.name || null;
  const rolePrefix = useMemo(() => rolePrefixFor(userRole), [userRole]);

  // ── Annotations (Part 12) — scoped to alertId; no-op when null. ─────
  const annotations = useGraphAnnotations(alertId, userName);

  // ── Local state for layout chrome ───────────────────────────────────
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // ── Counterparty count drives the Flow View disable threshold ──────
  const counterpartyCount = useMemo(() => {
    if (!data?.nodes) return 0;
    return data.nodes.filter(n => n.is_counterparty).length;
  }, [data]);

  // ── Cluster overlay (Part 16). Computed only when the toggle is on
  //    so cold-path renders skip the BFS scan. The simulation gives
  //    us filtered displayData; clustering runs on that so subgraph /
  //    edge-filter narrowing changes the components in real time.
  const clusters = useMemo(
    () => showClusters ? computeClusters(displayData) : null,
    [showClusters, displayData]
  );

  // ── Saved-view indicator (refreshes on rev bump + customer change). ─
  const hasSavedView = useMemo(
    () => readSavedViews(currentCustomerId).length > 0,
    [currentCustomerId, savedViewsRev]
  );

  // ── Clear selection on re-center (selection from prior graph isn't valid) ─
  useEffect(() => { setSelected(null); }, [currentCustomerId, setSelected]);

  // ── Canvas size tracking via ResizeObserver ─────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      const r = containerRef.current.getBoundingClientRect();
      setSize({ w: Math.max(400, r.width), h: Math.max(300, r.height) });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // ── d3-force tuning + auto-fit once the simulation has settled ──────
  useEffect(() => {
    if (!fgRef.current || !data) return;
    try {
      const chargeForce = fgRef.current.d3Force('charge');
      if (chargeForce) chargeForce.strength(-320);
      const linkForce = fgRef.current.d3Force('link');
      if (linkForce) linkForce.distance(140);
    } catch (_) { /* older lib versions may not expose d3Force */ }
  }, [data]);

  useEffect(() => {
    if (!fgRef.current || !data) return;
    const t = setTimeout(() => {
      try { fgRef.current.zoomToFit(400, 150); } catch (_) { /* ignore */ }
    }, 1500);
    return () => clearTimeout(t);
  }, [data]);

  // ── Escape: in multi-select mode, exit it. Otherwise close modal. ──
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (multiSelectMode) {
        exitMultiSelectMode();
      } else if (edgeFilterOpen) {
        setEdgeFilterOpen(false);
      } else if (timeWindowOpen) {
        setTimeWindowOpen(false);
      } else if (savedViewsOpen) {
        setSavedViewsOpen(false);
      } else {
        onClose && onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [multiSelectMode, edgeFilterOpen, timeWindowOpen, savedViewsOpen, exitMultiSelectMode, onClose]);

  // Auto-dismiss toast after 3.5s.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // ── Header zoom controls — delegate to the underlying graph ref ────
  const zoomIn  = () => { if (fgRef.current) try { fgRef.current.zoom(fgRef.current.zoom() * 1.3, 300); } catch (_) { /* ignore */ } };
  const zoomOut = () => { if (fgRef.current) try { fgRef.current.zoom(fgRef.current.zoom() * 0.7, 300); } catch (_) { /* ignore */ } };
  const fitAll  = () => { if (fgRef.current) try { fgRef.current.zoomToFit(400, 80); } catch (_) { /* ignore */ } };

  // ── Right-click context menu wiring ────────────────────────────────
  const openCustomerProfile = (node) => {
    if (!node || !node.customer_id) return;
    if (node.type !== 'PERSON' && node.type !== 'COMPANY') return;
    if (node.is_counterparty) return;
    const url = `${rolePrefix}/customers/${encodeURIComponent(node.customer_id)}`;
    try { window.open(url, '_blank', 'noopener'); } catch (_) { /* ignore */ }
  };

  // ── Node-click router. In multi-select mode, clicks toggle the
  //    node's membership in the multi-select set instead of replacing
  //    `selected`. Background click in multi-select mode is a no-op.
  const handleNodeClick = (node) => {
    if (multiSelectMode) {
      if (!node) return;
      toggleMultiSelectNode(node.id);
      return;
    }
    setSelected(node || null);
    if (node) pushToPath(node);
  };

  // ── Export / evidence helpers ──────────────────────────────────────
  // Shared between the Download button (downloads the PNG) and the
  // Camera button (uploads it as case evidence). The header strip
  // identifies who exported it and from what scope, so the image is
  // self-attributing if it leaves the workbench.
  const buildExportHeader = () => ({
    title: customerName ? `Entity Network — ${customerName}` : 'Entity Network',
    subtitle: currentCustomerId ? `Focus: ${currentCustomerId}` : null,
    window: timeWindow ? `${timeWindow.from || '–'} → ${timeWindow.to || '–'}` : null,
    analyst: userName || null,
    timestamp: new Date().toISOString().slice(0, 19).replace('T', ' ') + ' UTC'
  });

  const handleExportPng = async () => {
    try {
      const blob = await captureCanvasPng({
        container: containerRef.current,
        header: buildExportHeader()
      });
      const fname = `cceg_${currentCustomerId || 'graph'}_${Date.now()}.png`;
      downloadPng(fname, blob);
      setToast({ kind: 'success', text: 'PNG downloaded.' });
    } catch (err) {
      setToast({ kind: 'error', text: err?.message || 'Export failed.' });
    }
  };

  const handleCaptureEvidence = async () => {
    if (!alertId) {
      // No alert in scope — fall back to download with a hint.
      await handleExportPng();
      setToast({ kind: 'info', text: 'No alert in scope — downloaded instead.' });
      return;
    }
    try {
      const blob = await captureCanvasPng({
        container: containerRef.current,
        header: buildExportHeader()
      });
      const filename = `cceg_${currentCustomerId || 'graph'}_${Date.now()}.png`;
      const form = new FormData();
      form.append('file', blobToFile(blob, filename), filename);
      form.append('alert_id', alertId);
      form.append('document_type', 'Network Snapshot');
      form.append('description', `Entity network graph capture${timeWindow ? ` (${timeWindow.from || '–'} → ${timeWindow.to || '–'})` : ''}`);
      if (userName) form.append('uploaded_by', userName);
      await api.post('/case-documents/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setToast({ kind: 'success', text: 'Saved to case evidence.' });
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Evidence capture failed.';
      setToast({ kind: 'error', text: msg });
    }
  };

  // ── Saved views: build a snapshot of all view-driving state and
  //    apply one when the analyst picks it back. We intentionally do
  //    NOT capture multi-select state — selection is an in-session
  //    affordance, not a saved scope.
  const buildViewSnapshot = () => ({
    filter,
    edgeFilters,
    timeWindow,
    showEdgeLabels,
    showAccountNodes,
    showClusters,
    viewMode
  });

  const applyViewSnapshot = (snap) => {
    if (!snap) return;
    if (snap.filter)               filters.setFilter(snap.filter);
    if (snap.edgeFilters) {
      for (const [k, v] of Object.entries(snap.edgeFilters)) updateEdgeFilter(k, v);
    }
    setTimeWindow(snap.timeWindow || null);
    setShowEdgeLabels(!!snap.showEdgeLabels);
    setShowAccountNodes(!!snap.showAccountNodes);
    setShowClusters(!!snap.showClusters);
    setViewMode(snap.viewMode || 'force');
    setSavedViewsOpen(false);
    setToast({ kind: 'success', text: 'View applied.' });
  };

  // Helper: open one popover at a time. Used by the toolbar action
  // router to keep the canvas surface uncluttered.
  const openOne = (which) => {
    setEdgeFilterOpen(which === 'edgeFilter');
    setTimeWindowOpen(which === 'timeWindow');
    setSavedViewsOpen(which === 'savedViews');
  };

  // ── Toolbar action router ──────────────────────────────────────────
  const handleToolbarAction = (name) => {
    switch (name) {
      case 'toggleEdgeLabels':   setShowEdgeLabels(v => !v); break;
      case 'toggleAccountNodes': setShowAccountNodes(v => !v); break;
      case 'toggleClusters':     setShowClusters(v => !v); break;
      case 'toggleFlowView':     setViewMode(viewMode === 'sankey' ? 'force' : 'sankey'); break;
      case 'openEdgeFilter':     openOne(edgeFilterOpen  ? null : 'edgeFilter');  break;
      case 'openTimeWindow':     openOne(timeWindowOpen  ? null : 'timeWindow');  break;
      case 'toggleMultiSelect':
        if (multiSelectMode) exitMultiSelectMode();
        else { setSelected(null); setMultiSelectMode(true); }
        break;
      case 'captureEvidence':    handleCaptureEvidence(); break;
      case 'exportPng':          handleExportPng();       break;
      case 'saveView':           openOne(savedViewsOpen ? null : 'savedViews'); break;
      default: break;
    }
  };

  // ── Typology highlight: replace multi-select with the match's
  //    node IDs, then open multi-select mode so the analyst can
  //    inspect / extend / build a subgraph from the matched group.
  const handleTypologyHighlight = (match) => {
    if (!match?.nodeIds?.length) return;
    setSelected(null);
    replaceMultiSelectNodes(match.nodeIds);
    setMultiSelectMode(true);
  };

  // ── "Build Subgraph" — keep multi-selected nodes + everything one
  //    hop away. Used by the right-panel multi-select view.
  const buildSubgraph = () => {
    if (multiSelectNodes.size < 2) return;
    const keep = new Set(multiSelectNodes);
    for (const l of data?.links || []) {
      const s = typeof l.source === 'object' ? l.source.id : l.source;
      const t = typeof l.target === 'object' ? l.target.id : l.target;
      if (multiSelectNodes.has(s)) keep.add(t);
      if (multiSelectNodes.has(t)) keep.add(s);
    }
    setSubgraphFilter(keep);
    setMultiSelectMode(false);
  };

  // ── Derived render state ────────────────────────────────────────────
  const isEmpty = data && data.nodes.length <= 1 && data.links.length === 0;

  const onMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };
  const onMouseLeave = () => { setHoveredNode(null); setHoveredLink(null); };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: 'rgba(2, 6, 23, 0.78)', padding: 24 }}
      role="dialog"
      aria-modal="true"
      aria-label="Entity network graph"
    >
      <div className="rounded-lg flex-1 flex flex-col overflow-hidden shadow-2xl border border-slate-200 bg-white">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-4 text-slate-700 bg-white">
          <Network size={18} className="text-teal-600 shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-bold text-navy-900">Entity Network</div>
            <div className="text-[11px] text-slate-500 truncate">
              {data ? `${data.nodes.length} nodes · ${data.links.length} connections` : 'Loading…'}
              {customerName ? ` · ${customerName}` : ''}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {data && !isEmpty && (
              <div className="hidden md:flex items-center gap-1">
                <ChromeButton onClick={zoomIn}  title="Zoom in"><ZoomIn size={14} /></ChromeButton>
                <ChromeButton onClick={zoomOut} title="Zoom out"><ZoomOut size={14} /></ChromeButton>
                <ChromeButton onClick={fitAll}  title="Fit all to view"><Maximize2 size={14} /></ChromeButton>
                <span className="mx-2 h-5 w-px bg-slate-200" />
              </div>
            )}
            <ChromeButton onClick={onClose} title="Close (Esc)"><X size={16} /></ChromeButton>
          </div>
        </div>

        {/* Toolbar */}
        <GraphToolbar
          state={{
            showEdgeLabels, showAccountNodes, showClusters,
            viewMode, multiSelectMode, hasSavedView
          }}
          counterpartyCount={counterpartyCount}
          activeEdgeFilterCount={activeEdgeFilterCount}
          timeWindow={timeWindow}
          onAction={handleToolbarAction}
        />

        {/* Body: graph (70%) + details (30%) */}
        <div className="flex-1 flex min-h-0 relative">
          {/* Toolbar popovers (edge filter + time window) live at
              body-relative position so they float above the canvas at
              the top-left corner. Only one is open at a time — see the
              toolbar action router. */}
          <GraphEdgeFilterPanel
            open={edgeFilterOpen}
            edgeFilters={edgeFilters}
            onChange={updateEdgeFilter}
            onReset={resetEdgeFilters}
            onClose={() => setEdgeFilterOpen(false)}
          />
          <GraphTimeWindowPanel
            open={timeWindowOpen}
            value={timeWindow}
            bounds={data?.meta?.dataDateRange || null}
            onApply={(window) => setTimeWindow(window)}
            onClose={() => setTimeWindowOpen(false)}
            compareValue={compareWindow}
            onApplyCompare={(w) => setCompareWindow(w)}
          />
          <GraphSavedViewsPanel
            open={savedViewsOpen}
            customerId={currentCustomerId}
            buildSnapshot={buildViewSnapshot}
            onApply={applyViewSnapshot}
            onClose={() => { setSavedViewsOpen(false); setSavedViewsRev(r => r + 1); }}
          />

          <GraphCanvas
            data={mergedData || data}
            displayData={displayData}
            viewMode={viewMode}
            compareActive={!!compareWindow}
            compareWindow={compareWindow}
            compareCounts={mergedData?.meta?.compareCounts || null}
            onClearCompare={() => setCompareWindow(null)}
            adjacency={adjacency}
            isEmpty={isEmpty}
            error={error}
            containerRef={containerRef}
            fgRef={fgRef}
            size={size}
            selected={selected}
            hoveredNode={hoveredNode}
            hoveredLink={hoveredLink}
            cursorPos={cursorPos}
            onMouseMove={onMouseMove}
            onMouseLeave={onMouseLeave}
            onNodeClick={handleNodeClick}
            setHoveredNode={setHoveredNode}
            setHoveredLink={setHoveredLink}
            onNodeContext={onNodeContext}
            multiSelectMode={multiSelectMode}
            multiSelectedIds={multiSelectNodes}
            showEdgeLabels={showEdgeLabels}
            hubRingThreshold={hubRingThreshold}
            annotationsByKey={annotations.byTargetKey}
            clusterByNodeId={clusters?.clusterByNodeId || null}
            colorByClusterId={clusters?.colorByClusterId || null}
            filter={filter}
            filterReset={filterReset}
            navHistory={navHistory}
            navigateBack={navigateBack}
            pathHistory={pathHistory}
            onClearPath={clearPath}
            onPathClick={(entry) => {
              if (!data?.nodes) return;
              const n = data.nodes.find(x => x.id === entry.id);
              if (n) { setSelected(n); }
            }}
          />

          <GraphRightPanel
            node={selected}
            data={data}
            counts={networkCounts}
            customerName={customerName}
            customerId={currentCustomerId}
            userRole={userRole}
            userName={userName}
            rolePrefix={rolePrefix}
            adjacency={adjacency}
            onSelectNode={setSelected}
            onRecenter={recenterOn}
            multiSelectMode={multiSelectMode}
            multiSelectNodes={multiSelectNodes}
            onToggleMultiSelectNode={toggleMultiSelectNode}
            onClearMultiSelect={clearMultiSelect}
            onBuildSubgraph={buildSubgraph}
            subgraphFilter={subgraphFilter}
            onClearSubgraphFilter={() => setSubgraphFilter(null)}
            annotations={annotations}
            onHighlightTypology={handleTypologyHighlight}
            hubRingThreshold={hubRingThreshold}
          />
        </div>

        {/* Lightweight toast for export / evidence / saved-view feedback.
            Auto-dismisses; clickable to dismiss early. */}
        {toast && (
          <button
            type="button"
            onClick={() => setToast(null)}
            className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-[70] text-[11px] font-semibold rounded-md px-3 py-1.5 shadow-md border ${
              toast.kind === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                : toast.kind === 'error'
                  ? 'bg-red-50 border-red-300 text-red-800'
                  : 'bg-blue-50 border-blue-300 text-blue-800'
            }`}
          >
            {toast.text}
          </button>
        )}

        {/* Right-click context menu. Rendered at the modal top level so its
            page-absolute positioning sits above the canvas + side panel. */}
        {contextMenu && (
          <NodeContextMenu
            menu={contextMenu}
            onKeepOnly={() => { filterKeepOnly(contextMenu.node.id); setSelected(null); setContextMenu(null); }}
            onExclude={() => { filterExclude(contextMenu.node.id); setSelected(null); setContextMenu(null); }}
            onReset={() => { filterReset(); setContextMenu(null); }}
            onOpenProfile={() => { openCustomerProfile(contextMenu.node); setContextMenu(null); }}
            onRecenter={() => { recenterOn(contextMenu.node.customer_id); setContextMenu(null); }}
            currentCustomerId={currentCustomerId}
            filterActive={filter.mode !== 'all'}
          />
        )}
      </div>
    </div>
  );
}

// ─── Modal chrome ───────────────────────────────────────────────────────
function ChromeButton({ onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="w-8 h-8 inline-flex items-center justify-center rounded text-slate-600 hover:bg-slate-100"
    >
      {children}
    </button>
  );
}

// Tableau-style context menu shown on right-click of a graph node. Kept
// in the modal file because it's a small top-level overlay and only this
// file knows about the filter / recenter / openProfile handlers.
function NodeContextMenu({ menu, onKeepOnly, onExclude, onReset, onOpenProfile, onRecenter, currentCustomerId, filterActive }) {
  const isCustomer = (menu.node.type === 'PERSON' || menu.node.type === 'COMPANY') && !menu.node.is_counterparty && menu.node.customer_id;
  const isOtherCustomer = isCustomer && menu.node.customer_id !== currentCustomerId;
  const label = menu.node.label || menu.node.customer_name || menu.node.id;
  return (
    <div
      role="menu"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[60] bg-white border border-slate-200 rounded-md shadow-lg text-xs text-slate-700"
      style={{ top: menu.y + 4, left: menu.x + 4, minWidth: 200 }}
    >
      <div className="px-3 py-2 border-b border-slate-100 text-[10px] uppercase tracking-wider text-slate-400 truncate" title={label}>
        {label}
      </div>
      <button type="button" role="menuitem" onClick={onKeepOnly} className="w-full text-left px-3 py-2 hover:bg-slate-50">
        Keep Only
      </button>
      <button type="button" role="menuitem" onClick={onExclude} className="w-full text-left px-3 py-2 hover:bg-slate-50">
        Exclude
      </button>
      {filterActive && (
        <button type="button" role="menuitem" onClick={onReset} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-t border-slate-100">
          Reset Filter
        </button>
      )}
      {isOtherCustomer && (
        <button type="button" role="menuitem" onClick={onRecenter} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-t border-slate-100 text-blue-700 font-medium">
          Re-center Graph Here →
        </button>
      )}
      {isCustomer && (
        <button type="button" role="menuitem" onClick={onOpenProfile} className="w-full text-left px-3 py-2 hover:bg-slate-50 border-t border-slate-100 text-blue-700">
          Open Customer Profile ↗
        </button>
      )}
    </div>
  );
}
