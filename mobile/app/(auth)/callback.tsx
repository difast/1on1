// Handles Supabase email confirmation deep links (oneonone://callback?token=...).
// Without this file Expo Router shows "not found" when the app opens via the
// confirmation link. The auth state change listener in AuthProvider picks up
// the confirmed session automatically; we just need a valid route here.
import { Redirect } from 'expo-router';

export default function AuthCallback() {
  return <Redirect href="/" />;
}
