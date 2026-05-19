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

export function useGraphData(customerId) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [currentCustomerId, setCurrentCustomerId] = useState(customerId);
  const [navHistory, setNavHistory] = useState([]);

  // Prop change → reset.
  useEffect(() => {
    setCurrentCustomerId(customerId);
    setNavHistory([]);
  }, [customerId]);

  // Fetch keyed off currentCustomerId so the in-modal pivot triggers a
  // fresh fetch.
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api.get(`/customers/${currentCustomerId}/graph`)
      .then(r => { if (!cancelled) setData(r.data); })
      .catch(err => {
        if (!cancelled) setError(err.response?.data?.error || err.message || 'Failed to load graph');
      });
    return () => { cancelled = true; };
  }, [currentCustomerId]);

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
