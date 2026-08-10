import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../../src/context/auth';
import { useTheme } from '../../../../src/context/theme';
import { useI18n } from '../../../../src/lib/i18n';

/*
 * Возврат из Telegram в приложение по deep-link:
 *   oneonone://auth/telegram/callback?token=...&status=...
 *
 * Подпись Telegram проверена на бэкенде, пользователь найден/создан по
 * telegram_id и наш JWT уже выдан (веб-мост /auth/telegram/callback?platform=
 * mobile отправил подписанные данные на /telegram/callback, а тот перебросил
 * сюда готовый токен). Здесь остаётся только сохранить сессию — профиль
 * подтягивается с /auth/me тем же путём, что при обычном входе.
 */
export default function TelegramAuthCallback() {
  const { colors } = useTheme();
  const router = useRouter();
  const { signInWithTokenOnly } = useAuth();
  const { t } = useI18n();
  const { token, error: providerError } = useLocalSearchParams<{ token?: string; status?: string; error?: string }>();
  const [error, setError] = useState('');
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    if (providerError) { done.current = true; setError(t('auth.telegramFailed')); return; }
    if (!token) return;   // токен приходит вместе с deep-link
    done.current = true;
    (async () => {
      try {
        await signInWithTokenOnly(String(token));
        // На успехе корневой layout уводит на нужный экран.
      } catch (err: any) {
        const detail = err?.response?.data?.detail ?? err?.response?.detail;
        setError(detail?.message || (typeof detail === 'string' ? detail : t('auth.telegramFailed')));
      }
    })();
  }, [token, providerError]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      {error ? (
        <>
          <Text style={{ fontSize: 17, fontWeight: '600', color: colors.textPrimary, textAlign: 'center' }}>
            {t('auth.yandexFailedTitle')}
          </Text>
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>{error}</Text>
          <TouchableOpacity
            style={{ marginTop: 24, backgroundColor: colors.accent, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 32 }}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Text style={{ fontSize: 15, fontWeight: '600', color: '#fff' }}>{t('auth.backToLogin')}</Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={{ fontSize: 14, color: colors.textSecondary, marginTop: 16 }}>
            {t('auth.telegramLoggingIn')}
          </Text>
        </>
      )}
    </View>
  );
}
