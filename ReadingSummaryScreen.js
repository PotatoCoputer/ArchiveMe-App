import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from './firebase';
import {
  doc, getDoc, updateDoc, setDoc, collection, serverTimestamp,
  increment, runTransaction,
} from 'firebase/firestore';

const THEME = {
  bg: '#0f0a19',
  cardSolid: '#1d1530',
  modalSolid: '#1f1636',
  text: '#fdf4ff',
  textDim: '#c4b5fd',
  stroke: 'rgba(255,255,255,0.12)',
  accent: '#22d3ee',      // cyan
  mint: '#34d399',        // mint
  warn: '#f59e0b',
};
const GRAD_CARD = ['#2d1b4c', '#3b256c', '#4338ca'];
const GRAD_PILL = ['#22d3ee', '#34d399'];

/* --- TipsAccordion --- */
function TipsAccordion() {
  const [openKey, setOpenKey] = useState(null);
  const toggle = (k) => setOpenKey(prev => (prev === k ? null : k));

  const items = [
    {
      key: 'goal',
      icon: 'book-outline',
      iconBg: 'rgba(6,182,212,0.15)',
      iconColor: '#22D3EE',
      title: 'กำหนดเป้าหมายการอ่าน',
      desc: 'ตั้งเป้าวันละกี่หน้า/นาที และกำหนดเดดไลน์ที่ชัดเจน ช่วยให้คืบหน้าสม่ำเสมอ',
    },
    {
      key: 'pomodoro',
      icon: 'time-outline',
      iconBg: 'rgba(244,63,94,0.14)',
      iconColor: '#F43F5E',
      title: 'แบ่งเวลาอ่านแบบ Pomodoro',
      desc: 'อ่าน 20–30 นาที/ครั้ง แล้วพัก 5–10 นาที เพื่อคงโฟกัสและไม่ล้า',
    },
    {
      key: 'env',
      icon: 'calendar-outline',
      iconBg: 'rgba(8,145,178,0.15)',
      iconColor: '#38BDF8',
      title: 'จัดสภาพแวดล้อมให้เหมาะสม',
      desc: 'ที่เงียบ แสงพอดี โต๊ะโล่ง ปิดแจ้งเตือนก่อนเริ่มอ่าน ช่วยเพิ่มสมาธิ',
    },
    {
      key: 'log',
      icon: 'clipboard-outline',
      iconBg: 'rgba(34,197,94,0.12)',
      iconColor: '#22C55E',
      title: 'บันทึกความคืบหน้า',
      desc: 'จดจำนวนหน้า/เวลา และข้อคิดสำคัญสั้น ๆ เพื่อดูแนวโน้มและปรับแผน',
    },
  ];

  return (
    <LinearGradient colors={GRAD_CARD} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.acBorder}>
      <View style={styles.acSolid}>
        <Text style={styles.title}>คำแนะนำในการอ่านหนังสือ</Text>

        {items.map((it) => {
          const opened = openKey === it.key;
          return (
            <View key={it.key} style={styles.acItemBox}>
              {/* Header */}
              <TouchableOpacity onPress={()=>toggle(it.key)} activeOpacity={0.92} style={styles.acHeaderRow}>
                <View style={styles.acHeaderLeft}>
                  <View style={[styles.tipIconWrap, { backgroundColor: it.iconBg }]}>
                    <Ionicons name={it.icon} size={18} color={it.iconColor} />
                  </View>
                  <Text style={styles.tipTitle}>{it.title}</Text>
                </View>
                <Ionicons name={opened ? 'chevron-up' : 'chevron-down'} size={18} color={THEME.textDim} />
              </TouchableOpacity>

              {/* Body */}
              {opened && (
                <View style={styles.acBodyBox}>
                  <Text style={styles.tipDesc}>{it.desc}</Text>
                </View>
              )}
            </View>
          );
        })}
      </View>
    </LinearGradient>
  );
}

