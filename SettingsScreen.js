import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
  ScrollView,
  Platform,
  useWindowDimensions,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';

import * as Notifications from 'expo-notifications';
import { onAuthStateChanged, sendPasswordResetEmail, deleteUser } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, onSnapshot, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';

const THEME = {
  // gradient background
  bg1: '#0b1220',
  bg2: '#0f2033',
  bg3: '#083344',
  // glass cards
  card: 'rgba(255,255,255,0.06)',
  cardDeep: 'rgba(255,255,255,0.04)',
  cardBorder: 'rgba(255,255,255,0.14)',
  text: '#EAF2FF',
  sub: '#C8E6FF',
  muted: '#90A6C3',
  // accents
  primary: '#60A5FA',
  primary2: '#22D3EE',
  accent: '#34D399',
  danger: '#F43F5E',
  radius: 16,
};

const GRAD_PRIMARY = [THEME.primary, THEME.primary2];
const GRAD_DANGER = ['#ff7a59', '#ef4444'];

function FancyPopup({
  visible,
  mode = 'alert',           
  type = 'info',           
  title = '',
  message = '',
  confirmText = 'ตกลง',
  cancelText = 'ยกเลิก',
  onClose,
  onConfirm,
}) {
  const palette = {
    info:   { glow: '#22d3ee55', badgeBg: '#0b1722', icon: THEME.primary2 },
    success:{ glow: '#22c55e55', badgeBg: '#0d1a12', icon: '#22c55e' },
    warn:   { glow: '#f59e0b55', badgeBg: '#1f1205', icon: '#f59e0b' },
    danger: { glow: '#ef444455', badgeBg: '#1f0b0b', icon: '#ff7a59' },
  };
  const p = palette[type] || palette.info;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.popupOverlay}>
        <View style={[styles.popupGlow, { shadowColor: p.glow }]} />
        <LinearGradient colors={['#2e215a', '#221a45']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.popupBorder}>
          <View style={styles.popupCard}>
            <View style={[styles.popupBadge, { backgroundColor: p.badgeBg, shadowColor: p.glow }]}>
              <Ionicons name="warning" size={24} color={p.icon} />
            </View>
            {!!title && <Text style={styles.popupTitle}>{title}</Text>}
            {!!message && <Text style={styles.popupMessage}>{message}</Text>}

            {mode === 'alert' ? (
              <View style={styles.popupBtnRowSingle}>
                <LinearGradient colors={GRAD_PRIMARY} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.popupBtnGrad}>
                  <TouchableOpacity onPress={onClose} activeOpacity={0.9}>
                    <Text style={styles.popupBtnText}>ตกลง</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            ) : (
              <View style={styles.popupBtnRow}>
                <TouchableOpacity onPress={onClose} activeOpacity={0.9} style={styles.popupBtnGhost}>
                  <Text style={styles.popupBtnGhostText}>{cancelText}</Text>
                </TouchableOpacity>
                <LinearGradient
                  colors={type === 'danger' ? GRAD_DANGER : GRAD_PRIMARY}
                  start={{x:0,y:0}} end={{x:1,y:0}}
                  style={styles.popupBtnGrad}
                >
                  <TouchableOpacity onPress={onConfirm} activeOpacity={0.9}>
                    <Text style={styles.popupBtnText}>{confirmText}</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            )}
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

