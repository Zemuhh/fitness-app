import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '@/config/api';
import { AppUser } from '@/types/fitness';

interface AuthDemoContextValue {
  users: AppUser[];
  selectedUser: AppUser | null;
  selectUser: (user: AppUser) => void;
  loadingUsers: boolean;
  connectionError: string | null;
  reloadUsers: () => Promise<void>;
  refreshSignal: number;
  triggerGlobalRefresh: () => void;
}

const AuthDemoContext = createContext<AuthDemoContextValue | undefined>(undefined);

const PRIORITY_ORDER = [
  'Ahmet Yılmaz',
  'Zeynep Kaya',
  'Burak Hoca',
  'Selin Hoca',
];

export function AuthDemoProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState<number>(0);

  const triggerGlobalRefresh = useCallback(() => {
    setRefreshSignal((prev) => prev + 1);
  }, []);

  const reloadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setConnectionError(null);
    try {
      const fetched = await apiRequest<AppUser[]>('/users');
      const sorted = [...fetched].sort((a, b) => {
        const idxA = PRIORITY_ORDER.indexOf(a.full_name);
        const idxB = PRIORITY_ORDER.indexOf(b.full_name);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.id - b.id;
      });
      setUsers(sorted);
      setSelectedUserId((currentId) => {
        if (currentId && sorted.some((u) => u.id === currentId)) {
          return currentId;
        }
        const ahmet = sorted.find((u) => u.full_name === 'Ahmet Yılmaz');
        return ahmet ? ahmet.id : sorted[0]?.id ?? null;
      });
    } catch (err: any) {
      setConnectionError(err?.message || 'Backend API bağlantısı kurulamadı.');
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => {
    reloadUsers();
  }, [reloadUsers]);

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [users, selectedUserId]
  );

  const selectUser = useCallback((user: AppUser) => {
    setSelectedUserId(user.id);
  }, []);

  const value = useMemo(
    () => ({
      users,
      selectedUser,
      selectUser,
      loadingUsers,
      connectionError,
      reloadUsers,
      refreshSignal,
      triggerGlobalRefresh,
    }),
    [users, selectedUser, selectUser, loadingUsers, connectionError, reloadUsers, refreshSignal, triggerGlobalRefresh]
  );

  return <AuthDemoContext.Provider value={value}>{children}</AuthDemoContext.Provider>;
}

export function useAuthDemo(): AuthDemoContextValue {
  const ctx = useContext(AuthDemoContext);
  if (!ctx) {
    throw new Error('useAuthDemo must be used within AuthDemoProvider');
  }
  return ctx;
}
