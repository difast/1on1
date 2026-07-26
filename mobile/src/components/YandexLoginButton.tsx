import React, { useState } from 'react';
import { Text, TouchableOpacity, StyleSheet, View, Linking, ActivityIndicator } from 'react-native';
import { yandexAuthUrl } from '../lib/api';

/*
 * Кнопка «Войти через Яндекс ID» для мобильного приложения.
 *
 * Оформление — по брендовым гайдлайнам Yandex ID: фирменный красный #FC3F1D
 * (разрешены также чёрный и белый варианты), логотип-бейдж с фирменной «Я» в
 * контрастном круге, защитное поле вокруг логотипа, скругление и пропорции не
 * меняются, формулировка не сокращается.
 *
 * Поток входа нативный: обычный веб-редирект OAuth не возвращает пользователя в
 * приложение, поэтому бэкенд отдаёт URL согласия с redirect URI на схему
 * приложения (oneonone://auth/yandex/callback). Возврат ловит экран
 * app/(auth)/auth/yandex/callback.tsx.
 */
type Variant = 'red' | 'black' | 'white';

const BRAND: Record<Variant, { bg: string; text: string; border: string; badgeBg: string; badgeFg: string }> = {
  red:   { bg: '#FC3F1D', text: '#FFFFFF', border: 'transparent', badgeBg: '#FFFFFF', badgeFg: '#FC3F1D' },
  black: { bg: '#000000', text: '#FFFFFF', border: 'transparent', badgeBg: '#FFFFFF', badgeFg: '#000000' },
  white: { bg: '#FFFFFF', text: '#000000', border: '#DCDEE0',     badgeBg: '#FC3F1D', badgeFg: '#FFFFFF' },
};

export default function YandexLoginButton({
  variant = 'red', onError, disabled = false,
}: { variant?: Variant; onError?: (msg: string) => void; disabled?: boolean }) {
  const [loading, setLoading] = useState(false);
  const c = BRAND[variant];

  const start = async () => {
    if (loading || disabled) return;
    setLoading(true);
    try {
      const { url } = await yandexAuthUrl('mobile');
      if (!url) throw new Error('no url');
      await Linking.openURL(url);
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.response?.detail;
      onError?.(detail?.message || (typeof detail === 'string' ? detail : 'Не удалось открыть вход через Яндекс ID'));
    } finally {
      // Кнопку разблокируем сразу: пользователь ушёл в браузер и может вернуться.
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="Войти через Яндекс ID"
      activeOpacity={0.85}
      onPress={start}
      disabled={loading || disabled}
      style={[styles.btn, { backgroundColor: c.bg, borderColor: c.border }, (loading || disabled) && styles.disabled]}
    >
      <View style={[styles.badge, { backgroundColor: c.badgeBg }]}>
        <Text style={[styles.badgeText, { color: c.badgeFg }]}>Я</Text>
      </View>
      {loading
        ? <ActivityIndicator size="small" color={c.text} />
        : <Text style={[styles.label, { color: c.text }]}>Войти через Яндекс ID</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,                 // защитное поле у логотипа
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  disabled: { opacity: 0.7 },
  badge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 15, fontWeight: '700', lineHeight: 18 },
  label: { fontSize: 15, fontWeight: '600' },
});
