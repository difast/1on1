import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getUserByEmail, joinTeam, createTeam } from '../lib/api';

export interface AppUser {
  id: number;
  email: string;
  name: string;
  role: 'team_lead' | 'member';
  title?: string;
  telegram?: string;
  linkedin?: string;
  github?: string;
  avatar?: string;
}

type Role = 'team_lead' | 'member';

export const PENDING_ONBOARDING_KEY = 'pendingOnboarding';

interface AuthContextType {
  session: Session | null;
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
  signOut: () => Promise<void>;
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
  signOut: async () => {},
});

const USER_CACHE_KEY = 'cachedUser';
const BOTH_ROLES_KEY = 'hasBothRoles';
const ACTIVE_ROLE_KEY = 'activeRole';
const ADMIN_KEY = 'adminMode';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
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

  // Returns 'ok' | 'not_found' | 'error'
  const loadUser = async (email: string): Promise<'ok' | 'not_found' | 'error'> => {
    const [savedActiveRole, hasBoth, cached, pendingOnboarding] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_ROLE_KEY),
      AsyncStorage.getItem(BOTH_ROLES_KEY),
      AsyncStorage.getItem(USER_CACHE_KEY),
      AsyncStorage.getItem(PENDING_ONBOARDING_KEY),
    ]);
    setHasBothRoles(hasBoth === 'true');

    // Restore from cache immediately
    if (cached) {
      try {
        const u: AppUser = JSON.parse(cached);
        setUserState(u);
        if (savedActiveRole) setActiveRoleState(savedActiveRole as Role);
        else if (hasBoth !== 'true') setActiveRoleState(u.role);
      } catch {}
    }

    try {
      const data = (await getUserByEmail(email)) as AppUser;
      setUserState(data);
      setProfileError(null);
      setNeedsOnboarding(false);
      AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(data)).catch(() => {});
      AsyncStorage.removeItem(PENDING_ONBOARDING_KEY).catch(() => {});
      if (savedActiveRole) setActiveRoleState(savedActiveRole as Role);
      else if (hasBoth !== 'true') setActiveRoleState(data.role);
      return 'ok';
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 404) {
        // New user — Supabase account exists but no backend profile yet
        if (!cached) {
          setUserState(null);
          // Only route to onboarding when the registration flag is set;
          // returning users without a profile should stay at the login screen.
          setNeedsOnboarding(pendingOnboarding === 'true');
        }
        setProfileError(null);
        return 'not_found';
      }
      // Server error (500, timeout, 401, network down)
      const msg = err?.response?.detail ?? err?.message ?? null;
      if (!cached) {
        setUserState(null);
        setProfileError(msg ?? 'Сервер временно недоступен. Попробуйте позже.');
      }
      return 'error';
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, sess) => {
        setSession(sess);
        setProfileError(null);
        if (sess?.user?.email) {
          setLoading(true);
          try {
            await loadUser(sess.user.email);
          } catch {}
        } else {
          setUserState(null);
        }
        setLoading(false);
        setInitializing(false);
      },
    );
    return () => subscription.unsubscribe();
  }, []);

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

  const signOut = async () => {
    await supabase.auth.signOut();
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
      setUser, setActiveRole, addSecondaryRole, addTeamLeadRole, enterAdmin, exitAdmin, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
