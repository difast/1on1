import '../src/lib/polyfills';
import React, { useEffect } from 'react';
import { View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/context/auth';
import { ThemeProvider, useTheme } from '../src/context/theme';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { CallBanner } from '../src/components/CallBanner';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import * as Updates from 'expo-updates';
import { configureNotifications, ensureNotificationPermission, registerPushToken, setupNotificationTapHandler } from '../src/lib/push';

configureNotifications();

// Register the device push token once the user is known, and route taps.
function usePushNotifications(userId: number | undefined) {
  const router = useRouter();
  // Ask for notification permission immediately on first app open.
  useEffect(() => { ensureNotificationPermission(); }, []);
  useEffect(() => {
    if (!userId) return;
    registerPushToken(userId);
  }, [userId]);

  useEffect(() => setupNotificationTapHandler(router), []);
}

// Check for an OTA update on launch and apply it immediately (reload),
// so users don't have to restart the app twice to get the new bundle.
function useOtaUpdates() {
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    (async () => {
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res.isAvailable) {
          await Updates.fetchUpdateAsync();
          await Updates.reloadAsync();
        }
      } catch { /* offline / no update — ignore */ }
    })();
  }, []);
}

function AppContent() {
  const { session, user, loading, initializing, profileError, activeRole, hasBothRoles, isAdmin, needsOnboarding } = useAuth();
  const { isDark } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  usePushNotifications(user?.id);

  useEffect(() => {
    // Block only when there's genuinely no data to navigate with yet.
    // If we have a user (from cache) or a profileError, navigate immediately
    // rather than waiting 10-30s for the background server refresh to finish.
    if (initializing) return;
    if (loading && !user && !profileError && !isAdmin) return;

    const root = segments[0] as string | undefined;

    // Admin mode is independent of Supabase auth
    if (isAdmin) {
      if (root !== 'admin') router.replace('/admin');
      return;
    }

    if (!session) {
      // Not authenticated → always go to login
      if (root !== '(auth)') router.replace('/(auth)/login');
      return;
    }

    // Session exists but user profile not loaded
    if (!user) {
      if (profileError) {
        // Server error — stay on login so the error message is visible
        if (root !== '(auth)') router.replace('/(auth)/login');
      } else if (needsOnboarding) {
        // New registration: flag set during signUp, profile not created yet
        if (root !== 'onboarding') router.replace('/onboarding');
      } else {
        // Returning user whose profile load returned 404 (e.g. cleared DB or error)
        // — do not send to onboarding, redirect back to login
        if (root !== '(auth)') router.replace('/(auth)/login');
      }
      return;
    }

    if (!user.role) {
      if (root !== 'onboarding') router.replace('/onboarding');
      return;
    }

    if (hasBothRoles && !activeRole) {
      if (root !== 'role-select') router.replace('/role-select');
      return;
    }

    // Authenticated + role determined → go to tabs if stuck on auth/onboarding screens
    if (root === '(auth)' || root === 'onboarding' || root === 'role-select' || root === 'admin') {
      router.replace('/(tabs)');
    }
  }, [session, loading, initializing, profileError, user?.id, user?.role, activeRole, hasBothRoles, isAdmin, needsOnboarding]);

  return (
    <BottomSheetModalProvider>
      <View style={{ flex: 1 }}>
        <CallBanner />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="onboarding" />
          <Stack.Screen name="role-select" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="admin" />
          <Stack.Screen name="assistant" />
          <Stack.Screen name="+not-found" />
        </Stack>
      </View>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </BottomSheetModalProvider>
  );
}

export default function RootLayout() {
  useOtaUpdates();
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              <AppContent />
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
