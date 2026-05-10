import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  FlatList,
  TextInput,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  LayoutAnimation,
  UIManager,
  Animated,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Calendar from 'expo-calendar';

import { auth, db } from './firebase';
import {
  collection,
  doc,
  onSnapshot,
  query,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';

import { generateOllama, DEFAULT_MODEL } from './ollamaClient';

/* ===== Theme: Aurora Teal (ตัดกับเมนู) ===== */
const PALETTE = {
  bgStart: '#0b1020',
  bgMid:   '#0f1a2c',
  bgEnd:   '#0c2b3a',

  text:     '#EAF6FF',
  textDim:  '#A7D8F0',
  textSoft: '#8ABFD6',

  cardBorder: 'rgba(173,235,255,0.25)',
  cardGlass:  'rgba(7,17,31,0.72)',
  cardSoft:   'rgba(10,28,40,0.86)',

  primary1: '#06b6d4',
  primary2: '#22d3ee',
  mint:     '#a3e635',
  sky:      '#67e8f9',
  rose:     '#F43F5E',

  slotBg:           '#0a1b27',
  slotHead:         '#0d2230',
  slotActiveBg:     'rgba(34,211,238,0.16)',
  slotActiveBorder: '#22d3ee',
  slotBusyBg:       'rgba(244,63,94,0.10)',
  slotBusyBorder:   'rgba(244,63,94,0.55)',
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ===== Constants =====
const DAYS = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์'];
const HOURS = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);
const MIN_MIN = 10, MAX_MIN = 180, STEP_MIN = 5;
const CHAT_HEIGHT = Math.min(Math.round(Dimensions.get('window').height * 0.5), 440);
const RANDOM_ALLOWED_DAYS = new Set(['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์']);
const wait = (ms) => new Promise(res => setTimeout(res, ms));
const SOFT_PAUSE = new Set([',', '，', '、', '؛']);
const HARD_PAUSE = new Set(['.', '!', '?', '…', '\n', '—', '–', 'ฯ', 'ๆ', ';', '：']);
const genId = () => `${Date.now()}_${Math.random().toString(36).slice(2,9)}`;
const welcomeMessage = () => ({
  id: genId(),
  from: 'ai',
  text: 'สวัสดี! ผู้ช่วย ArchiveMe พร้อมช่วยจัดตารางและตอบคำถามการอ่าน 😊',
  ts: Date.now(),
});

const toHourOnly = (hhmm) => {
  const [H] = String(hhmm || '00:00').split(':');
  const h = String(Math.max(0, Math.min(23, parseInt(H, 10) || 0))).padStart(2, '0');
  return `${h}:00`;
}

const extractFirstJson = (raw) => {
  if (!raw) return null;
  let s = String(raw).replace(/```(?:json)?/gi, '```');

  let start = -1, depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const chunk = s.slice(start, i + 1);
        try { return JSON.parse(chunk); } catch {}
      }
    }
  }
  try { return JSON.parse(s.trim()); } catch {}
  const inline = s.replace(/```/g, '').trim();
  try { return JSON.parse(inline); } catch {}
  return null;
};

// ===== Conversation memory helpers =====
const HISTORY_MAX = 12;

const buildHistoryContext = ({ messages, selectedBook, sessionMinutes, selected, lastAISets }) => {
  const recent = (messages || []).slice(-HISTORY_MAX).map(m => {
    const role = m.from === 'user' ? 'User' : 'Assistant';
    return `${role}: ${m.text}`;
  }).join('\n');

  let state = [];
  if (selectedBook?.title) state.push(`หนังสือ: ${selectedBook.title}`);
  if (sessionMinutes) state.push(`นาที/ครั้ง: ${sessionMinutes}`);
  if (selected?.size) state.push(`จำนวนช่องเวลาเลือกไว้: ${selected.size}`);
  if (lastAISets && Object.keys(lastAISets).length) state.push(`มีชุดสุ่มล่าสุด: ${Object.keys(lastAISets).join(', ')}`);
  const stateLine = state.length ? state.join(' | ') : '—';

  return `ประวัติสนทนาล่าสุด:\n${recent || '(ยังไม่มีประวัติ)'}\n\nบริบท: ${stateLine}`;
};

const buildChatPrompt = ({ system, historyCtx, question }) =>
  `${historyCtx}

คำถามล่าสุดของผู้ใช้: ${question}

คำสั่งระบบ: โปรดตอบเป็นภาษาไทยทั้งหมด ให้ชัดเจน กระชับ และอิงจากบริบท/ประวัติด้านบนเท่านั้น`;

const buildJsonTaskPrompt = ({ historyCtx, taskSpec }) =>
  `${historyCtx}

ข้อกำหนดสำคัญของคำตอบ: 
- ตอบเป็น "JSON ล้วน" เท่านั้น (เริ่มด้วย { และจบด้วย })
- ห้ามมี Markdown หรือคำบรรยายอื่นใดนอกเหนือ JSON

${taskSpec}`;

/* ===== Tiny UI helpers ===== */
function TypingDots() {
  const [dots, setDots] = useState('.');
  useEffect(() => {
    const t = setInterval(() => setDots(prev => (prev.length >= 3 ? '.' : prev + '.')), 450);
    return () => clearInterval(t);
  }, []);
  return <Text style={styles.msgAiText}>กำลังพิมพ์คำตอบ{dots}</Text>;
}

function TabPill({ active, icon, label, onPress }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => Animated.spring(scale, { toValue: 0.97, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();

  return (
    <Animated.View style={{ flex:1, transform:[{ scale }] }}>
      <TouchableOpacity
        style={[styles.tabBtn, active && styles.tabBtnActive]}
        onPress={onPress}
        activeOpacity={0.9}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
      >
        {active ? (
          <LinearGradient
            colors={[PALETTE.primary1, PALETTE.primary2]}
            start={{x:0,y:0}} end={{x:1,y:1}}
            style={styles.tabGrad}
          />
        ) : null}
        <Ionicons
          name={icon}
          size={16}
          color={active ? '#ffffff' : PALETTE.textDim}
          style={{ zIndex:1 }}
        />
        <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

function useFancyPopup() {
  const [popup, setPopup] = useState({
    visible: false,
    type: 'info', 
    title: '',
    message: '',
    note: '',
    actions: [], 
  });

  const show = (cfg) => setPopup({ visible: true, ...cfg });
  const hide = () => setPopup(p => ({ ...p, visible: false }));
  return { popup, show, hide, setPopup };
}

function FancyPopup({ popup, onClose }) {
  const scale = useRef(new Animated.Value(0.9)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (popup.visible) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 7, tension: 60, useNativeDriver: true }),
      ]).start();
    } else {
      fade.setValue(0);
      scale.setValue(0.9);
    }
  }, [popup.visible]);

  const iconByType = {
    success: { name: 'checkmark-circle', colors: ['#22c55e', '#06b6d4'] },
    error:   { name: 'close-circle',     colors: ['#ef4444', '#f43f5e'] },
    warning: { name: 'warning',          colors: ['#f59e0b', '#f43f5e'] },
    info:    { name: 'information-circle-outline', colors: ['#06b6d4', '#22d3ee'] },
  };
  const meta = iconByType[popup.type] || iconByType.info;

  return (
    <Modal visible={popup.visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.popOverlay, { opacity: fade }]}>
        <Animated.View style={[styles.popCard, { transform: [{ scale }] }]}>
          <LinearGradient
            colors={['rgba(34,211,238,0.18)','rgba(6,182,212,0.10)']}
            start={{x:0,y:0}} end={{x:1,y:1}}
            style={styles.popAurora}
          />
          <View style={styles.popIconWrap}>
            <LinearGradient colors={meta.colors} style={styles.popIconGrad} start={{x:0,y:0}} end={{x:1,y:1}}>
              <Ionicons name={meta.name} size={28} color="#fff" />
            </LinearGradient>
          </View>

          {!!popup.title && <Text style={styles.popTitle}>{popup.title}</Text>}
          {!!popup.message && <Text style={styles.popMsg}>{popup.message}</Text>}
          {!!popup.note && <Text style={styles.popNote}>{popup.note}</Text>}

          <View style={styles.popActions}>
            {(popup.actions?.length ? popup.actions : [
              { label: 'ตกลง', variant: 'primary', onPress: onClose }
            ]).map((a, idx) => (
              <TouchableOpacity
                key={`${a.label}-${idx}`}
                onPress={() => { onClose?.(); a.onPress?.(); }}
                activeOpacity={0.9}
                style={[
                  styles.popBtn,
                  a.variant === 'primary' && styles.popBtnPrimary,
                  a.variant === 'danger' && styles.popBtnDanger,
                ]}
              >
                {a.variant === 'primary' ? (
                  <LinearGradient colors={[PALETTE.primary1, PALETTE.primary2]} style={styles.popBtnGrad} start={{x:0,y:0}} end={{x:1,y:1}} />
                ) : a.variant === 'danger' ? (
                  <LinearGradient colors={['#ef4444','#f43f5e']} style={styles.popBtnGrad} start={{x:0,y:0}} end={{x:1,y:1}} />
                ) : null}
                <Text style={styles.popBtnText}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ========= Component =========
export default function ScheduleScreen() {
  const uid = auth.currentUser?.uid;

  // หนังสือ
  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);

  // เลือกหนังสือ
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedBookId, setSelectedBookId] = useState(null);
  const selectedBook = useMemo(
    () => books.find(b => b.id === selectedBookId) || null,
    [books, selectedBookId]
  );

  // แท็บ
  const [activeTab, setActiveTab] = useState('schedule'); // 'schedule' | 'ask'

  // ตาราง
  const [selected, setSelected] = useState(new Set()); // key "วัน|เวลา"
  const [sessionMinutes, setSessionMinutes] = useState(30);

  // แชท
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [tipMode, setTipMode] = useState(false);
  const [aiTyping, setAiTyping] = useState(false);
  const chatRef = useRef(null);

  // ปฏิทิน
  const [lastSavedSchedule, setLastSavedSchedule] = useState(null);
  const [calendarBusy, setCalendarBusy] = useState(false);

  // บันทึกก่อน AI ปรับ เพื่อ undo + แสดง diff
  const [lastSelectedBeforeAI, setLastSelectedBeforeAI] = useState(null);
  const [lastAIDiff, setLastAIDiff] = useState(null); // {added, removed}

  // เก็บแผนสุ่ม A–F ล่าสุด
  const [lastAISets, setLastAISets] = useState(null); // { A: { sel:Set, minutes:number }, ... }

  // ===== Fancy Popup hook/state =====
  const { popup, show: showPopup, hide: hidePopup } = useFancyPopup();

  // ====== INDEX “ไม่ว่าง/ชนตาราง” จากเล่มอื่น ๆ ======
  const busyIndex = useMemo(() => {
    const map = {};
    for (const b of books) {
      if (b.id === selectedBookId) continue; 
      if (b?.readingSchedule && typeof b.readingSchedule === 'object') {
        Object.keys(b.readingSchedule).forEach(day => {
          Object.keys(b.readingSchedule[day] || {}).forEach(time => {
            const t00 = toHourOnly(time);
            const key = `${day}|${t00}`;
            (map[key] ||= []).push(b.title || '(ไม่มีชื่อ)');
          });
        });
      }
      // รองรับข้อมูลเก่า readingDays + readingTime
      else if (Array.isArray(b?.readingDays) && b?.readingTime) {
        const t00 = toHourOnly(b.readingTime);
        b.readingDays.forEach(day => {
          const key = `${day}|${t00}`;
          (map[key] ||= []).push(b.title || '(ไม่มีชื่อ)');
        });
      }
    }
    return map;
  }, [books, selectedBookId]);

  // Utils selection
  const selectionUnion = (a, b) => {
    const out = new Set(a);
    for (const x of b) out.add(x);
    return out;
  };
  const selectionDiff = (beforeSet, afterSet) => {
    const before = new Set(beforeSet || []);
    the_after = new Set(afterSet || []); 
    const after = the_after;
    const added = Array.from(after).filter(x => !before.has(x));
    const removed = Array.from(before).filter(x => !after.has(x));
    return { added, removed };
  };
  const clampMinutes = (m) => Math.max(15, Math.min(60, Number(m) || sessionMinutes));

  // ===== Typewriter =====
  const appendTextById = (id, chunk) => {
    setMessages(prev => prev.map(m => (m.id === id ? { ...m, text: m.text + chunk } : m)));
  };
  const typeOutFromAI = async (fullText) => {
    const msgId = genId();
    setMessages(prev => [...prev, { id: msgId, from: 'ai', text: '', ts: Date.now() }]);
    await wait(60);

    const baseMin = 14, baseMax = 28;
    const rdelay = () => Math.floor(Math.random()*(baseMax-baseMin+1))+baseMin;

    for (let i=0; i<fullText.length; i++) {
      const ch = fullText[i];
      appendTextById(msgId, ch);
      let d = rdelay();
      if (HARD_PAUSE.has(ch)) d += 120;
      else if (SOFT_PAUSE.has(ch)) d += 60;
      if (ch === '\n' && fullText[i+1] === '\n') d += 200;
      if (i % 8 === 0) chatRef.current?.scrollToEnd?.({ animated: true });
      await wait(d);
    }
  };

  // ===== Firestore: โหลดหนังสือ =====
  useEffect(() => {
    if (!uid) return;
    const ref = collection(db, 'users', uid, 'books');
    const unsub = onSnapshot(
      query(ref),
      qs => {
        const list = qs.docs.map(d => ({ id: d.id, ...d.data() }));
        setBooks(list);
        setLoading(false);
      },
      err => {
        console.log('books onSnapshot error:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid]);

  // ===== โหลดตารางเมื่อเลือกเล่ม =====
  useEffect(() => {
    const b = selectedBook;
    const s = new Set();
    if (b?.readingSchedule && typeof b.readingSchedule === 'object') {
      Object.keys(b.readingSchedule).forEach(d => {
        const times = b.readingSchedule[d] || {};
        Object.keys(times).forEach(t => s.add(`${d}|${t}`));
      });
    } else if (Array.isArray(b?.readingDays) && b?.readingTime) {
      b.readingDays.forEach(d => s.add(`${d}|${b.readingTime}`));
    }
    setSelected(s);

    const mins =
      typeof b?.sessionMinutes === 'number'
        ? Math.min(MAX_MIN, Math.max(MIN_MIN, b.sessionMinutes))
        : 30;
    setSessionMinutes(mins);

    setLastSavedSchedule(null);
    setLastAIDiff(null);
    setLastSelectedBeforeAI(null);
  }, [selectedBook]);

  // ===== Welcome chat =====
  useEffect(() => {
    if (messages.length === 0) setMessages([welcomeMessage()]);
  }, [messages.length]);

  // auto scroll
  useEffect(() => {
    chatRef.current?.scrollToEnd?.({ animated: true });
  }, [messages, aiTyping]);

  const toggleCell = (day, hour) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelected(prev => {
      const next = new Set(prev);
      const k = `${day}|${hour}`;
      next.has(k) ? next.delete(k) : next.add(k);
      return next;
    });
  };

  const handleCellPress = (day, hour) => {
    const key = `${day}|${hour}`;
    const busyList = busyIndex[key];
    if (busyList && busyList.length && !selected.has(key)) {
      const lines = busyList.map(t => `• ${t}`).join('\n');
      showPopup({
        type: 'warning',
        title: 'ไม่ว่างในช่วงเวลานี้',
        message: `${day} เวลา ${hour}`,
        note: `มีแผนการอ่านจองไว้แล้ว:\n${lines}`,
        actions: [{ label: 'รับทราบ', variant: 'primary' }]
      });
      return;
    }
    toggleCell(day, hour);
  };

  const weeklyCount = selected.size;
  const weeklyMinutes = weeklyCount * sessionMinutes;

  // ===== Summary text =====
  const buildScheduleSummary = (scheduleObj, mins) => {
    const orderDay = new Map(DAYS.map((d,i)=>[d,i]));
    const lines = Object.keys(scheduleObj)
      .sort((a,b)=>orderDay.get(a)-orderDay.get(b))
      .map(d => `${d}: ${Object.keys(scheduleObj[d]||{}).sort().join(', ')}`)
      .filter(Boolean);
    return `สรุปตารางของคุณ\n\n${lines.join('\n')}\n\nระยะเวลาอ่านต่อครั้ง: ${mins} นาที\nรวมทั้งสัปดาห์: ${weeklyCount} ครั้ง (${weeklyMinutes} นาที)`;
  };

  // ===== Save to Firestore =====
  const handleSave = async () => {
    if (!uid || !selectedBookId) return;
    if (selected.size === 0) {
      showPopup({
        type: 'info',
        title: 'ยังไม่ได้เลือกเวลา',
        message: 'โปรดเลือกวันและเวลาอย่างน้อย 1 ช่อง'
      });
      return;
    }
    const readingSchedule = {};
    for (const key of selected) {
      const [day,time] = key.split('|');
      if (!readingSchedule[day]) readingSchedule[day] = {};
      readingSchedule[day][time] = sessionMinutes;
    }
    try {
      await updateDoc(doc(db, 'users', uid, 'books', selectedBookId), {
        readingSchedule,
        sessionMinutes,
        updatedAt: serverTimestamp(),
      });
      setLastSavedSchedule(readingSchedule);

      const summary = buildScheduleSummary(readingSchedule, sessionMinutes);
      setMessages(prev => [...prev, {
        id: genId(),
        from: 'ai',
        text: `ตารางของเล่ม “${selectedBook?.title || 'หนังสือ'}” ถูกบันทึกแล้ว ✅\n\n${summary}\n\nคุณสามารถกด “เพิ่มลงปฏิทิน” เพื่อสร้างนัดซ้ำรายสัปดาห์ได้ทันที`,
        ts: Date.now(),
      }]);
      setActiveTab('ask');

      showPopup({
        type: 'success',
        title: 'บันทึกตารางเรียบร้อย',
        message: 'เซฟตารางสำเร็จแล้ว',
        note: 'คุณสามารถเพิ่มลงปฏิทินได้จากปุ่ม “เพิ่มลงปฏิทิน”',
        actions: [{ label: 'เยี่ยมมาก!', variant: 'primary' }]
      });
    } catch (e) {
      console.log('save schedule error:', e);
      showPopup({
        type: 'error',
        title: 'บันทึกไม่สำเร็จ',
        message: 'เกิดข้อผิดพลาดในการบันทึก',
        note: e?.message || ''
      });
    }
  };

  // ===== Calendar =====
  const getExpoWeekday = (thName) => {
    switch (thName) {
      case 'อาทิตย์': return Calendar.WeekDay.Sunday;
      case 'จันทร์':  return Calendar.WeekDay.Monday;
      case 'อังคาร':  return Calendar.WeekDay.Tuesday;
      case 'พุธ':     return Calendar.WeekDay.Wednesday;
      case 'พฤหัสบดี':return Calendar.WeekDay.Thursday;
      case 'ศุกร์':   return Calendar.WeekDay.Friday;
      case 'เสาร์':   return Calendar.WeekDay.Saturday;
      default:        return Calendar.WeekDay.Monday;
    }
  };
  const nextDateForWeekdayAndTime = (weekdayExpo, hhmm) => {
    const [H,M] = (hhmm||'00:00').split(':').map(n=>Number(n)||0);
    const expoToJs = {1:0,2:1,3:2,4:3,5:4,6:5,7:6};
    const want = expoToJs[weekdayExpo] ?? 1;
    const now = new Date();
    const d = new Date(now);
    d.setSeconds(0,0);
    const diff = (want - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + diff);
    d.setHours(H, M, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 7);
    return d;
  };
  const ensureCalendarId = async () => {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') throw new Error('ไม่ได้รับอนุญาตปฏิทิน');
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const existing = calendars.find(c => c.title === 'ArchiveMe' && c.allowsModifications);
    if (existing) return existing.id;
    const defaultSource =
      calendars.find(c => c.source && c.source.isLocalAccount)?.source ||
      calendars[0]?.source || { name: 'Expo Calendar', type: Calendar.SourceType.LOCAL };
    const newId = await Calendar.createCalendarAsync({
      title: 'ArchiveMe',
      color: PALETTE.primary1,
      entityType: Calendar.EntityTypes.EVENT,
      sourceId: defaultSource.id,
      source: defaultSource,
      name: 'ArchiveMe',
      ownerAccount: 'personal',
      accessLevel: Calendar.CalendarAccessLevel.OWNER,
    });
    return newId;
  };
  const addReadingEventsToCalendar = async () => {
    if (!lastSavedSchedule || !selectedBook) {
      showPopup({
        type: 'info',
        title: 'ยังไม่มีตารางล่าสุด',
        message: 'กรุณาบันทึกตารางก่อน'
      });
      return;
    }
    setCalendarBusy(true);
    try {
      const calendarId = await ensureCalendarId();
      const until = new Date(); until.setMonth(until.getMonth()+6);
      let created = 0;
      for (const dayName of Object.keys(lastSavedSchedule)) {
        const expoWeekday = getExpoWeekday(dayName);
        const times = Object.keys(lastSavedSchedule[dayName]||{}).sort();
        for (const t of times) {
          const mins = Number(lastSavedSchedule[dayName][t]) || sessionMinutes;
          const startDate = nextDateForWeekdayAndTime(expoWeekday, t);
          const endDate = new Date(startDate.getTime() + mins*60000);
          await Calendar.createEventAsync(calendarId, {
            title: `อ่าน: ${selectedBook.title || 'หนังสือ'}`,
            notes: `เป้าหมายอ่าน ${mins} นาที`,
            startDate, endDate, timeZone: undefined,
            recurrenceRule: { frequency: Calendar.Frequency.Weekly, interval: 1, endDate: until },
            alarms: [{ relativeOffset: -5 }],
          });
          created += 1;
        }
      }
      showPopup({
        type: 'success',
        title: 'เพิ่มลงปฏิทินสำเร็จ',
        message: `สร้างนัดหมาย ${created} รายการ`,
        note: 'ตั้งเป็นนัดซ้ำรายสัปดาห์ให้แล้ว',
        actions: [{ label: 'ขอบคุณ!', variant: 'primary' }]
      });
    } catch (e) {
      console.log('calendar add error:', e);
      showPopup({
        type: 'error',
        title: 'เพิ่มลงปฏิทินไม่สำเร็จ',
        message: e?.message || 'โปรดลองอีกครั้ง'
      });
    } finally { setCalendarBusy(false); }
  };

  // ===== AI =====
  const systemPrompt =
    'คุณคือผู้ช่วยด้านการอ่าน ตอบ "ภาษาไทยเท่านั้น" กระชับ เป็นกันเอง ' +
    'ห้ามสลับไปใช้ภาษาอื่น ยกเว้นชื่อเฉพาะที่จำเป็น ' +
    'ถ้าผู้ใช้พิมพ์ภาษาอื่น ให้ตีความแล้วตอบเป็นไทยล้วน';

  const scheduleToThaiLines = (readingSchedule) => {
    const order = new Map(DAYS.map((d,i)=>[d,i]));
    return Object.keys(readingSchedule)
      .sort((a,b)=>order.get(a)-order.get(b))
      .map(d => `${d}: ${Object.keys(readingSchedule[d]||{}).sort().join(', ')}`)
      .join('\n');
  };
  const buildPlanPrompt = ({ title, pages, sessionMinutes, readingSchedule }) => {
    const scheduleText = scheduleToThaiLines(readingSchedule);
    return `จงเป็นโค้ชการอ่านหนังสือ ตอบเป็นภาษาไทยล้วน กระชับ ทำตามได้จริง

ข้อมูลหนังสือ:
- ชื่อ: ${title || '—'}
- จำนวนหน้า (ถ้ามี): ${pages || 'ไม่ทราบ'}

ตารางที่ผู้ใช้ต้องการ:
${scheduleText}
เวลาอ่านต่อครั้ง: ${sessionMinutes} นาที

สิ่งที่ต้องแนะนำ:
1) เป้าหมายต่อช่วง (กี่หน้า/หัวข้อ ต่อ ${sessionMinutes} นาที)
2) รูทีนก่อน–ระหว่าง–หลังอ่าน (เช่น โฟกัส 25/พัก 5, ไฮไลต์, สรุป 3 บรรทัด)
3) เคล็ดลับให้เหมาะกับช่วงเวลา (เช้า/ค่ำ)
4) วันกันชนและการชดเชยอย่างไม่กดดัน
5) เช็คลิสต์จบสัปดาห์เพื่อปรับตาราง
รูปแบบหัวข้อสั้น อ่านแล้วทำตามได้ทันที`;
  };

  const HISTORY_WRAP = (messages) => (messages || []).slice(-HISTORY_MAX);

  const askOllamaReturnJson = async (promptBuilder, userHint) => {
    const historyCtx = buildHistoryContext({ messages: HISTORY_WRAP(messages), selectedBook, sessionMinutes, selected, lastAISets });
    const taskSpec = promptBuilder(userHint);
    const basePrompt = buildJsonTaskPrompt({ historyCtx, taskSpec });
    const opts = { model: DEFAULT_MODEL, system: systemPrompt, options: { temperature: 0.2 } };

    let answer = await generateOllama({ ...opts, prompt: basePrompt });
    let parsed = extractFirstJson(answer);

    if (!parsed) {
      const stricter =
        basePrompt +
        '\n\nเตือนย้ำอีกครั้ง: ตอบเป็น "JSON ล้วน" เท่านั้น ห้ามมีข้อความอื่นปะปน';
      answer = await generateOllama({ ...opts, prompt: stricter });
      parsed = extractFirstJson(answer);
    }
    if (!parsed) throw new Error('AI ไม่ได้ส่ง JSON ที่พาร์สได้');
    return parsed;
  };

  const askAI = async (question) => {
    setAiTyping(true);
    try {
      const historyCtx = buildHistoryContext({ messages: HISTORY_WRAP(messages), selectedBook, sessionMinutes, selected, lastAISets });
      const prompt = buildChatPrompt({ system: systemPrompt, historyCtx, question });
      const answer = await generateOllama({ model: DEFAULT_MODEL, system: systemPrompt, prompt });
      await typeOutFromAI(answer || '(ไม่มีข้อความตอบกลับ)');
    } catch {
      await typeOutFromAI('❌ ติดต่อ AI ไม่สำเร็จ โปรดตรวจสอบเครือข่าย/เซิร์ฟเวอร์');
    } finally {
      setAiTyping(false);
      chatRef.current?.scrollToEnd?.({ animated: true });
    }
  };

  const askPlanForCurrentSelection = async () => {
    if (!selectedBook) {
      showPopup({ type: 'info', title: 'กรุณาเลือกหนังสือก่อน', message: 'เลือกหนังสือเพื่อสร้างแผน' });
      return;
    }
    if (selected.size === 0) {
      showPopup({ type: 'info', title: 'ยังไม่ได้เลือกเวลา', message: 'โปรดเลือกวันและเวลาอย่างน้อย 1 ช่อง' });
      return;
    }

    setActiveTab('ask');
    setMessages(prev => [...prev, { id: genId(), from: 'user', text: 'ขอแผนการอ่านจาก AI สำหรับตารางนี้', ts: Date.now() }]);

    const readingSchedule = {};
    for (const key of selected) {
      const [day,time] = key.split('|');
      if (!readingSchedule[day]) readingSchedule[day] = {};
      readingSchedule[day][time] = sessionMinutes;
    }
    const promptCore = buildPlanPrompt({
      title: selectedBook.title,
      pages: Number(selectedBook.pages) || undefined,
      sessionMinutes,
      readingSchedule,
    });

    const historyCtx = buildHistoryContext({ messages: HISTORY_WRAP(messages), selectedBook, sessionMinutes, selected, lastAISets });
    const prompt = `${historyCtx}\n\n${promptCore}\n\n(ตอบเป็นภาษาไทยล้วน)`;

    setAiTyping(true);
    try {
      const answer = await generateOllama({ model: DEFAULT_MODEL, system: systemPrompt, prompt });
      await typeOutFromAI(answer || 'พร้อมแล้ว ลองเริ่มจากการตั้งเป้าหมายเล็ก ๆ ก่อนนะครับ');
    } catch {
      await typeOutFromAI('❌ ติดต่อ AI ไม่สำเร็จ');
    } finally { setAiTyping(false); }
  };

  const applyAIScheduleMerge = (aiSelSet, aiMinutes) => {
    const before = new Set(selected);
    const next = selectionUnion(before, aiSelSet);
    const minutes = clampMinutes(aiMinutes);
    setLastSelectedBeforeAI(before);
    setSelected(next);
    setSessionMinutes(minutes);
    setLastAIDiff(selectionDiff(before, next));
    setActiveTab('schedule');
  };
  const applyAIScheduleReplace = (aiSelSet, aiMinutes) => {
    const before = new Set(selected);
    const next = new Set(aiSelSet);
    const minutes = clampMinutes(aiMinutes);
    setLastSelectedBeforeAI(before);
    setSelected(next);
    setSessionMinutes(minutes);
    setLastAIDiff(selectionDiff(before, next));
    setActiveTab('schedule');
  };

  // ====== สุ่มตาราง (union) หลายชุด A–F ด้วย JSON เข้มงวด ======
  const askRandomSchedule = async (userHint) => {
    if (!selectedBook) { showPopup({ type:'info', title:'กรุณาเลือกหนังสือก่อน' }); return; }
    setAiTyping(true);
    try {
      const allowedDaysText = [...RANDOM_ALLOWED_DAYS].join(', ');
      const buildPrompt = (hint) =>
`สุ่มสร้าง "แผนการอ่าน 6 ชุด (A–F)" (ตอบเป็น JSON เท่านั้น — ห้ามมีคำอื่นนอกเหนือ JSON)
${hint ? `เงื่อนไขจากผู้ใช้: "${hint}"` : ''}

