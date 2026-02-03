import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Group } from './groupTypes';
import { listGroupsForUser, subscribeGroupsForUser } from './groupService';
import { useGoogleAuth } from './auth';

type Mode = 'personal' | 'group';

type ModeContextValue = {
  mode: Mode;
  setMode: (m: Mode) => void;
  activeGroupId?: string;
  setActiveGroupId: (id?: string) => void;
  groups: Group[];
  refreshGroups: () => Promise<void>;
};

const ModeContext = createContext<ModeContextValue | undefined>(undefined);

export const ModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useGoogleAuth();
  const [mode, setMode] = useState<Mode>('personal');
  const [activeGroupId, setActiveGroupId] = useState<string | undefined>(undefined);
  const [groups, setGroups] = useState<Group[]>([]);
  const subscriptionRef = React.useRef<(() => void) | null>(null);
  const activeGroupRef = React.useRef<string | undefined>(undefined);

  useEffect(() => {
    activeGroupRef.current = activeGroupId;
  }, [activeGroupId]);

  const refreshGroups = React.useCallback(async () => {
    if (!user?.uid) {
      setGroups([]);
      setActiveGroupId(undefined);
      return;
    }
    const list = await listGroupsForUser(user.uid);
    setGroups(list);
    if (list.length && !activeGroupId) {
      setActiveGroupId(list[0].id);
    }
  }, [user?.uid, activeGroupId]);

  useEffect(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current();
      subscriptionRef.current = null;
    }

    if (!user?.uid) {
      setGroups([]);
      setActiveGroupId(undefined);
      return;
    }

    subscriptionRef.current = subscribeGroupsForUser(user.uid, (list) => {
      setGroups(list);
      if (!list.length) {
        setActiveGroupId(undefined);
        setMode('personal');
        return;
      }
      const currentActive = activeGroupRef.current;
      if (currentActive && !list.some((g) => g.id === currentActive)) {
        setActiveGroupId(list[0].id);
      } else if (!currentActive) {
        setActiveGroupId(list[0].id);
      }
    });

    return () => {
      if (subscriptionRef.current) {
        subscriptionRef.current();
        subscriptionRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const value = useMemo(
    () => ({
      mode,
      setMode,
      activeGroupId,
      setActiveGroupId,
      groups,
      refreshGroups,
    }),
    [mode, activeGroupId, groups, refreshGroups]
  );

  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
};

export function useMode() {
  const ctx = useContext(ModeContext);
  if (!ctx) throw new Error('useMode must be used within ModeProvider');
  return ctx;
}
