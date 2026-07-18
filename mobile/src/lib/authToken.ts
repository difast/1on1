// Хранение собственного JWT (замена Supabase-сессии). Токен небольшой (< 2 КБ),
// поэтому храним в SecureStore, с откатом на AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

const KEY = 'auth_jwt';

export async function getToken(): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    if (v != null) return v;
  } catch { /* ignore */ }
  return AsyncStorage.getItem(KEY);
}

export async function setToken(token: string): Promise<void> {
  try {
    if (token.length <= 2048) { await SecureStore.setItemAsync(KEY, token); return; }
  } catch { /* ignore */ }
  await AsyncStorage.setItem(KEY, token);
}

export async function clearToken(): Promise<void> {
  await Promise.allSettled([
    SecureStore.deleteItemAsync(KEY),
    AsyncStorage.removeItem(KEY),
  ]);
}
