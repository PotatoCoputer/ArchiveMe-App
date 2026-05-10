import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, Platform,
  ScrollView, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { G, Circle } from 'react-native-svg';
import { auth, db } from './firebase';
import { doc, getDoc, collection, getDocs, query, where } from 'firebase/firestore';
import { LinearGradient } from 'expo-linear-gradient';

const THEME = {
  bg: '#0f0a19',
  card: '#1d1530',
  card2: '#1a1325',
  text: '#fdf4ff',
  textDim: '#c4b5fd',
  stroke: 'rgba(255,255,255,0.10)',
  cyan: '#22d3ee',
  mint: '#34d399',
  danger: '#fca5a5',
  warn: '#fde68a',
  grayBtn: 'rgba(255,255,255,0.15)',
  white: '#ffffff',
};
const GRAD_PILL = [THEME.cyan, THEME.mint];

/* ---------- CONST ---------- */
const FALLBACK_MINUTES = 30;
const DEFAULT_DAILY_GOAL = 15;
const STEP_SECONDS = 5 * 60;
const R = 88, STROKE = 12, SIZE = (R + STROKE) * 2, CIRC = 2 * Math.PI * R;

/* ---------- helpers ---------- */
const pad2 = (n)=>String(n).padStart(2,'0');
const todayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0,0,0,0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59,999);
  return { start, end };
};

