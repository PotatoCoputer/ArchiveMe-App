import React, { useEffect } from 'react';
import 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Notifications from 'expo-notifications';
import { Platform, AppState } from 'react-native';

// firebase / firestore
import { auth, db } from './firebase';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';

// ก่อนเข้า Drawer
import LoginScreen from './LoginScreen';
import RegisterScreen from './RegisterScreen';
import QuestionnaireScreen from './QuestionnaireScreen';
import MainDrawer from './MainDrawer';
import FinishedBooksScreen from './FinishedBooksScreen';
import StartedBooksScreen from './StartedBooksScreen';
import ReadingWishBooksScreen from './ReadingBooksScreen';
import AdminDrawer from './AdminDrawer';
import UserDetailScreen from './UserDetailScreen';
import ForgotPasswordScreen from './ForgotPasswordScreen';
import ReadingPlanDetailScreen from './ReadingPlanDetailScreen';
import ReadingScheduleEditorScreen from './ReadingScheduleEditorScreen';

// หน้าจับเวลาและหน้าสรุปผล
import ReadingTimerScreen from './ReadingTimerScreen';
import ReadingSummaryScreen from './ReadingSummaryScreen';

// หน้ารายละเอียดหนังสือที่แนะนำ
import RecomendBookScreen from './RecomendBookScreen';

const Stack = createNativeStackNavigator();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

export default function App() {
  // ขอสิทธิ์แจ้งเตือน + ตั้งช่องแจ้งเตือน (Android)
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Notifications.requestPermissionsAsync();
        
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('reading', {
            name: 'Reading Reminders',
            importance: Notifications.AndroidImportance.HIGH,
            sound: null,
            vibrationPattern: [0, 250, 250, 250],
            lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          });
        }
      } catch (e) {
        console.log('Notification setup error:', e?.message || e);
      }
    })();
  }, []);

  // Presence heartbeat (online/lastSeen)
  useEffect(() => {
    let interval;
    let appStateSub;
    let authSub;

    const updatePresence = async (online) => {
      const u = auth.currentUser;
      if (!u) return;
      try {
        const now = new Date();
        await setDoc(
          doc(db, 'users', u.uid),
          {
            online: Boolean(online),
            lastSeen: serverTimestamp(),
            lastSeenText: now.toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }),
          },
          { merge: true }
        );
      } catch (e) {
      }
    };

    // อัปเดตเมื่อเปลี่ยนสถานะล็อกอิน
    authSub = auth.onAuthStateChanged((u) => {
      if (u) {
        updatePresence(true);
        interval && clearInterval(interval);
        interval = setInterval(() => updatePresence(true), 30000); 
      } else {
        interval && clearInterval(interval);
        updatePresence(false);
      }
    });

    // ติดตามสถานะแอป
    appStateSub = AppState.addEventListener('change', (state) => {
      if (!auth.currentUser) return;
      if (state === 'active') updatePresence(true);
      else if (state === 'background' || state === 'inactive') updatePresence(false);
    });

    return () => {
      appStateSub && appStateSub.remove();
      authSub && authSub();
      interval && clearInterval(interval);
    };
  }, []);

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
        {/* Auth / Pre-main */}
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen name="Forgot" component={ForgotPasswordScreen} />
        <Stack.Screen name="Questionnaire" component={QuestionnaireScreen} />

        {/* Main drawers */}
        <Stack.Screen name="Main" component={MainDrawer} />
        <Stack.Screen name="AdminDrawer" component={AdminDrawer} />

        {/* Reading plan / editor */}
        <Stack.Screen name="ReadingPlanDetail" component={ReadingPlanDetailScreen} />
        <Stack.Screen name="ReadingScheduleEditor" component={ReadingScheduleEditorScreen} />

        {/* Timer / summary */}
        <Stack.Screen name="ReadingTimer" component={ReadingTimerScreen} />
        <Stack.Screen name="ReadingSummary" component={ReadingSummaryScreen} />

        {/* Library lists */}
        <Stack.Screen name="FinishedBooks" component={FinishedBooksScreen} />
        <Stack.Screen name="StartedBooks" component={StartedBooksScreen} />
        <Stack.Screen name="ReadingBooks" component={ReadingWishBooksScreen} />

        {/* User */}
        <Stack.Screen
          name="UserDetail"
          component={UserDetailScreen}
          options={{ title: 'รายละเอียดผู้ใช้' }}
        />

        {/* รายละเอียดหนังสือจากการแนะนำ */}
        <Stack.Screen
          name="RecomendBook"
          component={RecomendBookScreen}
          options={{ headerShown: true, title: 'รายละเอียดหนังสือ' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
