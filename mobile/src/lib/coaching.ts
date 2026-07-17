// Локальная настройка «Подсказки Пита» (коучинг). Хранится на устройстве
// (AsyncStorage), как и тема. По умолчанию включено — как на вебе.
// Значение читают будущие экраны коучинга (подсказки повестки, итоги встречи).
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'coaching_enabled';

export async function getCoaching(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === null ? true : v === '1';
  } catch {
    return true;
  }
}

export async function setCoaching(on: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* no-op */
  }
}
