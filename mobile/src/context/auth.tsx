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

interface AuthContextType {
  session: Session | null;
  user: AppUser | null;
  loading: boolean;
  activeRole: Role | null;
  hasBothRoles: boolean;
  isAdmin: boolean;
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
  activeRole: null,
  hasBothRoles: false,
  isAdmin: false,
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
  const [activeRole, setActiveRoleState] = useState<Role | null>(null);
  const [hasBothRoles, setHasBothRoles] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

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

  const loadUser = async (email: string) => {
    const [savedActiveRole, hasBoth, cached] = await Promise.all([
      AsyncStorage.getItem(ACTIVE_ROLE_KEY),
      AsyncStorage.getItem(BOTH_ROLES_KEY),
      AsyncStorage.getItem(USER_CACHE_KEY),
    ]);
    setHasBothRoles(hasBoth === 'true');

    // Restore from cache immediately — prevents onboarding flash on slow network
    if (cached) {
      try {
        const u: AppUser = JSON.parse(cached);
        setUserState(u);
        if (savedActiveRole) {
          setActiveRoleState(savedActiveRole as Role);
        } else if (hasBoth !== 'true') {
          // Single-role user: use their role directly
          setActiveRoleState(u.role);
        }
        // hasBothRoles + no savedActiveRole → leave null so role-select shows
      } catch {}
    }

    try {
      const data = (await getUserByEmail(email)) as AppUser;
      setUserState(data);
      AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(data)).catch(() => {});
      if (savedActiveRole) {
        setActiveRoleState(savedActiveRole as Role);
      } else if (hasBoth !== 'true') {
        setActiveRoleState(data.role);
      }
    } catch {
      if (!cached) setUserState(null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, sess) => {
        setSession(sess);
        if (sess?.user?.email) {
          // Keep the loading gate up while we resolve the backend profile,
          // otherwise the router briefly sees session+no-user and bounces
          // an existing user into the onboarding (registration) flow.
          setLoading(true);
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
    await AsyncStorage.multiRemove([ACTIVE_ROLE_KEY, BOTH_ROLES_KEY, USER_CACHE_KEY, ADMIN_KEY]);
  };

  return (
    <AuthContext.Provider value={{
      session, user, loading, activeRole, hasBothRoles, isAdmin,
      setUser, setActiveRole, addSecondaryRole, addTeamLeadRole, enterAdmin, exitAdmin, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
