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
//   * compose the left + right panes
//   * render the modal chrome (header with zoom buttons + close)
//   * render the top-level context menu overlay (it sits above both panes
//     and is positioned page-absolute, so it lives at the modal root)
//   * track the canvas container size for the force graph
//   * handle Escape-to-close and body-scroll lock
//
// Anything that touches graph data, filter state, or drawing belongs in a
// hook or in GraphCanvas / GraphRightPanel — not here.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useMemo, useRef, useState } from 'react';
import { X, ZoomIn, ZoomOut, Maximize2, Network } from 'lucide-react';
import GraphCanvas from './GraphCanvas.jsx';
import GraphRightPanel from './GraphRightPanel.jsx';
import { useGraphData } from './hooks/useGraphData.js';
import { useGraphFilters } from './hooks/useGraphFilters.js';
import { useGraphSimulation } from './hooks/useGraphSimulation.js';
import { useGraphInteraction } from './hooks/useGraphInteraction.js';
import { readUser, rolePrefixFor } from './graphHelpers.js';

export default function EntityGraphModal({ customerId, customerName, onClose }) {
  // ── Hooks ───────────────────────────────────────────────────────────
  const {
    data, error, currentCustomerId, navHistory, recenterOn, navigateBack
  } = useGraphData(customerId);

  const {
    filter, filterKeepOnly, filterExclude, filterReset
  } = useGraphFilters();

  const { displayData, adjacency, networkCounts } = useGraphSimulation(data, filter);

  const {
    selected, setSelected,
    hoveredNode, setHoveredNode,
    hoveredLink, setHoveredLink,
    cursorPos, setCursorPos,
    contextMenu, setContextMenu, onNodeContext
  } = useGraphInteraction();

  // ── Local state for layout chrome ───────────────────────────────────
  const containerRef = useRef(null);
  const fgRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // ── User identity (drives the role-aware deep links in the right panel) ─
  const user = useMemo(() => readUser(), []);
  const userRole = user?.role || null;
  const userName = user?.name || null;
  const rolePrefix = useMemo(() => rolePrefixFor(userRole), [userRole]);

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

  // ── Escape closes modal; body-scroll lock ───────────────────────────
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose && onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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

        {/* Body: graph (70%) + details (30%) */}
        <div className="flex-1 flex min-h-0">
          <GraphCanvas
            data={data}
            displayData={displayData}
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
            setSelected={setSelected}
            setHoveredNode={setHoveredNode}
            setHoveredLink={setHoveredLink}
            onNodeContext={onNodeContext}
            filter={filter}
            filterReset={filterReset}
            navHistory={navHistory}
            navigateBack={navigateBack}
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
          />
        </div>

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