/* ================= Component ================= */
export default function SettingsScreen() {
  const [active, setActive] = useState('profile'); 
  const [uid, setUid] = useState(null);

  // profile
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');

  // notifications
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifTime, setNotifTime] = useState('19:00');
  const [dailyId, setDailyId] = useState(null);

  const [loading, setLoading] = useState(true);

  const [popup, setPopup] = useState({
    show: false,
    mode: 'alert',
    type: 'info',
    title: '',
    message: '',
    onConfirm: null,
  });
  const closePopup = () => setPopup(p => ({ ...p, show: false }));
  const showAlert = (type, title, message) =>
    setPopup({ show: true, mode: 'alert', type, title, message, onConfirm: null });

  const { width } = useWindowDimensions();
  const isNarrow = width < 720;

  // ---------- fetch user ----------
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      setUid(user.uid);

      const ref = doc(db, 'users', user.uid);
      const unsubUser = onSnapshot(
        ref,
        (snap) => {
          const data = snap.data() || {};
          setName(data.name || user.displayName || '');
          setEmail(user.email || data.email || '');
          const n = data.notifications || {};
          setNotifEnabled(!!n.enabled);
          setNotifTime(n.time || '19:00');
          setDailyId(n.dailyId || null);
          setLoading(false);
        },
        () => setLoading(false)
      );

      return () => unsubUser();
    });

    return () => unsubAuth();
  }, []);

  // ---------- helpers: notifications ----------
  const requestNotificationPermission = async () => {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.status === 'granted') return true;
    const res = await Notifications.requestPermissionsAsync();
    return res.status === 'granted';
  };

  const parseHHMM = (txt) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec((txt || '').trim());
    if (!m) return null;
    const h = Number(m[1]), mm = Number(m[2]);
    if (Number.isNaN(h) || Number.isNaN(mm) || h < 0 || h > 23 || mm < 0 || mm > 59) return null;
    return { hour: h, minute: mm };
  };

  const cancelDailyReminder = async (id) => {
    if (!id) return;
    try { await Notifications.cancelScheduledNotificationAsync(id); } catch {}
  };

  const createDailyReminder = async (timeHHMM) => {
    const tm = parseHHMM(timeHHMM);
    if (!tm) throw new Error('รูปแบบเวลาไม่ถูกต้อง');

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'ถึงเวลาอ่านหนังสือ 📚',
        body: 'เตือนอ่านตามเป้าหมายประจำวันของคุณ',
        data: { type: 'daily-general' },
      },
      trigger: {
        hour: tm.hour,
        minute: tm.minute,
        repeats: true,
        channelId: Platform.OS === 'android' ? 'reading' : undefined,
      },
    });
    return id;
  };

  // ---------- actions ----------
  const saveProfile = async () => {
    if (!uid) return;
    try {
      await setDoc(
        doc(db, 'users', uid),
        { name: (name || '').trim(), email: email || '' },
        { merge: true }
      );
      showAlert('success', 'บันทึกแล้ว', 'บันทึกข้อมูลส่วนตัวเรียบร้อย');
    } catch {
      showAlert('danger', 'เกิดข้อผิดพลาด', 'บันทึกข้อมูลไม่สำเร็จ');
    }
  };

  const sendReset = async () => {
    if (!email) {
      showAlert('warn', 'แจ้งเตือน', 'ไม่มีอีเมลในบัญชีนี้');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showAlert('info', 'ส่งอีเมลแล้ว', 'โปรดตรวจสอบกล่องจดหมายเพื่อรีเซ็ตรหัสผ่าน');
    } catch {
      showAlert('danger', 'เกิดข้อผิดพลาด', 'ส่งอีเมลไม่สำเร็จ');
    }
  };

  const saveNotifications = async () => {
    if (!uid) return;

    const tm = parseHHMM(notifTime);
    if (!tm) {
      showAlert('warn', 'รูปแบบเวลาไม่ถูกต้อง', 'กรุณากรอกเวลาเป็น HH:MM เช่น 19:00');
      return;
    }

    try {
      if (notifEnabled) {
        const ok = await requestNotificationPermission();
        if (!ok) {
          showAlert('warn', 'ไม่ได้รับสิทธิ์', 'โปรดอนุญาตการแจ้งเตือนในตั้งค่าเครื่องก่อน');
          return;
        }
        if (dailyId) await cancelDailyReminder(dailyId);
        const newId = await createDailyReminder(notifTime);
        await updateDoc(doc(db, 'users', uid), {
          notifications: { enabled: true, time: notifTime, dailyId: newId },
        });
        setDailyId(newId);
        showAlert('success', 'สำเร็จ', 'บันทึกการตั้งค่าแจ้งเตือนแล้ว');
      } else {
        if (dailyId) await cancelDailyReminder(dailyId);
        await updateDoc(doc(db, 'users', uid), {
          notifications: { enabled: false, time: notifTime, dailyId: null },
        });
        setDailyId(null);
        showAlert('success', 'สำเร็จ', 'ปิดการแจ้งเตือนแล้ว');
      }
    } catch {
      showAlert('danger', 'เกิดข้อผิดพลาด', 'บันทึกการตั้งค่าไม่สำเร็จ');
    }
  };

  const handleDeleteAccount = () => {
    setPopup({
      show: true,
      mode: 'confirm',
      type: 'danger',
      title: 'ยืนยันการลบบัญชี',
      message: 'การลบบัญชีจะลบข้อมูลทั้งหมดของคุณและไม่สามารถกู้คืนได้ ต้องการดำเนินการต่อหรือไม่?',
      onConfirm: async () => {
        closePopup();
        if (!auth.currentUser) return;
        try {
          await deleteDoc(doc(db, 'users', auth.currentUser.uid));
          await deleteUser(auth.currentUser);
          showAlert('success', 'ลบบัญชีแล้ว', 'บัญชีของคุณถูกลบเรียบร้อย');
        } catch {
          showAlert('danger', 'เกิดข้อผิดพลาด', 'ไม่สามารถลบบัญชีได้ โปรดลองอีกครั้ง');
        }
      },
    });
  };

  // ---------- render ----------
  const version =
    (Constants && Constants.expoConfig && Constants.expoConfig.version) ||
    (Constants && Constants.manifest && Constants.manifest.version) ||
    '1.0.0';

  return (
    <LinearGradient colors={[THEME.bg1, THEME.bg2, THEME.bg3]} style={{ flex: 1 }}>
      <SafeAreaView style={styles.screen}>
        {/* Header */}
        <View style={styles.headerWrap}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>การตั้งค่า</Text>
            <View style={styles.headerBadge}>
              <Ionicons name="shield-checkmark-outline" size={14} color={THEME.text} />
              <Text style={styles.headerBadgeText}>โปรไฟล์ของคุณ</Text>
            </View>
          </View>
          <Text style={styles.headerSub}>จัดการบัญชีและการตั้งค่าของคุณ</Text>
        </View>

        <View style={[styles.layout, { flexDirection: isNarrow ? 'column' : 'row' }]}>
          {/* Sidebar */}
          <View style={[styles.sidebar, { width: isNarrow ? '100%' : 240, marginBottom: isNarrow ? 12 : 0 }]}>
            <SidebarItem icon="person-outline"              label="ข้อมูลส่วนตัว"  active={active==='profile'} onPress={()=>setActive('profile')} />
            <SidebarItem icon="notifications-outline"       label="การแจ้งเตือน"  active={active==='notify'}  onPress={()=>setActive('notify')} />
            <SidebarItem icon="information-circle-outline"  label="เกี่ยวกับแอป"    active={active==='about'}   onPress={()=>setActive('about')} />
          </View>

          {/* Main Panel */}
          <ScrollView style={styles.main} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {active === 'profile' && (
              <>
                <View style={styles.card}>
                  <Text style={styles.cardTitle}>ข้อมูลส่วนตัว</Text>

                  <Field label="ชื่อ">
                    <TextInput
                      style={styles.input}
                      value={name}
                      onChangeText={setName}
                      placeholder="ชื่อของคุณ"
                      placeholderTextColor={THEME.muted}
                      editable={!loading}
                    />
                  </Field>

                  <Field label="อีเมล">
                    <TextInput
                      style={[styles.input, styles.inputReadonly]}
                      value={email}
                      editable={false}
                      placeholderTextColor={THEME.muted}
                    />
                  </Field>

                  <Field label="รหัสผ่าน">
                    <PasswordRow onPress={sendReset} email={email} />
                  </Field>

                  <PrimaryButton title="บันทึกข้อมูล" icon="save-outline" onPress={saveProfile} disabled={loading} />
                </View>

                <TouchableOpacity
                  style={[styles.deleteBtn, { marginTop: 16, alignSelf: 'stretch', marginHorizontal: 16 }]}
                  onPress={handleDeleteAccount}
                  disabled={loading}
                  activeOpacity={0.88}
                >
                  <Ionicons name="trash-outline" size={18} color="#fff" />
                  <Text style={styles.primaryBtnText}>ลบบัญชี</Text>
                </TouchableOpacity>
              </>
            )}

            {active === 'notify' && (
              <View style={styles.card}>
                <SectionHeader title="การแจ้งเตือน" subtitle="กำหนดเวลาที่เหมาะกับคุณเพื่อให้แอปเตือนอ่านตามเป้าหมาย" />

                <SettingRow
                  title="เปิดการแจ้งเตือนทั่วไป (รายวัน)"
                  subtitle="แจ้งเตือนทุกวันตามเวลาที่กำหนด"
                  right={
                    <Switch
                      value={notifEnabled}
                      onValueChange={setNotifEnabled}
                      thumbColor={notifEnabled ? '#fff' : '#eee'}
                      trackColor={{ false: 'rgba(255,255,255,0.18)', true: THEME.primary }}
                    />
                  }
                />

                <Field label="เวลาแจ้งเตือน (HH:MM)">
                  <TextInput
                    style={styles.input}
                    value={notifTime}
                    onChangeText={setNotifTime}
                    placeholder="19:00"
                    placeholderTextColor={THEME.muted}
                    keyboardType="numeric"
                  />
                </Field>

                <PrimaryButton title="บันทึกการตั้งค่า" icon="save-outline" onPress={saveNotifications} />

                <HelpNote>
                  Android ต้องเปิด Notification Channel ชื่อ "reading" (ตั้งใน App.js){'\n'}
                  การแจ้งเตือนรายเล่มจากตารางอ่านจะถูกจัดการในหน้าจัดตาราง/แผนการอ่าน
                </HelpNote>
              </View>
            )}

            {active === 'about' && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>เกี่ยวกับแอป</Text>
                <InfoRow k="ชื่อแอป" v="AchieveMe" />
                <InfoRow k="เวอร์ชัน" v={version} />
                <InfoRow k="เฟรมเวิร์ก" v="React Native (Expo)" />
                <InfoRow k="ติดต่อเรา" v="support@example.com" />
              </View>
            )}
          </ScrollView>
        </View>
      </SafeAreaView>

      <FancyPopup
        visible={popup.show}
        mode={popup.mode}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={closePopup}
        onConfirm={popup.onConfirm}
        confirmText={popup.type === 'danger' && popup.mode === 'confirm' ? 'ลบบัญชี' : 'ยืนยัน'}
        cancelText="ยกเลิก"
      />
    </LinearGradient>
  );
}

