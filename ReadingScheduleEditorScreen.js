import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Platform, StatusBar, Modal, Animated
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { auth, db } from './firebase';
import { doc, getDoc, updateDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { scheduleReadingNotifications } from './notifications';

const DAYS = ['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์'];
const HOURS = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, '0')}:00`);

const MIN_MINUTES = 10;
const MAX_MINUTES = 180;
const STEP_MINUTES = 5;
const DEFAULT_MINUTES = 30;

const UI = {
  bg: '#0b1020',
  panel: '#0e1526',
  glass: 'rgba(255,255,255,0.06)',
  border: 'rgba(173,235,255,0.25)',
  text: '#EAF6FF',
  dim: '#A7D8F0',
  cyan: '#22D3EE',
  mint: '#a3e635',

  slotHead: '#0d2230',
  slotBg: '#0a1b27',
  slotActiveBg: 'rgba(34,211,238,0.16)',
  slotActiveBorder: '#22d3ee',
  slotBusyBg: 'rgba(244,63,94,0.10)',
  slotBusyBorder: 'rgba(244,63,94,0.55)',

  danger: '#F43F5E',
  gray: 'rgba(148,163,184,0.7)',
};

const toHourOnly = (hhmm) => {
  const [H] = String(hhmm || '00:00').split(':');
  const h = String(Math.max(0, Math.min(23, parseInt(H,10) || 0))).padStart(2, '0');
  return `${h}:00`;
};

function useFancyPopup() {
  const [popup, setPopup] = useState({
    visible: false,
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

  React.useEffect(() => {
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
            <LinearGradient colors={['#f59e0b', '#f43f5e']} style={styles.popIconGrad} start={{x:0,y:0}} end={{x:1,y:1}}>
              <Ionicons name="warning" size={28} color="#fff" />
            </LinearGradient>
          </View>

          {!!popup.title && <Text style={styles.popTitle}>{popup.title}</Text>}
          {!!popup.message && <Text style={styles.popMsg}>{popup.message}</Text>}
          {!!popup.note && <Text style={styles.popNote}>{popup.note}</Text>}

          <View style={styles.popActions}>
            {(popup.actions?.length ? popup.actions : [{ label: 'ตกลง', variant: 'primary', onPress: onClose }]).map((a, idx) => (
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
                <LinearGradient
                  colors={a.variant === 'danger' ? ['#ef4444','#f43f5e'] : [UI.cyan, '#06b6d4']}
                  style={styles.popBtnGrad} start={{x:0,y:0}} end={{x:1,y:1}}
                />
                <Text style={styles.popBtnText}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

export default function ReadingScheduleEditorScreen({ route, navigation }) {
  const { bookId } = route.params || {};
  const uid = auth.currentUser?.uid;

  const [selected, setSelected] = useState(new Set());
  const [sessionMinutes, setSessionMinutes] = useState(DEFAULT_MINUTES);
  const [loading, setLoading] = useState(true);
  const [otherBooksSchedule, setOtherBooksSchedule] = useState({});
  const [dayModal, setDayModal] = useState({ visible: false, day: null, items: [] });
  const { popup, show: showPopup, hide: hidePopup } = useFancyPopup();

  /* ---------- โหลดตารางเล่มนี้ ---------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!uid || !bookId) return;
        const snap = await getDoc(doc(db, 'users', uid, 'books', bookId));
        if (!mounted) return;
        if (snap.exists()) {
          const data = snap.data();
          const mins = typeof data.sessionMinutes === 'number' ? data.sessionMinutes : DEFAULT_MINUTES;
          setSessionMinutes(Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, mins)));

          const s = new Set();
          const sched = data.readingSchedule;
          if (sched && typeof sched === 'object') {
            for (const d of Object.keys(sched)) {
              const times = sched[d];
              if (times && typeof times === 'object') {
                for (const t of Object.keys(times)) s.add(`${d}|${toHourOnly(t)}`);
              }
            }
          } else if (data.readingDays && data.readingTime) {
            (Array.isArray(data.readingDays) ? data.readingDays : []).forEach((d) =>
              s.add(`${d}|${toHourOnly(data.readingTime)}`)
            );
          }
          setSelected(s);
        }
      } catch (e) {
        console.log('load schedule error:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [uid, bookId]);

  /* ---------- โหลดตารางเล่มอื่นเพื่อตรวจ ---------- */
  useEffect(() => {
    if (!uid || !bookId) return;
    (async () => {
      try {
        const booksSnap = await getDocs(collection(db, 'users', uid, 'books'));
        const allSched = {};
        booksSnap.forEach((docSnap) => {
          if (docSnap.id === bookId) return;
          const data = docSnap.data();
          if (data.readingSchedule && typeof data.readingSchedule === 'object') {
            for (const d of Object.keys(data.readingSchedule)) {
              for (const t of Object.keys(data.readingSchedule[d] || {})) {
                const key = `${d}|${toHourOnly(t)}`;
                if (!allSched[key]) allSched[key] = [];
                allSched[key].push({ id: docSnap.id, title: data.title || '(ไม่มีชื่อหนังสือ)' });
              }
            }
          } else if (Array.isArray(data.readingDays) && data.readingTime) {
            const t = toHourOnly(data.readingTime);
            data.readingDays.forEach((d) => {
              const key = `${d}|${t}`;
              if (!allSched[key]) allSched[key] = [];
              allSched[key].push({ id: docSnap.id, title: data.title || '(ไม่มีชื่อหนังสือ)' });
            });
          }
        });
        setOtherBooksSchedule(allSched);
      } catch (e) {
        console.log('load other schedules error:', e);
      }
    })();
  }, [uid, bookId]);

  /* ---------- สรุป “วันไหนว่าง/ไม่ว่าง/ถูกเลือก” ---------- */
  const daySummary = useMemo(() => {
    const info = {};
    for (const day of DAYS) info[day] = { selected: 0, conflict: 0 };
    for (const key of selected) {
      const [day] = key.split('|');
      if (info[day]) info[day].selected += 1;
    }
    Object.entries(otherBooksSchedule).forEach(([key, list]) => {
      if (list?.length) {
        const [day] = key.split('|');
        if (info[day]) info[day].conflict += 1;
      }
    });
    return info;
  }, [selected, otherBooksSchedule]);

  /* ---------- เปิดโมดัล “รายละเอียดวันที่ไม่ว่าง” ---------- */
  const openDayDetail = (day) => {
    const items = HOURS.map((h) => {
      const key = `${day}|${h}`;
      const list = otherBooksSchedule[key] || [];
      return list.length ? { time: h, books: list } : null;
    }).filter(Boolean);
    setDayModal({ visible: true, day, items });
  };

  /* ---------- แตะช่องเวลา  ---------- */
  const handleCellPress = (day, hour) => {
    const key = `${day}|${hour}`;
    const hasConflict = (otherBooksSchedule[key]?.length || 0) > 0;
    const active = selected.has(key);

    if (hasConflict && !active) {
      const lines = (otherBooksSchedule[key] || []).map(it => `• ${it.title}`).join('\n');
      showPopup({
        title: 'ไม่ว่างในช่วงเวลานี้',
        message: `${day} เวลา ${hour}`,
        note: `มีแผนการอ่านจองไว้แล้ว:\n${lines}`,
        actions: [
          { label: `ดูรายละเอียดวัน${day}`, variant: 'primary', onPress: () => openDayDetail(day) },
          { label: 'รับทราบ', variant: 'primary' },
        ],
      });
      return;
    }

    setSelected(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const incMinutes = () => setSessionMinutes((m) => Math.min(MAX_MINUTES, m + STEP_MINUTES));
  const decMinutes = () => setSessionMinutes((m) => Math.max(MIN_MINUTES, m - STEP_MINUTES));

  const weeklyCount = selected.size;
  const weeklyMinutes = useMemo(() => weeklyCount * sessionMinutes, [weeklyCount, sessionMinutes]);

  /* ---------- เซฟ ---------- */
  const handleSave = async () => {
    if (!uid || !bookId) return;
    if (selected.size === 0) {
      showPopup({ title: 'ยังไม่ได้เลือกเวลา', note: 'โปรดเลือกวันและเวลาอย่างน้อย 1 ช่อง', actions: [{ label: 'ตกลง', variant: 'primary' }] });
      return;
    }
    const readingSchedule = {};
    for (const key of selected) {
      const [day, time] = key.split('|');
      if (!readingSchedule[day]) readingSchedule[day] = {};
      readingSchedule[day][time] = sessionMinutes;
    }
    try {
      await updateDoc(doc(db, 'users', uid, 'books', bookId), {
        readingSchedule,
        sessionMinutes,
        updatedAt: serverTimestamp(),
      });
      const latest = await getDoc(doc(db, 'users', uid, 'books', bookId));
      if (latest.exists()) {
        await scheduleReadingNotifications(uid, { id: bookId, ...latest.data() });
      }

      if (route?.params?.returnTo === 'Home') {
        if (navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('Main');
        }
        return;
      }

      showPopup({ title: 'บันทึกตารางเรียบร้อย', note: 'เซฟสำเร็จแล้ว', actions: [{ label: 'เยี่ยม!', variant: 'primary' }] });
    } catch (e) {
      showPopup({ title: 'บันทึกไม่สำเร็จ', note: e?.message || 'โปรดลองอีกครั้ง', actions: [{ label: 'ปิด', variant: 'primary' }] });
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.screen, { alignItems:'center', justifyContent:'center' }]}>
        <Text style={{ color: UI.dim }}>กำลังโหลด...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      {/* Header */}
      <LinearGradient colors={['#0b1526', '#0b1220']} start={{ x:0,y:0 }} end={{ x:1,y:1 }} style={styles.header}>
        <TouchableOpacity style={styles.headerLeft} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color={UI.cyan} />
          <Text style={styles.backText}>จัดตารางการอ่าน</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* Minutes + Legend */}
      <View style={styles.minutesRow}>
        <Text style={styles.minutesLabel}>ระยะเวลาอ่านต่อครั้ง</Text>
        <View style={styles.minutesControl}>
          <TouchableOpacity onPress={decMinutes} style={[styles.smallBtn, { marginRight: 8 }]} activeOpacity={0.9}>
            <Ionicons name="remove" size={16} color={UI.cyan} />
          </TouchableOpacity>
          <View style={styles.minutesValue}><Text style={styles.minutesValueTxt}>{sessionMinutes} นาที</Text></View>
          <TouchableOpacity onPress={incMinutes} style={[styles.smallBtn, { marginLeft: 8 }]} activeOpacity={0.9}>
            <Ionicons name="add" size={16} color={UI.cyan} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendBar, { backgroundColor: UI.slotActiveBg, borderColor: UI.slotActiveBorder }]} />
          <Text style={styles.legendText}>เลือกแล้ว</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBar, { backgroundColor: UI.slotBusyBg, borderColor: UI.slotBusyBorder }]} />
          <Text style={styles.legendText}>ไม่ว่าง (เล่มอื่นจอง)</Text>
        </View>
      </View>

      <Text style={styles.subTitle}>เลือกเวลาที่ต้องการอ่าน (แตะที่ช่องเวลา / แตะหัวคอลัมน์เพื่อดูรายละเอียด)</Text>

      {/* Grid */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12 }}>
        <View>
          {/* Header row */}
          <View style={styles.gridHeader}>
            <View style={[styles.cell, styles.cornerCell]}>
              <Text style={styles.headerText}>เวลา</Text>
            </View>
            {DAYS.map((d) => {
              const stat = daySummary[d];
              const dotColor = stat.conflict ? UI.danger : (stat.selected ? UI.cyan : UI.gray);
              return (
                <TouchableOpacity key={d} style={[styles.cell, styles.dayHead]} activeOpacity={0.85} onPress={() => openDayDetail(d)}>
                  <View style={[styles.dayDot, { backgroundColor: dotColor }]} />
                  <Text style={styles.headerText}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <ScrollView style={{ maxHeight: 440 }} showsVerticalScrollIndicator={false}>
            {HOURS.map((h) => (
              <View key={h} style={styles.row}>
                <View style={[styles.cell, styles.timeCell]}>
                  <Text style={styles.timeText}>{h}</Text>
                </View>
                {DAYS.map((d) => {
                  const key = `${d}|${h}`;
                  const active = selected.has(key);
                  const busy = (otherBooksSchedule[key]?.length || 0) > 0 && !active;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => handleCellPress(d, h)}
                      style={[
                        styles.cell,
                        styles.slotCell,
                        active && styles.slotActive,
                        busy && styles.slotBusy,
                      ]}
                      activeOpacity={0.85}
                    >
                      {active && <Ionicons name="checkmark" size={16} color={UI.cyan} />}
                      {busy && !active && (
                        <View pointerEvents="none" style={styles.busyIconWrap}>
                          <Ionicons name="alert-circle-outline" size={18} color={UI.danger} />
                        </View>
                      )}
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
          รวม <Text style={{ fontWeight: '900', color: UI.cyan }}>{weeklyCount}</Text> ครั้ง/สัปดาห์ •{' '}
          <Text style={{ fontWeight: '900', color: UI.mint }}>{weeklyMinutes}</Text> นาที/สัปดาห์
        </Text>
      </View>

      {/* Footer */}
      <View style={styles.footerBtns}>
        <TouchableOpacity style={[styles.footerBtn, styles.cancelBtn]} onPress={() => navigation.goBack()} activeOpacity={0.9}>
          <Text style={styles.cancelText}>ยกเลิก</Text>
        </TouchableOpacity>
        <LinearGradient colors={[UI.cyan, '#06b6d4']} start={{ x:0,y:0 }} end={{ x:1,y:0 }} style={[styles.footerBtn, styles.saveBtn]}>
          <TouchableOpacity onPress={handleSave} activeOpacity={0.9} style={{ alignItems:'center', justifyContent:'center', height:'100%' }}>
            <Text style={styles.saveText}>บันทึกตารางการอ่าน</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* Modal: รายวัน */}
      <Modal
        visible={dayModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setDayModal({ visible:false, day:null, items:[] })}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <LinearGradient
              colors={['rgba(34,211,238,0.10)','rgba(6,182,212,0.06)']}
              start={{x:0,y:0}} end={{x:1,y:1}}
              style={styles.modalAurora}
            />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>รายละเอียดวัน{dayModal.day || ''}</Text>
              <TouchableOpacity onPress={() => setDayModal({ visible:false, day:null, items:[] })}>
                <Ionicons name="close" size={18} color={UI.dim} />
              </TouchableOpacity>
            </View>

            {dayModal.items.length ? (
              <ScrollView style={{ maxHeight: 320 }}>
                {dayModal.items.map((it, idx) => (
                  <View key={idx} style={styles.dayLine}>
                    <View style={styles.timeBadge}><Text style={styles.timeBadgeTxt}>{it.time}</Text></View>
                    <View style={{ flex:1 }}>
                      {it.books.map((bk, i) => (
                        <View key={i} style={styles.dayBookRow}>
                          <Ionicons name="book-outline" size={14} color={UI.cyan} />
                          <Text style={styles.dayBookTxt} numberOfLines={1}>{bk.title}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ))}
              </ScrollView>
            ) : (
              <View style={{ alignItems:'center', paddingVertical:12 }}>
                <Ionicons name="checkmark-circle-outline" size={22} color={UI.mint} />
                <Text style={{ color: UI.text, marginTop: 6 }}>ว่างทั้งวัน 🎉</Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: 'rgba(255,255,255,0.06)', borderColor: UI.border }]}
                onPress={() => setDayModal({ visible:false, day:null, items:[] })}
                activeOpacity={0.9}
              >
                <Text style={styles.modalBtnText}>ปิด</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <FancyPopup popup={popup} onClose={hidePopup} />
    </SafeAreaView>
  );
}

/* ===== STYLES ===== */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },

  header: {
    paddingTop: (Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : 0) + 6,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center' },
  backText: { marginLeft: 6, fontWeight: '800', color: UI.cyan },

  /* minutes + legend */
  minutesRow: {
    marginTop: 10, marginHorizontal: 12, padding: 12,
    borderRadius: 14, backgroundColor: UI.glass, borderWidth: 1, borderColor: UI.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  minutesLabel: { color: UI.text, fontWeight: '800' },
  minutesControl: { flexDirection: 'row', alignItems: 'center' },
  smallBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: UI.border,
    alignItems: 'center', justifyContent: 'center',
  },
  minutesValue: {
    minWidth: 86, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: UI.border,
    alignItems: 'center', justifyContent: 'center',
  },
  minutesValueTxt: { color: UI.text, fontWeight: '900' },

  legendRow: { flexDirection:'row', alignItems:'center', gap:14, paddingHorizontal: 16, paddingTop: 8 },
  legendItem: { flexDirection:'row', alignItems:'center', gap:8 },
  legendBar: { width:26, height:12, borderRadius:6, borderWidth:1 },
  legendText: { color: UI.dim, fontSize: 12, fontWeight:'700' },

  subTitle: { paddingHorizontal: 16, color: UI.dim, marginTop: 8, marginBottom: 8 },

  /* grid */
  gridHeader: { flexDirection: 'row', paddingHorizontal: 12 },
  row: { flexDirection: 'row', paddingHorizontal: 12 },

  cell: {
    width: 92, height: 42,
    borderWidth: 1, borderColor: UI.border,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: UI.slotBg,
    position: 'relative',
  },
  cornerCell: { backgroundColor: UI.slotHead },
  dayHead: { backgroundColor: UI.slotHead, flexDirection:'row', gap:6 },
  dayDot: { width:8, height:8, borderRadius:4 },
  timeCell: { backgroundColor: UI.slotHead },

  headerText: { fontWeight: '900', color: UI.text },
  timeText: { color: UI.text, fontWeight: '700' },

  slotCell: { backgroundColor: UI.slotBg },
  slotActive: {
    backgroundColor: UI.slotActiveBg,
    borderColor: UI.slotActiveBorder,
    shadowColor: UI.cyan,
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  slotBusy: { backgroundColor: UI.slotBusyBg, borderColor: UI.slotBusyBorder },

  busyIconWrap: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },

  /* summary */
  summaryBox: {
    marginTop: 12, marginHorizontal: 12, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: UI.glass, borderWidth: 1, borderColor: UI.border, borderRadius: 14,
  },
  summaryText: { color: UI.dim, fontWeight: '700' },

  /* footer */
  footerBtns: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 16, gap: 10 },
  footerBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  cancelBtn: { backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: UI.border },
  saveBtn: { borderWidth: 0 },
  cancelText: { color: UI.text, fontWeight: '800' },
  saveText: { color: '#0b1220', fontWeight: '900' },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.70)', 
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalCard: {
    width: '90%',
    maxWidth: 520,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: 'rgba(11,18,32,0.97)', 
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  modalAurora: { ...StyleSheet.absoluteFillObject, opacity: 0.45, borderRadius: 18 },
  modalHeader: { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:8 },
  modalTitle: { color: UI.text, fontWeight:'900', fontSize:16 },

  modalActions: { flexDirection:'row', gap:10, marginTop: 12 },
  modalBtn: { flex:1, height:44, borderRadius:12, alignItems:'center', justifyContent:'center', borderWidth:1 },
  modalBtnText: { color: UI.text, fontWeight:'800' },

  /* รายการในโมดัลรายวัน */
  dayLine: { flexDirection:'row', gap:10, paddingVertical:8, borderBottomWidth:1, borderColor:UI.border },
  timeBadge: {
    height:24, minWidth:56, borderRadius:8, paddingHorizontal:8,
    alignItems:'center', justifyContent:'center',
    backgroundColor: UI.slotActiveBg, borderWidth:1, borderColor: UI.slotActiveBorder
  },
  timeBadgeTxt: { color: UI.cyan, fontWeight:'900' },
  dayBookRow: { flexDirection:'row', alignItems:'center', gap:6, marginTop:2 },
  dayBookTxt: { color: UI.text, flex:1 },

  popOverlay: { flex:1, backgroundColor:'rgba(0,0,0,0.45)', alignItems:'center', justifyContent:'center', padding:16 },
  popCard: {
    width:'88%',
    borderRadius:20,
    padding:16,
    borderWidth:1,
    borderColor: UI.border,
    backgroundColor: 'rgba(10,22,34,0.92)',
    overflow:'hidden'
  },
  popAurora: { ...StyleSheet.absoluteFillObject, opacity:0.6, borderRadius:20 },
  popIconWrap: { alignItems:'center', justifyContent:'center', marginBottom:8 },
  popIconGrad: { width:58, height:58, borderRadius:18, alignItems:'center', justifyContent:'center' },
  popTitle: { color:UI.text, fontWeight:'900', fontSize:18, textAlign:'center', marginTop:6 },
  popMsg: { color:UI.text, marginTop:6, textAlign:'center', lineHeight:20 },
  popNote: { color:UI.dim, marginTop:6, textAlign:'center', lineHeight:18 },
  popActions: { flexDirection:'row', gap:10, marginTop:14, justifyContent:'center', flexWrap:'wrap' },
  popBtn: { paddingVertical:11, paddingHorizontal:16, borderRadius:12, borderWidth:1, borderColor: UI.border, overflow:'hidden', minWidth:110, alignItems:'center', justifyContent:'center' },
  popBtnPrimary: { borderColor: 'transparent' },
  popBtnDanger: { borderColor: 'transparent' },
  popBtnGrad: { ...StyleSheet.absoluteFillObject, borderRadius:12 },
  popBtnText: { color:'#fff', fontWeight:'900', zIndex:1 },
});
