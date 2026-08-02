import React from 'react';
import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/context/auth';
import { useTheme } from '../../src/context/theme';
import { ActivityIndicator, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../../src/lib/i18n';

/*
 * Нижнее меню — шесть вкладок, отобранных по частоте использования и по
 * структуре веб-навигации, где основной ряд занимают Команды/Обзор, Встречи,
 * Задачи и Аналитика.
 *
 * Порядок повторяет рабочий сценарий: пришёл на главную -> посмотрел встречи ->
 * разобрал задачи. В центре Пит — ежедневный помощник, он вызывается чаще
 * любого раздела и поэтому выделен круглой кнопкой. Аналитика раньше была
 * спрятана в профиле, хотя на вебе это отдельная вкладка верхнего уровня.
 * Профиль остаётся точкой входа во второстепенные разделы: цели, развитие,
 * ONE AI, база знаний, организация, тариф, уведомления, настройки.
 *
 * Активная вкладка выделяется не только цветом: под иконкой подложка-пилюля и
 * жирная подпись, поэтому состояние читается и на монохромном экране.
 */
const ICONS: Record<string, { on: string; off: string }> = {
  index: { on: 'grid', off: 'grid-outline' },
  meetings: { on: 'calendar', off: 'calendar-outline' },
  tasks: { on: 'checkbox', off: 'checkbox-outline' },
  analytics: { on: 'stats-chart', off: 'stats-chart-outline' },
  profile: { on: 'person', off: 'person-outline' },
};

export default function TabsLayout() {
  const { t } = useI18n();
  const { session, user, loading, initializing, activeRole } = useAuth();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // Only block UI on first initialisation with no data at all.
  if ((initializing || loading) && !user) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!session) return <Redirect href="/(auth)/login" />;
  if (!user?.role && !loading) return <Redirect href="/onboarding" />;

  const isLead = (activeRole ?? user?.role) === 'team_lead';

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
          // Высота считается от фактической системной панели: у жестовой
          // навигации Android она одна, у кнопочной другая, insets.bottom
          // возвращает реальную — панель приложения не обрезается ни там, ни там.
          height: 62 + insets.bottom,
          paddingBottom: 6 + insets.bottom,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 10.5, fontWeight: '600', marginTop: 2 },
        tabBarIcon: ({ color, focused }) => {
          const icon = ICONS[route.name];
          if (!icon) return null;
          return (
            <View style={styles.iconWrap}>
              <View style={[
                styles.pill,
                focused && { backgroundColor: colors.accentLight },
              ]}>
                <Ionicons name={(focused ? icon.on : icon.off) as any} size={21} color={color} />
              </View>
            </View>
          );
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: isLead ? t('ui.komandy') : t('nav.overview') }} />
      <Tabs.Screen name="meetings" options={{ title: t('nav.meetings') }} />
      <Tabs.Screen
        name="support"
        options={{
          title: t('nav.assistant'),
          tabBarIcon: () => null,
          tabBarLabel: () => null,
          tabBarButton: (props) => (
            <TouchableOpacity {...(props as any)} style={styles.pitWrap} activeOpacity={0.85}>
              <View style={[styles.pitBtn, { backgroundColor: colors.accent }]}>
                <Ionicons name="sparkles" size={22} color="#fff" />
              </View>
              <Text style={[styles.pitLabel, { color: colors.textMuted }]} numberOfLines={1}>
                {t('nav.assistant')}
              </Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen name="tasks" options={{ title: t('nav.tasks') }} />
      <Tabs.Screen name="analytics" options={{ title: t('nav.analytics') }} />
      <Tabs.Screen name="profile" options={{ title: t('menu.profile') }} />
      {/* Скрытые экраны — открываются через router.push, в панели не показываются */}
      <Tabs.Screen name="notifications" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: { alignItems: 'center', justifyContent: 'center' },
  // Подложка активной вкладки: состояние видно не только по цвету иконки.
  pill: {
    width: 46, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  pitWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 2 },
  pitBtn: {
    width: 46, height: 46, borderRadius: 23,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  pitLabel: { fontSize: 10.5, fontWeight: '600', marginTop: 2 },
});