/* ---------- small parts ---------- */
function SidebarItem({ icon, label, active, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.sideItem, active && styles.sideItemActive]} activeOpacity={0.9}>
      <View style={[styles.sideIconWrap, active && styles.sideIconActive]}>
        <Ionicons name={icon} size={18} color={active ? '#0b1220' : THEME.sub} />
      </View>
      <Text style={[styles.sideText, active && styles.sideTextActive]} numberOfLines={1}>{label}</Text>
      {active && <Ionicons name="chevron-forward" size={16} color={THEME.text} />}
    </TouchableOpacity>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

function PrimaryButton({ title, icon, onPress, disabled }) {
  return (
    <LinearGradient colors={GRAD_PRIMARY} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.primaryBtn, disabled && { opacity: 0.6 }]}>
      <TouchableOpacity style={styles.primaryBtnInner} onPress={onPress} disabled={disabled} activeOpacity={0.9}>
        <Ionicons name={icon} size={18} color="#fff" />
        <Text style={styles.primaryBtnText}>{title}</Text>
      </TouchableOpacity>
    </LinearGradient>
  );
}

function InfoRow({ k, v }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoKey}>{k}</Text>
      <Text style={styles.infoVal}>{v}</Text>
    </View>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSub}>{subtitle}</Text> : null}
    </View>
  );
}

