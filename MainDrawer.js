import React, { useState } from 'react';
import {
  createDrawerNavigator,
  DrawerContentScrollView,
  DrawerItemList,
  DrawerItem,
} from '@react-navigation/drawer';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, StyleSheet, ImageBackground, TouchableOpacity, Modal } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { signOut } from 'firebase/auth';
import { auth } from './firebase';

import HomeScreen from './HomeScreen';
import ReadingPlanScreen from './ReadingPlanScreen';
import ScheduleScreen from './ScheduleScreen';
import StatsScreen from './StatsScreen';
import SettingsScreen from './SettingsScreen';

const Drawer = createDrawerNavigator();

const THEME = {
  bg1: '#0b1020',
  bg2: '#101a3a',
  bg3: '#0c2b3a',
  text: '#eaf6ff',
  sub: '#a7d8f0',
  cardBorder: 'rgba(173, 235, 255, 0.25)',
  activeBg: 'rgba(34, 211, 238, 0.18)', // cyan glass
  primary: '#22d3ee',
  danger: '#ef4444',
};

const WALLPAPER = require('./assets/drawer-wallpaper.jpg');

function FancyPopup({ visible, title, message, onCancel, onConfirm }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.popupOverlay}>
        <View style={[styles.popupGlow, { shadowColor: '#ef444455' }]} />
        <LinearGradient
          colors={['#21314f', '#182341']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.popupBorder}
        >
          <View style={styles.popupCard}>
            <View style={[styles.popupBadge, { backgroundColor: '#1b0f12', shadowColor: '#ef444455' }]}>
              <Ionicons name="log-out-outline" size={24} color="#ff7a59" />
            </View>
            <Text style={styles.popupTitle}>{title}</Text>
            <Text style={styles.popupMessage}>{message}</Text>

            <View style={styles.popupBtnRow}>
              <TouchableOpacity onPress={onCancel} activeOpacity={0.9} style={styles.popupBtnGhost}>
                <Text style={styles.popupBtnGhostText}>ยกเลิก</Text>
              </TouchableOpacity>

              <LinearGradient
                colors={['#ff7a59', '#ef4444']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.popupBtnGrad}
              >
                <TouchableOpacity onPress={onConfirm} activeOpacity={0.9}>
                  <Text style={styles.popupBtnText}>ออกจากระบบ</Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

function CustomDrawerContent(props) {
  const insets = useSafeAreaInsets();
  const [showLogout, setShowLogout] = useState(false);

  const doLogout = async () => {
    setShowLogout(false);
    try {
      await signOut(auth);
      props.navigation.replace('Login');
    } catch (e) {
      console.log('Logout error:', e);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ImageBackground
        source={WALLPAPER}
        resizeMode="cover"
        blurRadius={6}
        style={StyleSheet.absoluteFill}
      >
        <LinearGradient
          colors={['rgba(8,16,32,0.85)', 'rgba(16,26,58,0.82)', 'rgba(12,43,58,0.85)']}
          style={StyleSheet.absoluteFill}
        />
      </ImageBackground>

      <DrawerContentScrollView {...props} contentContainerStyle={styles.drawerContent}>
        {/* Header */}
        <View style={[styles.drawerHeader, { paddingTop: insets.top + 10 }]}>
          <View style={styles.logoWrap}>
            <Ionicons name="book-outline" size={20} color="#072d36" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.appName}>AchieveMe</Text>
            <Text style={styles.appSub}>อ่านให้ถึงเป้าหมายของคุณ</Text>
          </View>
        </View>

        {/* Items */}
        <View style={styles.listWrap}>
          <DrawerItemList {...props} />
        </View>

        {/* Logout */}
        <View style={styles.logoutWrap}>
          <DrawerItem
            label="ออกจากระบบ"
            labelStyle={styles.logoutLabel}
            icon={({ size }) => <Ionicons name="log-out-outline" size={size} color={THEME.danger} />}
            style={styles.logoutItem}
            onPress={() => setShowLogout(true)}
          />
        </View>
      </DrawerContentScrollView>

      <FancyPopup
        visible={showLogout}
        title="ออกจากระบบ"
        message="คุณต้องการออกจากระบบใช่หรือไม่?"
        onCancel={() => setShowLogout(false)}
        onConfirm={doLogout}
      />
    </View>
  );
}

