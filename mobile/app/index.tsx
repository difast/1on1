import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../src/context/auth';
import { useTheme } from '../src/context/theme';

export default function Index() {
  const { session, user, loading, initializing, activeRole, hasBothRoles, isAdmin, needsOnboarding } = useAuth();
  const { colors } = useTheme();

  if (initializing || loading) {
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