export default function ReadingTimerScreen({ route, navigation }) {
  const { bookId } = route.params || {};
  const uid = auth.currentUser?.uid;

  const [book, setBook] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(FALLBACK_MINUTES * 60);
  const [running, setRunning] = useState(true);
  const [pagesReadInput, setPagesReadInput] = useState('0');

  // วันนี้อ่านไปแล้วกี่หน้า (ของเล่มนี้)
  const [pagesToday, setPagesToday] = useState(0);

  const tickRef = useRef(null);
  const totalSeconds = useRef(FALLBACK_MINUTES * 60);

  const extractMinutesFromSchedule = (sch, sessionMinutes) => {
    if (sch && typeof sch === 'object') {
      for (const day of Object.keys(sch)) {
        const times = sch[day];
        if (times && typeof times === 'object') {
          for (const t of Object.keys(times)) {
            const m = Number(times[t]);
            if (!Number.isNaN(m) && m > 0) return m;
          }
        }
      }
    }
    const m = Number(sessionMinutes);
    if (!Number.isNaN(m) && m > 0) return m;
    return FALLBACK_MINUTES;
  };

  // โหลดหนังสือ + ตั้งเวลาเริ่มต้น
  useEffect(() => {
    if (!uid || !bookId) return;
    (async () => {
      const snap = await getDoc(doc(db, 'users', uid, 'books', bookId));
      if (!snap.exists()) return;
      const data = { id: snap.id, ...snap.data() };
      setBook(data);

      const initMinutes = extractMinutesFromSchedule(data.readingSchedule, data.sessionMinutes);
      const initSeconds = Math.max(60, Math.round(initMinutes) * 60);
      setSecondsLeft(initSeconds);
      totalSeconds.current = initSeconds;
    })();
  }, [uid, bookId]);

  // หน้าที่อ่านวันนี้จาก subcollection sessions
  useEffect(() => {
    if (!uid || !bookId) return;
    (async () => {
      const { start, end } = todayRange();
      let sum = 0;
      try {
        const qSess = query(
          collection(db, 'users', uid, 'books', bookId, 'sessions'),
          where('createdAt', '>=', start),
          where('createdAt', '<=', end)
        );
        const snap = await getDocs(qSess);
        snap.forEach(s => { sum += Number((s.data() || {}).pagesRead ?? 0) || 0; });
      } catch {}
      setPagesToday(sum);
    })();
  }, [uid, bookId]);

  // timer
  useEffect(() => {
    if (running && secondsLeft > 0) {
      tickRef.current = setInterval(() => setSecondsLeft(s => s - 1), 1000);
    }
    return () => clearInterval(tickRef.current);
  }, [running, secondsLeft]);
  useEffect(() => { if (secondsLeft <= 0 && running) setRunning(false); }, [secondsLeft, running]);

  const display = useMemo(() => {
    const m = Math.floor(secondsLeft / 60), s = secondsLeft % 60;
    return `${m} นาที ${pad2(s)} วินาที`;
  }, [secondsLeft]);

  const addTime = (delta) => {
    setSecondsLeft(prev => {
      const next = Math.max(0, prev + delta);
      totalSeconds.current = Math.max(totalSeconds.current, next);
      return next;
    });
  };
  const handleCancel = () => {
    Alert.alert('ยกเลิกเวลาอ่าน', 'ต้องการยกเลิกการจับเวลาครั้งนี้หรือไม่?', [
      { text: 'ไม่', style: 'cancel' },
      { text: 'ยกเลิก', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };
  const handleFinish = () => {
    const pagesRead = Math.max(0, Number(pagesReadInput) || 0);
    const spent = (totalSeconds.current - secondsLeft);
    const minutesUsed = Math.max(1, Math.round(spent / 60));
    navigation.replace('ReadingSummary', { bookId, minutesUsed, pagesRead });
  };

  // ring progress
  const progress = useMemo(() => {
    const full = totalSeconds.current || 1;
    return Math.min(1, Math.max(0, (full - secondsLeft) / full));
  }, [secondsLeft]);
  const dashOffset = CIRC * (1 - progress);

  // ===== dailyGoal =====
  const dailyGoal = useMemo(() => {
    const g = Number(book?.dailyGoal);
    return Number.isFinite(g) && g > 0 ? g : DEFAULT_DAILY_GOAL;
  }, [book?.dailyGoal]);

  const inputPages = Math.max(0, Number(pagesReadInput) || 0);
  const remainingBookPages = useMemo(() => {
    const total = Number(book?.pages || 0);
    const cur   = Number(book?.currentPage || 0);
    return Math.max(0, total - cur);
  }, [book?.pages, book?.currentPage]);

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{flexDirection:'row', alignItems:'center'}} activeOpacity={0.8}>
          <Ionicons name="arrow-back" size={20} color={THEME.cyan} />
          <Text style={styles.backText}>กลับไปหน้าหนังสือ</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={styles.scrollBody}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Card */}
          <View style={styles.card}>
            {/* Title */}
            <View style={{flexDirection:'row', alignItems:'center', alignSelf:'flex-start', marginBottom: 12}}>
              <View style={styles.bookIcon}><Ionicons name="book-outline" size={20} color={THEME.cyan} /></View>
              <View style={{marginLeft:10}}>
                <Text style={styles.bookTitle} numberOfLines={1}>{book?.title || 'หนังสือ'}</Text>
                <Text style={styles.bookSub}>{book?.category || '-'}</Text>
              </View>
            </View>

            {/* Ring */}
            <View style={styles.circleWrap}>
              <Svg width={SIZE} height={SIZE}>
                <G rotation="-90" originX={SIZE/2} originY={SIZE/2}>
                  <Circle cx={SIZE/2} cy={SIZE/2} r={R} stroke="rgba(255,255,255,0.08)" strokeWidth={STROKE} fill="none" />
                  <Circle cx={SIZE/2} cy={SIZE/2} r={R} stroke={THEME.cyan} strokeWidth={STROKE} fill="none"
                    strokeDasharray={`${CIRC} ${CIRC}`} strokeDashoffset={dashOffset} strokeLinecap="round" />
                </G>
              </Svg>
              <View style={styles.centerContent}>
                <Ionicons name="time-outline" size={20} color={THEME.cyan} />
                <Text style={styles.timerText}>{display}</Text>
              </View>
            </View>

            {/* Controls */}
            <View style={styles.btnRow}>
              <Pill onPress={() => setRunning(v=>!v)} bg={THEME.warn} icon={running ? 'pause' : 'play'} />
              <Pill onPress={() => addTime(-STEP_SECONDS)} bg={THEME.white} icon="remove" />
              <Pill onPress={() => addTime(+STEP_SECONDS)} bg={THEME.white} icon="add" />
              <Pill onPress={handleCancel} bg={THEME.danger} icon="close" />
              <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.pillGrad}>
                <TouchableOpacity onPress={handleFinish} style={styles.pillInner} activeOpacity={0.9}>
                  <Ionicons name="checkmark" size={18} color="#0b1220" />
                </TouchableOpacity>
              </LinearGradient>
            </View>

            {/* Pages input */}
            <View style={{alignSelf:'stretch', marginTop: 12}}>
              <Text style={styles.label}>จำนวนหน้าที่อ่านได้</Text>
              <TextInput
                style={styles.input}
                keyboardType="numeric"
                value={pagesReadInput}
                onChangeText={setPagesReadInput}
                placeholder="0"
                placeholderTextColor={THEME.textDim}
                returnKeyType="done"
              />
            </View>

            {/* This session stats */}
            <View style={styles.statsBox}>
              <Text style={styles.statsTitle}>สถิติการอ่านครั้งนี้</Text>
              <View style={styles.statsRow}>
                <Text style={styles.statsKey}>เวลาที่ใช้ไป:</Text>
                <Text style={styles.statsVal}>{Math.round((totalSeconds.current - secondsLeft)/60)} นาที</Text>
              </View>
              <View style={styles.statsRow}>
                <Text style={styles.statsKey}>หน้าที่อ่านได้:</Text>
                <Text style={styles.statsVal}>{Number(pagesReadInput)||0} หน้า</Text>
              </View>
              <View style={styles.statsRow}>
                <Text style={styles.statsKey}>ความเร็ว:</Text>
                <Text style={styles.statsVal}>
                  {(() => {
                    const spentMin = Math.max(1, Math.round((totalSeconds.current - secondsLeft)/60));
                    const p = Math.max(0, Number(pagesReadInput)||0);
                    return `${(p/spentMin).toFixed(1)} หน้า/นาที`;
                  })()}
                </Text>
              </View>
            </View>

            {/* เป้าวันนี้ + หน้าที่เหลือทั้งเล่ม */}
            <View style={styles.goalTodayBox}>
              <View style={styles.goalLeft}>
                <View style={styles.goalIcon}>
                  <Ionicons name="flag-outline" size={16} color={THEME.cyan} />
                </View>
                <View style={{marginLeft:8}}>
                  <Text style={styles.goalTitle}>วันนี้ควรอ่านอย่างน้อย</Text>
                </View>
              </View>
              <View style={styles.goalRightCol}>
                <Text style={styles.goalValue}>{dailyGoal} หน้า</Text>
              </View>
            </View>

            <Text style={styles.bookRemainLine}>
              หนังสือเล่มนี้เหลืออีก {remainingBookPages} หน้า ถึงจะจบ
            </Text>
          </View>

          <View style={{ height: 24 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* small */
function Pill({ onPress, bg, icon }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.pill, {backgroundColor: bg}]} activeOpacity={0.9}>
      <Ionicons name={icon} size={18} color="#0b1220" />
    </TouchableOpacity>
  );
}

