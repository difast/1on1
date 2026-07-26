import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../../../src/context/auth';
import { useTheme } from '../../../../src/context/theme';
import { yandexAuthCallback } from '../../../../src/lib/api';
import { useI18n } from '../../../../src/lib/i18n';

/*
 * Возврат из Yandex ID в приложение по deep-link:
 *   oneonone://auth/yandex/callback?code=...&state=...
 *
 * Отправляем code и state на общий с вебом эндпоинт /auth/yandex/callback:
 * сервер проверяет подписанный state (CSRF), обменивает код, находит/создаёт
 * пользователя и выдаёт наш JWT. Дальше — обычная сессия приложения, корневой
 * layout сам уводит в онбординг или на вкладки.
 */
export default function YandexAuthCallback() {
  const { colors } = useTheme();
  const router = useRouter();
  const { signInWithToken } = useAuth();
  const { t } = useI18n();
  const { code, state, error: providerError } = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [error, setError] = useState('');
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    if (providerError) { done.current = true; setError(t('auth.yandexCancelled')); return; }
    if (!code || !state) return;   // параметры приходят вместе с deep-link
    done.current = true;
    (async () => {
      try {
        const data = await yandexAuthCallback(String(code), String(state));
        await signInWithToken(data.token, data.user);
      } catch (err: any) {
        const detail = err?.response?.data?.detail ?? err?.response?.detail;
        setError(detail?.message || (typeof detail === 'string' ? detail : t('auth.yandexFailed')));
      }
    })();
  }, [code, state, providerError]);

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
            {t('auth.yandexFinishing')}
          </Text>
        </>
      )}
    </View>
  );
}
