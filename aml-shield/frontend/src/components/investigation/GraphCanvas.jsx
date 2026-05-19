// ═══════════════════════════════════════════════════════════════════════════
// GraphCanvas — the 70%-width left pane of the CCEG modal.
//
// Owns:
//   * The ForceGraph2D wrapper + all its callbacks (node draw, link draw,
//     particles, click, hover, drag-end, right-click).
//   * The bottom-left collapsible legend.
//   * The bottom-centre Phase indicator chip (C-10 normalised / entity-fk).
//   * The bottom-right one-shot hint.
//   * The hover tooltips (node label + edge details).
//   * The top-left "Back" chip + top-right active-filter chip.
//
// Does NOT own:
//   * The right-click context menu — rendered at the modal top level so
//     its page-absolute positioning sits above this pane and the side
//     panel. The menu is in EntityGraphModal.jsx.
//
// All state is received as props from the orchestrating modal; this
// component is otherwise stateless (just hover labels via the parent's
// cursor pos state).
// ═══════════════════════════════════════════════════════════════════════════
//
// ─── PRE-PR AUDIT (visual-cleanup pass) ────────────────────────────────────
// Documented before the visual cleanup PR landed. Captures the state of
// the canvas layering so future edits don't re-introduce the noise this
// PR removed.
//
// 1) RISK-SCORE BADGE  (REMOVED in this PR.)
//    Previously: a small filled circle in the upper-right of every node
//    whose computeRiskScore(node) returned ≥ 55 (or any selected node).
//    Trigger: `score` from computeRiskScore() — a roll-up over sanctions,
//    PEP, OFAC, high-risk jurisdiction, hub popularity, alerts.
//    Draw calls: ctx.arc at (node.x + r - 1, node.y - r + 1) with
//    riskScoreCanvasColor(score) fill + white stroke; numeric score text
//    on top at zoom ≥ 1.1. Now retired from the canvas — the numeric
//    score lives on in the right-panel RiskScoreBar.
//
// 2) HUB RING  (RETIRED.)
//    Previously a violet outer ring at r+4 driven by the
//    hubRingThreshold prop (manager_settings key
//    graph.hub_ring_threshold). In dense networks the ring fired
//    on most counterparties and read as background texture. The
//    hub concept is preserved through node size — radiusFor
//    log-scales counterparty radius with txn_count, so high-volume
//    hubs are visibly larger circles. The right panel still
//    surfaces a "⚠ Network hub" text warning at the same threshold.
//
// 3) RING-DRAW SEQUENCE (top of drawNode → bottom; later = visually outer):
//    a. body fill            (circle for entities, rounded-square for ACCOUNT)
//    b. sanctions ring       (red,    r+1) — risk_indicators.sanctions_hit
//    c. focus halo           (node colour, r+3) — node.is_focus
//    d. pep/sanctions ring   (red or violet, r+1) — node.pep / .sanctions
//    e. diff status ring     (green/red, r+4) — Part 11 _diffStatus
//    f. selection ring       (blue, r+7) — selected single click
//    g. multi-select ring    (amber, r+5) — node in multiSelectedIds
//    h. annotation pin       (yellow, top-left) — Part 12
//    Retired in this layer: hub ring (background texture on dense
//    graphs), cluster halo, high-risk-country dashed ring (now in
//    fill colour), Phase A "?" badge, risk-score badge.
//
// 4) ORANGE FILL  (NOW TWO-TIER.)
//    Previously: a single `if (phaseB && node.is_high_risk_counterparty)
//    color = '#F97316'` (orange) bundled PEP, sanctions, OFAC and
//    high-risk jurisdiction into one fill. After this PR, PhaseB CP
//    fill is:
//      * `#F97316` orange — PEP / sanctions / OFAC (strong signal)
//      * `#D97706` amber  — high-risk jurisdiction ONLY (moderate)
//      * gold (default)   — everything else
//    Inputs: node.risk_indicators?.{pep,sanctions_hit,high_risk_jurisdiction},
//            node.ofac_flagged, node.is_high_risk_country (legacy fallback
//            on customer nodes).
//
// 5) SHAPE CHOICE.
//    Final state after the follow-up cleanup: ALL entity nodes render
//    as circles. Only ACCOUNT keeps a distinct shape (rounded square)
//    because it's a container, not an entity. The Phase A vs Phase B
//    distinction is no longer visible on the canvas — the tooltip
//    still reports identity status on hover, but the canvas treats
//    every counterparty uniformly. Fill colour does the work:
//      orange = PEP/sanctions/OFAC, amber = high-risk jurisdiction,
//      gold = standard counterparty.
//
// 6) LEGEND.
//    Three sections (Node types, Ring indicators, Fill colours), each
//    driven by an inline data array. All swatches are circles (with
//    a single rounded-square for the Account row). The "Currently
//    selected node" ring entry was removed — the blue ring is a
//    transient interaction cue, not a permanent legend concern.
// ═══════════════════════════════════════════════════════════════════════════

