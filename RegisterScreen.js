import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, KeyboardAvoidingView, Platform, ScrollView,
  Modal, Animated
} from 'react-native';
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { auth, db } from './firebase';
import { setDoc, doc, serverTimestamp } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';

function FancyPopupV2({ popup, onClose }) {
  const scale = useRef(new Animated.Value(0.98)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (popup?.visible) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      ]).start();
    } else {
      fade.setValue(0);
      scale.setValue(0.98);
    }
  }, [popup?.visible]);

  if (!popup) return null;

  const meta = {
    success: { icon: 'checkmark-circle', colors: ['#22c55e', '#06b6d4'] },
    error:   { icon: 'close-circle',     colors: ['#ef4444', '#f43f5e'] },
    warning: { icon: 'warning',          colors: ['#f59e0b', '#f43f5e'] },
    info:    { icon: 'information-circle', colors: ['#34D6FF', '#7C4DFF'] },
  }[popup.type || 'info'];

  const actions = popup.actions?.length
    ? popup.actions
    : [{ label: 'ตกลง', variant: 'primary', onPress: onClose }];

  return (
    <Modal visible={!!popup.visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[fpv2.backdrop, { opacity: fade }]}>
        <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={fpv2.glowTL} />
        <View style={fpv2.glowBR} />
      </Animated.View>

      <Animated.View style={[fpv2.centerWrap, { transform: [{ scale }], opacity: fade }]}>
        <View style={fpv2.cardWrap}>
          <LinearGradient colors={['#34D6FF', '#7C4DFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fpv2.borderGrad} />
          <View style={fpv2.card}>
            <BlurView intensity={44} tint="dark" style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={['rgba(8,12,18,0.88)', 'rgba(10,16,24,0.82)']}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />

            <LinearGradient colors={meta.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={fpv2.iconBadge}>
              <Ionicons name={meta.icon} size={28} color="#0b1220" />
            </LinearGradient>

            {!!popup.title && <Text style={fpv2.title}>{popup.title}</Text>}
            {!!popup.message && <Text style={fpv2.message}>{popup.message}</Text>}
            {!!popup.note && <Text style={fpv2.note}>{popup.note}</Text>}

            <View style={fpv2.actions}>
              {actions.map((a, idx) => {
                const isPrimary = a.variant === 'primary';
                const isDanger = a.variant === 'danger';
                const isGhost = a.variant === 'ghost';
                return (
                  <TouchableOpacity
                    key={`${a.label}-${idx}`}
                    activeOpacity={0.9}
                    onPress={() => { onClose?.(); a.onPress?.(); }}
                    style={[fpv2.btn, isGhost && fpv2.btnGhost]}
                  >
                    {(isPrimary || isDanger) && (
                      <LinearGradient
                        colors={isDanger ? ['#ef4444','#f43f5e'] : ['#34D6FF','#7C4DFF']}
                        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                    )}
                    <Text style={[fpv2.btnText, isGhost && { color: '#EAF6FF' }]}>{a.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const fpv2 = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(6,12,17,0.55)' },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  cardWrap: { width: '92%', maxWidth: 520, borderRadius: 20 },
  borderGrad: { ...StyleSheet.absoluteFillObject, borderRadius: 20, opacity: 0.85 },
  card: {
    overflow: 'hidden',
    borderRadius: 18,
    margin: 1.5,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(10,14,20,0.82)',
  },
  iconBadge: {
    alignSelf: 'center',
    width: 62,
    height: 62,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#34D6FF',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
  },
  title: { textAlign: 'center', color: '#EAF6FF', fontWeight: '900', fontSize: 18, marginTop: 2 },
  message: { textAlign: 'center', color: 'rgba(231,245,255,0.95)', marginTop: 8, lineHeight: 20 },
  note: { textAlign: 'center', color: 'rgba(207,227,239,0.9)', marginTop: 8 },
  actions: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  btn: {
    minWidth: 118, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  btnGhost: { backgroundColor: 'rgba(255,255,255,0.06)' },
  btnText: { color: '#0b1220', fontWeight: '900' },
  glowTL: {
    position: 'absolute', width: 280, height: 280, borderRadius: 180, top: -60, left: -60,
    backgroundColor: 'rgba(52,214,255,0.12)', borderWidth: 1, borderColor: 'rgba(52,214,255,0.24)',
  },
  glowBR: {
    position: 'absolute', width: 280, height: 280, borderRadius: 180, bottom: -60, right: -60,
    backgroundColor: 'rgba(124,77,255,0.14)', borderWidth: 1, borderColor: 'rgba(124,77,255,0.28)',
  },
});

/* ================= RegisterScreen ================= */
export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation();

  const [popup, setPopup] = useState({ visible: false });
  const showPopup = (cfg) => setPopup({ visible: true, type: 'info', ...cfg });
  const hidePopup = () => setPopup((p) => ({ ...p, visible: false }));

  const toThaiError = (code) => {
    switch (code) {
      case 'auth/email-already-in-use': return 'อีเมลนี้ถูกใช้สมัครแล้ว';
      case 'auth/invalid-email':        return 'รูปแบบอีเมลไม่ถูกต้อง';
      case 'auth/weak-password':        return 'รหัสผ่านสั้นเกินไป (อย่างน้อย 8 ตัวอักษร)';
      case 'auth/network-request-failed': return 'เครือข่ายขัดข้อง กรุณาลองใหม่';
      default: return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง';
    }
  };

  const handleRegister = async () => {
    const _name = name.trim();
    const _email = email.trim().toLowerCase();
    const _password = password;
    const _confirm = confirmPassword;

    if (!_name || !_email || !_password || !_confirm) {
      showPopup({ type: 'warning', title: 'ข้อมูลไม่ครบ', message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
      return;
    }
    if (_password.length < 8) {
      showPopup({ type: 'warning', title: 'รหัสผ่านสั้นเกินไป', message: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' });
      return;
    }
    if (_password !== _confirm) {
      showPopup({ type: 'error', title: 'รหัสผ่านไม่ตรงกัน', message: 'กรุณาตรวจสอบและลองใหม่อีกครั้ง' });
      return;
    }

    try {
      setLoading(true);
      const { user } = await createUserWithEmailAndPassword(auth, _email, _password);
      await updateProfile(user, { displayName: _name });

      await setDoc(
        doc(db, 'users', user.uid),
        {
          name: _name,
          email: _email,
          photoURL: user.photoURL || null,
          provider: user.providerData?.[0]?.providerId || 'password',
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );

      showPopup({
        type: 'success',
        title: 'ลงทะเบียนสำเร็จ',
        message: 'ยินดีต้อนรับ! ไปตั้งค่าความชอบกันต่อเลย',
        actions: [{ label: 'ไปต่อ', variant: 'primary', onPress: () => navigation.navigate('Questionnaire') }],
      });
    } catch (err) {
      showPopup({ type: 'error', title: 'สมัครไม่สำเร็จ', message: toThaiError(err?.code) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient colors={['#0b1220', '#101c2c', '#0b1220']} start={{ x: 0.8, y: 0 }} end={{ x: 0.1, y: 1 }} style={StyleSheet.absoluteFill} />
      <LinearGradient colors={['rgba(124,77,255,0.14)', 'transparent', 'rgba(52,214,255,0.14)']} start={{ x: 1, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
      <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
      <View style={styles.glowLT} />
      <View style={styles.glowBR} />
      <View style={styles.meshH} />
      <View style={styles.meshV} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {/* Logo */}
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
              <Text style={styles.subtitle}>ลงทะเบียนเพื่อเริ่มต้นใช้งาน</Text>

              {/* Name */}
              <View style={styles.field}>
                <Text style={styles.label}>ชื่อของคุณ</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="person-outline" size={18} color="rgba(207,234,251,0.9)" />
                  <TextInput
                    style={styles.input}
                    placeholder="ชื่อ–นามสกุล"
                    placeholderTextColor="rgba(231,245,255,0.7)"
                    autoCapitalize="words"
                    value={name}
                    onChangeText={setName}
                  />
                </View>
              </View>

              {/* Email */}
              <View style={styles.field}>
                <Text style={styles.label}>อีเมล</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="at-outline" size={18} color="rgba(207,234,251,0.9)" />
                  <TextInput
                    style={styles.input}
                    placeholder="อีเมลของคุณ"
                    placeholderTextColor="rgba(231,245,255,0.7)"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.field}>
                <Text style={styles.label}>รหัสผ่าน</Text>
                <View style={[styles.inputWrap, { paddingRight: 44 }]}>
                  <Ionicons name="lock-closed-outline" size={18} color="rgba(207,234,251,0.9)" />
                  <TextInput
                    style={styles.input}
                    placeholder="อย่างน้อย 8 ตัวอักษร"
                    placeholderTextColor="rgba(231,245,255,0.7)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowPassword(v => !v)}>
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="rgba(211,227,239,0.9)" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View style={styles.field}>
                <Text style={styles.label}>ยืนยันรหัสผ่าน</Text>
                <View style={[styles.inputWrap, { paddingRight: 44 }]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="rgba(207,234,251,0.9)" />
                  <TextInput
                    style={styles.input}
                    placeholder="พิมพ์รหัสผ่านอีกครั้ง"
                    placeholderTextColor="rgba(231,245,255,0.7)"
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showConfirm}
                    autoCapitalize="none"
                  />
                  <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowConfirm(v => !v)}>
                    <Ionicons name={showConfirm ? 'eye-off' : 'eye'} size={20} color="rgba(211,227,239,0.9)" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* CTA */}
              <TouchableOpacity
                style={[styles.button, loading && { opacity: 0.7 }]}
                onPress={handleRegister}
                disabled={loading}
                activeOpacity={0.9}
              >
                <LinearGradient colors={['#34D6FF', '#7C4DFF']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFill} />
                {loading ? <ActivityIndicator color="#0D1016" /> : <Text style={styles.buttonText}>ลงทะเบียน</Text>}
              </TouchableOpacity>

              <Text style={styles.switchText}>
                มีบัญชีอยู่แล้ว?{' '}
                <Text style={styles.link} onPress={() => navigation.navigate('Login')}>
                  เข้าสู่ระบบ
                </Text>
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <FancyPopupV2 popup={popup} onClose={hidePopup} />
    </View>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b1220' },
  body: { flexGrow: 1, justifyContent: 'center', padding: 20 },

  // Logo
  logoWrap: {
    alignSelf: 'center',
    width: 110,
    height: 110,
    borderRadius: 28,
    backgroundColor: 'rgba(124,77,255,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(124,77,255,0.30)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  logoImg: { width: 72, height: 72 },

  // Card
  cardWrap: {
    borderRadius: 20,
    shadowColor: '#2EE1FF',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 20,
    opacity: 0.85,
  },
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 18,
    margin: 1.5,
    padding: 18,
    backgroundColor: 'rgba(10,12,18,0.56)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  cardBlur: { ...StyleSheet.absoluteFillObject },
  cardInnerBg: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 10,
    bottom: 10,
    borderRadius: 16,
    backgroundColor: 'rgba(8,10,16,0.6)',
  },

  brand: { textAlign: 'center', fontSize: 22, fontWeight: '900', color: '#EAF6FF', letterSpacing: 0.2 },
  subtitle: { textAlign: 'center', color: 'rgba(234,246,255,0.86)', marginTop: 4, marginBottom: 14 },

  field: { marginBottom: 12 },
  label: { color: '#EAF6FF', fontWeight: '800', marginBottom: 6 },

  inputWrap: {
    height: 48, borderRadius: 14, paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row', alignItems: 'center',
  },
  input: { flex: 1, color: '#F7FBFF', paddingVertical: 0, marginLeft: 10 },
  eyeBtn: { position: 'absolute', right: 10, height: 48, width: 32, alignItems: 'center', justifyContent: 'center' },

  button: { marginTop: 10, height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  buttonText: { color: '#0D1016', fontWeight: '900', fontSize: 16, letterSpacing: 0.2 },

  switchText: { marginTop: 14, textAlign: 'center', color: 'rgba(231,245,255,0.86)' },
  link: { color: '#34D6FF', fontWeight: '900', letterSpacing: 0.2 },

  glowLT: {
    position: 'absolute', width: 260, height: 260, borderRadius: 180, top: -70, left: -70,
    backgroundColor: 'rgba(52,214,255,0.10)', borderWidth: 1, borderColor: 'rgba(52,214,255,0.22)',
  },
  glowBR: {
    position: 'absolute', width: 260, height: 260, borderRadius: 180, bottom: -70, right: -70,
    backgroundColor: 'rgba(124,77,255,0.12)', borderWidth: 1, borderColor: 'rgba(124,77,255,0.24)',
  },
  meshH: { position: 'absolute', left: 18, right: 18, top: '24%', height: 1, backgroundColor: 'rgba(231,245,255,0.06)' },
  meshV: { position: 'absolute', top: 92, bottom: 120, left: 24, width: 1, backgroundColor: 'rgba(231,245,255,0.06)' },
});
