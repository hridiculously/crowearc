// ═══════════════════════════════════════════════════════════════════════════
// useGraphData — fetches /api/customers/:id/graph and owns the navigation
// history that lets the analyst drill from one customer into another
// without leaving the modal.
//
// Inputs:   customerId (prop from the modal)
// Returns:  { data, error, currentCustomerId, navHistory, recenterOn,
//             navigateBack }
//
// The fetch is keyed off currentCustomerId, not the prop directly, so the
// analyst can pivot inside the modal. Changing the prop resets the nav
// history and the focus.
// ═══════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from 'react';
import api from '../../../api/client.js';

// Build the query string for /api/customers/:id/graph from the optional
// fetch params (time window + account-node toggle). Returns an empty
// string when none are set so the unwindowed call goes to the bare
// endpoint.
function buildGraphQuery({ from, to, includeAccounts } = {}) {
  const parts = [];
  if (from) parts.push(`from=${encodeURIComponent(from)}`);
  if (to)   parts.push(`to=${encodeURIComponent(to)}`);
  if (includeAccounts) parts.push('includeAccounts=true');
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export function useGraphData(customerId, fetchParams = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [currentCustomerId, setCurrentCustomerId] = useState(customerId);
  const [navHistory, setNavHistory] = useState([]);

  // Prop change → reset.
  useEffect(() => {
    setCurrentCustomerId(customerId);
    setNavHistory([]);
  }, [customerId]);

  // Fetch keyed off currentCustomerId + the fetch params. Includes a
  // stable string key for the params so the effect re-fires when any
  // dimension changes (account toggle, time window).
  const paramsKey = JSON.stringify({
    from: fetchParams.from || null,
    to: fetchParams.to || null,
    includeAccounts: !!fetchParams.includeAccounts
  });
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    const qs = buildGraphQuery(fetchParams);
    api.get(`/customers/${currentCustomerId}/graph${qs}`)
      .then(r => { if (!cancelled) setData(r.data); })
      .catch(err => {
        if (!cancelled) setError(err.response?.data?.error || err.message || 'Failed to load graph');
      });
    return () => { cancelled = true; };
    // paramsKey covers the fetchParams object identity safely.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentCustomerId, paramsKey]);

  // Push the current focus, swap to the new one.
  const recenterOn = (newCustomerId) => {
    if (!newCustomerId || newCustomerId === currentCustomerId) return;
    setNavHistory(prev => [...prev, currentCustomerId]);
    setCurrentCustomerId(newCustomerId);
  };

  const navigateBack = () => {
    setNavHistory(prev => {
      if (prev.length === 0) return prev;
      const next = prev.slice(0, -1);
      setCurrentCustomerId(prev[prev.length - 1]);
      return next;
    });
  };

  return { data, error, currentCustomerId, navHistory, recenterOn, navigateBack };
}
