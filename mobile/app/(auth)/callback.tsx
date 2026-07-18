// Резервный маршрут на случай открытия приложения по deep-link. Подтверждение
// почты теперь происходит на вебе (ссылка из письма ведёт на /confirm-email),
// поэтому здесь просто редирект на главный экран, чтобы Expo Router не показывал
// "not found".
import { Redirect } from 'expo-router';

export default function AuthCallback() {
  return <Redirect href="/" />;
}
