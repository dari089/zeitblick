"use client";
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';

/** Keep the latest input immediately, render at most once per display frame. */
export function useRafState<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const latest = useRef(initial);
  const frame = useRef<number | null>(null);
  const update = useCallback((next: SetStateAction<T>) => {
    latest.current = typeof next === 'function' ? (next as (value: T) => T)(latest.current) : next;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => { frame.current = null; setValue(latest.current); });
  }, []);
  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);
  return [value, update, latest] as const;
}