export default function MainDrawer() {
  return (
    <Drawer.Navigator
      initialRouteName="หน้าหลัก"
      drawerContent={(props) => <CustomDrawerContent {...props} />}
      screenOptions={{
        // Header ของแต่ละหน้า
        headerStyle: {
          backgroundColor: THEME.bg2,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: THEME.cardBorder,
        },
        headerTintColor: THEME.text,
        headerTitleStyle: { fontWeight: '800' },

        // Drawer
        drawerStyle: { width: 290, backgroundColor: 'transparent' },
        sceneContainerStyle: { backgroundColor: 'transparent' },
        drawerActiveTintColor: THEME.text,
        drawerInactiveTintColor: THEME.sub,
        drawerActiveBackgroundColor: THEME.activeBg,
        drawerItemStyle: {
          borderRadius: 12,
          marginHorizontal: 10,
          marginVertical: 3,
          borderWidth: 1,
          borderColor: 'transparent',
        },
        drawerLabelStyle: { fontSize: 15, fontWeight: '700' },
      }}
    >
      <Drawer.Screen
        name="หน้าหลัก"
        component={HomeScreen}
        options={{ drawerIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color}/> }}
      />
      <Drawer.Screen
        name="แผนการอ่าน"
        component={ReadingPlanScreen}
        options={{ drawerIcon: ({ color, size }) => <Ionicons name="reader-outline" size={size} color={color}/> }}
      />
      <Drawer.Screen
        name="จัดตารางและคำถาม"
        component={ScheduleScreen}
        options={{ drawerIcon: ({ color, size }) => <Ionicons name="chatbox-ellipses-outline" size={size} color={color}/> }}
      />
      <Drawer.Screen
        name="สถิติ"
        component={StatsScreen}
        options={{ drawerIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color}/> }}
      />
      <Drawer.Screen
        name="ตั้งค่า"
        component={SettingsScreen}
        options={{ drawerIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color}/> }}
      />
    </Drawer.Navigator>
  );
}

const styles = StyleSheet.create({
  drawerContent: { paddingTop: 0, paddingBottom: 12 },

  // Header
  drawerHeader: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: THEME.cardBorder,
  },
  logoWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#7de2ff',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(173,235,255,0.6)',
  },
  appName: { color: THEME.text, fontSize: 18, fontWeight: '800' },
  appSub: { color: THEME.sub, fontSize: 12, marginTop: 2 },

  // Items
  listWrap: { marginTop: 10, paddingVertical: 6 },

  // Logout
  logoutWrap: { marginTop: 6, paddingHorizontal: 6 },
  logoutItem: {
    borderRadius: 12,
    marginHorizontal: 10,
    marginVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  logoutLabel: { fontSize: 15, fontWeight: '800', color: THEME.danger },

  popupOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    padding: 24,
  },
  popupGlow: {
    position: 'absolute',
    width: '80%',
    height: 210,
    borderRadius: 20,
    shadowOpacity: 0.7,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  popupBorder: {
    width: '100%', maxWidth: 480, padding: 1.2, borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(173,235,255,0.25)',
  },
  popupCard: {
    backgroundColor: 'rgba(12,24,48,0.85)',
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(173,235,255,0.28)',
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  popupBadge: {
    alignSelf: 'center',
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginTop: -34, marginBottom: 8,
    shadowOpacity: 0.8, shadowRadius: 18, shadowOffset: { width: 0, height: 0 },
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  popupTitle: { color: THEME.text, fontWeight: '900', fontSize: 16, textAlign: 'center', marginBottom: 4 },
  popupMessage: { color: THEME.sub, textAlign: 'center', lineHeight: 20 },
  popupBtnRow: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  popupBtnGhost: {
    flex: 1,
    paddingVertical: 11, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(173,235,255,0.28)',
    backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center',
  },
  popupBtnGhostText: { color: THEME.text, fontWeight: '800' },
  popupBtnGrad: { flex: 1, borderRadius: 12, overflow: 'hidden', alignItems: 'center' },
  popupBtnText: { color: '#fff', fontWeight: '900', paddingVertical: 11, paddingHorizontal: 16, textAlign: 'center' },
});
