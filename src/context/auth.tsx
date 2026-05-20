import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getUserByEmail } from '../lib/api';

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

interface AuthContextType {
  session: Session | null;
  user: AppUser | null;
  loading: boolean;
  setUser: (user: AppUser | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  setUser: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  const loadUser = async (email: string) => {
    try {
      const data = (await getUserByEmail(email)) as AppUser;
      setUser(data);
    } catch {
      setUser(null);
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, sess) => {
        setSession(sess);
        if (sess?.user?.email) {
          await loadUser(sess.user.email);
        } else {
          setUser(null);
        }
        setLoading(false);
      },
    );
    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ session, user, loading, setUser, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
