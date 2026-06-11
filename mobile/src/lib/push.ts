import { Platform, Linking } from 'react-native';
import Constants from 'expo-constants';
import { updateUser } from './api';

// Lazy-require so that an OLD build (OTA-updated but WITHOUT the
// expo-notifications native module) degrades gracefully instead of crashing.
let Notifications: any = null;
try { Notifications = require('expo-notifications'); } catch { Notifications = null; }

const PROJECT_ID =
  (Constants.expoConfig as any)?.extra?.eas?.projectId ?? '69071943-c55a-4a87-9bf4-92fda7e75220';

/** Foreground display behaviour — show the banner like a normal push. */
export function configureNotifications() {
  if (!Notifications?.setNotificationHandler) return;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch { /* native module missing — ignore */ }
}

async function ensureAndroidChannel() {
  if (Platform.OS !== 'android' || !Notifications?.setNotificationChannelAsync) return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Уведомления',
      importance: Notifications.AndroidImportance?.MAX ?? 5,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#6366F1',
    });
  } catch {}
}

/** Ask for notification permission right away (on first app open). */
export async function ensureNotificationPermission(): Promise<void> {
  if (!Notifications?.getPermissionsAsync) return;
  try {
    await ensureAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }
  } catch {}
}

/** Ask permission, get the Expo push token, save it to the backend (push_token). */
export async function registerPushToken(userId: number): Promise<void> {
  if (!Notifications?.getExpoPushTokenAsync) return;
  try {
    await ensureAndroidChannel();
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
    // Emulator / no Google Play / offline / no native module — ignore.
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
  if (type === 'mood_reminder') {
    router.navigate('/(tabs)');  // home — daily mood survey banner
    return;
  }
  router.navigate('/(tabs)/notifications');
}

/** Attach tap handlers (running + cold-start). Returns a cleanup fn. */
export function setupNotificationTapHandler(router: any): () => void {
  if (!Notifications?.addNotificationResponseReceivedListener) return () => {};
  try {
    Notifications.getLastNotificationResponseAsync?.().then((res: any) => {
      const data = res?.notification?.request?.content?.data;
      if (data) setTimeout(() => routeFromNotificationData(router, data), 600);
    }).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((res: any) => {
      routeFromNotificationData(router, res?.notification?.request?.content?.data);
    });
    return () => { try { sub?.remove?.(); } catch {} };
  } catch {
    return () => {};
  }
}