import { lazy, Suspense, useEffect, useState } from 'react';
import {
  Network, Loader2, ChevronDown, ChevronRight, X, Trash2, GitFork
} from 'lucide-react';
import {
  COLORS, NODE_RADIUS, radiusFor, isPhaseBCounterparty,
  truncateLabel, fmtVolumeShort, fmtMoney, shouldShowHoverLabel
} from './graphHelpers.js';
import GraphSankeyView from './GraphSankeyView.jsx';

// Lazy-loaded so the graph library (~150KB) doesn't ship in the main bundle.
const ForceGraph2D = lazy(() => import('react-force-graph-2d'));

export default function GraphCanvas({
  // Data
  data,                 // raw graph response (for tooltips that need full node list)
  displayData,          // filtered graph passed to ForceGraph2D
  adjacency,            // node-id → Set of neighbour ids
  isEmpty,
  error,
  // Layout
  containerRef,
  fgRef,
  size,
  // Interaction state
  selected,
  hoveredNode,
  hoveredLink,
  cursorPos,
  // Interaction handlers
  onMouseMove,
  onMouseLeave,
  onNodeClick,
  setHoveredNode,
  setHoveredLink,
  onNodeContext,
  // Multi-select
  multiSelectMode = false,
  multiSelectedIds = null,
  // View toggles
  showEdgeLabels = false,
  // (hubRingThreshold prop retired — the violet hub ring was removed
  // from the canvas. The right panel still surfaces a "Network hub"
  // text warning at the same threshold; that lives in GraphRightPanel
  // and consumes its own prop from EntityGraphModal.)
  annotationsByKey = null,
  // Overlay state
  filter,
  filterReset,
  navHistory,
  navigateBack,
  // Investigation path (Part 13)
  pathHistory = [],
  onPathClick,
  onClearPath,
  // Diff overlay (Part 11)
  compareActive = false,
  compareWindow = null,
  compareCounts = null,
  onClearCompare,
  // View mode (Part 17) — 'force' (default) | 'sankey'
  viewMode = 'force'
}) {
  const [legendOpen, setLegendOpen] = useState(true);
  const [hintVisible, setHintVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setHintVisible(false), 5000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{
        background: '#F8FAFC',
        flex: '0 0 70%',
        maxWidth: '70%',
        cursor: hoveredNode ? 'pointer' : 'default'
      }}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {error ? (
        <Centered>
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
            Failed to load graph: {error}
          </div>
        </Centered>
      ) : !data ? (
        <LoadingState />
      ) : isEmpty ? (
        <Centered>
          <div className="text-center max-w-md px-6">
            <Network size={36} className="text-slate-300 mx-auto mb-3" />
            <div className="text-sm font-medium text-navy-900">No connected entities found</div>
            <div className="text-xs text-slate-500 mt-2">
              This customer has no shared counterparties with other customers
              in the current dataset.
            </div>
          </div>
        </Centered>
      ) : viewMode === 'sankey' ? (
        <GraphSankeyView displayData={displayData} size={size} />
      ) : (
        <Suspense fallback={<LoadingState />}>
          <ForceGraph2D
            ref={fgRef}
            graphData={displayData}
            width={size.w}
            height={size.h}
            backgroundColor="#F8FAFC"
            nodeRelSize={5}
            nodeCanvasObject={(node, ctx, globalScale) =>
              drawNode(node, ctx, globalScale, selected, hoveredNode, adjacency, multiSelectedIds, annotationsByKey)
            }
            nodePointerAreaPaint={(node, color, ctx) => {
              ctx.fillStyle = color;
              const r = radiusFor(node) + 4;
              ctx.beginPath();
              ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
              ctx.fill();
            }}
            linkColor={(l) => linkColor(l, selected)}
            linkWidth={(l) => linkWidth(l)}
            linkLineDash={(l) => linkDash(l)}
            // Edge label overlay — only fires when the toolbar toggle is
            // on. Labels are zoom-gated (>= 1.0) so we don't drown the
            // canvas at fit-to-view.
            linkCanvasObjectMode={() => showEdgeLabels ? 'after' : undefined}
            linkCanvasObject={(link, ctx, globalScale) => {
              if (!showEdgeLabels) return;
              drawLinkLabel(link, ctx, globalScale, selected);
            }}
            // Money-flow direction. Larger arrows (6px) sit at the
            // target end so the eye lands on the receiving entity.
            // Particles animate in the same direction; their count
            // is log-scaled to txn_count so high-volume edges shimmer.
            // Bidirectional flows get two particles.
            linkDirectionalArrowLength={(l) => l.type === 'TRANSACTS_WITH' ? 6 : 3}
            linkDirectionalArrowRelPos={0.92}
            linkDirectionalParticles={(l) => {
              if (l.type !== 'TRANSACTS_WITH') return 0;
              if (l.direction === 'bidirectional') return 2;
              const cnt = Number(l.txn_count) || 0;
              return Math.max(1, Math.min(4, Math.round(Math.log10(cnt + 1) + 1)));
            }}
            linkDirectionalParticleSpeed={(l) => l.alerted ? 0.012 : 0.006}
            linkDirectionalParticleWidth={(l) => l.alerted ? 3 : 2}
            linkDirectionalParticleColor={(l) => l.alerted ? '#DC2626' : '#475569'}
            onNodeClick={(node) => onNodeClick && onNodeClick(node)}
            onNodeHover={(node) => setHoveredNode(node || null)}
            onBackgroundClick={() => onNodeClick && onNodeClick(null)}
            onLinkHover={(link) => setHoveredLink(link || null)}
            onNodeDragEnd={(node) => { node.fx = node.x; node.fy = node.y; }}
            onNodeRightClick={onNodeContext}
            // CHANGE-1 target: simulation budget. warmupTicks=120
            // runs 120 ticks invisibly before the first paint so
            // the analyst never sees a mid-simulation cluster.
            // cooldownTicks=0 stops the animated cool-down after
            // the warmup completes — there's nothing to refine
            // since the layout is already settled.
            warmupTicks={120}
            cooldownTicks={0}
            // Frame the network when the simulation settles.
            onEngineStop={() => {
              try { fgRef.current?.zoomToFit(400, 140); } catch (_) { /* ignore */ }
            }}
          />
        </Suspense>
      )}

      {/* Hover-following label tooltip. */}
      {hoveredNode && shouldShowHoverLabel(hoveredNode) && (
        <div
          className="absolute pointer-events-none rounded px-2 py-1 text-[11px] font-medium text-navy-900 border border-slate-200 shadow-md"
          style={{
            top: cursorPos.y + 14,
            left: cursorPos.x + 14,
            background: 'rgba(255, 255, 255, 0.98)',
            zIndex: 30,
            maxWidth: 240
          }}
        >
          {hoveredNode.label}
        </div>
      )}

      {/* Edge-hover tooltip */}
      {hoveredLink && <EdgeTooltip link={hoveredLink} pos={cursorPos} data={data} />}

      {/* Bottom-left collapsible legend */}
      {data && !isEmpty && (
        <GraphLegend
          open={legendOpen}
          onToggle={() => setLegendOpen(o => !o)}
        />
      )}

      {/* C-10: phase indicator. */}
      {data?.meta?.graphPhase && (
        <div
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-10 text-[10px] font-medium px-2 py-1 rounded ${
            data.meta.graphPhase === 'entity_fk'
              ? 'bg-teal-100 text-teal-800 border border-teal-300'
              : 'bg-slate-100 text-slate-600 border border-slate-300'
          } pointer-events-none`}
          title={data.meta.graphPhase === 'entity_fk'
            ? 'Graph using counterparty_id FK joins (C-10 Phase B)'
            : 'Graph using counterparty_normalised string matching (C-10 Phase A — backfill not yet run)'}
        >
          Graph: {data.meta.graphPhase === 'entity_fk' ? 'entity-linked' : 'normalised matching'}
        </div>
      )}

      {/* Bottom-right one-shot hint */}
      {hintVisible && data && (
        <div
          className="absolute bottom-4 right-4 text-[10px] text-slate-600 border border-slate-200 rounded px-2 py-1 pointer-events-none transition-opacity duration-500 shadow-sm"
          style={{ background: 'rgba(255,255,255,0.95)', opacity: hintVisible ? 1 : 0 }}
        >
          Click a node to explore · Right-click for filter
        </div>
      )}

      {/* Diff overlay banner (Part 11). Sits just below the toolbar
          so the analyst always sees the diff scope. Stacks above the
          multi-select banner if both happen to be active. */}
      {compareActive && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-2 bg-violet-100 border border-violet-400 text-violet-900 text-[11px] font-semibold rounded-md px-3 py-1 shadow-sm">
          <span>Diff vs {compareWindow?.from || '–'} → {compareWindow?.to || '–'}</span>
          {compareCounts && (
            <span className="text-violet-700 font-normal">
              · <span className="text-emerald-700 font-semibold">+{compareCounts.addedNodes}</span>
              / <span className="text-red-700 font-semibold">−{compareCounts.removedNodes}</span> nodes
            </span>
          )}
          <button
            type="button"
            onClick={onClearCompare}
            className="ml-1 text-violet-800 hover:text-violet-900 underline"
          >
            Clear
          </button>
        </div>
      )}

      {/* Multi-select mode banner — pinned top-center so the analyst
          always sees the mode is on (it changes click semantics).
          Pushes down when the diff banner is also visible. */}
      {multiSelectMode && (
        <div
          className={`absolute left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-2 bg-amber-100 border border-amber-400 text-amber-900 text-[11px] font-semibold rounded-md px-3 py-1 shadow-sm ${
            compareActive ? 'top-12' : 'top-3'
          }`}
        >
          Select nodes to build subgraph ({multiSelectedIds?.size || 0} selected) · Press Esc to cancel
        </div>
      )}

      {/* Top-left back chip. */}
      {navHistory.length > 0 && (
        <button
          type="button"
          onClick={navigateBack}
          className="absolute top-3 left-3 z-20 inline-flex items-center gap-1.5 bg-white border border-slate-300 hover:border-blue-400 text-slate-700 text-[11px] font-semibold rounded-md px-2.5 py-1 shadow-sm"
          title="Return to the previous customer focus"
        >
          ← Back
        </button>
      )}

      {/* Investigation path breadcrumb (Part 13). Pinned bottom-center
          above any phase-indicator chip; collapses gracefully when only
          one node has been visited. */}
      {pathHistory && pathHistory.length > 0 && (
        <GraphPathStrip
          path={pathHistory}
          onClick={onPathClick}
          onClear={onClearPath}
        />
      )}

      {/* Top-right active-filter chip. */}
      {filter.mode !== 'all' && (
        <div className="absolute top-3 right-3 z-20 inline-flex items-center gap-2 bg-blue-50 border border-blue-300 text-blue-800 text-[11px] font-semibold rounded-md px-2.5 py-1 shadow-sm">
          {filter.mode === 'keepOnly' ? (
            <span>Filter: Keep Only · 1 node + neighbours</span>
          ) : (
            <span>Filter: Excluding {filter.ids.length} node{filter.ids.length === 1 ? '' : 's'}</span>
          )}
          <button
            type="button"
            onClick={filterReset}
            className="text-blue-700 hover:text-blue-900 underline text-[11px]"
          >
            Reset
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Edge color / width / dash helpers ──────────────────────────────────
function linkColor(l, selected) {
  const dimmed = selected && !linkTouchesSelected(l, selected);
  if (dimmed) return 'rgba(148, 163, 184, 0.15)';
  // Diff overlay (Part 11): added in window B → green, removed only
  // in window A → red. Unchanged falls through to the regular palette.
  if (l._diffStatus === 'added')   return '#10B981';
  if (l._diffStatus === 'removed') return '#DC2626';
  if (l.type === 'TRANSACTS_WITH') return l.alerted ? '#DC2626' : '#94A3B8';
  if (l.type === 'CO_OCCURS_WITH') return '#CBD5E1';
  if (l.type === 'APPEARS_IN')     return '#3B82F6';
  if (l.type === 'FILED_BY' || l.type === 'SUBJECT_OF') return '#A32D2D';
  // Account-ownership / via-account edges (when includeAccounts=true).
  if (l.type === 'HOLDS_ACCOUNT')   return '#185FA5';
  if (l.type === 'TRANSACTS_VIA')   return '#94A3B8';
  return '#94A3B8';
}

function linkWidth(l) {
  if (l.type === 'TRANSACTS_WITH') return l.alerted ? 2 : 1;
  if (l.type === 'CO_OCCURS_WITH') return 0.5;
  if (l.type === 'HOLDS_ACCOUNT')  return 1.5;
  if (l.type === 'TRANSACTS_VIA')  return 0.75;
  return 1;
}

function linkDash(l) {
  // Diff overlay: removed-only edges read dashed so they don't compete
  // visually with present edges in the same color family.
  if (l._diffStatus === 'removed') return [4, 3];
  // computed = co-occurrence inference (Phase A backfill). Keep dashed
  // so analysts know it's derived. HOLDS_ACCOUNT also dashes so it
  // reads visually as structural rather than behavioural.
  if (l.computed) return [3, 3];
  if (l.type === 'HOLDS_ACCOUNT') return [4, 3];
  return null;
}

// ─── Edge label drawing ─────────────────────────────────────────────────
// Renders a compact "$X · n txn" pill at the midpoint of TRANSACTS_WITH
// edges (and only those — co-occurrence / account-ownership / SAR edges
// have no $ amount to show). Hidden on dimmed edges and at very low
// zoom so the canvas doesn't drown.
function drawLinkLabel(link, ctx, globalScale, selected) {
  if (globalScale < 0.9) return;
  if (link.type !== 'TRANSACTS_WITH') return;
  if (selected && !linkTouchesSelected(link, selected)) return;
  // Source/target may be string-IDs early in the simulation; once d3
  // hydrates them they're objects with x/y.
  const sx = link.source?.x, sy = link.source?.y;
  const tx = link.target?.x, ty = link.target?.y;
  if (sx == null || sy == null || tx == null || ty == null) return;

  const cnt = Number(link.txn_count) || 0;
  const amt = Number(link.total_amount) || 0;
  if (cnt === 0 && amt === 0) return;

  const label = `${shortMoney(amt)} · ${cnt} txn`;
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;
  const fontSize = Math.max(8, 9 / globalScale);
  ctx.font = `${fontSize}px Inter, sans-serif`;
  const metrics = ctx.measureText(label);
  const padX = 4, padY = 1.5;
  const w = metrics.width + padX * 2;
  const h = fontSize + padY * 2;
  const x = mx - w / 2;
  const y = my - h / 2;
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = link.alerted ? 'rgba(254, 226, 226, 0.95)' : 'rgba(248, 250, 252, 0.95)';
  ctx.strokeStyle = link.alerted ? 'rgba(220, 38, 38, 0.5)' : 'rgba(203, 213, 225, 0.7)';
  ctx.lineWidth = 0.75;
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 3);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }
  ctx.fillStyle = link.alerted ? '#991B1B' : '#475569';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(label, mx, my);
  ctx.restore();
}

function shortMoney(v) {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

function linkTouchesSelected(link, selected) {
  if (!selected) return true;
  const s = typeof link.source === 'object' ? link.source.id : link.source;
  const t = typeof link.target === 'object' ? link.target.id : link.target;
  return s === selected.id || t === selected.id;
}

// ─── Custom node draw ───────────────────────────────────────────────────
function drawNode(node, ctx, globalScale, selected, hoveredNode, adjacency, multiSelectedIds, annotationsByKey) {
  // Counterparty fill (two-tier, post visual-cleanup PR):
  //   PEP / sanctions / OFAC  → #F97316 orange (strong)
  //   high-risk jurisdiction only → #D97706 amber (moderate)
  //   else → gold (COMPANY default)
  // Orange wins when both conditions are true. Phase A and Phase B share
  // this fill logic — only the shape differentiates them visually.
  const phaseB = isPhaseBCounterparty(node);
  const phaseA = !!(node.is_counterparty && !node.counterparty_id);
  const isCounterparty = phaseA || phaseB;
  const hasPEPorSanctions = !!(
    node.risk_indicators?.pep ||
    node.risk_indicators?.sanctions_hit ||
    node.ofac_flagged
  );
  const hasHighRiskJurisdiction = !!(
    node.risk_indicators?.high_risk_jurisdiction ||
    (isCounterparty && node.is_high_risk_country)
  );
  let color = COLORS[node.type] || '#94A3B8';
  if (isCounterparty && hasPEPorSanctions) {
    color = '#F97316';                       // orange — strong signal wins
  } else if (isCounterparty && hasHighRiskJurisdiction) {
    color = '#D97706';                       // amber — high-risk jurisdiction only
  }
  const r = radiusFor(node);

  // Selection dimming — when a node is clicked, non-neighbour nodes fade
  // heavily so the first-order neighbourhood pops. The simulation hook
  // also stamps node._dimmed when the analyst has built a subgraph
  // filter from multi-select; that takes precedence over single-select
  // dimming so the chosen subgraph stays at full opacity.
  let alpha = 1;
  if (node._dimmed) {
    alpha = 0.08;
  } else if (selected) {
    const isSelected   = selected.id === node.id;
    const isConnected  = adjacency.get(selected.id)?.has(node.id);
    alpha = (isSelected || isConnected) ? 1 : 0.1;
  }
  // Diff overlay: removed nodes fade a little so adds/unchanged read
  // brighter against them. Added nodes stay at full opacity to draw
  // the eye to the new entity.
  if (node._diffStatus === 'removed') alpha = Math.min(alpha, 0.55);
  ctx.save();
  ctx.globalAlpha = alpha;

  // (Cluster halo retired per follow-up UX feedback — the connected-
  // component algorithm painted every reachable node in a single hue
  // on dense hub-and-spoke networks, communicating nothing.)

  // Body. All entity nodes (PERSON / COMPANY / counterparty / SAR) draw
  // as a circle. ACCOUNT keeps its rounded square because it's a
  // structural container, not a behavioural entity. The diamond shape
  // for counterparties was retired per follow-up UX feedback — fill
  // colour and rings carry the type/risk signal instead.
  const isAccount = node.type === 'ACCOUNT';
  ctx.beginPath();
  if (isAccount) {
    // Rounded square. Closed account → dimmer fill + dashed border.
    const halfR = r;
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(node.x - halfR, node.y - halfR, halfR * 2, halfR * 2, 3);
    } else {
      ctx.rect(node.x - halfR, node.y - halfR, halfR * 2, halfR * 2);
    }
  } else {
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
  }
  ctx.fillStyle = color;
  ctx.fill();
  if (isAccount) {
    ctx.lineWidth = 1;
    if (node.status && node.status !== 'Active') {
      ctx.setLineDash([3, 2]);
      ctx.strokeStyle = '#94A3B8';
    } else {
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // (Hub ring retired per follow-up UX feedback — in dense networks
  // the violet ring fired on most counterparties and read as
  // background texture rather than signal. Node size is now the
  // hub indicator: high-volume counterparties have a larger radius
  // via radiusFor's log-scaling of txn_count. The right panel still
  // surfaces a "⚠ Network hub" text warning at the same threshold.)

  // Sanctions hazard ring (Phase B counterparties from risk_indicators).
  if (phaseB && node.risk_indicators?.sanctions_hit) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 1, 0, 2 * Math.PI, false);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#DC2626';
    ctx.stroke();
  }

  // Focus halo (subtle outer ring on the root entity)
  if (node.is_focus) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 3, 0, 2 * Math.PI, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // (High-risk-country dashed orange ring retired in the visual-cleanup
  // PR — see PRE-PR AUDIT note 4. High-risk jurisdiction is now encoded
  // in the counterparty FILL colour (amber) so the indicator no longer
  // competes with the sanctions/PEP rings for the third visual channel.)
  if (node.pep || node.sanctions) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 1, 0, 2 * Math.PI, false);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = node.sanctions ? '#DC2626' : '#7C3AED';
    ctx.stroke();
  }

  // Diff status ring (Part 11). Drawn outside the focus halo but
  // inside the selection ring so single-select still overrides
  // visually. 'added' = green, 'removed' = red dashed.
  if (node._diffStatus === 'added' || node._diffStatus === 'removed') {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 4, 0, 2 * Math.PI, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = node._diffStatus === 'added' ? '#10B981' : '#DC2626';
    if (node._diffStatus === 'removed') ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Selection ring (blue, outermost)
  if (selected && selected.id === node.id) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 7, 0, 2 * Math.PI, false);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#3B82F6';
    ctx.stroke();
  }

  // Multi-select ring (amber). Shown when this node is one of the
  // analyst's multi-selected set — separate visual from the single-
  // node blue selection ring above.
  if (multiSelectedIds && multiSelectedIds.has && multiSelectedIds.has(node.id)) {
    ctx.beginPath();
    ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI, false);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#F59E0B';
    ctx.stroke();
  }

  // (Phase A "?" badge retired per follow-up UX feedback — the per-node
  // identity status still surfaces in the hover tooltip, but no longer
  // adds a corner glyph that doubled the visual count on every node.)

  // Annotation pin — small yellow square in the upper-left of any node
  // that has at least one pinned note for the current alert. Drawn
  // before the risk-score badge so they don't collide visually.
  const annotations = annotationsByKey?.get?.(node.id);
  if (annotations && annotations.length > 0 && globalScale >= 0.5) {
    const pinR = Math.max(4, Math.min(6, r * 0.45));
    const px = node.x - r + 1;
    const py = node.y - r + 1;
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, pinR, 0, 2 * Math.PI, false);
    ctx.fillStyle = '#FACC15';   // amber-400
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.stroke();
    if (annotations.length > 1 && globalScale >= 1.0) {
      const f = Math.max(7, 8 / globalScale);
      ctx.font = `bold ${f}px Inter, sans-serif`;
      ctx.fillStyle = '#92400E';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(annotations.length), px, py);
    }
    ctx.restore();
  }

  // (Risk-score badge retired in the visual-cleanup PR — see PRE-PR AUDIT
  // note 1. The numeric score still appears in the right panel's
  // RiskScoreBar; the canvas no longer stacks a redundant red disc on
  // top of the fill + rings.)

  // Label rules.
  const isSelected = selected && selected.id === node.id;
  const alwaysShow = node.is_focus || isSelected;
  const isFlagged  = node.sanctions || node.pep || node.is_high_risk_country;
  const showLabel  = alwaysShow || (isFlagged && globalScale >= 0.7);
  if (showLabel) {
    const fontSize = Math.max(9, 11 / globalScale);
    ctx.font = `${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const label = truncateLabel(node.label, 18);
    const padX = 5;
    const padY = 2;
    const textMetrics = ctx.measureText(label);
    const w = textMetrics.width + padX * 2;
    const h = fontSize + padY * 2;
    const x = node.x - w / 2;
    const y = node.y + r + 4;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.strokeStyle = 'rgba(203, 213, 225, 0.9)';
    ctx.lineWidth = 1;
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 4);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(x, y, w, h);
      ctx.strokeRect(x, y, w, h);
    }
    ctx.fillStyle = '#0F172A';
    ctx.fillText(label, node.x, y + padY);

    if (phaseB && globalScale >= 0.7) {
      const subFontSize = Math.max(8, 9 / globalScale);
      ctx.font = `${subFontSize}px Inter, sans-serif`;
      ctx.fillStyle = '#64748B';
      const sub = `${node.txn_count_with_focus ?? 0} txns · ${fmtVolumeShort(node.total_volume)}`;
      ctx.fillText(sub, node.x, y + h + 2);
    }
  }

  ctx.restore();
}

