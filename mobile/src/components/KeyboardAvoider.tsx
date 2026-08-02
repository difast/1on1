import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/*
 * Единый механизм «клавиатура не перекрывает поле ввода».
 *
 * Поведение платформ отличается принципиально:
 *  - iOS: система не сдвигает окно, поэтому нужен behavior="padding" и
 *    компенсация высоты шапки через keyboardVerticalOffset;
 *  - Android: окно сдвигается системой (windowSoftInputMode=adjustResize),
 *    поэтому behavior="height" даёт двойной сдвиг. Правильно — undefined.
 *
 * Раньше это повторялось вручную на четырёх экранах и отсутствовало на
 * восемнадцати. Здесь один компонент с корректным поведением для обеих
 * платформ, чтобы поведение не расходилось между экранами.
 */
export function KeyboardAvoider({
  children, style, offset = 0,
}: { children: React.ReactNode; style?: ViewStyle; offset?: number }) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? offset : 0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

/*
 * Прокручиваемая форма: содержимое доезжает над клавиатурой, а нижний отступ
 * учитывает системную панель Android (жестовую и кнопочную — у них разная
 * высота, insets.bottom возвращает фактическую).
 *
 * keyboardShouldPersistTaps="handled" обязателен: без него первый тап при
 * открытой клавиатуре только закрывает её, и кнопка «Сохранить» под формой
 * требует двух нажатий.
 */
export function KeyboardAwareScroll({
  children, contentContainerStyle, style, offset = 0, extraBottom = 24, ...rest
}: any) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoider offset={offset} style={style}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        contentContainerStyle={[
          contentContainerStyle,
          { paddingBottom: (contentContainerStyle?.paddingBottom ?? 0) + insets.bottom + extraBottom },
        ]}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAvoider>
  );
}

/*
 * Нижняя закреплённая панель (строка ввода чата, кнопки действий):
 * поднимается над клавиатурой и не заезжает под системную панель Android.
 */
export function BottomBarSafe({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsets();
  return <View style={[{ paddingBottom: insets.bottom }, style]}>{children}</View>;
}
