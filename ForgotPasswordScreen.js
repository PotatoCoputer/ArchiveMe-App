import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Platform,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { sendPasswordResetEmail } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { auth } from './firebase';

function MistAlert({ visible, mode = 'info', title, message, onClose }) {
  const scale = useRef(new Animated.Value(0.98)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.98);
      opacity.setValue(0);
    }
  }, [visible]);

  const palette =
    mode === 'success'
      ? { tintBg: 'rgba(124,245,209,0.14)', tintBorder: 'rgba(124,245,209,0.35)', icon: 'checkmark-circle', iconColor: '#7CF5D1' }
      : mode === 'error'
      ? { tintBg: 'rgba(255,181,71,0.12)', tintBorder: 'rgba(255,181,71,0.35)', icon: 'alert-circle', iconColor: '#FFB547' }
      : { tintBg: 'rgba(52,214,255,0.12)', tintBorder: 'rgba(52,214,255,0.35)', icon: 'information-circle', iconColor: '#34D6FF' };

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <View style={styles.alertBackdrop}>
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      </View>

      {/* center */}
      <View style={styles.alertCenter} pointerEvents="box-none">
        <Animated.View style={[styles.alertWrap, { transform: [{ scale }], opacity }]}>
          <LinearGradient
            colors={['#34D6FF', '#7C4DFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.alertBorder}
          />
          <View style={styles.alertCard}>
            <BlurView intensity={42} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.alertInnerBg} />

            <View style={[styles.alertIconRow, { backgroundColor: palette.tintBg, borderColor: palette.tintBorder }]}>
              <Ionicons name={palette.icon} size={22} color={palette.iconColor} />
              <Text style={styles.alertTitle} numberOfLines={2}>{title || 'แจ้งเตือน'}</Text>
            </View>

            <Text style={styles.alertMsg}>{message || 'ดำเนินการเสร็จสมบูรณ์'}</Text>

            <TouchableOpacity activeOpacity={0.9} onPress={onClose} style={styles.alertBtn}>
              <LinearGradient
                colors={['#34D6FF', '#7C4DFF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <Text style={styles.alertBtnText}>ตกลง</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>

      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
    </Modal>
  );
}

export default function ForgotPasswordScreen({ navigation, route }) {
  const [email, setEmail] = useState(route?.params?.prefillEmail || '');
  const [loading, setLoading] = useState(false);

  const [popup, setPopup] = useState({ visible: false, mode: 'info', title: '', message: '', onClose: null });

  const canSubmit = useMemo(() => email.trim().length > 0 && !loading, [email, loading]);

  const showPopup = (mode, title, message, onClose) =>
    setPopup({ visible: true, mode, title, message, onClose: onClose || (() => setPopup((p) => ({ ...p, visible: false }))) });

  const hidePopup = () => {
    const cb = popup.onClose;
    setPopup((p) => ({ ...p, visible: false }));
    setTimeout(() => cb && cb(), 10);
  };

  const handleSend = async () => {
    if (!canSubmit) return;
    try {
      setLoading(true);
      await sendPasswordResetEmail(auth, email.trim());
      showPopup(
        'success',
        'ส่งอีเมลแล้ว',
        'เราได้ส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปที่อีเมลของคุณ โปรดตรวจสอบกล่องจดหมาย',
        () => navigation.replace('Login')
      );
    } catch (err) {
      const msg =
        err?.message?.replace('Firebase:', '').replace('auth/', '').replace(/-/g, ' ') ||
        'ไม่สามารถส่งอีเมลรีเซ็ตรหัสผ่านได้';
      showPopup('error', 'เกิดข้อผิดพลาด', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#0b1220', '#101c2c', '#0b1220']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(52,214,255,0.14)', 'transparent', 'rgba(124,77,255,0.14)']}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.glowTR} />
      <View style={styles.glowBL} />
      <View style={styles.meshH} />
      <View style={styles.meshV} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* โลโก้ */}
          <View style={styles.logoWrap}>
            <Image source={require('./assets/Logo.png')} style={styles.logoImg} resizeMode="contain" />
          </View>

          {/* Card */}
          <View style={styles.cardWrap}>
            <LinearGradient colors={['#34D6FF', '#7C4DFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.cardBorder} />
            <View style={styles.card}>
              <BlurView intensity={46} tint="dark" style={styles.cardBlur} />
              <View style={styles.cardInnerBg} />

              <Text style={styles.brand}>AchieveMe</Text>
              <Text style={styles.subtitle}>กู้คืนการเข้าถึงบัญชีของคุณ</Text>

              <View style={styles.helper}>
                <Ionicons name="information-circle-outline" size={16} color="#CFEAFB" />
                <Text style={styles.helperText}>ใส่อีเมลที่ใช้สมัคร แล้วเราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้คุณ</Text>
              </View>

              {/* Email */}
              <View style={styles.field}>
                <Text style={styles.label}>อีเมล</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="at-outline" size={18} color="rgba(207,234,251,0.9)" />
                  <TextInput
                    style={styles.input}
                    placeholder="อีเมลที่ใช้ลงทะเบียน"
                    placeholderTextColor="rgba(231,245,255,0.7)"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="send"
                    onSubmitEditing={handleSend}
                  />
                </View>
              </View>

              {/* ปุ่มยืนยัน */}
              <TouchableOpacity
                style={[styles.button, !canSubmit && { opacity: 0.6 }]}
                onPress={handleSend}
                disabled={!canSubmit}
                activeOpacity={0.9}
              >
                <LinearGradient colors={['#34D6FF', '#7C4DFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                <Text style={styles.buttonText}>{loading ? 'กำลังส่งลิงก์…' : 'ยืนยันส่งลิงก์รีเซ็ต'}</Text>
              </TouchableOpacity>

              {/* ลิงก์กลับ */}
              <View style={styles.bottomRow}>
                <TouchableOpacity onPress={() => navigation.replace('Login')} activeOpacity={0.85}>
                  <Text style={styles.link}>
                    <Ionicons name="arrow-back" size={14} /> กลับไปหน้าเข้าสู่ระบบ
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ===== Popup ===== */}
      <MistAlert
        visible={popup.visible}
        mode={popup.mode}
        title={popup.title}
        message={popup.message}
        onClose={hidePopup}
      />
    </View>
  );
}

/*  Styles  */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b1220' },
  body: { flexGrow: 1, justifyContent: 'center', padding: 20 },

  
  logoWrap: {
    alignSelf: 'center',
    width: 110, height: 110, borderRadius: 28,
    backgroundColor: 'rgba(52,214,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(52,214,255,0.30)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 12,
  },
  logoImg: { width: 72, height: 72 },

  
  cardWrap: {
    borderRadius: 20,
    shadowColor: '#2EE1FF',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  cardBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 20, opacity: 0.85 },
  card: {
    position: 'relative', overflow: 'hidden',
    borderRadius: 18, margin: 1.5, padding: 18,
    backgroundColor: 'rgba(10,12,18,0.56)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  cardBlur: { ...StyleSheet.absoluteFillObject },
  cardInnerBg: {
    position: 'absolute', left: 10, right: 10, top: 10, bottom: 10,
    borderRadius: 16, backgroundColor: 'rgba(8,10,16,0.6)',
  },

  brand: { textAlign: 'center', fontSize: 22, fontWeight: '900', color: '#EAF6FF', letterSpacing: 0.2 },
  subtitle: { textAlign: 'center', color: 'rgba(234,246,255,0.86)', marginTop: 4, marginBottom: 14 },

  helper: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 10, borderRadius: 12,
    backgroundColor: 'rgba(52,214,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(52,214,255,0.28)',
    marginBottom: 10,
  },
  helperText: { color: '#CFEAFB', flex: 1, lineHeight: 18 },

  field: { marginBottom: 12 },
  label: { color: '#EAF6FF', fontWeight: '800', marginBottom: 6 },

  inputWrap: {
    height: 48, borderRadius: 14, paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row', alignItems: 'center',
  },
  input: { flex: 1, color: '#F7FBFF', paddingVertical: 0, marginLeft: 10 },

  button: {
    marginTop: 8, height: 50, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  buttonText: { color: '#0D1016', fontWeight: '900', fontSize: 16, letterSpacing: 0.2 },

  bottomRow: { alignItems: 'center', marginTop: 14 },
  link: { color: '#34D6FF', fontWeight: '900', letterSpacing: 0.2 },

  glowTR: {
    position: 'absolute', width: 260, height: 260, borderRadius: 180,
    top: -70, right: -70, backgroundColor: 'rgba(124,77,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(124,77,255,0.24)',
  },
  glowBL: {
    position: 'absolute', width: 260, height: 260, borderRadius: 180,
    bottom: -70, left: -70, backgroundColor: 'rgba(52,214,255,0.10)',
    borderWidth: 1, borderColor: 'rgba(52,214,255,0.22)',
  },
  meshH: { position: 'absolute', left: 18, right: 18, top: '26%', height: 1, backgroundColor: 'rgba(231,245,255,0.06)' },
  meshV: { position: 'absolute', top: 100, bottom: 120, right: 26, width: 1, backgroundColor: 'rgba(231,245,255,0.06)' },

  alertBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,8,13,0.45)' },
  alertCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', padding: 22 },
  alertWrap: { width: '100%', maxWidth: 420, borderRadius: 18 },
  alertBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 18, opacity: 0.75 },
  alertCard: {
    margin: 1.5, borderRadius: 16, overflow: 'hidden',
    backgroundColor: 'rgba(10,12,18,0.62)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
  },
  alertInnerBg: {
    position: 'absolute', left: 10, right: 10, top: 10, bottom: 10,
    borderRadius: 14, backgroundColor: 'rgba(8,10,16,0.55)',
  },
  alertIconRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: 8, borderRadius: 12, borderWidth: 1,
  },
  alertTitle: { color: '#EAF6FF', fontWeight: '900', fontSize: 16, flex: 1 },
  alertMsg: { color: 'rgba(234,246,255,0.9)', marginTop: 10, lineHeight: 20 },
  alertBtn: {
    height: 46, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', marginTop: 14,
  },
  alertBtnText: { color: '#0D1016', fontWeight: '900' },
});
