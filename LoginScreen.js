import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
  Animated,
} from 'react-native';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';

function NeonAlert({ visible, title, message, onClose }) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 160, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]).start();
    } else {
      scale.setValue(0.9);
      opacity.setValue(0);
    }
  }, [visible]);

  return (
    <Modal transparent visible={visible} animationType="none" onRequestClose={onClose}>
      <Pressable style={styles.alertBackdrop} onPress={onClose}>
        <View />
      </Pressable>

      <View pointerEvents="box-none" style={styles.alertCenter}>
        <Animated.View style={[styles.alertWrap, { transform: [{ scale }], opacity }]}>
          <LinearGradient
            colors={['#34D6FF', '#7C4DFF', '#FFB547']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.alertBorder}
          />
          <View style={styles.alertCard}>
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
            <View style={styles.alertInnerBg} />

            <View style={styles.alertHeader}>
              <View style={styles.alertIconWrap}>
                <Ionicons name="alert-circle" size={24} color="#FFB547" />
              </View>
              <Text style={styles.alertTitle} numberOfLines={2}>
                {title || 'แจ้งเตือน'}
              </Text>
            </View>

            <Text style={styles.alertMessage}>{message || 'เกิดข้อผิดพลาด'}</Text>

            <TouchableOpacity onPress={onClose} activeOpacity={0.9} style={styles.alertBtn}>
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
    </Modal>
  );
}

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const [alertData, setAlertData] = useState({ visible: false, title: '', message: '' });

  const normEmail = email.trim().toLowerCase();
  const canSubmit = normEmail.length > 0 && password.length >= 6 && !loading;

  const errorToThai = (codeOrMsg = '') => {
    const s = String(codeOrMsg);
    if (s.includes('invalid-credential') || s.includes('wrong-password')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    if (s.includes('user-not-found')) return 'ไม่พบบัญชีนี้ในระบบ';
    if (s.includes('too-many-requests')) return 'พยายามเข้าสู่ระบบหลายครั้งเกินไป โปรดลองใหม่ภายหลัง';
    if (s.includes('network-request-failed')) return 'เครือข่ายมีปัญหา ตรวจสอบอินเทอร์เน็ตแล้วลองใหม่';
    if (s.includes('user-disabled')) return 'บัญชีผู้ใช้นี้ถูกปิดใช้งาน';
    return s.replace('Firebase:', '').replace('auth/', '').replace(/-/g, ' ').trim() || 'ไม่สามารถเข้าสู่ระบบได้';
  };

  const showAlert = (title, message) => setAlertData({ visible: true, title, message });
  const hideAlert = () => setAlertData((d) => ({ ...d, visible: false }));

  const handleLogin = async () => {
    if (!canSubmit) return;
    try {
      setLoading(true);
      const userCredential = await signInWithEmailAndPassword(auth, normEmail, password);
      const user = userCredential.user;
      const docRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(docRef);
      const role = docSnap?.data()?.role || 'user';
      if (role === 'admin') navigation.replace('AdminDrawer');
      else if (role === 'moderator') navigation.replace('Main');
      else navigation.replace('Main');
    } catch (error) {
      showAlert('เข้าสู่ระบบไม่สำเร็จ', errorToThai(error?.code || error?.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={['#0b1220', '#10243a', '#0b1220']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(124,245,209,0.12)', 'transparent', 'rgba(124,77,255,0.12)']}
        start={{ x: 0, y: 1 }}
        end={{ x: 1, y: 0 }}
        style={StyleSheet.absoluteFill}
      />
      <BlurView intensity={26} tint="dark" style={StyleSheet.absoluteFill} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
      >
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.logoWrap}>
            <Image source={require('./assets/Logo.png')} style={styles.logoImg} resizeMode="contain" />
          </View>

          <View style={styles.cardNeonWrap}>
            <LinearGradient
              colors={['#34D6FF', '#7C4DFF', '#FFB547']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.cardBorder}
            />
            <View style={styles.card}>
              <BlurView intensity={52} tint="dark" style={styles.cardBlur} />
              <View style={styles.cardInnerBg} />

              <Text style={styles.brand}>AchieveMe</Text>
              <Text style={styles.subtitle}>กำหนดเป้าหมายการอ่านหนังสือด้วยตัวคุณเอง</Text>

              {/* Email */}
              <View style={styles.field}>
                <Text style={styles.label}>อีเมล</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.75)" />
                  <TextInput
                    style={styles.input}
                    placeholder="อีเมลของคุณ"
                    placeholderTextColor="rgba(247,251,255,0.55)"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="next"
                    textContentType="username"
                  />
                </View>
              </View>

              {/* Password */}
              <View style={styles.field}>
                <Text style={styles.label}>รหัสผ่าน</Text>
                <View style={styles.inputWrap}>
                  <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.75)" />
                  <TextInput
                    style={[styles.input, { paddingRight: 44 }]}
                    placeholder="รหัสผ่านของคุณ"
                    placeholderTextColor="rgba(247,251,255,0.55)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    returnKeyType="done"
                    textContentType="password"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    style={styles.eyeBtn}
                    onPress={() => setShowPassword((v) => !v)}
                    disabled={loading}
                  >
                    <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={20} color="rgba(255,255,255,0.75)" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* ปุ่ม */}
              <TouchableOpacity
                style={[styles.button, !canSubmit && { opacity: 0.6 }]}
                onPress={handleLogin}
                disabled={!canSubmit}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#34D6FF', '#7C4DFF']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.buttonText}>{loading ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}</Text>
              </TouchableOpacity>

              {/* ลิงก์ */}
              <View style={styles.bottomRow}>
                <Text style={styles.muted}>ยังไม่มีบัญชี? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Register')} disabled={loading}>
                  <Text style={styles.link}>ลงทะเบียน</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  onPress={() => navigation.navigate('Forgot', { prefillEmail: normEmail })}
                  disabled={loading}
                >
                  <Text style={styles.link}>ลืมรหัสผ่าน?</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <NeonAlert
        visible={alertData.visible}
        title={alertData.title}
        message={alertData.message}
        onClose={hideAlert}
      />
    </View>
  );
}

