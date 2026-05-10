import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  LayoutAnimation,
  UIManager,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export default function ReadingStatsScreen() {
  const [loading, setLoading] = useState(true);

  // ช่วงเวลา
  const [timeBuckets, setTimeBuckets] = useState({
    morning: 0,
    noon: 0,
    evening: 0,
    night: 0,
  });

  // วันในสัปดาห์ 
  const [dowBuckets, setDowBuckets] = useState([0, 0, 0, 0, 0, 0, 0]);

  const [categoryMap, setCategoryMap] = useState({});

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const userSnap = await getDocs(collection(db, 'users'));

        let tbMorning = 0,
          tbNoon = 0,
          tbEvening = 0,
          tbNight = 0;

        const dow = [0, 0, 0, 0, 0, 0, 0]; // อา..เสาร์
        const catMap = {};

        for (const user of userSnap.docs) {
          // หนังสือ
          const booksSnap = await getDocs(collection(db, 'users', user.id, 'books'));
          booksSnap.forEach((b) => {
            const bd = b.data() || {};
            const cat = bd.category || bd.type || bd.genre || 'อื่นๆ';
            catMap[cat] = (catMap[cat] || 0) + 1;
          });

          // sessions ต่อเล่ม
          for (const book of booksSnap.docs) {
            const sessSnap = await getDocs(
              collection(db, 'users', user.id, 'books', book.id, 'sessions')
            );

            sessSnap.forEach((s) => {
              const d = s.data() || {};
              const minutes = Number(d.minutesUsed) || Number(d.minutes) || 1;
              const t =
                d.createdAt?.toDate?.() ||
                d.timestamp?.toDate?.() ||
                (d.createdAt ? new Date(d.createdAt) : null);
              if (!t || isNaN(t.getTime())) return;

              // แบ่งช่วงเวลา
              const h = t.getHours();
              if (h >= 6 && h < 12) tbMorning += minutes;
              else if (h >= 12 && h < 18) tbNoon += minutes;
              else if (h >= 18 && h < 22) tbEvening += minutes;
              else tbNight += minutes;

              // วันในสัปดาห์
              const dayIdx = t.getDay(); 
              dow[dayIdx] += minutes;
            });
          }
        }

        setTimeBuckets({ morning: tbMorning, noon: tbNoon, evening: tbEvening, night: tbNight });
        setDowBuckets(dow);
        setCategoryMap(catMap);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  // % ของช่วงเวลา
  const timePercents = useMemo(() => {
    const { morning: m, noon: n, evening: e, night: ni } = timeBuckets;
    const sum = m + n + e + ni;
    if (!sum) return { morning: 0, noon: 0, evening: 0, night: 0, topKey: 'evening' };

    const pct = {
      morning: Math.round((m * 100) / sum),
      noon: Math.round((n * 100) / sum),
      evening: Math.round((e * 100) / sum),
      night: Math.round((ni * 100) / sum),
    };

    let topKey = 'morning';
    let topVal = pct.morning;
    ['noon', 'evening', 'night'].forEach((k) => {
      if (pct[k] > topVal) {
        topKey = k;
        topVal = pct[k];
      }
    });

    return { ...pct, topKey };
  }, [timeBuckets]);

  // % ของวันในสัปดาห์ + วันยอดนิยม
  const dowPercents = useMemo(() => {
    const sum = dowBuckets.reduce((a, b) => a + b, 0);
    const pct = sum
      ? dowBuckets.map((v) => Math.round((v * 100) / sum))
      : [0, 0, 0, 0, 0, 0, 0];
    let topIdx = 0;
    for (let i = 1; i < pct.length; i++) if (pct[i] > pct[topIdx]) topIdx = i;
    return { pct, topIdx };
  }, [dowBuckets]);

  // ประเภทหนังสือยอดนิยม
  const topCategories = useMemo(() => {
    const entries = Object.entries(categoryMap);
    if (!entries.length) return [];
    const total = entries.reduce((s, [, c]) => s + c, 0);
    return entries
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, count, percent: Math.round((count * 100) / total) }));
  }, [categoryMap]);

  const labelOfTopTime = {
    morning: 'เช้า (06:00 - 12:00)',
    noon: 'กลางวัน (12:00 - 18:00)',
    evening: 'เย็น (18:00 - 22:00)',
    night: 'ก่อนนอน (22:00 - 06:00)',
  }[timePercents.topKey];

  const DOW_LABELS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัส', 'ศุกร์', 'เสาร์'];
  const DOW_ORDER = [1, 2, 3, 4, 5, 6, 0]; // แสดง จันทร์→อาทิตย์

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={{ marginTop: 8 }}>กำลังโหลดข้อมูล...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={{ marginBottom: 8 }}>
        <Text style={styles.pageTitle}>สถิติการอ่าน</Text>
        <Text style={styles.pageSub}>ดูภาพรวมพฤติกรรมการอ่านของผู้ใช้ทั้งหมด</Text>
      </View>

      {/* ช่วงเวลาการอ่านยอดนิยม */}
      <CollapsibleCard
        title="ช่วงเวลาการอ่านยอดนิยม"
        iconName="time-outline"
        defaultOpen={true}
      >
        <ProgressRow
          label="เช้า (06:00 - 12:00)"
          value={timePercents.morning}
          rightText={`(${timeBuckets.morning})`}
        />
        <ProgressRow
          label="กลางวัน (12:00 - 18:00)"
          value={timePercents.noon}
          rightText={`(${timeBuckets.noon})`}
        />
        <ProgressRow
          label="เย็น (18:00 - 22:00)"
          value={timePercents.evening}
          rightText={`(${timeBuckets.evening})`}
        />
        <ProgressRow
          label="ก่อนนอน (22:00 - 06:00)"
          value={timePercents.night}
          rightText={`(${timeBuckets.night})`}
        />
        <Text style={styles.hintText}>ผู้ใช้ส่วนใหญ่อ่านหนังสือในช่วง {labelOfTopTime}</Text>
      </CollapsibleCard>

      {/* วันในสัปดาห์ที่อ่านบ่อย */}
      <CollapsibleCard
        title="วันในสัปดาห์ที่อ่านบ่อย"
        iconName="calendar-outline"
        defaultOpen={false}
      >
        {DOW_ORDER.map((idx) => (
          <ProgressRow
            key={idx}
            label={DOW_LABELS[idx]}
            value={dowPercents.pct[idx]}
            rightText={`(${dowBuckets[idx]})`}
          />
        ))}
        <Text style={styles.hintText}>ผู้ใช้ส่วนใหญ่อ่านในวัน{DOW_LABELS[dowPercents.topIdx]}</Text>
      </CollapsibleCard>

      {/* ประเภทหนังสือยอดนิยม */}
      <CollapsibleCard
        title="ประเภทหนังสือยอดนิยม"
        iconName="bar-chart-outline"
        defaultOpen={false}
      >
        {topCategories.length === 0 ? (
          <Text style={styles.hintMuted}>ยังไม่มีข้อมูลประเภทหนังสือ</Text>
        ) : (
          topCategories.map((c, i) => (
            <ProgressRow
              key={`${c.name}-${i}`}
              label={c.name}
              value={c.percent}
              rightText={`(${c.count})`}
            />
          ))
        )}

        {topCategories[0] && (
          <Text style={styles.hintText}>
            ประเภทหนังสือที่ได้รับความนิยมสูงสุดคือ {topCategories[0].name}
          </Text>
        )}
      </CollapsibleCard>
    </ScrollView>
  );
}