export default function ReadingSummaryScreen({ route, navigation }) {
  const { bookId, minutesUsed = 0, pagesRead = 0 } = route.params || {};
  const uid = auth.currentUser?.uid;

  const [book, setBook] = useState(null);
  const [saving, setSaving] = useState(false);

  const [achModal, setAchModal] = useState({ visible: false, list: [] });

  useEffect(() => {
    if (!uid || !bookId) return;
    (async () => {
      const snap = await getDoc(doc(db, 'users', uid, 'books', bookId));
      if (snap.exists()) setBook({ id: snap.id, ...snap.data() });
    })();
  }, [uid, bookId]);

  const total = Number(book?.pages || 0);
  const currentPage = Number(book?.currentPage || 0);

  const appliedPages = useMemo(() => {
    const p = Math.max(0, Number(pagesRead) || 0);
    if (!total) return p;
    const remain = Math.max(0, total - currentPage);
    return Math.min(p, remain);
  }, [pagesRead, total, currentPage]);

  const nextPage = Math.min(total, currentPage + appliedPages);
  const pct = useMemo(() => (total ? Math.round((nextPage / total) * 100) : 0), [total, nextPage]);

  const speed = useMemo(() => {
    const m = Math.max(1, Number(minutesUsed || 0));
    const p = Math.max(0, Number(appliedPages || 0));
    return (p / m).toFixed(1);
  }, [minutesUsed, appliedPages]);

  const applySave = async () => {
    if (!uid || !bookId) return;
    try {
      setSaving(true);

      // 1) เพิ่ม session
      const sessRef = doc(collection(db, 'users', uid, 'books', bookId, 'sessions'));
      await setDoc(sessRef, {
        minutesUsed: Number(minutesUsed || 0),
        pagesRead: Number(appliedPages || 0),
        speed: Number(speed),
        createdAt: serverTimestamp(),
      });

      // 2) อัปเดตหนังสือ
      const wasFinished = (book?.status || '') === 'อ่านจบแล้ว';
      const willBeFinished = !!total && nextPage >= total;

      await updateDoc(doc(db, 'users', uid, 'books', bookId), {
        currentPage: increment(Number(appliedPages || 0)),
        status: willBeFinished ? 'อ่านจบแล้ว' : (nextPage > 0 ? 'กำลังอ่าน' : 'อยากอ่าน'),
        ...(willBeFinished && !wasFinished ? { finishedAt: serverTimestamp() } : {}),
        updatedAt: serverTimestamp(),
      });

      // 3) รวมถาวร aggregate
      await runTransaction(db, async (tx) => {
        const aggRef = doc(db, 'users', uid, 'stats', 'aggregate');
        const snap = await tx.get(aggRef);
        const cur = snap.exists() ? snap.data() : {};
        const tp = Number(cur.totalPages || 0) + Number(appliedPages || 0);
        const tm = Number(cur.totalMinutes || 0) + Math.max(0, Number(minutesUsed || 0));
        const ts = Number(cur.totalSessions || 0) + 1;

        tx.set(aggRef, {
          totalPages: tp,
          totalMinutes: tm,
          totalSessions: ts,
          lastUpdated: serverTimestamp(),
        }, { merge: true });
      });

      // 4) achievements
      const newlyUnlocked = [];
      const achRef = doc(db, 'users', uid, 'stats', 'achievements');

      await runTransaction(db, async (tx) => {
        const snap = await tx.get(achRef);
        const d = snap.exists() ? snap.data() : {};

        const prevPages = Number(d.pagesLifetime || 0);
        const nextPages = prevPages + Number(appliedPages || 0);

        const addFinished = !wasFinished && willBeFinished;
        const prevFinish = Number(d.finishedCountLifetime || 0);
        const nextFinish = prevFinish + (addFinished ? 1 : 0);

        const f1   = !!d.firstFinishUnlocked;
        const f10  = !!d.tenFinishUnlocked;
        const p500 = !!d.pages500Unlocked;

        if (!f1 && nextFinish >= 1)   newlyUnlocked.push('first');
        if (!f10 && nextFinish >= 10) newlyUnlocked.push('ten');
        if (!p500 && nextPages >= 500) newlyUnlocked.push('p500');

        tx.set(achRef, {
          pagesLifetime: nextPages,
          finishedCountLifetime: nextFinish,
          firstFinishUnlocked: f1  || (nextFinish >= 1),
          tenFinishUnlocked:   f10 || (nextFinish >= 10),
          pages500Unlocked:    p500|| (nextPages >= 500),
          lastUpdated: serverTimestamp(),
        }, { merge: true });
      });

      if (newlyUnlocked.length > 0) {
        setAchModal({ visible: true, list: newlyUnlocked });
      } else {
        navigation.reset({
          index: 0,
          routes: [{ name: 'Main', params: { screen: 'แผนการอ่าน' } }],
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const renderAchLine = (key) => {
    switch (key) {
      case 'first':
        return { icon: 'book-outline', color: '#f97316', title: 'นักอ่านมือใหม่', desc: 'อ่านหนังสือเล่มแรกจนจบ' };
      case 'ten':
        return { icon: 'trophy-outline', color: '#6b7280', title: 'นักอ่านผู้เชี่ยวชาญ', desc: 'อ่านหนังสือครบ 10 เล่ม' };
      case 'p500':
        return { icon: 'bookmarks-outline', color: '#16a34a', title: 'ผู้พิชิต 500 หน้า', desc: 'อ่านหนังสือครบ 500 หน้า' };
      default:
        return { icon: 'sparkles-outline', color: THEME.accent, title: 'ความสำเร็จ', desc: 'ปลดล็อคสำเร็จ!' };
    }
  };

  const closePopupAndGo = () => {
    setAchModal({ visible: false, list: [] });
    navigation.reset({
      index: 0,
      routes: [{ name: 'Main', params: { screen: 'แผนการอ่าน' } }],
    });
  };

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ flexDirection:'row', alignItems:'center' }}>
          <Ionicons name="arrow-back" size={20} color={THEME.accent} />
          <Text style={styles.backText}>กลับไปหน้าหนังสือ</Text>
        </TouchableOpacity>
      </View>

      {/* Summary Card */}
      <LinearGradient colors={GRAD_CARD} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.cardBorder}>
        <View style={styles.cardSolid}>
          <Text style={styles.title}>สรุปการอ่าน</Text>
          <Text style={styles.bookTitle} numberOfLines={2}>{book?.title || '-'}</Text>

          <View style={styles.box}>
            <Row k="เวลาที่ใช้" v={`${minutesUsed} นาที`} />
            <Row k="หน้าที่อ่าน (นับจริง)" v={`${appliedPages} หน้า`} />
            <Row k="ความเร็ว" v={`${speed} หน้า/นาที`} />
          </View>

          <Text style={styles.progressLabel}>ความคืบหน้า</Text>
          <View style={styles.progressBg}>
            <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={[styles.progressFill, { width: `${pct}%` }]} />
          </View>
          <View style={styles.progressRow}>
            <Text style={styles.gray}>เริ่มต้น</Text>
            <Text style={styles.gray}>หน้า {nextPage} / {total}</Text>
            <Text style={styles.gray}>จบ</Text>
          </View>

          <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={[styles.primaryBtn, saving && { opacity: .6 }]}>
            <TouchableOpacity style={styles.primaryTap} onPress={applySave} disabled={saving} activeOpacity={0.9}>
              <Ionicons name="save-outline" size={18} color="#0b1220" />
              <Text style={styles.primaryBtnText}>บันทึกความคืบหน้า</Text>
            </TouchableOpacity>
          </LinearGradient>
        </View>
      </LinearGradient>

      <TipsAccordion />

      {/* Achievement Popup */}
      <Modal visible={achModal.visible} transparent animationType="fade" onRequestClose={closePopupAndGo}>
        <View style={ap.modalWrap}>
          <View style={ap.card}>
            <View style={ap.header}>
              <Ionicons name="sparkles-outline" size={22} color={THEME.warn} />
              <Text style={ap.headerText}>ปลดล็อคความสำเร็จ!</Text>
            </View>

            {achModal.list.map((k, idx) => {
              const m = renderAchLine(k);
              return (
                <View key={`${k}-${idx}`} style={ap.item}>
                  <View style={[ap.iconWrap, { backgroundColor: 'rgba(255,255,255,0.08)' }]}>
                    <Ionicons name={m.icon} size={22} color={m.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={ap.title}>{m.title}</Text>
                    <Text style={ap.desc}>{m.desc}</Text>
                  </View>
                </View>
              );
            })}

            <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={ap.btn}>
              <TouchableOpacity onPress={closePopupAndGo} style={ap.btnTap} activeOpacity={0.9}>
                <Text style={ap.btnText}>เยี่ยมไปเลย</Text>
              </TouchableOpacity>
            </LinearGradient>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function Row({ k, v }) {
  return (
    <View style={styles.row}>
      <Text style={styles.gray}>{k}</Text>
      <Text style={styles.bold}>{v}</Text>
    </View>
  );
}

/* ============ Styles ============ */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: THEME.bg },

  header: {
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0) + 8,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderColor: THEME.stroke,
    backgroundColor: THEME.bg,
  },
  backText: { marginLeft: 8, fontWeight: '800', color: THEME.text },

  cardBorder: { margin: 16, borderRadius: 18, padding: 1 },
  cardSolid: { backgroundColor: THEME.cardSolid, borderRadius: 17, borderWidth: 1, borderColor: THEME.stroke, padding: 16 },

  title: { fontWeight: '900', fontSize: 18, color: THEME.text },
  bookTitle: { marginTop: 4, color: THEME.textDim, fontWeight: '800' },

  box: { marginTop: 12, borderWidth: 1, borderColor: THEME.stroke, borderRadius: 12, padding: 12, backgroundColor: '#1b1431' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 },
  gray: { color: THEME.textDim },
  bold: { color: THEME.text, fontWeight: '900' },

  progressLabel: { marginTop: 14, fontWeight: '900', color: THEME.text },
  progressBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 999, overflow: 'hidden', marginTop: 6 },
  progressFill: { height: 8, borderRadius: 999 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },

  primaryBtn: { marginTop: 16, borderRadius: 12, overflow: 'hidden' },
  primaryTap: { paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  primaryBtnText: { color: '#0b1220', fontWeight: '900', marginLeft: 6 },

  /* --- TipsAccordion (match summary card) --- */
  acBorder: { marginHorizontal:16, marginBottom:20, borderRadius:18, padding:1 },
  acSolid:  { backgroundColor: THEME.cardSolid, borderRadius:17, borderWidth:1, borderColor:THEME.stroke, padding:16 },

  acItemBox: {
    marginTop:10,
    borderWidth:1,
    borderColor: THEME.stroke,
    borderRadius:12,
    backgroundColor:'#1b1431',     
    overflow:'hidden',
  },
  acHeaderRow: {
    paddingHorizontal:12,
    paddingVertical:12,
    flexDirection:'row',
    alignItems:'center',
    justifyContent:'space-between',
  },
  acHeaderLeft: { flexDirection:'row', alignItems:'center', gap:10 },

  acBodyBox: {
    borderTopWidth:1,
    borderTopColor: THEME.stroke,
    paddingHorizontal:12,
    paddingVertical:12,
    backgroundColor:'rgba(255,255,255,0.03)',
  },

  tipIconWrap: { width:42, height:42, borderRadius:14, alignItems:'center', justifyContent:'center' },
  tipTitle: { fontWeight:'800', color: THEME.text },
  tipDesc: { color: THEME.textDim, lineHeight: 18 },
});

/* ===== Popup styles ===== */
const ap = StyleSheet.create({
  modalWrap: { flex:1, backgroundColor:'rgba(0,0,0,0.45)', alignItems:'center', justifyContent:'center', padding:16 },
  card: { width:'92%', backgroundColor: THEME.modalSolid, borderRadius:16, borderWidth:1, borderColor: THEME.stroke, padding:16 },
  header: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:10 },
  headerText: { fontWeight:'900', color: THEME.text, fontSize:16 },
  item: { flexDirection:'row', alignItems:'center', gap:12, paddingVertical:10, borderTopWidth:1, borderTopColor: THEME.stroke },
  iconWrap: { width:44, height:44, borderRadius:12, alignItems:'center', justifyContent:'center' },
  title: { fontWeight:'800', color: THEME.text },
  desc: { color: THEME.textDim, marginTop:2 },
  btn: { marginTop:14, borderRadius:12, overflow: 'hidden' },
  btnTap: { height:46, alignItems:'center', justifyContent:'center' },
  btnText: { color:'#0b1220', fontWeight:'900' },
});