รูปแบบ JSON ที่ต้องการ:
{
  "A": { "schedule": { "จันทร์": {"07:00": 30}, "พุธ": {"20:00": 30}, "เสาร์": {"09:00": 30} }, "sessionMinutes": 30 },
  "B": { "schedule": { "จันทร์": {"06:00": 45}, "อังคาร": {"19:00": 45}, "ศุกร์": {"20:00": 45} }, "sessionMinutes": 45 },
  "C": { "schedule": { "จันทร์": {"20:00": 60}, "พุธ": {"21:00": 60}, "เสาร์": {"11:00": 60} }, "sessionMinutes": 60 },
  "D": { "schedule": { "อังคาร": {"07:00": 45}, "พุธ": {"19:00": 45}, "ศุกร์": {"19:00": 45}, "เสาร์": {"09:00": 45} }, "sessionMinutes": 45 },
  "E": { "schedule": { "จันทร์": {"09:00": 30}, "อังคาร": {"12:00": 30}, "พฤหัสบดี": {"12:00": 30}, "อาทิตย์": {"09:00": 30} }, "sessionMinutes": 30 },
  "F": { "schedule": { "จันทร์": {"07:00": 45}, "อังคาร": {"19:00": 45}, "พฤหัสบดี": {"07:00": 45}, "ศุกร์": {"19:00": 45} }, "sessionMinutes": 45 }
}

