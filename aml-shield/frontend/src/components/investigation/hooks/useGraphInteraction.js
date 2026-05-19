// ═══════════════════════════════════════════════════════════════════════════
// useGraphInteraction — owns the selection, hover, cursor, and right-click
// context-menu state for the graph modal.
//
// Returns:
//   selected / setSelected           — single-node selection (drives the
//                                       right-panel detail view).
//   hoveredNode / setHoveredNode     — for the cursor-following tooltip.
//   hoveredLink / setHoveredLink     — for the edge tooltip.
//   cursorPos / setCursorPos         — pointer x,y inside the canvas pane.
//   contextMenu / setContextMenu     — right-click menu state, including
//                                       page-absolute coordinates.
//   onNodeContext(node, event)       — right-click handler (writes menu state).
//
// The outside-click + Escape effect that auto-dismisses the context menu
// lives inside this hook so the parent doesn't have to wire it up.
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';

const PATH_CAP = 20;

export function useGraphInteraction() {
  const [selected, setSelected] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState(null);
  // Part 13 — Investigation path: chronological breadcrumb of visited
  // nodes so the analyst can retrace their click trail.
  const [pathHistory, setPathHistory] = useState([]);

  const pushToPath = useCallback((node) => {
    if (!node || !node.id) return;
    setPathHistory(prev => {
      // Drop a consecutive duplicate (re-clicking the same node shouldn't
      // create a stutter in the trail). Otherwise append and cap.
      if (prev.length > 0 && prev[prev.length - 1].id === node.id) return prev;
      const entry = {
        id: node.id,
        type: node.type,
        label: node.label || node.customer_name || node.alert_id || node.sar_id || node.id,
        is_counterparty: !!node.is_counterparty,
        ts: Date.now()
      };
      const next = [...prev, entry];
      return next.length > PATH_CAP ? next.slice(next.length - PATH_CAP) : next;
    });
  }, []);

  const clearPath = useCallback(() => setPathHistory([]), []);

  // Right-click on any node opens the filter context menu (Keep Only /
  // Exclude / Reset / Re-center / Open Profile). The native event is
  // forwarded by react-force-graph-2d as the 2nd arg — we use page
  // coordinates so the menu lands at the cursor regardless of the
  // modal's scroll position.
  const onNodeContext = (node, event) => {
    if (!node) return;
    const x = event?.pageX ?? event?.clientX ?? 0;
    const y = event?.pageY ?? event?.clientY ?? 0;
    setContextMenu({ x, y, node });
  };

  // Auto-dismiss the context menu on outside click / Escape.
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    const t = setTimeout(() => {
      window.addEventListener('click', close);
      window.addEventListener('keydown', onKey);
    }, 0);
    return () => {
      clearTimeout(t);
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  return {
    selected, setSelected,
    hoveredNode, setHoveredNode,
    hoveredLink, setHoveredLink,
    cursorPos, setCursorPos,
    contextMenu, setContextMenu,
    onNodeContext,
    // Investigation path (Part 13)
    pathHistory, pushToPath, clearPath
  };
}
