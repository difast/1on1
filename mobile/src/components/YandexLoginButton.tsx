import React, { useState } from 'react';
import { Text, Pressable, StyleSheet, View, Linking, ActivityIndicator } from 'react-native';
import { yandexAuthUrl } from '../lib/api';
import { useI18n } from '../lib/i18n';

/*
 * Кнопка «Войти с Яндекс ID» для мобильного приложения (официальная
 * формулировка Yandex ID; сокращать «Яндекс ID» нельзя).
 *
 * Оформление — по брендовым гайдлайнам Yandex ID: фирменный красный (основной),
 * разрешённые варианты — чёрный и белый; логотип-бейдж, его пропорции, радиус и
 * защитное поле не меняются. Высота, скругление и кегль совпадают с основной
 * кнопкой входа на экране, чтобы способы входа не выглядели вразнобой.
 * Состояние нажатия — затемнение фирменного цвета (как в оформлении Yandex ID).
 *
 * Поток входа: открываем страницу согласия Яндекса в браузере. Адрес возврата
 * общий с вебом (https://.../auth/yandex/callback) — в панели Yandex OAuth у
 * приложения можно указать только один Redirect URI, и схему oneonone:// она не
 * принимает. Веб-страница возврата по метке в state понимает, что вход шёл из
 * приложения, и перебрасывает code и state сюда по схеме приложения. Возврат
 * ловит экран app/(auth)/auth/yandex/callback.tsx, обмен кода делает он же.
 */
type Variant = 'red' | 'black' | 'white';

const BRAND: Record<Variant, {
  bg: string; bgPressed: string; text: string; border: string; badgeBg: string; badgeFg: string;
}> = {
  red:   { bg: '#FC3F1D', bgPressed: '#D92C0E', text: '#FFFFFF', border: 'transparent', badgeBg: '#FFFFFF', badgeFg: '#FC3F1D' },
  black: { bg: '#000000', bgPressed: '#1F1F1F', text: '#FFFFFF', border: 'transparent', badgeBg: '#FFFFFF', badgeFg: '#000000' },
  white: { bg: '#FFFFFF', bgPressed: '#ECEEF0', text: '#000000', border: '#DCDEE0',     badgeBg: '#FC3F1D', badgeFg: '#FFFFFF' },
};

export default function YandexLoginButton({
  variant = 'red', onError, disabled = false, compact = false,
}: { variant?: Variant; onError?: (msg: string) => void; disabled?: boolean; compact?: boolean }) {
  const { t } = useI18n();
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
      onError?.(detail?.message || (typeof detail === 'string' ? detail : t('auth.yandexOpenFailed')));
    } finally {
      // Кнопку разблокируем сразу: пользователь ушёл в браузер и может вернуться.
      setLoading(false);
    }
  };

  // Компактная круглая иконка для ряда соц-входа: фирменный красный круг с белым
  // бейджем «Я» (тот же логотип-бейдж, что и на полной кнопке, перенесён в
  // компактный формат). Логика входа не меняется.
  if (compact) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('auth.yandex')}
        accessibilityState={{ disabled: loading || disabled, busy: loading }}
        onPress={start}
        disabled={loading || disabled}
        style={({ pressed }) => [
          styles.iconBtn,
          { backgroundColor: pressed ? c.bgPressed : c.bg, borderColor: c.border },
          (loading || disabled) && styles.disabled,
        ]}
      >
        {loading
          ? <ActivityIndicator size="small" color={c.text} />
          : <Text style={[styles.iconBadgeText, { color: c.text }]}>Я</Text>}
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('auth.yandex')}
      accessibilityState={{ disabled: loading || disabled, busy: loading }}
      onPress={start}
      disabled={loading || disabled}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: pressed ? c.bgPressed : c.bg, borderColor: c.border },
        (loading || disabled) && styles.disabled,
      ]}
    >
      <View style={[styles.badge, { backgroundColor: c.badgeBg }]}>
        <Text style={[styles.badgeText, { color: c.badgeFg }]}>Я</Text>
      </View>
      {loading
        ? <ActivityIndicator size="small" color={c.text} />
        : <Text style={[styles.label, { color: c.text }]}>{t('auth.yandex')}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    // Высота и скругление — как у основной кнопки входа (paddingVertical 14 +
    // строка 15/20 даёт те же 48 pt).
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,                 // защитное поле у логотипа
    paddingHorizontal: 18,
    borderRadius: 10,
    borderWidth: 1,
  },
  disabled: { opacity: 0.6 },
  badge: {
    width: 22, height: 22, borderRadius: 11,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontSize: 15, fontWeight: '700', lineHeight: 18 },
  label: { fontSize: 15, fontWeight: '600' },

  // Компактная круглая иконка — единый размер с прочими иконками ряда соц-входа.
  iconBtn: {
    width: 52, height: 52, borderRadius: 26,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  iconBadgeText: { fontSize: 24, fontWeight: '700', lineHeight: 28 },
});