function SettingRow({ title, subtitle, right }) {
  return (
    <View style={styles.settingRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.settingTitle} numberOfLines={1}>{title}</Text>
        {subtitle ? <Text style={styles.settingSub} numberOfLines={2}>{subtitle}</Text> : null}
      </View>
      <View style={{ marginLeft: 12 }}>{right}</View>
    </View>
  );
}

function HelpNote({ children }) {
  return (
    <View style={styles.helpNote}>
      <Ionicons name="alert-circle-outline" size={16} color="#0b1220" />
      <Text style={styles.helpNoteText}>{children}</Text>
    </View>
  );
}

/** กล่องแสดงรหัสผ่าน + ปุ่มเปลี่ยน  */
function PasswordRow({ onPress }) {
  return (
    <View>
      <View style={styles.pwRow}>
        <View style={styles.pwInputWrap}>
          <Ionicons name="lock-closed-outline" size={16} color={THEME.muted} style={{ marginRight: 8 }} />
          <Text style={styles.pwDots}>••••••••</Text>
        </View>

        <TouchableOpacity activeOpacity={0.9} onPress={onPress}>
          <View style={styles.pwBtn}>
            <Ionicons name="key-outline" size={16} color="#0b1220" />
            <Text style={styles.pwBtnText}>เปลี่ยนรหัสผ่าน</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  screen: { flex: 1 },

  headerWrap: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: THEME.text },
  headerBadge: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)', flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderColor: THEME.cardBorder,
  },
  headerBadgeText: { color: THEME.text, fontSize: 12, fontWeight: '700' },
  headerSub: { color: THEME.sub, marginTop: 4 },

  layout: { flex: 1, gap: 12, paddingHorizontal: 12, paddingBottom: 12 },

  // sidebar
  sidebar: {
    backgroundColor: THEME.cardDeep,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    paddingVertical: 6,
  },
  sideItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: 8,
    borderRadius: 12,
    gap: 10,
  },
  sideItemActive: {
    backgroundColor: 'rgba(96,165,250,0.16)',
    borderWidth: 1,
    borderColor: THEME.cardBorder,
  },
  sideIconWrap: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1, borderColor: THEME.cardBorder,
  },
  sideIconActive: { backgroundColor: THEME.text, borderColor: 'transparent' },
  sideText: { color: THEME.text, flex: 1 },
  sideTextActive: { color: THEME.text, fontWeight: '800' },

  // main panel
  main: { flex: 1 },

  card: {
    backgroundColor: THEME.card,
    borderRadius: THEME.radius,
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    marginBottom: 12,
  },
  cardTitle: { fontWeight: '800', color: THEME.text, marginBottom: 14, fontSize: 16 },

  // fields
  label: { color: THEME.muted, marginBottom: 6, fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: THEME.cardBorder,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: THEME.text,
  },
  inputReadonly: { backgroundColor: 'rgba(255,255,255,0.03)', color: THEME.text },

  // buttons
  primaryBtn: { marginTop: 8, height: 46, borderRadius: 12, overflow: 'hidden', justifyContent: 'center' },
  primaryBtnInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8 },
  primaryBtnText: { color: '#fff', fontWeight: '800' },
  deleteBtn: {
    marginTop: 16, height: 46, backgroundColor: THEME.danger,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8, marginBottom: 8,
  },

  // notify section
  sectionTitle: { fontSize: 16, fontWeight: '800', color: THEME.text },
  sectionSub: { color: THEME.muted, marginTop: 4, lineHeight: 18 },

  settingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: THEME.cardBorder,
    borderRadius: 12, marginBottom: 12,
  },
  settingTitle: { color: THEME.text, fontWeight: '800' },
  settingSub: { color: THEME.muted, marginTop: 2, fontSize: 12, lineHeight: 16 },

  // notes & info
  helpNote: {
    marginTop: 12, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#9bdaf7', borderRadius: 10,
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
  },
  helpNoteText: { color: '#0b1220', fontSize: 12, lineHeight: 16, flex: 1 },

  infoRow: {
    paddingVertical: 10, borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row', justifyContent: 'space-between',
  },
  infoKey: { color: THEME.muted },
  infoVal: { color: THEME.text, fontWeight: '800' },

  // ===== Password Row =====
  pwRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pwInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, height: 44, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1, borderColor: THEME.cardBorder,
  },
  pwDots: { color: THEME.text, letterSpacing: 2, fontWeight: '700' },
  pwBtn: {
    height: 44, paddingHorizontal: 12, borderRadius: 12,
    backgroundColor: '#9bdaf7', flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  pwBtnText: { color: '#0b1220', fontWeight: '800' },

  popupOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24,
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
  popupBorder: { width: '100%', maxWidth: 500, padding: 1.2, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  popupCard: { backgroundColor: '#1b1430', borderRadius: 17, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', paddingVertical: 16, paddingHorizontal: 16 },
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
  popupBtnRowSingle: { marginTop: 16, flexDirection: 'row', justifyContent: 'center' },
  popupBtnRow: { marginTop: 16, flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  popupBtnGhost: {
    flex: 1,
    paddingVertical: 11, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center',
  },
  popupBtnGhostText: { color: THEME.text, fontWeight: '800' },
  popupBtnGrad: { flex: 1, borderRadius: 12, overflow: 'hidden', alignItems: 'center' },
  popupBtnText: { color: '#fff', fontWeight: '900', paddingVertical: 11, paddingHorizontal: 16, textAlign: 'center' },
});
