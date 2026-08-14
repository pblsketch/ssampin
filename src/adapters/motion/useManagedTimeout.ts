import { useCallback, useEffect, useRef } from 'react';

type TimeoutHandle = ReturnType<typeof setTimeout>;

export type CancelManagedTimeout = () => void;

export function useManagedTimeout(): (
  callback: () => void,
  delayMs: number,
) => CancelManagedTimeout {
  const timersRef = useRef(new Set<TimeoutHandle>());

  useEffect(
    () => () => {
      timersRef.current.forEach(clearTimeout);
      timersRef.current.clear();
    },
    [],
  );

  return useCallback((callback: () => void, delayMs: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      callback();
    }, delayMs);
    timersRef.current.add(timer);

    return () => {
      clearTimeout(timer);
      timersRef.current.delete(timer);
    };
  }, []);
}
