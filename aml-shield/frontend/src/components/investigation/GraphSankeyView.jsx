// ═══════════════════════════════════════════════════════════════════════════
// GraphSankeyView — money-flow diagram alternative to the force graph.
// Mounted when the toolbar's Flow View toggle is on (viewMode==='sankey').
//
// Layout: three implicit columns enforced by the synthetic-node trick
// so the Sankey stays a DAG (d3-sankey can't render cycles):
//
//   left col       middle col     right col
//   ─────────       ──────────     ─────────
//   inflow CPs  →  FOCUS CUSTOMER →  outflow CPs
//
// A counterparty that has both inflow and outflow gets two synthetic
// nodes (one in each side column) — its money in lands on the left,
// its money out leaves from the right. This is the standard way to
// surface "U-turn" / round-trip patterns in flow visualisations.
//
// Pure presentation: receives `displayData` (the filtered set the rest
// of the canvas operates on) plus `size` {w,h}. Empty / "no money
// flow" states render a centred hint.
// ═══════════════════════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { sankey as d3Sankey, sankeyLinkHorizontal, sankeyLeft } from 'd3-sankey';
import { fmtMoney } from './graphHelpers.js';

function buildSankeyDataset(displayData) {
  if (!displayData?.nodes) return { nodes: [], links: [] };
  const focus = displayData.nodes.find(n => n.is_focus);
  if (!focus) return { nodes: [], links: [] };

  // Map: synthetic node id → real node ref. Synthetic ids carry an
  // :in / :out suffix so the same counterparty can appear in both
  // columns without colliding.
  const sankeyNodes = new Map();
  const focusKey = `${focus.id}:focus`;
  sankeyNodes.set(focusKey, { name: focus.label || focus.id, real: focus, side: 'focus' });

  const sankeyLinks = [];

  for (const l of displayData.links || []) {
    if (l.type !== 'TRANSACTS_WITH') continue;
    const s = typeof l.source === 'object' ? l.source.id : l.source;
    const t = typeof l.target === 'object' ? l.target.id : l.target;
    const otherId = s === focus.id ? t : (t === focus.id ? s : null);
    if (!otherId) continue;
    const other = displayData.nodes.find(n => n.id === otherId);
    if (!other) continue;

    const inflow  = Number(l.inflow_amount)  || 0;
    const outflow = Number(l.outflow_amount) || 0;
    const total   = Number(l.total_amount)   || 0;

    // Decide how to split the edge into inflow / outflow legs.
    // When the backend split is available, use it. Otherwise fall back
    // to direction + total.
    let inAmt = 0, outAmt = 0;
    if (inflow > 0 || outflow > 0) {
      inAmt = inflow; outAmt = outflow;
    } else if (l.direction === 'inflow') {
      inAmt = total;
    } else if (l.direction === 'outflow') {
      outAmt = total;
    } else if (l.direction === 'bidirectional') {
      // No per-side split — assume even halves.
      inAmt = total / 2;
      outAmt = total / 2;
    } else {
      // Unknown direction — treat as outflow (most common default).
      outAmt = total;
    }

    if (inAmt > 0) {
      const inKey = `${other.id}:in`;
      if (!sankeyNodes.has(inKey)) {
        sankeyNodes.set(inKey, { name: other.label || other.id, real: other, side: 'in' });
      }
      sankeyLinks.push({ source: inKey, target: focusKey, value: inAmt, alerted: !!l.alerted });
    }
    if (outAmt > 0) {
      const outKey = `${other.id}:out`;
      if (!sankeyNodes.has(outKey)) {
        sankeyNodes.set(outKey, { name: other.label || other.id, real: other, side: 'out' });
      }
      sankeyLinks.push({ source: focusKey, target: outKey, value: outAmt, alerted: !!l.alerted });
    }
  }

  // Convert the Map to the index-stable array form d3-sankey expects.
  const nodesArr = Array.from(sankeyNodes.entries()).map(([id, v], i) => ({
    index: i, id, name: v.name, real: v.real, side: v.side
  }));
  const idIdx = new Map(nodesArr.map(n => [n.id, n.index]));
  const linksArr = sankeyLinks.map(l => ({
    source: idIdx.get(l.source),
    target: idIdx.get(l.target),
    value: Math.max(l.value, 1),    // d3-sankey errors on zero-value links
    alerted: l.alerted
  })).filter(l => l.source != null && l.target != null);

  return { nodes: nodesArr, links: linksArr };
}

export default function GraphSankeyView({ displayData, size }) {
  const { nodes, links, layout } = useMemo(() => {
    const ds = buildSankeyDataset(displayData);
    if (ds.nodes.length === 0 || ds.links.length === 0) {
      return { nodes: [], links: [], layout: null };
    }
    const w = Math.max(400, size?.w || 800);
    const h = Math.max(300, size?.h || 600);
    const sankeyGen = d3Sankey()
      .nodeAlign(sankeyLeft)
      .nodeWidth(14)
      .nodePadding(12)
      .extent([[24, 24], [w - 200, h - 24]]);   // leave room for right-side labels
    try {
      const layout = sankeyGen({
        nodes: ds.nodes.map(n => ({ ...n })),
        links: ds.links.map(l => ({ ...l }))
      });
      return { nodes: layout.nodes, links: layout.links, layout };
    } catch (_e) {
      return { nodes: [], links: [], layout: null };
    }
  }, [displayData, size?.w, size?.h]);

  if (!layout || nodes.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
        <div className="text-xs text-slate-500 max-w-sm">
          No money-flow data to render. The Sankey view needs at least one
          TRANSACTS_WITH edge with a non-zero amount in the current scope.
        </div>
      </div>
    );
  }

  return (
    <svg
      width={size?.w || 800}
      height={size?.h || 600}
      style={{ display: 'block', background: '#F8FAFC' }}
      aria-label="Money-flow Sankey view"
    >
      {/* Links */}
      {links.map((l, i) => (
        <path
          key={`l-${i}`}
          d={sankeyLinkHorizontal()(l)}
          fill="none"
          stroke={l.alerted ? '#DC2626' : '#94A3B8'}
          strokeOpacity={0.35}
          strokeWidth={Math.max(1, l.width)}
        >
          <title>
            {l.source.name} → {l.target.name}{'\n'}
            {fmtMoney(l.value)}{l.alerted ? ' · alerted' : ''}
          </title>
        </path>
      ))}

      {/* Nodes */}
      {nodes.map(n => {
        const focus = n.side === 'focus';
        const inSide = n.side === 'in';
        const fill = focus
          ? '#0EA5E9'
          : inSide ? '#10B981' : '#F59E0B';
        return (
          <g key={n.id}>
            <rect
              x={n.x0}
              y={n.y0}
              width={Math.max(2, n.x1 - n.x0)}
              height={Math.max(2, n.y1 - n.y0)}
              fill={fill}
              opacity={0.9}
            >
              <title>{n.name}{'\n'}{fmtMoney(n.value)}</title>
            </rect>
            <text
              x={inSide ? n.x0 - 6 : n.x1 + 6}
              y={(n.y0 + n.y1) / 2}
              textAnchor={inSide ? 'end' : 'start'}
              alignmentBaseline="middle"
              fontFamily="Inter, sans-serif"
              fontSize={11}
              fill="#0F172A"
            >
              {truncate(n.name, 28)}
              <tspan dx={4} fill="#64748B">{compact(n.value)}</tspan>
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function truncate(s, n) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

function compact(v) {
  if (v == null) return '';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}
