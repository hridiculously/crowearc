// ═══════════════════════════════════════════════════════════════════════════
// useCompareGraphData — second graph fetch for the Part 11 diff overlay.
//
// Lives alongside the primary useGraphData call. When `compareWindow` is
// null this hook returns `null` data and never hits the network. When the
// analyst sets a compare window via the Time Window popover, this hook
// re-fetches the same customer's graph clipped to that window so the
// diff helper can union the two datasets.
//
// Inputs:
//   customerId      — the focus customer (shared with the primary hook)
//   compareWindow   — { from, to } | null
//   includeAccounts — boolean; mirrors the primary hook so the compare
//                     payload has the same node taxonomy
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import api from '../../../api/client.js';

function buildQuery({ from, to, includeAccounts }) {
  const parts = [];
  if (from) parts.push(`from=${encodeURIComponent(from)}`);
  if (to)   parts.push(`to=${encodeURIComponent(to)}`);
  if (includeAccounts) parts.push('includeAccounts=true');
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export function useCompareGraphData(customerId, compareWindow, includeAccounts = false) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Stable key so we don't re-fire on object identity changes.
  const key = JSON.stringify({
    from: compareWindow?.from || null,
    to: compareWindow?.to || null,
    includeAccounts: !!includeAccounts
  });

  useEffect(() => {
    if (!customerId || !compareWindow || (!compareWindow.from && !compareWindow.to)) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    const qs = buildQuery({ ...compareWindow, includeAccounts });
    api.get(`/customers/${customerId}/graph${qs}`)
      .then(r => { if (!cancelled) setData(r.data); })
      .catch(err => {
        if (!cancelled) setError(err.response?.data?.error || err.message || 'Compare fetch failed');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // key covers the inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, key]);

  return { compareData: data, compareError: error, compareLoading: loading };
}
