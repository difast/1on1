import React, { useState } from 'react';
import { Pressable, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../lib/i18n';

/*
 * Вход через Telegram в приложении — компактная круглая иконка в общем ряду
 * соц-входа (единый размер с иконками Яндекс ID и VK ID).
 *
 * Telegram Login Widget работает только в браузере, нативного аналога нет,
 * поэтому вход идёт через веб-мост (тот же приём, что у VK ID): открываем
 *   https://app.oneononehq.com/auth/telegram/callback?platform=mobile
 * во внешнем браузере. Там рендерится официальный Login Widget; после
 * подтверждения бэкенд проверяет подпись, находит/создаёт пользователя по
 * telegram_id, выдаёт наш JWT и перебрасывает результат обратно в приложение по
 * deep-link oneonone://auth/telegram/callback?token=..., который ловит экран
 * app/(auth)/auth/telegram/callback.tsx.
 *
 * Логотип — официальный знак Telegram (белый самолётик на фирменном голубом).
 */
export default function TelegramLoginButton({
  loginUrl, onError, disabled = false,
}: { loginUrl: string; onError?: (msg: string) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const start = async () => {
    if (loading || disabled || !loginUrl) return;
    setLoading(true);
    try {
      const sep = loginUrl.includes('?') ? '&' : '?';
      await Linking.openURL(`${loginUrl}${sep}platform=mobile`);
    } catch {
      onError?.(t('auth.telegramFailed'));
    } finally {
      // Разблокируем сразу: пользователь ушёл в браузер и может вернуться.
      setLoading(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('auth.telegram')}
      accessibilityState={{ disabled: loading || disabled, busy: loading }}
      onPress={start}
      disabled={loading || disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: pressed ? '#1E90C4' : '#229ED9' },
        (loading || disabled) && styles.disabled,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color="#FFFFFF" />
        // Белый самолётик на фирменном голубом круге — как иконка Telegram на
        // вебе. Небольшой сдвиг компенсирует оптический центр самолётика.
        : <Ionicons name="paper-plane" size={26} color="#FFFFFF" style={styles.plane} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Единый размер с компактными иконками Яндекс ID и VK ID (52).
  btn: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  plane: { marginLeft: -2 },
});