กติกาแต่ละชุด:
- มี 3–5 วัน/สัปดาห์
- เลือกวันได้เฉพาะ: ${allowedDaysText}
- เวลาเป็น "ชั่วโมงตรง" เท่านั้น (HH:00) เช่น 06:00, 07:00, 20:00 (ห้าม 07:15/08:30)
- นาทีต่อครั้ง 15–60 นาที (ระบุไว้ที่ "sessionMinutes")
- วันต้องเป็นชื่อไทย: จันทร์ อังคาร พุธ พฤหัสบดี ศุกร์ เสาร์ อาทิตย์`;

      const parsed = await askOllamaReturnJson(buildPrompt, userHint);

      const labels = ['A','B','C','D','E','F'];
      const sets = {};
      for (const lab of labels) {
        const pack = parsed?.[lab] || {};
        const schedule = pack.schedule || {};
        let minutes = Number(pack.sessionMinutes) || 30;
        const sel = new Set();

        Object.keys(schedule).forEach(day => {
          if (!RANDOM_ALLOWED_DAYS.has(day)) return;
          Object.keys(schedule[day] || {}).forEach(time => {
            const t00 = toHourOnly(time);
            sel.add(`${day}|${t00}`);
            const m = Number(schedule[day][time]);
            if (!Number.isNaN(m) && m > 0) minutes = m;
          });
        });

        if (sel.size > 0) sets[lab] = { sel, minutes };
      }

      if (Object.keys(sets).length === 0) {
        await typeOutFromAI('ขออภัย AI ไม่ได้คืนชุด A–F ที่ใช้ได้ ลองสั่งสุ่มอีกครั้งนะครับ');
        return;
      }

      setLastAISets(sets);

      const prettyLines = Object.entries(sets).map(([lab, data]) => {
        const byDay = {};
        data.sel.forEach(k => {
          const [d, t] = k.split('|');
          (byDay[d] ||= []).push(t);
        });
        const orderDay = new Map(DAYS.map((d,i)=>[d,i]));
        const parts = Object.keys(byDay)
          .sort((a,b)=>orderDay.get(a)-orderDay.get(b))
          .map(d => `${d}: ${byDay[d].sort().join(', ')}`);
        return `ชุด ${lab} (${data.minutes} นาที): ${parts.join(' | ')}`;
      });

      await typeOutFromAI(
        'ฉันสุ่มแผน 6 ชุด (A–F) ให้แล้ว 🎲\n' +
        prettyLines.join('\n') +
        '\n\nพิมพ์ว่า "ใช้ชุด A" หรือ "ใช้ชุด B" ... เพื่อใส่ลงตารางได้เลยครับ'
      );
    } catch (e) {
      await typeOutFromAI('ขออภัย สุ่มแผน A–F ไม่สำเร็จ (รูปแบบ JSON ไม่ถูกต้อง) ลองพิมพ์ใหม่หรือระบุเงื่อนไขเพิ่มเติมครับ');
    } finally {
      setAiTyping(false);
    }
  };

  // ====== สร้างตารางใหม่ทั้งชุด (replace) ======
  const askGeneratedSchedule = async (userHint) => {
    if (!selectedBook) { showPopup({ type:'info', title:'กรุณาเลือกหนังสือก่อน' }); return; }
    setAiTyping(true);
    try {
      const buildPrompt = (hint) =>
`สร้าง "ตารางการอ่านใหม่ทั้งชุด" (ตอบเป็น JSON เท่านั้น — ห้ามมีคำอื่นนอกเหนือ JSON)
${hint ? `เงื่อนไขจากผู้ใช้: "${hint}"` : ''}