/* ===== Styles ===== */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b1220' },
  body: { flexGrow: 1, justifyContent: 'center', padding: 20 },

  // โลโก้
  logoWrap: {
    alignSelf: 'center',
    width: 120,
    height: 120,
    borderRadius: 24,
    backgroundColor: 'rgba(52,214,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(52,214,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  logoImg: { width: 78, height: 78 },

  cardNeonWrap: {
    borderRadius: 18,
    shadowColor: '#34D6FF',
    shadowOpacity: 0.25,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 6,
  },
  cardBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    opacity: 0.85,
  },
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 16,
    margin: 1.5,
    padding: 18,
    backgroundColor: 'rgba(10,12,18,0.50)',
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
    borderRadius: 14,
    backgroundColor: 'rgba(8,10,16,0.65)',
  },

  brand: { textAlign: 'center', fontSize: 24, fontWeight: '900', color: '#F7FBFF' },
  subtitle: { textAlign: 'center', color: 'rgba(247,251,255,0.78)', marginTop: 4, marginBottom: 16 },

  field: { marginBottom: 12 },
  label: { color: '#F7FBFF', fontWeight: '800', marginBottom: 6 },

  inputWrap: {
    height: 48,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  input: { flex: 1, color: '#F7FBFF', paddingVertical: 0, marginLeft: 10 },
  eyeBtn: { position: 'absolute', right: 10, padding: 6 },

  button: {
    marginTop: 8,
    height: 50,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonText: { color: '#0D1016', fontWeight: '900', fontSize: 16 },

  bottomRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  muted: { color: 'rgba(247,251,255,0.65)' },
  link: { color: '#34D6FF', fontWeight: '900' },

  alertBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5, 8, 13, 0.55)',
  },
  alertCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  alertWrap: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 18,
  },
  alertBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 18,
    opacity: 0.9,
  },
  alertCard: {
    margin: 1.5,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,12,18,0.6)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
  },
  alertInnerBg: {
    position: 'absolute',
    left: 10,
    right: 10,
    top: 10,
    bottom: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(8,10,16,0.6)',
  },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  alertIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,181,71,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,181,71,0.35)',
  },
  alertTitle: { color: '#EAF6FF', fontWeight: '900', fontSize: 16, flex: 1 },
  alertMessage: { color: 'rgba(234,246,255,0.86)', marginTop: 8, lineHeight: 20 },
  alertBtn: {
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginTop: 14,
  },
  alertBtnText: { color: '#0D1016', fontWeight: '900' },
});