/** ---------- Collapsible Card Component ---------- */
function CollapsibleCard({ title, iconName, children, defaultOpen = true }) {
  const [open, setOpen] = useState(!!defaultOpen);

  const rotate = useRef(new Animated.Value(defaultOpen ? 1 : 0)).current;
  const rotateDeg = rotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'], // 0 = พับ, 90 = กาง
  });

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => {
      const next = !prev;
      Animated.timing(rotate, {
        toValue: next ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }).start();
      return next;
    });
  };

  return (
    <View style={styles.sectionCard}>
      <TouchableOpacity onPress={toggle} activeOpacity={0.8} style={styles.sectionHeaderTouch}>
        <View style={styles.sectionHeaderLeft}>
          {iconName ? <Ionicons name={iconName} size={18} color="#6b7280" style={{ marginRight: 6 }} /> : null}
          <Text style={styles.sectionTitle}>{title}</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate: rotateDeg }] }}>
          <Ionicons name="chevron-forward" size={20} color="#6b7280" />
        </Animated.View>
      </TouchableOpacity>

      {open ? <View style={{ marginTop: 10 }}>{children}</View> : null}
    </View>
  );
}

/** ---------- Progress Row ---------- */
function ProgressRow({ label, value, rightText }) {
  const safeVal = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={styles.rowBetween}>
        <Text style={styles.progressLabel}>{label}</Text>
        <Text style={styles.progressPercent}>
          {safeVal}% {rightText ? rightText : ''}
        </Text>
      </View>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${safeVal}%` }]} />
      </View>
    </View>
  );
}

/** ---------- Styles ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scrollContent: { paddingBottom: 40 },

  pageTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  pageSub: { fontSize: 12, color: '#6b7280', marginTop: 4 },

  sectionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionHeaderTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '600' },

  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  progressLabel: { fontSize: 13, color: '#374151' },
  progressPercent: { fontSize: 12, color: '#6b7280' },
  progressTrack: { height: 8, backgroundColor: '#e5e7eb', borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: '#6366f1', borderRadius: 999 },
  hintText: { marginTop: 8, fontSize: 12, color: '#6b7280' },
  hintMuted: { fontSize: 12, color: '#9ca3af' },
});