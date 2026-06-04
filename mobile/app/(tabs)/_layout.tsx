import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/auth';
import { useTheme } from '../../src/context/theme';
import { ActivityIndicator, View, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabsLayout() {
  const { session, user, loading, initializing, activeRole } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Only block UI on first initialisation with no data at all.
  // During background re-fetches (loading=true but user already loaded from cache),
  // keep showing the tabs so the user isn't stared at a spinner for up to 30 s.
  if ((initializing || loading) && !user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!user?.role && !loading) return <Redirect href="/onboarding" />;

  const isLead = (activeRole ?? user.role) === 'team_lead';

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          elevation: 0,
          shadowOpacity: 0,
          height: 60 + insets.bottom,
          paddingBottom: 8 + insets.bottom,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 2 },
        tabBarIcon: ({ color, size, focused }) => {
          const iconMap: Record<string, string> = {
            index: isLead ? 'grid-outline' : 'home-outline',
            meetings: 'calendar-outline',
            tasks: 'checkbox-outline',
            profile: 'person-outline',
          };
          const icon = iconMap[route.name];
          if (!icon) return null;
          return (
            <View style={{ alignItems: 'center' }}>
              <Ionicons name={icon as any} size={size} color={color} />
              {focused && (
                <View style={[tabStyles.activeDot, { backgroundColor: colors.accent, shadowColor: colors.accent }]} />
              )}
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: isLead ? 'Команды' : 'Обзор' }} />
      <Tabs.Screen name="meetings" options={{ title: 'Встречи' }} />
      <Tabs.Screen
        name="support"
        options={{
          title: 'Пит',
          tabBarIcon: () => null,
          tabBarLabel: () => null,
          tabBarButton: (props) => (
            <TouchableOpacity
              {...(props as any)}
              style={tabStyles.pitWrap}
              activeOpacity={0.85}
            >
              <View style={[tabStyles.pitBtn, { backgroundColor: colors.accent }]}>
                <Ionicons name="sparkles" size={22} color="#fff" />
              </View>
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen name="tasks" options={{ title: 'Задачи' }} />
      <Tabs.Screen name="profile" options={{ title: 'Профиль' }} />
      {/* Hidden screens — accessible via router.push, not shown in tab bar */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="analytics" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

const tabStyles = StyleSheet.create({
  pitWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  pitBtn: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
    marginBottom: 8,
  },
  activeDot: {
    width: 4, height: 4, borderRadius: 2,
    marginTop: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 4,
  },
});
