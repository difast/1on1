import React, { useState } from 'react';
import { Text, Pressable, StyleSheet, Linking, ActivityIndicator } from 'react-native';
import { useI18n } from '../lib/i18n';

/*
 * Вход через VK ID в приложении — компактная круглая иконка в общем ряду
 * соц-входа (единый размер с иконкой Яндекс ID).
 *
 * VK не принимает кастомные схемы в своём redirect_uri, поэтому вход идёт через
 * веб-мост: открываем зарегистрированный адрес возврата с меткой платформы
 *   https://app.oneononehq.com/auth/vk/callback?platform=mobile
 * во внешнем браузере. Там работает виджет VK ID (One Tap + QR); после успеха
 * бэкенд обменивает code по client_secret, выдаёт наш JWT и перебрасывает
 * результат обратно в приложение по deep-link
 *   oneonone://auth/vk/callback?token=...&status=...
 * который ловит экран app/(auth)/auth/vk/callback.tsx.
 *
 * Логотип VK — белый знак «VK» на фирменном синем (#0077FF), по аналогии с
 * бейджем «Я» у Яндекс ID (в проекте марки провайдеров рисуются текстом, без SVG).
 */
export default function VkLoginButton({
  redirectUrl, onError, disabled = false,
}: { redirectUrl: string; onError?: (msg: string) => void; disabled?: boolean }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);

  const start = async () => {
    if (loading || disabled || !redirectUrl) return;
    setLoading(true);
    try {
      const sep = redirectUrl.includes('?') ? '&' : '?';
      await Linking.openURL(`${redirectUrl}${sep}platform=mobile`);
    } catch {
      onError?.(t('auth.vkFailed'));
    } finally {
      // Разблокируем сразу: пользователь ушёл в браузер и может вернуться.
      setLoading(false);
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('auth.vk')}
      accessibilityState={{ disabled: loading || disabled, busy: loading }}
      onPress={start}
      disabled={loading || disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: pressed ? '#0768D9' : '#0077FF' },
        (loading || disabled) && styles.disabled,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color="#FFFFFF" />
        : <Text style={styles.mark}>VK</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Единый размер с компактной иконкой Яндекс ID (52).
  btn: {
    width: 52, height: 52, borderRadius: 26,
    alignItems: 'center', justifyContent: 'center',
  },
  disabled: { opacity: 0.6 },
  mark: { fontSize: 19, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
});
