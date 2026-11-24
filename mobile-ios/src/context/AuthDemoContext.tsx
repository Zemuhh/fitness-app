import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { apiRequest } from '@/config/api';
import { AppUser } from '@/types/fitness';
import {
  ActivePanelMode,
  AdminPanelConfig,
  AuthSessionOut,
  AuthSessionUser,
  GoogleAuthUrlResponse,
} from '@/types/authAdmin';

const SESSION_STORAGE_KEY = 'erya_session_token_v2';
let memoryTokenFallback: string | null = null;

function readStoredToken(): string | null {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      return window.localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return memoryTokenFallback;
    }
  }
  return memoryTokenFallback;
}

function writeStoredToken(token: string | null): void {
  memoryTokenFallback = token;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    try {
      if (token) {
        window.localStorage.setItem(SESSION_STORAGE_KEY, token);
      } else {
        window.localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch {
      // ignore storage quota / private mode errors
    }
  }
}

function mapSessionToAuthUser(session: AuthSessionOut): AuthSessionUser {
  const isAdmin = Boolean(session.is_admin || session.role === 'admin');
  return {
    id: isAdmin ? null : session.user_id ?? session.id ?? null,
    user_id: isAdmin ? null : session.user_id ?? session.id ?? null,
    admin_id: session.admin_id ?? null,
    full_name: session.full_name || (isAdmin ? 'Sistem Yöneticisi' : 'Kullanıcı'),
    role: isAdmin ? 'admin' : session.role,
    email: session.email ?? null,
    username: session.username ?? null,
    phone: isAdmin ? '' : session.phone || '',
    access_code: isAdmin ? null : session.access_code ?? null,
    avatar_url: isAdmin ? null : session.avatar_url ?? null,
    specialty: isAdmin ? null : session.specialty ?? null,
    notes: isAdmin ? null : session.notes ?? null,
    instagram_handle: isAdmin ? null : session.instagram_handle ?? null,
    has_personal_profile: isAdmin ? false : Boolean(session.has_personal_profile ?? true),
    is_admin: isAdmin,
    available_panels:
      Array.isArray(session.available_panels) && session.available_panels.length > 0
        ? session.available_panels
        : isAdmin
        ? ['admin', 'trainer', 'member']
        : [session.role === 'trainer' ? 'trainer' : 'member'],
    default_panel: isAdmin
      ? 'admin'
      : session.default_panel || (session.role === 'trainer' ? 'trainer' : 'member'),
    policy_accepted: isAdmin ? true : Boolean(session.policy_accepted),
    policy_accepted_at: isAdmin ? null : session.policy_accepted_at ?? null,
    policy_version: session.policy_version,
  };
}

function mapSessionToAppUser(session: AuthSessionOut): AppUser | null {
  if (session.is_admin || session.role === 'admin') {
    return null;
  }
  const uid = session.user_id ?? session.id;
  if (!uid) {
    return null;
  }
  return {
    id: uid,
    full_name: session.full_name,
    phone: session.phone || '',
    role: session.role === 'trainer' ? 'trainer' : 'member',
    instagram_handle: session.instagram_handle ?? null,
    notes: session.notes ?? '',
    avatar_url: session.avatar_url ?? null,
    specialty: session.specialty ?? null,
  };
}

function extractUrlParam(rawUrl: string, key: string): string | null {
  try {
    const parsed = new URL(rawUrl);
    const fromSearch = parsed.searchParams.get(key);
    if (fromSearch) return fromSearch;
    if (parsed.hash && parsed.hash.length > 1) {
      const hashParams = new URLSearchParams(parsed.hash.replace(/^#/, ''));
      return hashParams.get(key);
    }
  } catch {
    const regex = new RegExp(`[?&#]${key}=([^&#]+)`);
    const match = rawUrl.match(regex);
    if (match?.[1]) {
      return decodeURIComponent(match[1]);
    }
  }
  return null;
}

export interface AuthDemoContextValue {
  users: AppUser[];
  selectedUser: AppUser | null;
  selectUser: (user: AppUser) => void;
  loadingUsers: boolean;
  connectionError: string | null;
  reloadUsers: () => Promise<void>;
  refreshSignal: number;
  triggerGlobalRefresh: () => void;

  // Yeni Zorunlu Giriş, Google OAuth & Admin Panel Yönetimi Alanları
  isAuthenticated: boolean;
  restoringSession: boolean;
  authToken: string | null;
  authUser: AuthSessionUser | null;
  isAdmin: boolean;
  activePanel: ActivePanelMode;
  panelConfig: AdminPanelConfig | null;
  reloadPanelConfig: () => Promise<void>;
  switchPanel: (panel: ActivePanelMode, targetUser?: AppUser) => void;
  returnToAdminPanel: () => void;
  loginWithAccessCode: (accessCode: string) => Promise<void>;
  markPolicyAccepted: (acceptedAt?: string) => void;
  loginWithPassword: (identifier: string, password: string) => Promise<AuthSessionOut>;
  loginWithGoogle: () => Promise<void>;
  completeTokenLogin: (token: string) => Promise<AuthSessionOut>;
  completeCodeLogin: (code: string) => Promise<AuthSessionOut>;
  logout: () => Promise<void>;
  deleteMyAccount: () => Promise<void>;
  authRequest: <T>(endpoint: string, options?: RequestInit) => Promise<T>;
}

const AuthDemoContext = createContext<AuthDemoContextValue | undefined>(undefined);

export function AuthDemoProvider({ children }: { children: React.ReactNode }) {
  const [allDirectoryUsers, setAllDirectoryUsers] = useState<AppUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [refreshSignal, setRefreshSignal] = useState<number>(0);

  const [authToken, setAuthToken] = useState<string | null>(null);
  const [authUser, setAuthUser] = useState<AuthSessionUser | null>(null);
  const [restoringSession, setRestoringSession] = useState<boolean>(true);
  const [activePanel, setActivePanel] = useState<ActivePanelMode>('member');
  const [panelConfig, setPanelConfig] = useState<AdminPanelConfig | null>(null);

  const authTokenRef = useRef<string | null>(null);
  authTokenRef.current = authToken;

  const triggerGlobalRefresh = useCallback(() => {
    setRefreshSignal((prev) => prev + 1);
  }, []);

  const authRequest = useCallback(
    async <T,>(endpoint: string, options: RequestInit = {}): Promise<T> => {
      const token = authTokenRef.current;
      const headers: Record<string, string> = {
        ...(options.headers as Record<string, string> | undefined),
      };
      if (token && !headers.Authorization) {
        headers.Authorization = `Bearer ${token}`;
      }
      return apiRequest<T>(endpoint, {
        ...options,
        headers,
      });
    },
    []
  );

  const reloadPanelConfig = useCallback(async () => {
    try {
      const cfg = await apiRequest<AdminPanelConfig>('/auth/panel-config');
      setPanelConfig(cfg);
    } catch {
      // Sunucu henüz açılmadıysa sessizce geç
    }
  }, []);

  const fetchUsersDirectory = useCallback(async (): Promise<AppUser[]> => {
    setLoadingUsers(true);
    setConnectionError(null);
    try {
      const fetched = await apiRequest<AppUser[]>('/users');
      const cleaned = (Array.isArray(fetched) ? fetched : []).filter(
        (u) => (u.role as string) === 'member' || (u.role as string) === 'trainer'
      );
      setAllDirectoryUsers(cleaned);
      return cleaned;
    } catch (err: any) {
      setConnectionError(
        err?.message ||
          'Sunucuya bağlanılamadı. Lütfen internet bağlantınızı kontrol edip tekrar deneyin.'
      );
      return [];
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const reloadUsers = useCallback(async () => {
    await fetchUsersDirectory();
  }, [fetchUsersDirectory]);

  const applyAuthenticatedSession = useCallback(
    async (session: AuthSessionOut, overrideToken?: string): Promise<AuthSessionOut> => {
      const resolvedToken = overrideToken || session.token;
      if (!resolvedToken) {
        throw new Error('Oturum anahtarı alınamadı.');
      }

      writeStoredToken(resolvedToken);
      authTokenRef.current = resolvedToken;
      setAuthToken(resolvedToken);

      const mappedAuthUser = mapSessionToAuthUser(session);
      setAuthUser(mappedAuthUser);
      setConnectionError(null);

      const directory = await fetchUsersDirectory();

      if (mappedAuthUser.is_admin) {
        // Admin hesabı kişisel üye/sporcu bilgisi taşımaz; doğrudan Yönetim Merkezi'nde açılır
        setActivePanel('admin');
        setSelectedUserId(null);
      } else {
        const ownAppUser = mapSessionToAppUser(session);
        const targetRole: ActivePanelMode =
          mappedAuthUser.role === 'trainer' ? 'trainer' : 'member';
        setActivePanel(targetRole);

        if (ownAppUser) {
          setAllDirectoryUsers((prev) =>
            prev.some((u) => u.id === ownAppUser.id) ? prev : [ownAppUser, ...prev]
          );
          setSelectedUserId(ownAppUser.id);
        } else if (mappedAuthUser.id && directory.some((u) => u.id === mappedAuthUser.id)) {
          setSelectedUserId(mappedAuthUser.id);
        }
      }

      reloadPanelConfig();
      return { ...session, token: resolvedToken };
    },
    [fetchUsersDirectory, reloadPanelConfig]
  );

  const completeTokenLogin = useCallback(
    async (token: string): Promise<AuthSessionOut> => {
      const me = await apiRequest<AuthSessionOut>('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return applyAuthenticatedSession(me, token);
    },
    [applyAuthenticatedSession]
  );

  const completeCodeLogin = useCallback(
    async (code: string): Promise<AuthSessionOut> => {
      const session = await apiRequest<AuthSessionOut>('/auth/google', {
        method: 'POST',
        body: JSON.stringify({ code }),
      });
      return applyAuthenticatedSession(session);
    },
    [applyAuthenticatedSession]
  );

  const loginWithAccessCode = useCallback(
    async (accessCode: string): Promise<void> => {
      const normalizedCode = accessCode.trim().toUpperCase();
      if (!normalizedCode) {
        throw new Error('Lütfen erişim kodunuzu girin.');
      }
      const session = await apiRequest<AuthSessionOut>('/auth/code-login', {
        method: 'POST',
        body: JSON.stringify({ access_code: normalizedCode }),
      });
      await applyAuthenticatedSession(session);
    },
    [applyAuthenticatedSession]
  );

  const markPolicyAccepted = useCallback((acceptedAt?: string): void => {
    setAuthUser((prev) =>
      prev
        ? {
            ...prev,
            policy_accepted: true,
            policy_accepted_at: acceptedAt ?? new Date().toISOString(),
          }
        : prev
    );
  }, []);

  const loginWithPassword = useCallback(
    async (identifier: string, password: string): Promise<AuthSessionOut> => {
      const trimmedId = identifier.trim();
      const session = await apiRequest<AuthSessionOut>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          identifier: trimmedId,
          username: trimmedId,
          email: trimmedId.includes('@') ? trimmedId : undefined,
          password,
        }),
      });
      return applyAuthenticatedSession(session);
    },
    [applyAuthenticatedSession]
  );

  const loginWithGoogle = useCallback(async (): Promise<void> => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const cleanOriginUrl = `${window.location.origin}${window.location.pathname}`;
      const urlData = await apiRequest<GoogleAuthUrlResponse>(
        `/auth/google/url?redirect_uri=${encodeURIComponent(cleanOriginUrl)}`
      );

      const width = 500;
      const height = 660;
      const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - width) / 2));
      const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - height) / 2));

      const popup = window.open(
        urlData.auth_url,
        'EryaGoogleAuthPopup',
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        // Popup engellendiyse tam sayfa yönlendirme yap
        window.location.href = urlData.auth_url;
      }
      return;
    }

    // iOS / Android Mobil OAuth Tarayıcı Oturumu
    const redirectUri = Linking.createURL('google-auth');
    const urlData = await apiRequest<GoogleAuthUrlResponse>(
      `/auth/google/url?redirect_uri=${encodeURIComponent(redirectUri)}`
    );

    const authResult = await WebBrowser.openAuthSessionAsync(urlData.auth_url, redirectUri);
    if (authResult.type === 'success' && authResult.url) {
      const returnedToken = extractUrlParam(authResult.url, 'token');
      const returnedCode = extractUrlParam(authResult.url, 'code');
      if (returnedToken) {
        await completeTokenLogin(returnedToken);
      } else if (returnedCode) {
        await completeCodeLogin(returnedCode);
      }
    }
  }, [completeCodeLogin, completeTokenLogin]);

  const logout = useCallback(async (): Promise<void> => {
    const currentToken = authTokenRef.current;
    writeStoredToken(null);
    authTokenRef.current = null;
    setAuthToken(null);
    setAuthUser(null);
    setSelectedUserId(null);
    setAllDirectoryUsers([]);
    setActivePanel('member');
    setConnectionError(null);

    if (currentToken) {
      try {
        await apiRequest('/auth/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${currentToken}` },
        });
      } catch {
        // Çıkış her koşulda yerel oturumu temizler
      }
    }
  }, []);

  const deleteMyAccount = useCallback(async (): Promise<void> => {
    const currentToken = authTokenRef.current;
    if (!currentToken) {
      throw new Error('Aktif oturum bulunamadı. Lütfen tekrar giriş yapın.');
    }

    await apiRequest<{ deleted?: boolean; message?: string }>('/auth/me', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${currentToken}` },
    });

    writeStoredToken(null);
    authTokenRef.current = null;
    setAuthToken(null);
    setAuthUser(null);
    setSelectedUserId(null);
    setAllDirectoryUsers([]);
    setActivePanel('member');
    setConnectionError(null);
  }, []);

  // Web popup postMessage dinleyicisi (Google OAuth penceresinden anlık dönüş)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return;
    }
    const handleMessage = (event: MessageEvent) => {
      const payload = event?.data;
      if (!payload || typeof payload !== 'object') return;
      if (payload.type === 'ERYA_GOOGLE_AUTH') {
        if (typeof payload.token === 'string' && payload.token.length > 0) {
          completeTokenLogin(payload.token).catch(() => {});
        } else if (typeof payload.code === 'string' && payload.code.length > 0) {
          completeCodeLogin(payload.code).catch(() => {});
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [completeCodeLogin, completeTokenLogin]);

  // İlk açılışta: yalnızca daha önce açıkça giriş yapılmışsa veya Google callback dönmüşse oturumu yükle
  useEffect(() => {
    let active = true;

    const bootstrapAuth = async () => {
      setRestoringSession(true);
      reloadPanelConfig();

      try {
        // 1. Web Google OAuth yönlendirme parametrelerini kontrol et (?token=... veya ?code=...)
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const urlToken = extractUrlParam(window.location.href, 'token');
          const urlCode = extractUrlParam(window.location.href, 'code');

          if (urlToken || urlCode) {
            try {
              const cleanUrl = `${window.location.origin}${window.location.pathname}`;
              window.history.replaceState({}, document.title, cleanUrl);
            } catch {
              // ignore history replace errors
            }

            if (urlToken) {
              await completeTokenLogin(urlToken);
              return;
            }
            if (urlCode) {
              await completeCodeLogin(urlCode);
              return;
            }
          }
        }

        // 2. Önceden kaydedilmiş oturum anahtarı varsa /auth/me ile doğrula
        const savedToken = readStoredToken();
        if (!savedToken) {
          return;
        }

        await completeTokenLogin(savedToken);
      } catch {
        // Geçersiz veya süresi dolmuş token: temizle ve Giriş Ekranında kal
        writeStoredToken(null);
        if (active) {
          authTokenRef.current = null;
          setAuthToken(null);
          setAuthUser(null);
          setSelectedUserId(null);
        }
      } finally {
        if (active) {
          setRestoringSession(false);
        }
      }
    };

    bootstrapAuth();

    return () => {
      active = false;
    };
  }, [completeCodeLogin, completeTokenLogin, reloadPanelConfig]);

  const isAdmin = Boolean(authUser?.is_admin || authUser?.role === 'admin');
  const isAuthenticated = Boolean(authToken && authUser);

  const users = useMemo(() => {
    if (!isAuthenticated || !authUser) {
      return [];
    }
    if (isAdmin) {
      return allDirectoryUsers;
    }
    const own = allDirectoryUsers.find((u) => u.id === authUser.id);
    return own ? [own] : [];
  }, [allDirectoryUsers, authUser, isAdmin, isAuthenticated]);

  const selectedUser = useMemo<AppUser | null>(() => {
    if (!isAuthenticated || !authUser) {
      return null;
    }
    if (isAdmin) {
      if (activePanel === 'admin') {
        return null;
      }
      const explicit = allDirectoryUsers.find((u) => u.id === selectedUserId);
      if (explicit && explicit.role === activePanel) {
        return explicit;
      }
      return allDirectoryUsers.find((u) => u.role === activePanel) ?? null;
    }

    const fallbackRole: AppUser['role'] =
      authUser.role === 'trainer' ? 'trainer' : 'member';

    return (
      allDirectoryUsers.find((u) => u.id === (selectedUserId ?? authUser.id)) ??
      (authUser.id
        ? {
            id: authUser.id,
            full_name: authUser.full_name,
            phone: authUser.phone || '',
            role: fallbackRole,
            instagram_handle: authUser.instagram_handle ?? null,
            notes: authUser.notes ?? '',
            avatar_url: authUser.avatar_url ?? null,
            specialty: authUser.specialty ?? null,
          }
        : null)
    );
  }, [activePanel, allDirectoryUsers, authUser, isAdmin, isAuthenticated, selectedUserId]);

  const selectUser = useCallback(
    (user: AppUser) => {
      setAllDirectoryUsers((prev) =>
        prev.some((u) => u.id === user.id) ? prev : [...prev, user]
      );
      setSelectedUserId(user.id);
      if (isAdmin) {
        setActivePanel(user.role === 'trainer' ? 'trainer' : 'member');
      }
    },
    [isAdmin]
  );

  const switchPanel = useCallback(
    (panel: ActivePanelMode, targetUser?: AppUser) => {
      if (!isAdmin) {
        return;
      }
      if (panel === 'admin') {
        setActivePanel('admin');
        return;
      }

      if (targetUser) {
        setAllDirectoryUsers((prev) =>
          prev.some((u) => u.id === targetUser.id) ? prev : [...prev, targetUser]
        );
        setSelectedUserId(targetUser.id);
      } else {
        const candidate = allDirectoryUsers.find((u) => u.role === panel);
        if (candidate) {
          setSelectedUserId(candidate.id);
        }
      }
      setActivePanel(panel);
    },
    [allDirectoryUsers, isAdmin]
  );

  const returnToAdminPanel = useCallback(() => {
    if (isAdmin) {
      setActivePanel('admin');
    }
  }, [isAdmin]);

  const value = useMemo<AuthDemoContextValue>(
    () => ({
      users,
      selectedUser,
      selectUser,
      loadingUsers,
      connectionError,
      reloadUsers,
      refreshSignal,
      triggerGlobalRefresh,
      isAuthenticated,
      restoringSession,
      authToken,
      authUser,
      isAdmin,
      activePanel,
      panelConfig,
      reloadPanelConfig,
      switchPanel,
      returnToAdminPanel,
      loginWithAccessCode,
      markPolicyAccepted,
      loginWithPassword,
      loginWithGoogle,
      completeTokenLogin,
      completeCodeLogin,
      logout,
      deleteMyAccount,
      authRequest,
    }),
    [
      users,
      selectedUser,
      selectUser,
      loadingUsers,
      connectionError,
      reloadUsers,
      refreshSignal,
      triggerGlobalRefresh,
      isAuthenticated,
      restoringSession,
      authToken,
      authUser,
      isAdmin,
      activePanel,
      panelConfig,
      reloadPanelConfig,
      switchPanel,
      returnToAdminPanel,
      loginWithAccessCode,
      markPolicyAccepted,
      loginWithPassword,
      loginWithGoogle,
      completeTokenLogin,
      completeCodeLogin,
      logout,
      deleteMyAccount,
      authRequest,
    ]
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
