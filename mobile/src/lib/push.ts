import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform, Linking } from 'react-native';
import { updateUser } from './api';

const PROJECT_ID =
  (Constants.expoConfig as any)?.extra?.eas?.projectId ?? '69071943-c55a-4a87-9bf4-92fda7e75220';

/** Foreground display behaviour — show the banner like a normal push. */
export function configureNotifications() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Ask permission, get the Expo push token, save it to the backend (push_token). */
export async function registerPushToken(userId: number): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Уведомления',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#6366F1',
      });
    }
    const current = await Notifications.getPermissionsAsync();
    let status = current.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId: PROJECT_ID })).data;
    if (token) await updateUser(userId, { push_token: token });
  } catch {
    // Emulator / no Google Play / offline — ignore, in-app notifications still work.
  }
}

/**
 * Open the right screen when a push is tapped — mirrors the in-app
 * notification behaviour (meeting → detail, task → tasks, call → join).
 */
export function routeFromNotificationData(router: any, data: any) {
  if (!data) return;
  const type: string = data.type ?? '';
  if (data.room_url) { Linking.openURL(String(data.room_url)).catch(() => {}); return; }
  if (data.meeting_id) {
    router.push({ pathname: '/meeting-detail', params: { id: String(data.meeting_id) } });
    return;
  }
  if (data.task_id || type === 'new_task' || type === 'task_assigned') {
    router.navigate('/(tabs)/tasks');
    return;
  }
  router.navigate('/(tabs)/notifications');
}
