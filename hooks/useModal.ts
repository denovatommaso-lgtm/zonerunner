import { useState, useCallback } from 'react';

export function useModal<T = undefined>() {
  const [visible, setVisible] = useState(false);
  const [data, setData] = useState<T | undefined>(undefined);

  const open = useCallback((payload?: T) => {
    setData(payload);
    setVisible(true);
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    setData(undefined);
  }, []);

  return { visible, data, open, close, setVisible, setData };
}

export type UseModalReturn<T = undefined> = ReturnType<typeof useModal<T>>;