// Investigation path strip — chronological breadcrumb pinned to the
// bottom of the canvas. Each crumb is a button: clicking it re-selects
// the node (driving the right panel back to that entity's details).
// The strip shows up to the last 6 crumbs by default to keep things
// readable; a "+N" chip on the left signals there are older entries
// not shown.
function GraphPathStrip({ path, onClick, onClear }) {
  const visible = path.slice(-6);
  const hiddenCount = path.length - visible.length;
  return (
    <div
      className="absolute bottom-12 left-1/2 -translate-x-1/2 z-20 inline-flex items-center gap-1 bg-white/95 border border-slate-200 rounded-full pl-1 pr-1 py-1 shadow-sm text-[11px]"
      role="navigation"
      aria-label="Investigation path"
    >
      {hiddenCount > 0 && (
        <span
          className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-medium"
          title={`${hiddenCount} earlier node${hiddenCount === 1 ? '' : 's'} not shown`}
        >
          +{hiddenCount}
        </span>
      )}
      {visible.map((entry, i) => (
        <div key={`${entry.id}-${entry.ts}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <span className="text-slate-300">›</span>}
          <button
            type="button"
            onClick={() => onClick && onClick(entry)}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full hover:bg-blue-50 text-navy-900"
            title={entry.label}
          >
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: COLORS[entry.type] || '#94A3B8' }}
            />
            <span className="max-w-[8rem] truncate">{entry.label}</span>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onClear}
        title="Clear investigation path"
        className="ml-0.5 inline-flex items-center justify-center h-5 w-5 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600"
      >
        <X size={11} />
      </button>
    </div>
  );
}

function Centered({ children }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center">
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <Centered>
      <div className="relative w-64 h-32 mb-4">
        <span className="absolute left-1/2 top-2 -translate-x-1/2 block w-5 h-5 rounded-full bg-slate-300 animate-pulse" />
        <span className="absolute left-3 top-1/2 -translate-y-1/2 block w-3 h-3 rounded-full bg-slate-200 animate-pulse" style={{ animationDelay: '150ms' }} />
        <span className="absolute right-4 top-1/2 -translate-y-1/2 block w-4 h-4 rounded-full bg-slate-300 animate-pulse" style={{ animationDelay: '300ms' }} />
        <span className="absolute left-12 bottom-1 block w-3 h-3 rounded-full bg-slate-200 animate-pulse" style={{ animationDelay: '450ms' }} />
        <span className="absolute right-12 bottom-2 block w-3.5 h-3.5 rounded-full bg-slate-300 animate-pulse" style={{ animationDelay: '600ms' }} />
        <svg className="absolute inset-0 w-full h-full" aria-hidden>
          <line x1="50%" y1="14" x2="14"  y2="50%" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="3 3" />
          <line x1="50%" y1="14" x2="232" y2="50%" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="3 3" />
          <line x1="14"  y1="50%" x2="60" y2="120" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="3 3" />
          <line x1="232" y1="50%" x2="200" y2="120" stroke="#CBD5E1" strokeWidth="1.5" strokeDasharray="3 3" />
        </svg>
      </div>
      <Loader2 size={16} className="animate-spin text-slate-400" />
      <div className="text-xs text-slate-500 mt-2">Loading entity network…</div>
    </Centered>
  );
}

function GraphLegend({ open, onToggle }) {
  // Three sections, each driven by an inline data array so future
  // additions / removals are a one-line edit. Swatches use the same
  // shape vocabulary as the canvas: circle (customer / SAR), diamond
  // (counterparty), rounded-square (account). The diamond swatch is
  // a rotated <div> so the legend always mirrors the actual node draw.
  const nodeTypes = [
    { shape: 'circle',  color: COLORS.PERSON,  label: 'Person (customer)' },
    { shape: 'circle',  color: COLORS.COMPANY, label: 'Company / Counterparty' },
    { shape: 'circle',  color: '#D97706',      label: 'Counterparty (high-risk jurisdiction)' },
    { shape: 'circle',  color: '#F97316',      label: 'Counterparty (PEP / sanctions / OFAC)' },
    { shape: 'circle',  color: COLORS.SAR,     label: 'SAR Filing' },
    { shape: 'rounded', color: COLORS.ACCOUNT, label: 'Account' }
  ];
  const ringIndicators = [
    { color: '#DC2626', label: 'Sanctions match' },
    { color: '#7C3AED', label: 'PEP flag' }
  ];
  const fillColours = [
    { color: COLORS.COMPANY, label: 'Standard counterparty' },
    { color: '#D97706',      label: 'High-risk jurisdiction' },
    { color: '#F97316',      label: 'PEP / Sanctions / OFAC match' }
  ];

  return (
    <div
      className="absolute bottom-4 left-4 z-20 text-[11px] text-slate-700"
      style={{
        background: 'rgba(255, 255, 255, 0.95)',
        border: '1px solid #E2E8F0',
        borderRadius: 8,
        padding: open ? '10px 14px' : '6px 10px',
        boxShadow: '0 4px 16px rgba(15, 23, 42, 0.08)',
        maxWidth: 420
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-1 text-slate-700 hover:text-navy-900"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="font-semibold uppercase tracking-wider text-[10px]">Legend</span>
      </button>
      {open && (
        <div className="mt-2 grid grid-cols-3 gap-x-5 gap-y-1.5">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Node types</div>
            {nodeTypes.map((n, i) => (
              <LegendShape key={i} {...n} />
            ))}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Ring indicators</div>
            {ringIndicators.map((r, i) => (
              <LegendRing key={i} color={r.color} label={r.label} />
            ))}
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1">Fill colours</div>
            {fillColours.map((f, i) => (
              <LegendShape key={i} shape="circle" color={f.color} label={f.label} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Renders the legend swatch for a node — circle (default) or rounded
// square (account). All entity nodes use a circle now; ACCOUNT alone
// uses the rounded variant because it represents a container, not an
// entity.
function LegendShape({ shape = 'circle', color, label }) {
  const size = 10;
  const cls = shape === 'rounded' ? 'rounded-sm' : 'rounded-full';
  return (
    <div className="inline-flex items-center gap-1.5 mr-3 mb-0.5 w-full">
      <span
        className={`inline-block shrink-0 ${cls}`}
        style={{ width: size, height: size, backgroundColor: color }}
      />
      <span className="text-slate-700">{label}</span>
    </div>
  );
}

function LegendRing({ color, label }) {
  return (
    <div className="inline-flex items-center gap-1.5 mr-3 mb-0.5 w-full">
      <span
        className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
        style={{ background: 'transparent', border: `1.5px solid ${color}` }}
      />
      <span className="text-slate-700">{label}</span>
    </div>
  );
}

function EdgeTooltip({ link, pos, data }) {
  const lines = describeLink(link, data);
  if (!lines || lines.length === 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: pos.y - 10,
        left: pos.x + 15,
        background: '#1C2128',
        color: 'white',
        border: '1px solid #30363D',
        borderRadius: 6,
        padding: '8px 12px',
        fontSize: 12,
        pointerEvents: 'none',
        zIndex: 100,
        maxWidth: 220,
        boxShadow: '0 6px 16px rgba(0,0,0,0.5)'
      }}
    >
      {lines.map((l, i) => (
        <div key={i} className={l.tone === 'red' ? 'text-red-300' : l.tone === 'muted' ? 'text-slate-400 text-[11px]' : ''}>
          {l.tone === 'header' ? <span className="font-semibold">{l.text}</span> : l.text}
        </div>
      ))}
    </div>
  );
}

function describeLink(link, data) {
  const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
  const targetId = typeof link.target === 'object' ? link.target.id : link.target;
  const nodeById = (id) => data?.nodes?.find(n => n.id === id);

  if (link.type === 'TRANSACTS_WITH') {
    const out = [];
    out.push({ tone: 'header', text: `${link.txn_count || 0} transactions` });
    out.push({ text: fmtMoney(link.total_amount) });
    if (link.outflow_amount != null || link.inflow_amount != null) {
      const outflowAmt = Number(link.outflow_amount) || 0;
      const inflowAmt  = Number(link.inflow_amount)  || 0;
      if (outflowAmt > 0) out.push({ tone: 'muted', text: `Sends ${fmtMoney(outflowAmt)} (${link.outflow_count || 0} txn)` });
      if (inflowAmt  > 0) out.push({ tone: 'muted', text: `Receives ${fmtMoney(inflowAmt)} (${link.inflow_count || 0} txn)` });
    }
    if (link.alerted_count > 0) {
      out.push({ tone: 'red', text: `${link.alerted_count} alerted` });
    }
    return out;
  }
  if (link.type === 'CO_OCCURS_WITH') {
    return [
      { tone: 'header', text: 'Shared counterparty' },
      { tone: 'muted', text: link.via || '(unspecified)' }
    ];
  }
  if (link.type === 'APPEARS_IN') {
    const alertNode = nodeById(targetId) || nodeById(sourceId);
    return [
      { tone: 'header', text: 'Alert connection' },
      { tone: 'muted', text: alertNode?.label || '' }
    ];
  }
  if (link.type === 'FILED_BY' || link.type === 'SUBJECT_OF') {
    const sarNode = nodeById(targetId) || nodeById(sourceId);
    return [
      { tone: 'header', text: 'SAR connection' },
      { tone: 'muted', text: sarNode?.label || '' }
    ];
  }
  return null;
}
