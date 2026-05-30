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

function AppContent() {
  const { session, user, loading, activeRole, hasBothRoles, isAdmin } = useAuth();
  const { isDark } = useTheme();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (loading) return;

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

    // Session exists but user profile not loaded yet → wait
    if (!user) return;

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
  }, [session, loading, user?.id, user?.role, activeRole, hasBothRoles, isAdmin]);

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
        </Stack>
      </View>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </BottomSheetModalProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