/* styles */
const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor: THEME.bg },
  header:{ paddingHorizontal:16, paddingVertical: Platform.OS === 'android' ? 10 : 12, backgroundColor: THEME.bg, borderBottomWidth:1, borderColor: THEME.stroke },
  backText:{ marginLeft:6, fontWeight:'800', color: THEME.text },

  scrollBody:{ padding: 16 },

  card:{ padding:16, borderRadius:16, backgroundColor: THEME.card, borderWidth:1, borderColor: THEME.stroke },

  bookIcon:{ width:36, height:36, borderRadius:10, backgroundColor:'rgba(255,255,255,0.06)', alignItems:'center', justifyContent:'center' },
  bookTitle:{ fontWeight:'900', color: THEME.text, maxWidth:240 },
  bookSub:{ color: THEME.textDim, fontSize:12 },

  circleWrap:{ alignSelf:'center', width: SIZE, height: SIZE + 12, alignItems:'center', justifyContent:'center', marginTop: 4, marginBottom: 8 },
  centerContent:{ position:'absolute', alignItems:'center', justifyContent:'center' },
  timerText:{ marginTop:4, fontSize:16, fontWeight:'900', color: THEME.text, textAlign:'center' },

  btnRow:{ flexDirection:'row', justifyContent:'space-between', gap:10, marginTop:8 },
  pill:{ flex:1, paddingVertical:12, borderRadius:999, alignItems:'center' },

  pillGrad:{ flex:1, borderRadius:999, overflow:'hidden' },
  pillInner:{ paddingVertical:12, alignItems:'center' },

  label:{ color: THEME.textDim, marginBottom:6 },
  input:{ borderWidth:1, borderColor: THEME.stroke, borderRadius:12, paddingHorizontal:12, paddingVertical:10, color: THEME.text, backgroundColor: THEME.card2 },

  statsBox:{ marginTop:12, padding:12, borderWidth:1, borderColor: THEME.stroke, borderRadius:12, backgroundColor: THEME.card2 },
  statsTitle:{ fontWeight:'900', color: THEME.text, marginBottom:8 },
  statsRow:{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginTop:4 },
  statsKey:{ color: THEME.textDim },
  statsVal:{ color: THEME.text, fontWeight:'900' },

  goalTodayBox:{
    marginTop:12, padding:12, borderWidth:1, borderColor: THEME.stroke, borderRadius:12,
    backgroundColor: THEME.card2, flexDirection:'row', alignItems:'center', justifyContent:'space-between'
  },
  goalLeft:{ flexDirection:'row', alignItems:'center', flex:1 },
  goalIcon:{ width:28, height:28, borderRadius:8, alignItems:'center', justifyContent:'center',
    backgroundColor:'rgba(34,211,238,0.12)', borderWidth:1, borderColor:'rgba(34,211,238,0.35)' },
  goalTitle:{ color: THEME.text, fontWeight:'900' },

  goalRightCol:{ alignItems:'center', justifyContent:'center', minWidth:48 },
  goalValue:{ color: THEME.text, fontWeight:'900', lineHeight:24 },

  bookRemainLine:{ marginTop:6, color: THEME.textDim },
});