รูปแบบ JSON:
{
  "schedule": {
    "จันทร์": {"07:00": 30, "20:00": 25},
    "พุธ":   {"20:00": 25},
    "เสาร์": {"09:00": 40}
  },
  "sessionMinutes": 30
}

กติกา:
- สร้างใหม่ทั้งแผน (ไม่ต้องสนใจของเดิม)
- เลือก 2–5 วัน/สัปดาห์
- เวลาเป็น "ชั่วโมงตรง" เท่านั้น (HH:00)
- นาทีต่อครั้ง 15–60 นาที
- วันต้องเป็นไทย: จันทร์ อังคาร พุธ พฤหัสบดี ศุกร์ เสาร์ อาทิตย์`;

      const parsed = await askOllamaReturnJson(buildPrompt, userHint);

      const schedule = parsed.schedule || {};
      const sel = new Set();
      let minutes = Number(parsed.sessionMinutes) || 30;

      Object.keys(schedule).forEach(day => {
        Object.keys(schedule[day] || {}).forEach(time => {
          const t00 = toHourOnly(time);
          sel.add(`${day}|${t00}`);
          const m = Number(schedule[day][time]);
          if (!Number.isNaN(m) && m > 0) minutes = m;
        });
      });

      applyAIScheduleReplace(sel, minutes);
      await typeOutFromAI('🗓️ สร้าง “แผนตารางใหม่” แล้ว (เวลาเป็นชั่วโมงตรงเท่านั้น) — ตรวจในแท็บจัดตาราง แล้วกด “บันทึกตารางการอ่าน” ถ้าพอใจ');
    } catch (e) {
      await typeOutFromAI('ขออภัย สร้างแผนใหม่ไม่สำเร็จ (รูปแบบ JSON ไม่ถูกต้อง) ลองพิมพ์อีกครั้งหรือระบุวัน/ช่วงเวลาที่สะดวก');
    } finally {
      setAiTyping(false);
    }
  };

  const isRandomScheduleIntent = (text) => {
    const t = (text||'').trim();
    return /(สุ่ม|random)/i.test(t) && /(ตาราง|เวลาอ่าน|วันเวลา|แผนการอ่าน|plan|schedule)/i.test(t);
  };
  const isCreateScheduleIntent = (text) => {
    const t = (text || '').trim();
    return /(สร้าง|จัด|วาง|ทำ)\s*(ตาราง|แผน)(การ)?อ่าน/i.test(t)
        || /(create|make|build|generate)\s*(plan|schedule)/i.test(t);
  };
  const pickSetIntent = (text) => {
    const t = (text || '').trim();
    const m = t.match(/ใช้ชุด\s*([A-F])/i) || t.match(/use\s*set\s*([A-F])/i);
    return m ? m[1].toUpperCase() : null;
  };

  const sendQuestion = async () => {
    const text = (draft || '').trim();
    if (!text) return;

    if (tipMode) {
      const book = books.find(b => (b.title || '').toLowerCase() === text.toLowerCase());
      setMessages(prev => [...prev, { id: genId(), from: 'user', text, ts: Date.now() }]);
      if (book) {
        const pages = Number(book.pages) || 100;
        const targetDays = 7;
        const ppd = Math.ceil(pages/targetDays);
        const today = new Date(); const finish = new Date(today); finish.setDate(today.getDate()+targetDays);
        const finishStr = finish.toLocaleDateString('th-TH',{ day:'numeric', month:'long', year:'numeric' });
        await typeOutFromAI(`สำหรับเล่ม "${book.title}" (${pages} หน้า)\nควรอ่านวันละ ~${ppd} หน้า เพื่อจบภายใน ${targetDays} วัน (คาดว่า ${finishStr})`);
      } else {
        await typeOutFromAI(`ไม่พบหนังสือชื่อ "${text}" ในรายการของคุณ`);
      }
      setTipMode(false);
      setDraft('');
      return;
    }

    setMessages(prev => [...prev, { id: genId(), from: 'user', text, ts: Date.now() }]);
    setDraft('');

    const chosen = pickSetIntent(text);
    if (chosen) {
      if (lastAISets && lastAISets[chosen]) {
        const { sel, minutes } = lastAISets[chosen];
        applyAIScheduleReplace(sel, minutes);
        await typeOutFromAI(`นำ "ชุด ${chosen}" ใส่ในแท็บตารางแล้ว ✅\nตรวจแล้วกด "บันทึกตารางการอ่าน" ได้เลยครับ`);
      } else {
        await typeOutFromAI(`ยังไม่มี "ชุด ${chosen}" ในรอบสุ่มล่าสุด ลองพิมพ์ "สุ่ม" เพื่อสร้างชุด A–F ก่อนนะครับ`);
      }
      return;
    }

    if (isCreateScheduleIntent(text)) { await askGeneratedSchedule(text); return; }
    if (isRandomScheduleIntent(text)) { await askRandomSchedule(text); return; }

    await askAI(text);
  };

  const confirmClearChat = () => {
    showPopup({
      type: 'warning',
      title: 'ล้างประวัติแชท',
      message: 'ต้องการลบประวัติการคุยทั้งหมดจริงไหม?',
      actions: [
        { label: 'ยกเลิก' },
        { label: 'ลบ', variant: 'danger', onPress: () => { setTipMode(false); setMessages([welcomeMessage()]); } }
      ]
    });
  };

  // ===== UI =====
  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      <LinearGradient colors={[PALETTE.bgStart, PALETTE.bgMid, PALETTE.bgEnd]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.bg}>
        <ScrollView contentContainerStyle={styles.body} nestedScrollEnabled keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

          <Text style={styles.title}>จัดตารางและคำถาม</Text>
          <Text style={styles.subtitle}>จัดตารางการอ่านของคุณและสอบถามข้อสงสัยเกี่ยวกับการอ่าน</Text>
          <LinearGradient colors={[PALETTE.primary2, PALETTE.primary1]} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.titleBar} />

          {/* Tabs */}
          <View style={styles.tabs}>
            <TabPill
              active={activeTab==='schedule'}
              icon="calendar-outline"
              label="จัดตารางการอ่าน"
              onPress={()=>setActiveTab('schedule')}
            />
            <TabPill
              active={activeTab==='ask'}
              icon="chatbubble-ellipses-outline"
              label="สอบถามเกี่ยวกับการอ่าน"
              onPress={()=>setActiveTab('ask')}
            />
          </View>

          {/* ตาราง */}
          {activeTab === 'schedule' && (
            <>
              <View style={[styles.card, styles.glass]}>
                <Text style={styles.sectionLabel}>เลือกหนังสือ</Text>
                <TouchableOpacity style={styles.select} onPress={()=>setPickerOpen(true)} activeOpacity={0.9}>
                  <Text style={{ color: selectedBook ? PALETTE.text : PALETTE.textDim }}>{selectedBook?.title || '— เลือกหนังสือ —'}</Text>
                  <Ionicons name="chevron-down" size={18} color={PALETTE.textDim} />
                </TouchableOpacity>
              </View>

              {selectedBook && (
                <View style={[styles.card, styles.glass]}>
                  {/* minutes */}
                  <View style={styles.minutesRow}>
                    <Text style={styles.minutesLabel}>ระยะเวลาอ่านต่อครั้ง (นาที)</Text>
                    <View style={styles.minutesControl}>
                      <TouchableOpacity onPress={()=>setSessionMinutes(m=>Math.max(MIN_MIN,m-STEP_MIN))} style={styles.smallBtn} activeOpacity={0.85}>
                        <Ionicons name="remove" size={16} color={PALETTE.text} />
                      </TouchableOpacity>
                      <View style={styles.minutesValue}><Text style={{ fontWeight:'800', color:PALETTE.text }}>{sessionMinutes}</Text></View>
                      <TouchableOpacity onPress={()=>setSessionMinutes(m=>Math.min(MAX_MIN,m+STEP_MIN))} style={styles.smallBtn} activeOpacity={0.85}>
                        <Ionicons name="add" size={16} color={PALETTE.text} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* legend */}
                  <View style={{ flexDirection:'row', alignItems:'center', gap:12, marginBottom:6 }}>
                    <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                      <View style={[styles.legendDot, { backgroundColor: PALETTE.slotActiveBg, borderColor: PALETTE.slotActiveBorder }]} />
                      <Text style={{ color:PALETTE.textDim, fontSize:12 }}>เลือกแล้ว</Text>
                    </View>
                    <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                      <View style={[styles.legendDot, { backgroundColor: PALETTE.slotBusyBg, borderColor: PALETTE.slotBusyBorder }]} />
                      <Text style={{ color:PALETTE.textDim, fontSize:12 }}>ไม่ว่าง (เล่มอื่นจอง)</Text>
                    </View>
                  </View>

                  <Text style={styles.subTitle}>เลือกเวลาที่ต้องการอ่าน (แตะที่ช่องเวลา)</Text>

                  <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
                    <View>
                      {/* Header */}
                      <View style={styles.gridHeader}>
                        <View style={[styles.cell, styles.cornerCell]}><Text style={styles.headerText}>เวลา</Text></View>
                        {DAYS.map(d => (
                          <View key={d} style={[styles.cell, styles.dayHead]}>
                            <Text style={styles.headerText}>{d}</Text>
                          </View>
                        ))}
                      </View>

                      {/* Rows */}
                      <ScrollView style={{ height: 440 }} nestedScrollEnabled showsVerticalScrollIndicator contentContainerStyle={{ paddingBottom: 12 }}>
                        {HOURS.map(h => (
                          <View key={h} style={styles.row}>
                            <View style={[styles.cell, styles.timeCell]}><Text style={styles.timeText}>{h}</Text></View>
                            {DAYS.map(d => {
                              const key = `${d}|${h}`;
                              const active = selected.has(key);
                              const busy = !!(busyIndex[key]?.length) && !active; // ถ้ามีชนและยังไม่ได้เลือกเอง
                              return (
                                <TouchableOpacity
                                  key={key}
                                  onPress={()=>handleCellPress(d,h)}
                                  style={[
                                    styles.cell,
                                    styles.slotCell,
                                    active && styles.slotActive,
                                    busy && styles.slotBusy,
                                  ]}
                                  activeOpacity={0.85}
                                >
                                  {active && <Ionicons name="checkmark" size={16} color={PALETTE.primary2} />}
                                  {busy && !active && <Ionicons name="alert-circle-outline" size={16} color={PALETTE.rose} />}
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  </ScrollView>

                  {/* Summary */}
                  <View style={styles.summaryBox}>
                    <Text style={styles.summaryText}>
                      ตารางรวมทั้งหมด: <Text style={{ fontWeight:'800', color:PALETTE.text }}>{weeklyCount}</Text> ครั้ง/สัปดาห์ (
                      <Text style={{ fontWeight:'800', color:PALETTE.text }}>{weeklyMinutes}</Text> นาที/สัปดาห์)
                    </Text>
                  </View>

                  {/* AI change box */}
                  {lastAIDiff && (lastAIDiff.added?.length>0 || lastAIDiff.removed?.length>0) && (
                    <View style={styles.aiChangeBox}>
                      <View style={styles.aiChangeHeaderRow}>
                        <Ionicons name="sparkles-outline" size={18} color={PALETTE.sky} />
                        <Text style={styles.aiChangeTitle}>AI ปรับตาราง</Text>
                        <View style={{ flex:1 }} />
                        <Text style={styles.aiChangeBadge}>
                          +{lastAIDiff.added.length}
                          {lastAIDiff.removed.length ? ` / -${lastAIDiff.removed.length}` : ''}
                        </Text>
                      </View>

                      {lastAIDiff.added?.length > 0 && (
                        <>
                          <Text style={styles.aiChangeSubtitle}>เพิ่ม:</Text>
                          <View style={styles.aiChangeChipsWrap}>
                            {lastAIDiff.added.map(k => {
                              const [d,t] = (k||'').split('|');
                              return (
                                <View key={`add-${k}`} style={styles.aiChip}>
                                  <Ionicons name="time-outline" size={14} color={PALETTE.primary2} style={{ marginRight: 4 }} />
                                  <Text style={styles.aiChipText}>{`${d} | ${t}`}</Text>
                                </View>
                              );
                            })}
                          </View>
                        </>
                      )}

                      <View style={styles.aiChangeActions}>
                        <TouchableOpacity style={[styles.aiSmallBtn, { backgroundColor:PALETTE.sky }]} onPress={()=>setLastAIDiff(null)} activeOpacity={0.9}>
                          <Text style={styles.aiSmallBtnText}>ซ่อนสรุป</Text>
                        </TouchableOpacity>
                        {lastSelectedBeforeAI && (
                          <TouchableOpacity style={[styles.aiSmallBtn, { backgroundColor:PALETTE.rose }]} onPress={()=>{ setSelected(new Set(lastSelectedBeforeAI)); setLastAIDiff(null); }} activeOpacity={0.9}>
                            <Text style={styles.aiSmallBtnText}>ย้อนกลับ</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  )}

                  {/* Save */}
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.92}>
                    <LinearGradient colors={[PALETTE.primary1, PALETTE.primary2]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.saveBtnGradient} />
                    <Text style={styles.saveBtnText}>บันทึกตารางการอ่าน</Text>
                  </TouchableOpacity>

                  {/* Ask plan */}
                  {selected.size > 0 && (
                    <TouchableOpacity
                      style={[styles.saveBtn, { marginTop:8 }]}
                      onPress={() => { setActiveTab('ask'); askPlanForCurrentSelection(); }}
                      activeOpacity={0.92}
                    >
                      <LinearGradient colors={['#22c55e', '#06b6d4']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.saveBtnGradient} />
                      <Text style={styles.saveBtnText}>ขอแผนอ่านจาก AI สำหรับตารางนี้</Text>
                    </TouchableOpacity>
                  )}

                  {/* Add to calendar */}
                  {lastSavedSchedule && (
                    <TouchableOpacity style={[styles.saveBtn, { marginTop:8 }]} onPress={addReadingEventsToCalendar} disabled={calendarBusy} activeOpacity={0.92}>
                      <LinearGradient colors={['#0ea5e9', '#22c55e']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.saveBtnGradient} />
                      <Text style={styles.saveBtnText}>{calendarBusy ? 'กำลังเพิ่มลงปฏิทิน…' : 'เพิ่มลงปฏิทิน'}</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          )}

          {/* แชท */}
          {activeTab === 'ask' && (
            <View style={[styles.card, styles.glass, styles.chatCard]}>
              <View style={{ flexDirection:'row', alignItems:'center', marginBottom:8 }}>
                <Ionicons name="chatbubble-ellipses-outline" size={18} color={PALETTE.primary2} />
                <Text style={{ marginLeft:6, fontWeight:'800', color:PALETTE.text }}>สอบถามเกี่ยวกับการอ่าน</Text>
                <View style={{ flex:1 }} />
                <TouchableOpacity onPress={confirmClearChat} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                  <Text style={{ color:PALETTE.rose, fontWeight:'800' }}>ล้างประวัติ</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: CHAT_HEIGHT }}>
                <ScrollView
                  ref={chatRef}
                  style={styles.chatScroll}
                  contentContainerStyle={{ paddingVertical:6 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                  onContentSizeChange={() => chatRef.current?.scrollToEnd?.({ animated: true })}
                  scrollEventThrottle={16}
                >
                  {messages.map(m => (
                    <View key={m.id} style={[styles.msg, m.from==='user' ? styles.msgUser : styles.msgAi]}>
                      <Text style={m.from==='user' ? styles.msgUserText : styles.msgAiText}>{m.text}</Text>
                    </View>
                  ))}
                  {aiTyping && (
                    <View style={[styles.msg, styles.msgAi, { flexDirection:'row', gap:8, alignItems:'center' }]}>
                      <ActivityIndicator color={PALETTE.primary1} />
                      <TypingDots />
                    </View>
                  )}
                </ScrollView>
              </View>

              <KeyboardAvoidingView behavior={Platform.OS==='ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS==='ios' ? 64 : 0}>
                <View style={styles.chatInputRow}>
                  <TextInput
                    style={styles.chatInput}
                    placeholder={tipMode ? 'พิมพ์ชื่อหนังสือ…' : 'ถามอะไรก็ได้'}
                    placeholderTextColor={PALETTE.textDim}
                    value={draft}
                    onChangeText={setDraft}
                  />
                  <TouchableOpacity style={styles.sendBtn} onPress={sendQuestion} activeOpacity={0.9} disabled={aiTyping}>
                    <LinearGradient colors={[PALETTE.primary1, PALETTE.primary2]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.sendBtnGrad} />
                    <Ionicons name="send" size={16} color="#fff" style={{ zIndex:1 }} />
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </View>
          )}

          {/* Tips Accordion */}
          <TipsAccordion
            items={[
              {
                key: 'goal',
                icon: 'book-outline',
                iconBg: 'rgba(6,182,212,0.15)',
                iconColor: '#22D3EE',
                title: 'กำหนดเป้าหมายการอ่าน',
                desc: 'พิมพ์ชื่อหนังสือ แล้วให้ช่วยคำนวณจำนวนหน้าต่อวันเพื่อจบใน 7 วัน',
                onPress: () => {
                  setTipMode(true);
                  setActiveTab('ask');
                  const bookNames = books.map(b=>b.title || '(ไม่มีชื่อ)').join(', ') || 'ยังไม่มีหนังสือในรายการ';
                  setMessages(prev => [
                    ...prev,
                    { id: genId(), from: 'user', text: 'คำแนะนำเป้าหมายการอ่าน', ts: Date.now() },
                    { id: genId(), from: 'ai', text: `ต้องการคำแนะนำจากเล่มไหน? กรุณาพิมพ์ชื่อหนังสือ\n\nรายชื่อหนังสือ: ${bookNames}`, ts: Date.now() },
                  ]);
                },
              },
              {
                key: 'pomodoro',
                icon: 'time-outline',
                iconBg: 'rgba(244,63,94,0.14)',
                iconColor: '#F43F5E',
                title: 'แบ่งเวลาอ่านแบบ Pomodoro',
                desc: 'อ่าน 20–30 นาที/ครั้ง แล้วพัก 5–10 นาที เพื่อคงโฟกัส',
                onPress: async () => {
                  setTipMode(false); setActiveTab('ask');
                  setMessages(prev => [...prev, { id: genId(), from: 'user', text: 'แบ่งเวลาอ่านหนังสือ', ts: Date.now() }]);
                  await typeOutFromAI('อ่านเป็นช่วงสั้น ๆ 20–30 นาที ต่อครั้ง แล้วพัก 5–10 นาที จะช่วยให้โฟกัสดีขึ้นและจำได้มากขึ้น ใช้เทคนิค Pomodoro ช่วยได้มาก 😊');
                },
              },
              {
                key: 'env',
                icon: 'calendar-outline',
                iconBg: 'rgba(8,145,178,0.15)',
                iconColor: '#38BDF8',
                title: 'จัดสภาพแวดล้อมให้เหมาะสม',
                desc: 'ที่เงียบ โต๊ะโล่ง แสงพอดี ปิดสิ่งรบกวนก่อนเริ่มอ่าน',
                onPress: async () => {
                  setTipMode(false); setActiveTab('ask');
                  setMessages(prev => [...prev, { id: genId(), from: 'user', text: 'จัดสภาพแวดล้อมให้เหมาะสม', ts: Date.now() }]);
                  await typeOutFromAI('เลือกที่เงียบสงบ จัดโต๊ะให้โล่ง แสงสว่างพอดี ลดสิ่งรบกวน (เช่น ปิดการแจ้งเตือน) จะช่วยให้คุณมีสมาธิเต็มที่ 😊');
                },
              },
              {
                key: 'log',
                icon: 'clipboard-outline',
                iconBg: 'rgba(34,197,94,0.12)',
                iconColor: '#22C55E',
                title: 'บันทึกความคืบหน้า',
                desc: 'จดจำนวนหน้า/บท และข้อคิดสำคัญสั้น ๆ ทุกวัน',
                onPress: async () => {
                  setTipMode(false); setActiveTab('ask');
                  setMessages(prev => [...prev, { id: genId(), from: 'user', text: 'บันทึกความคืบหน้า', ts: Date.now() }]);
                  await typeOutFromAI('การบันทึกความคืบหน้าช่วยให้เห็นพัฒนาการและสร้างแรงจูงใจ เช่น จดจำนวนหน้าที่อ่านแต่ละวัน/บทสรุปสั้น ๆ เพื่อนำมาปรับตารางให้เหมาะกับคุณ');
                },
              },
            ]}
          />
        </ScrollView>

        {/* Modal เลือกหนังสือ */}
        <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={()=>setPickerOpen(false)}>
          <View style={styles.modalWrap}>
            <View style={[styles.modalCard, styles.glass]}>
              <View style={{ flexDirection:'row', alignItems:'center', marginBottom:10 }}>
                <Ionicons name="book-outline" size={18} color={PALETTE.primary2} />
                <Text style={{ marginLeft:6, fontWeight:'800', color:PALETTE.text }}>เลือกหนังสือ</Text>
              </View>

              <FlatList
                data={books}
                keyExtractor={item => item.id}
                ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.optionBtn, item.id===selectedBookId && { borderColor:PALETTE.slotActiveBorder, backgroundColor:'rgba(34,211,238,0.12)' }]}
                    onPress={()=>{ setSelectedBookId(item.id); setPickerOpen(false); }}
                    activeOpacity={0.9}
                  >
                    <Text style={{ color:PALETTE.text, fontWeight:'700' }}>{item.title || '(ไม่มีชื่อ)'}</Text>
                    <Ionicons name="chevron-forward" size={16} color={PALETTE.textDim} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={<Text style={{ color:PALETTE.textDim }}>{loading ? 'กำลังโหลด...' : 'ยังไม่มีแผนการอ่าน'}</Text>}
              />

              <TouchableOpacity style={styles.modalClose} onPress={()=>setPickerOpen(false)} activeOpacity={0.9}>
                <Text style={{ color:PALETTE.primary2, fontWeight:'800' }}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
          <FancyPopup popup={popup} onClose={hidePopup} />
</LinearGradient>
</SafeAreaView>
);
}


/* ===== Tips Accordion ===== */
function TipsAccordion({ items }) {
  const [openKey, setOpenKey] = useState(null);
  const toggle = (key) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenKey(prev => (prev === key ? null : key));
  };
  return (
    <View style={[styles.card, styles.glass]}>
      <Text style={styles.sectionTitle}>คำแนะนำในการจัดตารางอ่านที่มีประสิทธิภาพ</Text>
      {items.map((it, idx) => {
        const opened = openKey === it.key;
        return (
          <View key={it.key}>
            {idx>0 && <View style={styles.tipDivider} />}
            <TouchableOpacity activeOpacity={0.92} onPress={()=>toggle(it.key)} style={styles.accHeader}>
              <View style={styles.accHeaderLeft}>
                <View style={[styles.tipIconWrap, { backgroundColor: it.iconBg }]}>
                  <Ionicons name={it.icon} size={18} color={it.iconColor} />
                </View>
                <Text style={styles.tipTitle}>{it.title}</Text>
              </View>
              <Ionicons name={opened ? 'chevron-up' : 'chevron-down'} size={18} color={PALETTE.textDim} />
            </TouchableOpacity>
            {opened && (
              <View style={styles.accBody}>
                <Text style={styles.tipDesc}>{it.desc}</Text>
                <View style={styles.accActions}>
                  <TouchableOpacity onPress={it.onPress} style={styles.accBtn} activeOpacity={0.92}>
                    <LinearGradient colors={[PALETTE.primary1, PALETTE.primary2]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.accBtnGrad} />
                    <Ionicons name="sparkles-outline" size={16} color="#fff" style={{ zIndex:1 }} />
                    <Text style={styles.accBtnText}>ใช้คำแนะนำนี้</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/* ===== Styles ===== */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'black' },
  bg: { flex: 1 },
  body: { padding: 16, paddingBottom: 64 },

  title: { fontSize: 22, fontWeight: '900', color: PALETTE.text },
  subtitle: { color: PALETTE.textDim, marginTop: 6, marginBottom: 10, lineHeight: 20 },
  titleBar: { height: 4, width: 140, borderRadius: 999, alignSelf: 'flex-start', marginBottom: 12 },

  // Tabs
  tabs: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PALETTE.cardBorder,
    overflow: 'hidden',
    marginBottom: 12,
    backgroundColor: 'rgba(6,20,32,0.6)',
  },
  tabBtn: {
    flex:1,
    paddingVertical:12,
    paddingHorizontal:10,
    flexDirection:'row',
    justifyContent:'center',
    alignItems:'center',
    gap:6,
    position:'relative',
  },
  tabBtnActive: {},
  tabGrad: { ...StyleSheet.absoluteFillObject, borderRadius: 0 },
  tabText: { color: PALETTE.textDim, fontWeight:'800', zIndex:1 },
  tabTextActive: { color:'#ffffff' },

  // Card / Glass
  card: {
    borderRadius:20,
    borderWidth:1,
    borderColor: PALETTE.cardBorder,
    padding:14,
    marginBottom:12,
  },
  glass: {
    backgroundColor: PALETTE.cardGlass,
    shadowColor: PALETTE.primary1,
    shadowOpacity:0.22,
    shadowRadius:18,
    shadowOffset:{ width:0, height:8 },
    elevation:8,
  },

  sectionLabel: { color: PALETTE.textDim, marginBottom:8, fontWeight:'800' },
  select: {
    height:48,
    borderWidth:1,
    borderColor: PALETTE.cardBorder,
    borderRadius:12,
    paddingHorizontal:12,
    flexDirection:'row',
    alignItems:'center',
    justifyContent:'space-between',
    backgroundColor: PALETTE.cardSoft,
  },

  // Minutes control
  minutesRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:6 },
  minutesLabel: { color:PALETTE.text, fontWeight:'900' },
  minutesControl: { flexDirection:'row', alignItems:'center' },
  smallBtn: {
    width:36, height:36, borderRadius:12, borderWidth:1, borderColor: PALETTE.cardBorder,
    alignItems:'center', justifyContent:'center', backgroundColor: 'rgba(10,28,40,0.86)'
  },
  minutesValue: {
    minWidth:64, height:36, marginHorizontal:8, borderRadius:12, borderWidth:1,
    borderColor: PALETTE.cardBorder, alignItems:'center', justifyContent:'center',
    backgroundColor: PALETTE.cardSoft
  },
  subTitle: { color:PALETTE.textDim, marginBottom:6, fontWeight:'600' },

  // Legend
  legendDot: { width:16, height:10, borderRadius:4, borderWidth:1 },

  // Grid
  gridHeader: { flexDirection:'row' },
  row: { flexDirection:'row' },
  cell: { width:84, height:40, borderWidth:1, borderColor: PALETTE.cardBorder, alignItems:'center', justifyContent:'center', backgroundColor:PALETTE.slotBg },
  cornerCell: { backgroundColor:PALETTE.slotHead },
  dayHead: { backgroundColor:PALETTE.slotHead },
  timeCell: { backgroundColor:PALETTE.slotHead },
  headerText: { fontWeight:'900', color: PALETTE.text },
  timeText: { color:PALETTE.text },

  slotCell: { backgroundColor:PALETTE.slotBg },
  slotActive: {
    backgroundColor: PALETTE.slotActiveBg,
    borderColor: PALETTE.slotActiveBorder,
    shadowColor: PALETTE.primary2,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  slotBusy: {
    backgroundColor: PALETTE.slotBusyBg,
    borderColor: PALETTE.slotBusyBorder,
  },

  // Summary
  summaryBox: {
    marginTop:10,
    paddingVertical:10,
    paddingHorizontal:12,
    backgroundColor:'rgba(6,182,212,0.14)',
    borderRadius:12,
    borderWidth:1,
    borderColor: PALETTE.cardBorder
  },
  summaryText: { color:PALETTE.textDim, fontWeight:'700' },

  // AI Change Box
  aiChangeBox: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: 'rgba(14,165,233,0.12)',
    borderWidth: 1,
    borderColor: '#145E7A',
    borderRadius: 14,
  },
  aiChangeHeaderRow: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 },
  aiChangeTitle: { fontWeight:'900', color:'#CFF3FF', fontSize:15, lineHeight:22 },
  aiChangeBadge: { backgroundColor:'rgba(2,132,199,0.6)', color:'#E0F2FE', borderRadius:999, paddingHorizontal:10, paddingVertical:4, fontWeight:'900', overflow:'hidden' },
  aiChangeSubtitle: { marginTop:2, color:'#E0F2FE', fontWeight:'800', lineHeight:20 },
  aiChangeChipsWrap: { flexDirection:'row', flexWrap:'wrap', gap:8, marginTop:6 },
  aiChip: {
    flexDirection:'row',
    alignItems:'center',
    paddingHorizontal:10, paddingVertical:6,
    borderRadius:999,
    backgroundColor:'rgba(34,211,238,0.14)',
    borderWidth:1, borderColor: PALETTE.primary2,
  },
  aiChipText: { color:'#E0FBFF', fontWeight:'800', lineHeight:18 },
  aiChangeActions: { flexDirection:'row', justifyContent:'flex-end', gap:8, marginTop:12 },
  aiSmallBtn: { paddingHorizontal:12, paddingVertical:8, borderRadius:10 },
  aiSmallBtnText: { color:'#fff', fontWeight:'900' },

  // Buttons
  saveBtn: {
    marginTop:10,
    height:50,
    borderRadius:14,
    alignItems:'center',
    justifyContent:'center',
    overflow:'hidden',
    shadowColor: PALETTE.primary1,
    shadowOpacity:0.35,
    shadowRadius:12,
    elevation:6,
  },
  saveBtnGradient: { ...StyleSheet.absoluteFillObject, borderRadius:14 },
  saveBtnText: { color:'#fff', fontWeight:'900', zIndex:1 },

  // Modal (picker)
  modalWrap: { flex:1, backgroundColor:'rgba(0,0,0,0.45)', alignItems:'center', justifyContent:'center', padding:16 },
  modalCard: { width:'92%', maxHeight:'72%', borderRadius:16, padding:14, borderWidth:1, borderColor: PALETTE.cardBorder },
  optionBtn: {
    paddingVertical:12,
    paddingHorizontal:12,
    borderWidth:1,
    borderColor: PALETTE.cardBorder,
    borderRadius:12,
    backgroundColor: PALETTE.cardSoft,
    flexDirection:'row',
    justifyContent:'space-between',
    alignItems:'center'
  },
  modalClose: { marginTop:12, alignSelf:'flex-end' },

  // Chat
  chatCard: { flexShrink:1 },
  chatScroll: { flex:1 },
  msg: { padding:10, borderRadius:12, marginBottom:8, maxWidth:'90%' },
  msgAi: { backgroundColor:'rgba(34,211,238,0.18)', alignSelf:'flex-start', borderWidth:1, borderColor:PALETTE.cardBorder },
  msgUser: { backgroundColor:'rgba(163,230,53,0.18)', alignSelf:'flex-end',   borderWidth:1, borderColor:'rgba(163,230,53,0.35)' },
  msgAiText: { color:PALETTE.text },
  msgUserText: { color:PALETTE.text, fontWeight:'800' },
  chatInputRow: { flexDirection:'row', alignItems:'center', marginTop:10, gap:8 },
  chatInput: {
    flex:1, height:46, borderWidth:1, borderColor: PALETTE.cardBorder, borderRadius:12,
    paddingHorizontal:12, backgroundColor: PALETTE.cardSoft, color:PALETTE.text
  },
  sendBtn: { width:46, height:46, borderRadius:12, alignItems:'center', justifyContent:'center', overflow:'hidden' },
  sendBtnGrad: { ...StyleSheet.absoluteFillObject, borderRadius:12 },

  // Tips Accordion
  tipDivider: { height:1, backgroundColor: PALETTE.cardBorder, marginVertical:8 },
  accHeader: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:8 },
  accHeaderLeft: { flexDirection:'row', alignItems:'center', gap:10 },
  accBody: {
    backgroundColor: PALETTE.cardSoft,
    borderRadius:12,
    borderWidth:1,
    borderColor: PALETTE.cardBorder,
    padding:12,
    marginTop:6
  },
  accActions: { flexDirection:'row', alignItems:'center', gap:8, marginTop:10 },
  accBtn: { flexDirection:'row', alignItems:'center', gap:6, borderRadius:10, paddingHorizontal:12, paddingVertical:10, overflow:'hidden' },
  accBtnGrad: { ...StyleSheet.absoluteFillObject, borderRadius:10 },
  accBtnText: { color:'#fff', fontWeight:'900', zIndex:1 },
  tipIconWrap: { width:42, height:42, borderRadius:14, alignItems:'center', justifyContent:'center' },
  sectionTitle: { fontWeight:'900', color:PALETTE.text, marginBottom:6 },
  tipTitle: { fontWeight:'800', color:PALETTE.text },
  tipDesc: { color:PALETTE.textDim, marginTop:2, lineHeight:18 },

  popOverlay: {
    flex:1,
    backgroundColor:'rgba(0,0,0,0.45)',
    alignItems:'center',
    justifyContent:'center',
    padding:16,
  },
  popCard: {
    width:'92%',
    maxWidth:480,
    borderRadius:20,
    padding:16,
    borderWidth:1,
    borderColor: PALETTE.cardBorder,
    backgroundColor: 'rgba(10,22,34,0.88)',
    overflow:'hidden'
  },
  popAurora: { ...StyleSheet.absoluteFillObject, opacity:0.6, borderRadius:20 },
  popIconWrap: { alignItems:'center', justifyContent:'center', marginBottom:8 },
  popIconGrad: { width:58, height:58, borderRadius:18, alignItems:'center', justifyContent:'center' },
  popTitle: { color:'#EAF6FF', fontWeight:'900', fontSize:18, textAlign:'center', marginTop:6 },
  popMsg: { color:PALETTE.text, marginTop:6, textAlign:'center', lineHeight:20 },
  popNote: { color:PALETTE.textDim, marginTop:6, textAlign:'center', lineHeight:18 },
  popActions: { flexDirection:'row', gap:10, marginTop:14, justifyContent:'center', flexWrap:'wrap' },
  popBtn: {
    paddingVertical:11,
    paddingHorizontal:16,
    borderRadius:12,
    borderWidth:1,
    borderColor: PALETTE.cardBorder,
    backgroundColor: PALETTE.cardSoft,
    overflow:'hidden',
    minWidth:110,
    alignItems:'center',
    justifyContent:'center'
  },
  popBtnPrimary: { borderColor: 'transparent' },
  popBtnDanger: { borderColor: 'transparent' },
  popBtnGrad: { ...StyleSheet.absoluteFillObject, borderRadius:12 },
  popBtnText: { color:'#fff', fontWeight:'900', zIndex:1 },
});
