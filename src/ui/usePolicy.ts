/**
 * The learner's privacy choice for marking, kept on this device (it is about this device's
 * model, and whether answers written here may leave it).
 */
import { useCallback, useState } from 'react';
import type { Policy } from '../core/audit';

const KEY = 'recall.policy';

function read(): Policy {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'private' || v === 'accurate' ? v : 'balanced';
  } catch {
    return 'balanced';
  }
}

export function usePolicy(): [Policy, (p: Policy) => void] {
  const [policy, setPolicy] = useState<Policy>(read);
  const set = useCallback((p: Policy) => {
    setPolicy(p);
    try {
      localStorage.setItem(KEY, p);
    } catch {
      // Storage blocked: the choice lasts for this visit.
    }
  }, []);
  return [policy, set];
}
