import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../src/context/auth';
import { useTheme } from '../src/context/theme';

export default function Index() {
  const { session, user, loading, initializing, activeRole, hasBothRoles, isAdmin, needsOnboarding } = useAuth();
  const { colors } = useTheme();

  // Show spinner only when there's no data at all yet (first cold launch).
  // If user is already in cache, skip ahead and let the redirects below handle navigation.
  if (initializing || (loading && !user && !isAdmin && !session)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (isAdmin) return <Redirect href="/admin" />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!user) return needsOnboarding ? <Redirect href="/onboarding" /> : <Redirect href="/(auth)/login" />;
  if (!user.role) return needsOnboarding ? <Redirect href="/onboarding" /> : <Redirect href="/(auth)/login" />;
  if (hasBothRoles && !activeRole) return <Redirect href="/role-select" />;
  return <Redirect href="/(tabs)" />;
}
