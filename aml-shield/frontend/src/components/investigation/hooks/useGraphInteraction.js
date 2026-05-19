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

import { useEffect, useState } from 'react';

export function useGraphInteraction() {
  const [selected, setSelected] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredLink, setHoveredLink] = useState(null);
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
  const [contextMenu, setContextMenu] = useState(null);

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
    onNodeContext
  };
}
