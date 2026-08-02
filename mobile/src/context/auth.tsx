import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getToken, setToken, clearToken } from '../lib/authToken';
import { setLang, translate, type Lang } from '../lib/i18n';
import { authLogin, authRegister, authMe, authForgotPassword, authResendConfirmationByEmail, joinTeam, createTeam } from '../lib/api';
import { releaseDevicePushToken } from '../lib/push';

export interface AppUser {
  id: number;
  email: string;
  name: string;
  role: 'team_lead' | 'member' | '';
  title?: string;
  telegram?: string;
  linkedin?: string;
  github?: string;
  avatar?: string;
  email_confirmed?: boolean;
  has_password?: boolean;
}

type Role = 'team_lead' | 'member';

// Сессия собственной авторизации — наличие токена и email пользователя.
export interface AuthSession { token: string; email: string }

export const PENDING_ONBOARDING_KEY = 'pendingOnboarding';

interface AuthContextType {
  session: AuthSession | null;
  user: AppUser | null;
  loading: boolean;
  initializing: boolean;
  profileError: string | null;
  activeRole: Role | null;
  hasBothRoles: boolean;
  isAdmin: boolean;
  needsOnboarding: boolean;
  setUser: (user: AppUser | null) => void;
  setActiveRole: (role: Role) => Promise<void>;
  addSecondaryRole: (inviteCode: string) => Promise<void>;
  addTeamLeadRole: (teamName: string) => Promise<void>;
  enterAdmin: () => Promise<void>;
  exitAdmin: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  // Вход по уже выданному сервером JWT (Yandex ID): токен и профиль приходят
  // из /auth/yandex/callback, пароль в этом потоке не участвует.
  signInWithToken: (token: string, u: AppUser) => Promise<void>;
  // Регистрация не входит в кабинет: возвращает email для окна подтверждения.
  signUp: (email: string, password: string) => Promise<{ email: string }>;
  forgotPassword: (email: string) => Promise<void>;
  resendConfirmation: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  retryProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  initializing: true,
  profileError: null,
  activeRole: null,
  hasBothRoles: false,
  isAdmin: false,
  needsOnboarding: false,
  setUser: () => {},
  setActiveRole: async () => {},
  addSecondaryRole: async () => {},
  addTeamLeadRole: async () => {},
  enterAdmin: async () => {},
  exitAdmin: async () => {},
  signIn: async () => {},
  signInWithToken: async () => {},
  signUp: async () => ({ email: '' }),
  forgotPassword: async () => {},
  resendConfirmation: async () => {},
  signOut: async () => {},
  retryProfile: async () => {},
});

