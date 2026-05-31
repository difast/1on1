// Hermes ships an incomplete URL/URLSearchParams implementation; supabase-js
// builds URL objects for every auth request, so without this polyfill the app
// crashes deterministically the moment you sign in or sign up in a release
// (Hermes) build. Must be imported before createClient runs.
import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://gxhmgwfgbouuvmdnswel.supabase.co';

const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd4aG1nd2ZnYm91dXZtZG5zd2VsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMTUyNzUsImV4cCI6MjA5NDY5MTI3NX0.ADHb8aVrzfZR4hO5n2S-0AgfKOgDcvb2zp9MfgFyqaU';

// SecureStore has a 2048-byte limit; fall back to AsyncStorage for larger values
const SecureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const value = await SecureStore.getItemAsync(key);
      if (value !== null) return value;
    } catch {}
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      if (value.length <= 2048) {
        await SecureStore.setItemAsync(key, value);
        return;
      }
    } catch {}
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    await Promise.allSettled([
      SecureStore.deleteItemAsync(key),
      AsyncStorage.removeItem(key),
    ]);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
