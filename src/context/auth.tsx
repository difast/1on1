import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { getUserByEmail, joinTeam } from '../lib/api';

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

interface AuthContextType {
  session: Session | null;
  user: AppUser | null;
  loading: boolean;
  activeRole: Role | null;
  hasBothRoles: boolean;
  setUser: (user: AppUser | null) => void;
  setActiveRole: (role: Role) => Promise<void>;
  addSecondaryRole: (inviteCode: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  activeRole: null,
  hasBothRoles: false,
  setUser: () => {},
  setActiveRole: async () => {},
  addSecondaryRole: async () => {},
  signOut: async () => {},
});

const USER_CACHE_KEY = 'cachedUser';
const BOTH_ROLES_KEY = 'hasBothRoles';
const ACTIVE_ROLE_KEY = 'activeRole';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUserState] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeRole, setActiveRoleState] = useState<Role | null>(null);
  const [hasBothRoles, setHasBothRoles] = useState(false);

  // Keep user cache in sync (fire-and-forget)
  const setUser = (u: AppUser | null) => {
    setUserState(u);
    if (u) AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(u)).catch(() => {});
  };

  const loadUser = async (email: string) => {
    const [savedActiveRole, hasBoth] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_ROLE_KEY),
      AsyncStorage.getItem(BOTH_ROLES_KEY),
    ]);
    setHasBothRoles(hasBoth === 'true');

    try {
      const data = (await getUserByEmail(email)) as AppUser;
      setUserState(data);
      AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(data)).catch(() => {});
      setActiveRoleState((savedActiveRole as Role) ?? data.role);
    } catch {
      // API unavailable — fall back to cached user so onboarding is not re-shown
      const cached = await AsyncStorage.getItem(USER_CACHE_KEY);
      if (cached) {
        try {
          const u: AppUser = JSON.parse(cached);
          setUserState(u);
          setActiveRoleState((savedActiveRole as Role) ?? u.role);
        } catch { setUserState(null); }
      } else {
        setUserState(null);
      }
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, sess) => {
        setSession(sess);
        if (sess?.user?.email) {
          await loadUser(sess.user.email);
        } else {
          setUserState(null);
        }
        setLoading(false);
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

  const signOut = async () => {
    await supabase.auth.signOut();
    setUserState(null);
    setSession(null);
    setActiveRoleState(null);
    // Clear active role on logout so role selection appears on next login
    await AsyncStorage.removeItem(ACTIVE_ROLE_KEY);
  };

  return (
    <AuthContext.Provider value={{
      session, user, loading, activeRole, hasBothRoles,
      setUser, setActiveRole, addSecondaryRole, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
