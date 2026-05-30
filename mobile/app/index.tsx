import { Redirect } from 'expo-router';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../src/context/auth';
import { useTheme } from '../src/context/theme';

export default function Index() {
  const { session, user, loading, activeRole, hasBothRoles, isAdmin } = useAuth();
  const { colors } = useTheme();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (isAdmin) return <Redirect href="/admin" />;
  if (!session) return <Redirect href="/(auth)/login" />;
  if (!user?.role) return <Redirect href="/onboarding" />;
  if (hasBothRoles && !activeRole) return <Redirect href="/role-select" />;
  return <Redirect href="/(tabs)" />;
}
