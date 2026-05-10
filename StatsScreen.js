import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { auth, db } from './firebase';
import { collection, doc, getDocs, onSnapshot } from 'firebase/firestore';

const PALETTE = {
  bgStart: '#081522',
  bgMid:   '#0b2336',
  bgEnd:   '#0f3142',

  text:    '#E8F7FF',
  textDim: '#A8D1E3',

  cardBorder: '#12344A',
  cardGlass:  'rgba(10, 26, 40, 0.75)',
  cardSoft:   'rgba(13, 30, 46, 0.88)',

  primary1: '#22D3EE',
  primary2: '#60A5FA',
  mint:     '#34D399',
  sky:      '#38BDF8',
  warn:     '#F59E0B',

  barBg:    '#123143',

  violet:   '#A78BFA',
  green:    '#22C55E', 
  amber:    '#F59E0B', 
  blue:     '#60A5FA', 
};

export default function StatsScreen({ navigation }) {
  const uid = auth.currentUser?.uid;

  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState([]);

  const [persistTotals, setPersistTotals] = useState({
    pages: 0,
    minutes: 0,
    sessions: 0,
    finishedBooksCount: 0,
  });

  const [ach, setAch] = useState({
    firstFinishUnlocked: false,
    tenFinishUnlocked: false,
    pages500Unlocked: false,
  });

  useEffect(() => {
    if (!uid) return;

    const unsubBooks = onSnapshot(
      collection(db, 'users', uid, 'books'),
      (qs) => {
        setBooks(qs.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );

    const unsubAgg = onSnapshot(doc(db, 'users', uid, 'stats', 'aggregate'), (snap) => {
      const d = snap.data() || {};
      setPersistTotals({
        pages: Number(d.totalPages || 0),
        minutes: Number(d.totalMinutes || 0),
        sessions: Number(d.totalSessions || 0),
        finishedBooksCount: Number(d.finishedBooksCount || 0),
      });
    });

    const unsubAch = onSnapshot(doc(db, 'users', uid, 'stats', 'achievements'), (snap) => {
      const d = snap.data() || {};
      setAch({
        firstFinishUnlocked: !!d.firstFinishUnlocked,
        tenFinishUnlocked: !!d.tenFinishUnlocked,
        pages500Unlocked: !!d.pages500Unlocked,
      });
    });

    return () => {
      unsubBooks();
      unsubAgg();
      unsubAch();
    };
  }, [uid]);

  const totalPagesRead = persistTotals.pages;
  const totalMinutesRead = persistTotals.minutes;

  const durationLabel = useMemo(() => {
    const m = Math.max(0, Number(totalMinutesRead) || 0);
    if (m < 60) return `${m} นาที`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`;
  }, [totalMinutesRead]);

  const [timeBucketsPct, setTimeBucketsPct] = useState({ morning: 0, noon: 0, evening: 0, night: 0 });
  const [categoryPct, setCategoryPct] = useState([]);

  useEffect(() => {
    if (!uid || books.length === 0) {
      setTimeBucketsPct({ morning: 0, noon: 0, evening: 0, night: 0 });
      setCategoryPct([]);
      return;
    }

    (async () => {
      const timeBuckets = { morning: 0, noon: 0, evening: 0, night: 0 };
      const categoryMinutes = {};

      for (const b of books) {
        try {
          const sessCol = collection(db, 'users', uid, 'books', b.id, 'sessions');
          const snap = await getDocs(sessCol);
          const cat = (b.category || 'อื่นๆ').trim();

          snap.forEach(s => {
            const d = s.data();
            const minutes = Number(d.minutesUsed) || 0;
            if (!minutes) return;
            let h = 19;
            const ts = d.createdAt;
            if (ts?.toDate) h = ts.toDate().getHours();

            if (h >= 6 && h < 12) timeBuckets.morning += minutes;
            else if (h >= 12 && h < 18) timeBuckets.noon += minutes;
            else if (h >= 18 && h < 22) timeBuckets.evening += minutes;
            else timeBuckets.night += minutes;

            categoryMinutes[cat] = (categoryMinutes[cat] || 0) + minutes;
          });
        } catch {}
      }

      const totalBucket = Object.values(timeBuckets).reduce((a, b) => a + b, 0);
      if (totalBucket > 0) {
        setTimeBucketsPct({
          morning: Math.round((timeBuckets.morning / totalBucket) * 100),
          noon: Math.round((timeBuckets.noon / totalBucket) * 100),
          evening: Math.round((timeBuckets.evening / totalBucket) * 100),
          night: Math.round((timeBuckets.night / totalBucket) * 100),
        });
      }

      const catTotal = Object.values(categoryMinutes).reduce((a, b) => a + b, 0);
      if (catTotal > 0) {
        setCategoryPct(
          Object.entries(categoryMinutes)
            .map(([name, mins]) => ({ name, pct: Math.round((mins / catTotal) * 100) }))
            .sort((a, b) => b.pct - a.pct)
        );
      }
    })();
  }, [uid, books]);

  const statusCounts = useMemo(() => {
    const get = (s) => books.filter(b => (b.status || '').trim() === s).length;
    return {
      reading: get('กำลังอ่าน'),
      finished: get('อ่านจบแล้ว'),
      wishlist: get('อยากอ่าน'),
    };
  }, [books]);

  const readingSpeedPagesPerMinute = useMemo(() => {
    const minutes = Number(totalMinutesRead) || 0;
    if (!minutes) return 0;
    const pages = Number(totalPagesRead) || 0;
    return Math.round((pages / minutes) * 100) / 100;
  }, [totalMinutesRead, totalPagesRead]);

  const finishedBooksCount = persistTotals.finishedBooksCount || 0;
  const unlocked = {
    first: ach.firstFinishUnlocked || finishedBooksCount >= 1,
    ten: ach.tenFinishUnlocked || finishedBooksCount >= 10,
    p500: ach.pages500Unlocked || totalPagesRead >= 500,
  };

  if (loading) {
    return (
      <LinearGradient colors={[PALETTE.bgStart, PALETTE.bgMid, PALETTE.bgEnd]} style={styles.gradient}>
        <SafeAreaView style={styles.safe} edges={['left','right']}>
          <StatusBar style="light" translucent backgroundColor="transparent" />
          <View style={{ flex:1, alignItems:'center', justifyContent:'center' }}>
            <ActivityIndicator color={PALETTE.primary2} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={[PALETTE.bgStart, PALETTE.bgMid, PALETTE.bgEnd]} style={styles.gradient}>
      {/* โปร่งใส + ตัวหนังสือสีอ่อน */}
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <SafeAreaView style={styles.safe} edges={['left','right']}>
        <ScrollView stickyHeaderIndices={[0]} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false}>
          {/* Sticky Header (glass) */}
          <View style={styles.headerSticky}>
            <Text style={styles.headerTitle}>สถิติและความสำเร็จ</Text>
            <Text style={styles.headerSub}>ติดตามความก้าวหน้าและนิสัยการอ่านของคุณ</Text>
            <LinearGradient colors={[PALETTE.primary2, PALETTE.primary1]} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.titleBar} />
          </View>

          <View style={styles.body}>
            {/* การ์ดสถิติ — ใส่ accent สีให้แต่ละหมวด */}
            <StatCard
              title="หน้าที่อ่านแล้ว"
              value={`${totalPagesRead}`}
              unit="หน้า"
              icon="book-outline"
              iconGrad={[PALETTE.primary2, PALETTE.primary1]}
              accent={PALETTE.sky}          // 🔹 หมวด "หน้า" = ฟ้า
            />

            <StatCard
              title="เวลาอ่านทั้งหมด"
              value={durationLabel}
              unit=""
              icon="time-outline"
              iconGrad={['#22D3EE','#34D399']}
              accent={PALETTE.mint}         // 🟢 หมวด "เวลา" = เขียวมิ้นต์
            />

            <StatCard
              title="ความเร็วในการอ่าน"
              value={`${readingSpeedPagesPerMinute}`}
              unit="หน้า/นาที"
              icon="trending-up"
              iconGrad={['#60A5FA','#38BDF8']}
              accent={PALETTE.primary2}     // 🔵 หมวด "ความเร็ว" = น้ำเงิน
            />

            {/* สถานะหนังสือ */}
            <View style={styles.blockCard}>
              <Text style={[styles.blockTitle, { color: PALETTE.sky }]}>สถานะหนังสือ</Text>

              <StatusItem
                icon="book-outline"
                color={PALETTE.blue}
                label="กำลังอ่าน"
                value={`${statusCounts.reading} เล่ม`}
                labelColor={PALETTE.blue}
                valueColor={PALETTE.text}
                onPress={() => navigation.navigate('StartedBooks')}
              />

              <StatusItem
                icon="checkmark-circle-outline"
                color={PALETTE.green}
                label="อ่านจบแล้ว"
                value={`${statusCounts.finished} เล่ม`}
                labelColor={PALETTE.green}
                valueColor={PALETTE.text}
                onPress={() => navigation.navigate('FinishedBooks')}
              />

              <StatusItem
                icon="book"
                color={PALETTE.amber}
                label="อยากอ่าน"
                value={`${statusCounts.wishlist} เล่ม`}
                labelColor={PALETTE.amber}
                valueColor={PALETTE.text}
                onPress={() => navigation.navigate('ReadingBooks')}
              />
            </View>

            {/* ความสำเร็จ */}
            <View style={styles.blockCard}>
              <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                <Text style={[styles.blockTitle, { color: PALETTE.blue }]}>ความสำเร็จ</Text>
                <Text style={[styles.achievementCount, { color: PALETTE.textDim }]}>
                  {[unlocked.first, unlocked.ten, unlocked.p500].filter(Boolean).length}/3 ปลดล็อค
                </Text>
              </View>

              <AchievementItem icon="book-outline"      iconColor="#F97316" title="นักอ่านมือใหม่"     desc="อ่านหนังสือเล่มแรกจนจบ"    unlocked={unlocked.first} />
              <AchievementItem icon="trophy-outline"    iconColor="#E5E7EB" title="นักอ่านผู้เชี่ยวชาญ" desc="อ่านหนังสือครบ 10 เล่ม"   unlocked={unlocked.ten} />
              <AchievementItem icon="bookmarks-outline" iconColor="#34D399" title="ผู้พิชิต 500 หน้า"    desc="อ่านหนังสือครบ 500 หน้า" unlocked={unlocked.p500} />
            </View>

            {/* นิสัยการอ่าน */}
            <View style={styles.blockCard}>
              <Text style={[styles.blockTitle, { color: PALETTE.mint }]}>นิสัยการอ่านของคุณ</Text>
              <Text style={[styles.subTitle, { color: PALETTE.sky }]}>ช่วงเวลาที่อ่านบ่อยที่สุด</Text>

              <BarLine label="เช้า (6:00 - 12:00)"     pct={timeBucketsPct.morning} grad={[PALETTE.primary2, PALETTE.primary1]} labelColor={PALETTE.sky} />
              <BarLine label="กลางวัน (12:00 - 18:00)" pct={timeBucketsPct.noon}    grad={['#38BDF8','#60A5FA']} labelColor={PALETTE.blue} />
              <BarLine label="เย็น (18:00 - 22:00)"     pct={timeBucketsPct.evening} grad={['#22D3EE','#34D399']} labelColor={PALETTE.mint} />
              <BarLine label="ก่อนนอน (22:00 - 6:00)"  pct={timeBucketsPct.night}   grad={['#0EA5E9','#60A5FA']} labelColor={PALETTE.violet} />

              <Text style={[styles.subTitle, { marginTop: 14, color: PALETTE.mint }]}>ประเภทหนังสือที่อ่าน</Text>
              {categoryPct.length ? (
                categoryPct.map(c => (
                  <BarLine key={c.name} label={c.name} pct={c.pct} grad={[PALETTE.mint, '#22D3EE']} labelColor={PALETTE.mint} />
                ))
              ) : (
                <Text style={[styles.emptyText, { color: PALETTE.textDim }]}>ยังไม่มีข้อมูล</Text>
              )}
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

/* ---------- Components (UI only) ---------- */
function StatCard({ title, value, unit, icon, iconGrad, accent }) {
  return (
    <View style={[styles.card, accent && { shadowColor: accent }]}>
      <View style={styles.cardHeader}>
        <Text style={[styles.cardTitle, accent && { color: accent }]}>{title}</Text>
        <View style={styles.iconWrap}>
          <LinearGradient colors={iconGrad} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.iconGrad} />
          <Ionicons name={icon} size={18} color="#fff" style={{ zIndex:1 }} />
        </View>
      </View>
      <View style={{ marginTop: 12 }}>
        <Text style={[styles.bigNumber, accent && { color: accent }]}>{value}</Text>
        {!!unit && <Text style={[styles.unitText, accent && { color: accent }]}>{unit}</Text>}
      </View>
    </View>
  );
}

function StatusItem({ icon, color, label, value, onPress, labelColor, valueColor }) {
  const Content = (
    <View style={styles.statusItem}>
      <View style={[styles.leftIcon, { borderColor: color }]}>
        <Ionicons name={icon} size={20} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.statusLabel, labelColor && { color: labelColor }]}>{label}</Text>
        <Text style={[styles.statusValue, valueColor && { color: valueColor }]}>{value}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={PALETTE.textDim} />
    </View>
  );
  return onPress ? <TouchableOpacity onPress={onPress} activeOpacity={0.9}>{Content}</TouchableOpacity> : Content;
}

function BarLine({ label, pct, grad, labelColor }) {
  return (
    <View style={{ marginTop: 10 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={[styles.barLabel, labelColor && { color: labelColor }]}>{label}</Text>
        <Text style={styles.barPct}>{pct}%</Text>
      </View>
      <View style={styles.barBg}>
        <LinearGradient colors={grad} start={{x:0,y:0}} end={{x:1,y:0}} style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

function AchievementItem({ icon, iconColor, title, desc, unlocked }) {
  return (
    <View style={[styles.achItem, !unlocked && { opacity: 0.45 }]}>
      <View style={[styles.achIconBg, { borderColor: iconColor }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text style={styles.achievementTitle}>{title}</Text>
        <Text style={styles.achievementDesc}>{desc}</Text>
      </View>
      {unlocked && (
        <View style={styles.badge}>
          <Ionicons name="sparkles-outline" size={14} color="#fff" />
          <Text style={styles.badgeText}>Unlocked</Text>
        </View>
      )}
    </View>
  );
}

/* ---------- Styles ---------- */
const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safe: { flex: 1, backgroundColor: 'transparent' },

  headerSticky: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: 'rgba(8,22,36,0.78)',
    borderBottomWidth: 1,
    borderColor: PALETTE.cardBorder,
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: PALETTE.text },
  headerSub: { marginTop: 4, color: PALETTE.textDim },
  titleBar: { height: 4, width: 160, borderRadius: 999, marginTop: 8 },

  body: { padding: 16, paddingBottom: 24 },

  card: {
    backgroundColor: PALETTE.cardGlass,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PALETTE.cardBorder,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#22D3EE',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontWeight: '800', color: PALETTE.textDim },
  iconWrap: {
    width: 32, height: 32, borderRadius: 10,
    overflow: 'hidden', alignItems:'center', justifyContent:'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  iconGrad: { ...StyleSheet.absoluteFillObject, borderRadius: 10, opacity: 0.95 },
  bigNumber: { fontSize: 30, fontWeight: '900', color: PALETTE.text },
  unitText: { color: PALETTE.textDim, marginTop: 2 },

  blockCard: {
    backgroundColor: PALETTE.cardGlass,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: PALETTE.cardBorder,
    padding: 16,
    marginTop: 12,
  },
  blockTitle: { fontWeight: '900', color: PALETTE.text },

  statusItem: {
    marginTop: 12,
    backgroundColor: PALETTE.cardSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PALETTE.cardBorder,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leftIcon: {
    width: 42, height: 42, borderRadius: 12,
    alignItems:'center', justifyContent:'center',
    borderWidth: 1, backgroundColor:'rgba(7,25,39,0.75)'
  },
  statusLabel: { color: PALETTE.textDim, marginBottom: 2 },
  statusValue: { color: PALETTE.text, fontWeight: '900', fontSize: 18 },

  subTitle: { marginTop: 10, fontWeight: '800', color: PALETTE.text },
  barLabel: { color: PALETTE.text },
  barPct: { color: PALETTE.textDim },
  barBg: {
    height: 12,
    backgroundColor: PALETTE.barBg,
    borderRadius: 999,
    overflow: 'hidden',
    marginTop: 6,
    borderWidth:1,
    borderColor:'#0F3A52'
  },
  barFill: { height: 12, borderRadius: 999 },

  emptyText: { color: PALETTE.textDim, marginTop: 6 },

  achItem: {
    marginTop: 12,
    backgroundColor: PALETTE.cardSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: PALETTE.cardBorder,
    padding: 12,
    flexDirection:'row',
    alignItems:'center'
  },
  achIconBg: {
    width: 42, height: 42, borderRadius: 12,
    alignItems:'center', justifyContent:'center',
    borderWidth: 1, backgroundColor:'rgba(7,25,39,0.75)'
  },
  achievementTitle: { fontWeight:'800', color: PALETTE.text },
  achievementDesc: { fontSize:12, color: PALETTE.textDim },

  badge: {
    flexDirection:'row', alignItems:'center', gap:6,
    paddingHorizontal:10, paddingVertical:6, borderRadius: 999,
    backgroundColor: 'rgba(34,211,238,0.75)', borderWidth: 1, borderColor: '#22D3EE',
  },
  badgeText: { color:'#003244', fontWeight:'900', fontSize:12 },

  achievementCount: { color: PALETTE.textDim },
});