const USER_CACHE_KEY = 'cachedUser';
const BOTH_ROLES_KEY = 'hasBothRoles';
const ACTIVE_ROLE_KEY = 'activeRole';
const ADMIN_KEY = 'adminMode';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [user, setUserState] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [initializing, setInitializing] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [activeRole, setActiveRoleState] = useState<Role | null>(null);
  const [hasBothRoles, setHasBothRoles] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ADMIN_KEY).then(v => { if (v === 'true') setIsAdmin(true); }).catch(() => {});
  }, []);

  const enterAdmin = async () => {
    setIsAdmin(true);
    await AsyncStorage.setItem(ADMIN_KEY, 'true');
  };

  const exitAdmin = async () => {
    setIsAdmin(false);
    await AsyncStorage.removeItem(ADMIN_KEY);
  };

  // Keep user cache in sync (fire-and-forget)
  const setUser = (u: AppUser | null) => {
    setUserState(u);
    if (u) AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(u)).catch(() => {});
  };

  // Разложить загруженного пользователя по состоянию (роль/кэш).
  const applyUser = async (data: AppUser) => {
    // Язык интерфейса — из профиля: выбор, сделанный на любом клиенте (веб,
    // приложение, Mini App, бот), применяется здесь и считается явным, поэтому
    // автоопределение по локали устройства его больше не перекрывает.
    const pl = (data as any)?.preferred_language;
    if (pl === 'ru' || pl === 'en' || pl === 'kz') setLang(pl as Lang);
    const [savedActiveRole, hasBoth] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_ROLE_KEY),
      AsyncStorage.getItem(BOTH_ROLES_KEY),
    ]);
    setHasBothRoles(hasBoth === 'true');
    setUserState(data);
    setProfileError(null);
    setNeedsOnboarding(false);
    AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(data)).catch(() => {});
    if (data.role) {
      if (savedActiveRole) setActiveRoleState(savedActiveRole as Role);
      else if (hasBoth !== 'true') setActiveRoleState(data.role as Role);
    }
  };

  // Загрузка профиля по токену (/auth/me). 401 -> сессия сброшена.
  const loadProfile = async (): Promise<'ok' | 'unauth' | 'error'> => {
    try {
      const data = (await authMe()) as AppUser;
      await applyUser(data);
      return 'ok';
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        await clearToken();
        setSession(null);
        setUserState(null);
        return 'unauth';
      }
      const cached = await AsyncStorage.getItem(USER_CACHE_KEY);
      if (cached) {
        try { setUserState(JSON.parse(cached)); } catch {}
      } else {
        setProfileError(err?.response?.detail ?? err?.message ?? translate('errors.network'));
      }
      return 'error';
    }
  };

  // Восстановление сессии при запуске: есть токен -> грузим профиль.
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (token) {
        // Показать кэш сразу (быстрый старт), затем обновить с сервера.
        const cached = await AsyncStorage.getItem(USER_CACHE_KEY);
        if (cached) {
          try { const u = JSON.parse(cached); setSession({ token, email: u.email }); setUserState(u); } catch { setSession({ token, email: '' }); }
        } else {
          setSession({ token, email: '' });
        }
        await loadProfile();
      }
      setLoading(false);
      setInitializing(false);
    })();
  }, []);

  const signIn = async (email: string, password: string) => {
    setProfileError(null);
    const { token, user: u } = await authLogin({ email: email.trim(), password });
    await setToken(token);
    setSession({ token, email: u.email });
    await applyUser(u);
  };

  // Вход через Yandex ID: сервер уже проверил code/state и выдал наш JWT
  // (та же выдача токена, что у email- и Telegram-входа) — сохраняем сессию.
  const signInWithToken = async (token: string, u: AppUser) => {
    setProfileError(null);
    await setToken(token);
    setSession({ token, email: u?.email ?? '' });
    await applyUser(u);
  };

  const signUp = async (email: string, password: string) => {
    setProfileError(null);
    const clean = email.trim();
    // Регистрация НЕ входит в кабинет: токен не выдаётся, доступ закрыт до
    // подтверждения почты (общий бэкенд). Экран входа покажет окно
    // подтверждения; войти можно только после перехода по ссылке из письма.
    await authRegister({ name: clean.split('@')[0], email: clean, password });
    return { email: clean };
  };

  const forgotPassword = async (email: string) => {
    await authForgotPassword(email.trim());
  };

  const resendConfirmation = async (email: string) => {
    await authResendConfirmationByEmail(email.trim());
  };

  const setActiveRole = async (role: Role) => {
    setActiveRoleState(role);
    await AsyncStorage.setItem(ACTIVE_ROLE_KEY, role);
  };

  const addSecondaryRole = async (inviteCode: string) => {
    if (!user) throw new Error('No user');
    await joinTeam({ invite_code: inviteCode.trim(), user_id: user.id });
    setHasBothRoles(true);
    await AsyncStorage.setItem(BOTH_ROLES_KEY, 'true');
    const newRole: Role = user.role === 'team_lead' ? 'member' : 'team_lead';
    await setActiveRole(newRole);
  };

  const addTeamLeadRole = async (teamName: string) => {
    if (!user) throw new Error('No user');
    await createTeam({ name: teamName.trim(), team_lead_id: user.id });
    setHasBothRoles(true);
    await AsyncStorage.setItem(BOTH_ROLES_KEY, 'true');
    await setActiveRole('team_lead');
  };

  const retryProfile = async () => {
    if (!session) return;
    setLoading(true);
    setProfileError(null);
    try { await loadProfile(); } catch {}
    setLoading(false);
  };

  const signOut = async () => {
    // Порядок важен: запросу на отвязку нужен ещё живой токен авторизации,
    // поэтому снимаем привязку устройства ДО очистки сессии.
    const uid = user?.id;
    if (uid) { try { await releaseDevicePushToken(uid); } catch {} }
    await clearToken();
    setUserState(null);
    setSession(null);
    setActiveRoleState(null);
    setHasBothRoles(false);
    setIsAdmin(false);
    setProfileError(null);
    setNeedsOnboarding(false);
    await AsyncStorage.multiRemove([ACTIVE_ROLE_KEY, BOTH_ROLES_KEY, USER_CACHE_KEY, ADMIN_KEY, PENDING_ONBOARDING_KEY]);
  };

  return (
    <AuthContext.Provider value={{
      session, user, loading, initializing, profileError, activeRole, hasBothRoles, isAdmin, needsOnboarding,
      setUser, setActiveRole, addSecondaryRole, addTeamLeadRole, enterAdmin, exitAdmin,
      signIn, signInWithToken, signUp, forgotPassword, resendConfirmation, signOut, retryProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
