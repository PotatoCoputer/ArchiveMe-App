// HomeScreen.js
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert,
  FlatList, ScrollView, Image, ImageBackground, AppState
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { collection, doc, onSnapshot, query, getDocs, where } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

const DAYS_TH = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

const BG_IMAGE = require('./assets/wallpaper.jpg');

const OVERLAY_GRADIENT = [
  'rgba(6,12,17,0.86)',
  'rgba(6,12,17,0.46)',
  'rgba(6,12,17,0.86)',
];

const THEME = {
  bgGlass: 'rgba(10,12,18,0.50)',
  innerPanel: 'rgba(8,10,16,0.65)',
  borderNeon: ['#34D6FF', '#7C4DFF', '#FFB547'], // cyan -> violet -> amber
  textPrimary: '#F7FBFF',
  textSecondary: 'rgba(247,251,255,0.85)',
  textMuted: 'rgba(247,251,255,0.70)',
  mint: '#7CF5D1',
  cyan: '#34D6FF',
  violet: '#7C4DFF',
  amber: '#FFB547',
};

function goToReadingPlan(navigation) {
  try {
    navigation.navigate('Main', { screen: 'แผนการอ่าน' });
  } catch (e) {
    console.log('navigate error:', e);
    Alert.alert('ไปหน้าแผนการอ่าน', 'เปิดไม่สำเร็จ ลองใช้เมนูด้านข้างแทน');
  }
}

const pad2 = (n)=>String(n).padStart(2,'0');

const getTodayRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
};

const formatMinutesThai = (m) => {
  const mm = Math.max(0, Number(m)||0);
  if (mm < 60) return `${mm} นาที`;
  const h = Math.floor(mm/60);
  const r = mm % 60;
  return r ? `${h} ชม. ${r} นาที` : `${h} ชม.`;
};

// เช็คว่า “อ่านจบแล้ว” 
const isFinished = (b) => {
  const pages = Number(b.pages) || 0;
  const cur   = Number(b.currentPage) || 0;
  return pages > 0 && cur >= pages;
};

const GlassCard = ({ children, style, intensity = 54 }) => {
  return (
    <View style={[styles.cardNeonWrap, style]}>
      <LinearGradient
        colors={THEME.borderNeon}
        start={{x:0,y:0}} end={{x:1,y:1}}
        style={styles.cardNeonBorder}
      />
      <View style={styles.cardWrapper}>
        <BlurView intensity={intensity} tint="dark" style={styles.cardBlur} />
        <LinearGradient
          colors={['rgba(0,0,0,0.35)','rgba(0,0,0,0.22)']}
          start={{x:0,y:0}} end={{x:1,y:1}}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.cardInnerBg} />
        <View style={styles.cardInner}>{children}</View>
      </View>
    </View>
  );
};

/* === utils สำหรับแนะนำหนังสือ === */
const ensureHttps = (u) => (u ? String(u).trim().replace(/^http:\/\//i, 'https://') : null);
const safeAuthor = (a) => {
  const s = (a || '').toString().trim().toLowerCase();
  return (!s || s === 'unknown' || s === 'unknow') ? 'ไม่ระบุผู้แต่ง' : a;
};

/* ===== QuoteCard: คำคมวันนี้  ===== */
const QuoteCard = () => {
  const [state, setState] = useState({ loading: true, text: null, author: null, error: null });
  const FALLBACK = [
    { text: 'การอ่านคือการเดินทางไกลโดยไม่ต้องก้าวเท้า', author: '—' },
    { text: 'หนึ่งหน้าต่อวัน ก็พาคุณไปสุดเล่มได้', author: 'AchieveMe' },
    { text: 'อ่านให้สั้น แต่ได้มาก', author: '—' },
    { text: 'เริ่มจาก 10 นาที แล้วปล่อยให้สมาธิพาไปต่อ', author: '—' },
  ];

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    (async () => {
      try {
        setState(s => ({ ...s, loading: true, error: null }));
        const r = await fetch('https://api.quotable.io/random', { signal: controller.signal });
        if (!r.ok) throw new Error(`status ${r.status}`);
        const j = await r.json();
        if (!alive) return;
        const text = j?.content || j?.quote || null;
        const author = j?.author || '—';
        if (!text) throw new Error('empty');
        setState({ loading: false, text, author, error: null });
      } catch (e) {
        if (!alive) return;
        const f = FALLBACK[Math.floor(Math.random() * FALLBACK.length)];
        setState({ loading: false, text: f.text, author: f.author, error: 'fallback' });
      }
    })();
    return () => { alive = false; controller.abort(); };
  }, []);

  return (
    <GlassCard style={{ marginTop: -4 }}>
      <View style={styles.quoteRow}>
        <View style={styles.quoteBadge}>
          <Ionicons name="sparkles" size={14} color={THEME.cyan} />
          <Text style={styles.quoteBadgeText}>คำคมวันนี้</Text>
        </View>

        {state.loading ? (
          <View style={styles.quoteSkeleton}>
            <ActivityIndicator size="small" color={THEME.cyan} />
            <Text style={styles.quoteLoadingText}>กำลังโหลด…</Text>
          </View>
        ) : (
          <>
            <Text style={styles.quoteText} numberOfLines={3}>"{state.text}"</Text>
            <Text style={styles.quoteAuthor}>— {state.author}</Text>
            {state.error && (
              <Text style={styles.quoteHint}></Text>
            )}
          </>
        )}
      </View>
    </GlassCard>
  );
};


const normalize = {
  openlib: (w) => {
    const coverId = w.cover_id ?? w.cover_i ?? null;
    const olid = w.cover_edition_key || (w.edition_key && w.edition_key[0]);
    const thumb = coverId
      ? `https://covers.openlibrary.org/b/id/${coverId}-M.jpg`
      : (olid ? `https://covers.openlibrary.org/b/olid/${olid}-M.jpg` : null);

    return {
      id: (w.key || olid || w.title || Math.random()).toString(),
      title: w.title || 'ไม่มีชื่อเรื่อง',
      author: safeAuthor(w.authors?.[0]?.name || 'ไม่ระบุผู้แต่ง'),
      thumb: ensureHttps(thumb),
      source: 'openlib',
      raw: w,
    };
  },

  gbooks: (item) => {
    const rawThumb = item.volumeInfo?.imageLinks?.thumbnail || null;
    return {
      id: (item.id || Math.random()).toString(),
      title: item.volumeInfo?.title || 'ไม่มีชื่อเรื่อง',
      author: safeAuthor(item.volumeInfo?.authors?.[0] || 'ไม่ระบุผู้แต่ง'),
      thumb: ensureHttps(rawThumb),
      source: 'gbooks',
      raw: item,
    };
  },

  gutendex: (b) => ({
    id: String(b.id),
    title: b.title || 'ไม่มีชื่อเรื่อง',
    author: safeAuthor(b.authors?.[0]?.name || 'ไม่ระบุผู้แต่ง'),
    thumb: ensureHttps(b.formats?.['image/jpeg'] || null),
    source: 'gutendex',
    raw: b,
  }),
};

const withTimeout = (p, ms = 6000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); res(v); })
     .catch((e) => { clearTimeout(t); rej(e); });
  });

async function fetchOpenLibraryBySubjects(subjects = [], signal) {
  const sub = subjects[0] || 'reading';
  const url = `https://openlibrary.org/subjects/${encodeURIComponent(sub)}.json?limit=20`;
  const r = await withTimeout(fetch(url, { signal }));
  if (!r.ok) throw new Error(`openlib ${r.status}`);
  const j = await r.json();
  return (j?.works || []).map(normalize.openlib);
}

async function fetchGoogleBooksBySubjects(subjects = [], signal) {
  const sub = subjects[0] || 'reading';
  const q = `subject:${sub}`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=20`;
  const r = await withTimeout(fetch(url, { signal }));
  if (!r.ok) throw new Error(`gbooks ${r.status}`);
  const j = await r.json();
  return (j?.items || []).map(normalize.gbooks);
}

async function fetchGutendexSearch(keyword = 'reading', signal) {
  const url = `https://gutendex.com/books?search=${encodeURIComponent(keyword)}`;
  const r = await withTimeout(fetch(url, { signal }));
  if (!r.ok) throw new Error(`gutendex ${r.status}`);
  const j = await r.json();
  return (j?.results || []).map(normalize.gutendex);
}

function useRecommendedBooks(seedGenres = []) {
  const [state, setState] = useState({ loading: true, items: [], source: null, err: null });

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();

    (async () => {
      try {
        const a1 = await fetchOpenLibraryBySubjects(seedGenres, controller.signal).catch(() => null);
        if (a1?.length && alive) { setState({ loading:false, items:a1, source:'openlib', err:null }); return; }

        const a2 = await fetchGoogleBooksBySubjects(seedGenres, controller.signal).catch(() => null);
        if (a2?.length && alive) { setState({ loading:false, items:a2, source:'gbooks', err:null }); return; }

        const a3 = await fetchGutendexSearch(seedGenres[0] || 'reading', controller.signal).catch(() => null);
        if (a3?.length && alive) { setState({ loading:false, items:a3, source:'gutendex', err:null }); return; }

        if (alive) setState({ loading:false, items:[], source:null, err:'no-result' });
      } catch (e) {
        if (!alive) return;
        setState({ loading:false, items:[], source:null, err:String(e?.message||e) });
      }
    })();

    return () => { alive = false; controller.abort(); };
  }, [JSON.stringify(seedGenres)]);

  return state;
}

const BookRecsCard = ({ seedGenres = ['productivity','self-help','learning'], navigation }) => {
  const { loading, items, source, err } = useRecommendedBooks(seedGenres);

  if (loading && !items.length) {
    return (
      <GlassCard>
        <View style={{ flexDirection:'row', alignItems:'center', gap:10 }}>
          <View style={styles.quoteBadge}>
            <Ionicons name="book-outline" size={14} color={THEME.cyan} />
            <Text style={styles.quoteBadgeText}>แนะนำหนังสือ</Text>
          </View>
          <ActivityIndicator color={THEME.cyan} />
          <Text style={{ color:THEME.textSecondary }}>กำลังค้นหา...</Text>
        </View>
      </GlassCard>
    );
  }

  if (!items.length) {
    return (
      <GlassCard>
        <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
          <View style={styles.quoteBadge}>
            <Ionicons name="book-outline" size={14} color={THEME.cyan} />
            <Text style={styles.quoteBadgeText}>แนะนำหนังสือ</Text>
          </View>
          <Text style={{ color:THEME.textMuted, fontSize:12 }}>
            {err ? 'ออฟไลน์/บริการภายนอกไม่ตอบสนอง' : 'ยังไม่มีคำแนะนำ'}
          </Text>
        </View>
        <Text style={{ color:THEME.textSecondary, marginTop:8 }}>
          ลองเชื่อมต่ออินเทอร์เน็ต หรือเปลี่ยนหัวข้อความสนใจดูนะ
        </Text>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <View style={styles.quoteBadge}>
          <Ionicons name="book-outline" size={14} color={THEME.cyan} />
          <Text style={styles.quoteBadgeText}>แนะนำหนังสือ</Text>
        </View>
        <Text style={{ color:THEME.textMuted, fontSize:12 }}>
          จาก {source === 'openlib' ? 'Open Library'
               : source === 'gbooks' ? 'Google Books'
               : 'Gutendex'}
        </Text>
      </View>

      <FlatList
        data={items.slice(0, 12)}
        keyExtractor={(it) => String(it.id)}
        horizontal
        showsHorizontalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ width: 10 }} />}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={recStyles.card}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('RecomendBook', { book: item })}
          >
            <View style={recStyles.coverWrap}>
              {item.thumb ? (
                <Image source={{ uri: ensureHttps(item.thumb) }} style={recStyles.cover} />
              ) : (
                <View style={recStyles.coverEmpty}>
                  <Ionicons name="book" size={18} color="rgba(255,255,255,0.6)" />
                </View>
              )}
            </View>
            <Text style={recStyles.title} numberOfLines={2}>{item.title}</Text>
            <Text style={recStyles.author} numberOfLines={1}>{safeAuthor(item.author)}</Text>
          </TouchableOpacity>
        )}
      />
    </GlassCard>
  );
};

// ===== สถิติรายวัน =====
function SmallStatItem({ label, value, unit, icon }) {
  return (
    <View style={dailyStyles.item}>
      <View style={dailyStyles.itemHeader}>
        <View style={dailyStyles.itemIcon}>
          <Ionicons name={icon} size={14} color="#C7E7FF" />
        </View>
        <Text style={dailyStyles.itemLabel} numberOfLines={1}>{label}</Text>
      </View>
      <View style={dailyStyles.itemValueWrap}>
        <Text
          style={dailyStyles.itemValue}
          numberOfLines={1}
          ellipsizeMode="clip"
          adjustsFontSizeToFit
        >
          {value}
        </Text>
        {!!unit && (
          <Text
            style={dailyStyles.itemUnit}
            numberOfLines={1}
            ellipsizeMode="clip"
            adjustsFontSizeToFit
          >
            {unit}
          </Text>
        )}
      </View>
    </View>
  );
}

function StatRow({ icon, label, value, unit }) {
  return (
    <View style={dailyStyles.row}>
      <View style={dailyStyles.rowLeft}>
        <View style={dailyStyles.rowIcon}>
          <Ionicons name={icon} size={16} color="#C7E7FF" />
        </View>
        <Text style={dailyStyles.rowLabel} numberOfLines={1}>{label}</Text>
      </View>

      <View style={dailyStyles.rowRight}>
        <Text style={dailyStyles.rowValue} numberOfLines={1} adjustsFontSizeToFit>
          {value}
        </Text>
        {!!unit && <Text style={dailyStyles.rowUnit}>{unit}</Text>}
      </View>
    </View>
  );
}

function DailyStatsCard({ pages, minutesRaw, speed }) {
  const minutesCompact = formatMinutesThai(minutesRaw);
  return (
    <GlassCard>
      <View style={dailyStyles.headerRow}>
        <View style={styles.quoteBadge}>
          <Ionicons name="calendar-outline" size={14} color={THEME.cyan} />
          <Text style={styles.quoteBadgeText}>สถิติการอ่านรายวัน</Text>
        </View>
      </View>

      <View style={dailyStyles.list}>
        <StatRow icon="book-outline"        label="หน้าที่อ่านแล้ว"   value={String(pages)}        unit="หน้า" />
        <View style={dailyStyles.divider} />
        <StatRow icon="time-outline"        label="เวลาอ่านทั้งหมด"    value={minutesCompact}     unit=""    />
        <View style={dailyStyles.divider} />
        <StatRow icon="speedometer-outline" label="ความเร็วในการอ่าน" value={String(speed)}        unit="หน้า/นาที" />
      </View>
    </GlassCard>
  );
}

export default function HomeScreen({ navigation }) {
  const [displayName, setDisplayName] = useState('คุณ');
  const [loading, setLoading] = useState(true);
  const [books, setBooks] = useState([]);

  // ===== Daily stats state =====
  const [dailyStats, setDailyStats] = useState({ pages:0, minutes:0, speed:0 });
  const [todayKey, setTodayKey] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
  });

  // ---------- Load user + books ----------
  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (!user) { navigation.replace('Login'); return; }

      const userRef = doc(db, 'users', user.uid);
      const unsubUser = onSnapshot(userRef, (snap) => {
        const data = snap.data() || {};
        const name = (data.name || '').trim();
        setDisplayName(name && name.length > 0 ? name : 'คุณ');
      });

      const booksRef = collection(db, 'users', user.uid, 'books');
      const unsubBooks = onSnapshot(query(booksRef),(qs) => {
        const list = qs.docs.map(d => ({ id: d.id, ...d.data() }));
        setBooks(list); setLoading(false);
      });


      return () => { unsubUser(); unsubBooks(); };
    });

    return () => unsubAuth();
  }, [navigation]);

  // ---------- Overall progress ----------
  const totalReadPages = useMemo(
    () => books.reduce((sum, b) => sum + (Number(b.currentPage) || 0), 0), [books]
  );
  const booksFinished = useMemo(
    () => books.filter(b => (Number(b.currentPage) || 0) >= (Number(b.pages) || 0) && Number(b.pages) > 0).length, [books]
  );
  const goalPages = useMemo(() => books.reduce((s,b)=> s + (Number(b.pages)||0), 0), [books]);

  const overallPct = useMemo(() => {
    if (!goalPages || goalPages <= 0) return 0;
    const pct = Math.round((totalReadPages / goalPages) * 100);
    return Math.max(0, Math.min(100, pct));
  }, [totalReadPages, goalPages]);

  // ---------- Slots (วันนี้ + ถัดไป) ----------
  const { todaySlotsAll, nextSlot } = useMemo(() => {
    const res = { todaySlotsAll: [], nextSlot: null };
    if (!books || books.length === 0) return res;
    const now = new Date();
    const dayName = DAYS_TH[now.getDay()];
    const toMinutes = (hhmm) => {
      const [h, m] = (hhmm || '00:00').split(':').map(n => Number(n) || 0);
      return h * 60 + m;
    };
    const slots = [];
    for (const b of books) {
     
      if (isFinished(b)) continue;
      const sch = b?.readingSchedule;
      if (sch && typeof sch === 'object' && sch[dayName]) {
        Object.keys(sch[dayName]).forEach((t) => {
          const mins = Number(sch[dayName][t]) || Number(b.sessionMinutes) || 30;
          slots.push({
            bookId: b.id, title: b.title || 'หนังสือ', start: t, startMin: toMinutes(t),
            minutes: mins, goalPages: Number(b.dailyGoal) || 15,
            pages: Number(b.pages) || 0, currentPage: Number(b.currentPage) || 0,
            coverUri: b.coverUri || null,
          });
        });
      }
    }
    if (slots.length === 0) return res;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const sorted = [...slots].sort((a,b)=>a.startMin-b.startMin);
    const future = sorted.filter(s=>s.startMin>=nowMin);
    const chosen = future[0] || sorted[0];
    const endMin = chosen.startMin + chosen.minutes;
    const next = { ...chosen, end: `${pad2(Math.floor(endMin/60))}:${pad2(endMin%60)}` };
    const mapped = sorted.map(s=>{
      const endMin2 = s.startMin + s.minutes;
      return { ...s, end: `${pad2(Math.floor(endMin2/60))}:${pad2(endMin2%60)}` };
    });
    return { todaySlotsAll: mapped, nextSlot: next };
  }, [books]);

  const handleStartReading = (slot) => {
    if (!slot) return;
    navigation.navigate('ReadingTimer', {
      bookId: slot.bookId, title: slot.title, pages: slot.pages, currentPage: slot.currentPage,
    });
  };

  const handleSnooze = () => {
    if (!nextSlot) return;
    navigation.navigate('ReadingScheduleEditor', {
      bookId: nextSlot.bookId,
      returnTo: 'Home',
    });
  };

  // ===== รีเซ็ตสถิติรายวัน =====
  useEffect(() => {
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 50
    );
    const ms = nextMidnight.getTime() - now.getTime();

    const timer = setTimeout(() => {
      const d = new Date();
      setTodayKey(`${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`);
    }, ms);

    return () => clearTimeout(timer);
  }, [todayKey]);

  useEffect(() => {
    let lastKey = todayKey;
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') {
        const d = new Date();
        const k = `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
        if (k !== lastKey) {
          lastKey = k;
          setTodayKey(k);
        }
      }
    });
    return () => sub.remove();
  }, [todayKey]);

  // ===== คำนวณสถิติรายวัน จาก sessions ของแต่ละเล่ม =====
  useEffect(() => {
    let isActive = true;

    const run = async () => {
      if (isActive) setDailyStats({ pages: 0, minutes: 0, speed: 0 });

      const user = auth.currentUser;
      if (!user) return;

      const { start, end } = getTodayRange();

      let pagesToday = 0;
      let minutesToday = 0;

      try {
        const booksSnap = await getDocs(collection(db, 'users', user.uid, 'books'));

        for (const bDoc of booksSnap.docs) {
          const sessCol = collection(db, 'users', user.uid, 'books', bDoc.id, 'sessions');
          const qSess = query(
            sessCol,
            where('createdAt', '>=', start),
            where('createdAt', '<=', end)
          );
          const sessSnap = await getDocs(qSess);

          sessSnap.forEach(s => {
            const d = s.data() || {};
            if (!d.createdAt) return; 
            const pages = Number(d.pagesRead ?? d.pages ?? 0);
            const mins  = Number(d.minutesUsed ?? d.minutes ?? 0);
            pagesToday   += pages;
            minutesToday += mins;
          });
        }
      } catch (e) {
        console.log('daily stats error:', e);
      }

      const speed = minutesToday > 0
        ? Math.round((pagesToday / minutesToday) * 100) / 100
        : 0;

      if (isActive) {
        setDailyStats({ pages: pagesToday, minutes: minutesToday, speed });
      }
    };

    run();
    return () => { isActive = false; };
  }, [auth.currentUser?.uid, todayKey, books.length]);

  // ---------- Loading ----------
  if (loading) {
    return (
      <ImageBackground source={BG_IMAGE} style={styles.bg} resizeMode="cover">
        <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
        <LinearGradient colors={OVERLAY_GRADIENT} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill} />
        <View style={[styles.bg, styles.center]}>
          <ActivityIndicator color="#E8FFF9" />
        </View>
      </ImageBackground>
    );
  }

  // ---------- UI ----------
  return (
    <ImageBackground source={BG_IMAGE} style={styles.bg} resizeMode="cover">
      <BlurView intensity={48} tint="dark" style={StyleSheet.absoluteFill} />
      <LinearGradient colors={OVERLAY_GRADIENT} start={{x:0,y:0}} end={{x:1,y:1}} style={StyleSheet.absoluteFill} />

      <ScrollView contentContainerStyle={styles.scrollContent}>

        {/* Greeting */}
        <GlassCard>
          <Text style={styles.greetTitle}>สวัสดี, {displayName} 👋</Text>
          <Text style={styles.greetSub}>มาดูความคืบหน้าการอ่านของคุณกัน</Text>
        </GlassCard>

        {/* Overall progress */}
        <GlassCard>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>ความคืบหน้าโดยรวม</Text>
            <View style={styles.badge}><Ionicons name="trending-up" size={16} color={THEME.mint} /></View>
          </View>

          <View style={styles.progressRow}>
            <Text style={styles.progressPct}>{overallPct}%</Text>
            <Text style={styles.goalLabel}>หน้ารวมทั้งหมด {goalPages} หน้า</Text>
          </View>

          <View style={styles.progressBarBg}>
            <LinearGradient
              colors={[THEME.mint, THEME.cyan]}
              start={{x:0,y:0}} end={{x:1,y:0}}
              style={[styles.progressBarFill, { width: `${Number.isFinite(overallPct) ? overallPct : 0}%` }]}
            />
          </View>

          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statCaption}>หน้าที่อ่านแล้ว</Text>
              <Text style={styles.statValue}>{totalReadPages} หน้า</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statCaption}>หนังสือที่อ่านจบ</Text>
              <Text style={styles.statValue}>{booksFinished} เล่ม</Text>
            </View>
          </View>
        </GlassCard>

        {/* สถิติการอ่านวันนี้ */}
        <DailyStatsCard
          pages={dailyStats.pages}
          minutesRaw={dailyStats.minutes}
          speed={dailyStats.speed}
        />

        {/* ➜ คำคม */}
        <QuoteCard />

        {/* Next & today queue */}
        <GlassCard>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>คิวถัดไปวันนี้</Text>
            <View style={[styles.circleIcon]}><Ionicons name="time-outline" size={16} color="#C7E7FF" /></View>
          </View>

          {todaySlotsAll.length ? (
            <>
              {/* next slot */}
              <View style={[styles.scheduleBox]}>
                {nextSlot?.coverUri ? (
                  <Image source={{ uri: nextSlot.coverUri }} style={styles.coverThumbLarge} />
                ) : (
                  <View style={styles.scheduleIcon}><Ionicons name="book-outline" size={18} color="#C7E7FF" /></View>
                )}
                <View style={{flex:1}}>
                  <Text style={styles.scheduleTitle} numberOfLines={1}>{nextSlot?.title || '—'}</Text>
                  <Text style={styles.scheduleTime}>
                    {nextSlot?.start} - {nextSlot?.end}
                  </Text>
                  <Text style={styles.scheduleGoal}>เป้าหมายรอบนี้: {nextSlot?.goalPages} หน้า • {nextSlot?.minutes} นาที</Text>
                </View>
              </View>

              <View style={styles.actionRow}>
                <TouchableOpacity onPress={()=>handleStartReading(nextSlot)} style={{flex:1, borderRadius:12}}>
                  <LinearGradient
                    colors={[THEME.cyan, THEME.violet]}
                    start={{x:0,y:0}} end={{x:1,y:0}}
                    style={[styles.primaryBtn, { borderRadius:12 }]}
                  >
                    <Ionicons name="play" size={18} color="#0D1016" />
                    <Text style={styles.primaryBtnText}>เริ่มอ่าน</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity style={[styles.secondaryBtn, {flex:1}]} onPress={handleSnooze}>
                  <Ionicons name="alarm-outline" size={18} color={THEME.cyan} />
                  <Text style={styles.secondaryBtnText}>เลื่อนเวลา</Text>
                </TouchableOpacity>
              </View>

              {/* today list */}
              <Text style={[styles.cardTitle,{marginTop:12}]}>คิววันนี้ทั้งหมด</Text>
              <FlatList
                data={todaySlotsAll}
                keyExtractor={(it,idx)=>`${it.bookId}-${it.start}-${idx}`}
                scrollEnabled={false}
                ItemSeparatorComponent={()=> <View style={{height:8}}/>}
                renderItem={({item})=>(
                  <TouchableOpacity style={styles.slotRow} onPress={()=>handleStartReading(item)}>
                    <View style={styles.slotTime}><Text style={styles.slotTimeText}>{item.start}</Text></View>
                    {item.coverUri ? (
                      <Image source={{ uri: item.coverUri }} style={styles.slotCover} />
                    ) : (
                      <View style={styles.slotCoverEmpty}><Ionicons name="book-outline" size={16} color="rgba(255,255,255,0.6)" /></View>
                    )}
                    <View style={{flex:1}}>
                      <Text style={styles.slotTitle} numberOfLines={1}>{item.title}</Text>
                      <Text style={styles.slotMeta}>{item.minutes} นาที • เป้า {item.goalPages} หน้า</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color="rgba(255,255,255,0.6)" />
                  </TouchableOpacity>
                )}
              />
              <TouchableOpacity onPress={() => goToReadingPlan(navigation)}>
                <Text style={styles.viewAllLink}>จัดการตารางทั้งหมด</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.noScheduleText}>วันนี้ยังไม่มีคิวอ่านหนังสือ</Text>
          )}
        </GlassCard>

        <BookRecsCard seedGenres={['productivity','self-help','learning']} navigation={navigation} />

        <View style={{height:24}} />
      </ScrollView>
    </ImageBackground>
  );
}

/* ================= Styles ================= */
const styles = StyleSheet.create({
  // Base
  bg: { flex: 1 },
  center: { justifyContent: 'center', alignItems: 'center' },
  scrollContent: { padding: 16 },

  // ===== Neon Edge Card =====
  cardNeonWrap:{
    borderRadius:18,
    marginBottom:16,
    shadowColor:'#34D6FF',
    shadowOpacity:0.25,
    shadowRadius:18,
    shadowOffset:{ width:0, height:12 },
    elevation:6,
  },
  cardNeonBorder:{
    ...StyleSheet.absoluteFillObject,
    borderRadius:18,
    opacity:0.85,
  },
  cardWrapper:{
    borderRadius:16,
    overflow:'hidden',
    margin:1.5,
    backgroundColor: THEME.bgGlass,
  },
  cardBlur:{ ...StyleSheet.absoluteFillObject },
  cardInnerBg:{
    position:'absolute', left:10, right:10, top:10, bottom:10,
    borderRadius:14,
    backgroundColor: THEME.innerPanel,
    borderWidth:1, borderColor:'rgba(255,255,255,0.06)',
  },
  cardInner:{ padding:14 },

  // Typography
  greetTitle:{
    fontSize:20, fontWeight:'900', letterSpacing:0.2,
    color:THEME.textPrimary, textShadowColor:'rgba(0,0,0,0.7)', textShadowRadius:8,
    marginBottom:4, lineHeight:26
  },
  greetSub:{ fontSize:13, color:THEME.textSecondary, lineHeight:18 },

  cardHeader:{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' },
  cardTitle:{
    fontSize:16, fontWeight:'900', letterSpacing:0.6, textTransform:'uppercase',
    color:THEME.textPrimary, textShadowColor:'rgba(0,0,0,0.6)', textShadowRadius:6
  },
  badge:{
    height:28, paddingHorizontal:10, borderRadius:14,
    borderWidth:1, borderColor:'rgba(124,245,209,0.35)',
    backgroundColor:'rgba(124,245,209,0.10)',
    alignItems:'center', justifyContent:'center'
  },

  // Progress
  progressRow:{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-end', marginTop:10 },
  progressPct:{
    fontSize:34, fontWeight:'900', color:THEME.mint,
    textShadowColor:'rgba(0,0,0,0.75)', textShadowRadius:9, lineHeight:38
  },
  goalLabel:{ color:THEME.textSecondary },

  progressBarBg:{
    marginTop:10, height:12, borderRadius:12, overflow:'hidden',
    backgroundColor:'rgba(255,255,255,0.12)',
    borderWidth:1, borderColor:'rgba(255,255,255,0.18)',
  },
  progressBarFill:{
    height:12, borderRadius:12,
    shadowColor: THEME.cyan,
    shadowOpacity:0.7, shadowRadius:14, shadowOffset:{width:0, height:0},
    elevation:2,
  },

  // Stats
  statsRow:{ flexDirection:'row', gap:10, marginTop:12 },
  stat:{
    flex:1, borderRadius:12, padding:12,
    backgroundColor:'rgba(12,14,20,0.65)',
    borderWidth:1, borderColor:'rgba(255,255,255,0.10)'
  },
  statCaption:{ color:THEME.textMuted, fontSize:12, letterSpacing:0.2 },
  statValue:{ color:THEME.textPrimary, fontWeight:'900', marginTop:2 },

  // Next slot / list
  circleIcon:{
    width:28, height:28, borderRadius:14,
    borderWidth:1, borderColor:'rgba(52,214,255,0.35)',
    backgroundColor:'rgba(52,214,255,0.12)',
    alignItems:'center', justifyContent:'center'
  },
  scheduleBox:{
    flexDirection:'row', alignItems:'center', gap:12, marginTop:12, padding:12,
    borderRadius:12,
    backgroundColor:'rgba(12,14,20,0.65)',
    borderWidth:1, borderColor:'rgba(255,255,255,0.10)'
  },
  scheduleIcon:{
    width:42, height:42, borderRadius:10,
    backgroundColor:'rgba(124,77,255,0.12)',
    borderWidth:1, borderColor:'rgba(124,77,255,0.35)',
    alignItems:'center', justifyContent:'center'
  },
  coverThumbLarge:{ width:42, height:42, borderRadius:10, backgroundColor:'rgba(255,255,255,0.14)' },

  scheduleTitle:{ color:THEME.textPrimary, fontWeight:'900' },
  scheduleTime:{ color:THEME.textSecondary, marginTop:2 },
  scheduleGoal:{ color:THEME.textMuted, marginTop:2 },
  noScheduleText:{ color:THEME.textSecondary, marginTop:8 },

  // Buttons
  actionRow:{ flexDirection:'row', gap:10, marginTop:12 },
  primaryBtn:{
    flex:1, height:46, borderRadius:12, alignItems:'center', justifyContent:'center', flexDirection:'row', gap:8,
    backgroundColor:'transparent',
    borderWidth:0,
  },
  primaryBtnText:{ color:'#0D1016', fontWeight:'900' },
  secondaryBtn:{
    flex:1, height:46, borderRadius:12, alignItems:'center', justifyContent:'center', flexDirection:'row', gap:8,
    backgroundColor:'rgba(52,214,255,0.10)',
    borderWidth:1, borderColor:'rgba(52,214,255,0.45)'
  },
  secondaryBtnText:{ color:THEME.cyan, fontWeight:'900' },
  viewAllLink:{ color:THEME.cyan, marginTop:10, fontWeight:'800', textTransform:'uppercase', letterSpacing:0.5 },

  // Today list
  slotRow:{
    flexDirection:'row', alignItems:'center', gap:10, padding:12, borderRadius:12,
    borderWidth:1, borderColor:'rgba(255,255,255,0.10)',
    backgroundColor:'rgba(12,14,20,0.65)', marginTop:8
  },
  slotTime:{
    width:64, height:38, borderRadius:10,
    backgroundColor:'rgba(255,255,255,0.08)',
    borderWidth:1, borderColor:'rgba(255,255,255,0.10)',
    alignItems:'center', justifyContent:'center'
  },
  slotTimeText:{ fontWeight:'900', color:THEME.textPrimary },
  slotCover:{ width:40, height:40, borderRadius:8, backgroundColor:'rgba(255,255,255,0.12)' },
  slotCoverEmpty:{ width:40, height:40, borderRadius:8, backgroundColor:'rgba(255,255,255,0.08)', borderWidth:1, borderColor:'rgba(255,255,255,0.10)', alignItems:'center', justifyContent:'center' },
  slotTitle:{ fontWeight:'900', color:THEME.textPrimary },
  slotMeta:{ color:THEME.textMuted },

  // ===== Quote styles =====
  quoteRow:{},
  quoteBadge:{
    alignSelf:'flex-start',
    flexDirection:'row', alignItems:'center', gap:6,
    paddingHorizontal:10, height:24, borderRadius:14,
    backgroundColor:'rgba(52,214,255,0.10)',
    borderWidth:1, borderColor:'rgba(52,214,255,0.35)',
    marginBottom:8,
  },
  quoteBadgeText:{ color:'#C7E7FF', fontWeight:'800', fontSize:12 },
  quoteSkeleton:{ flexDirection:'row', alignItems:'center', gap:8, paddingVertical:2 },
  quoteLoadingText:{ color:THEME.textSecondary, fontSize:12 },
  quoteText:{ color:THEME.textPrimary, fontStyle:'italic', lineHeight:20 },
  quoteAuthor:{ color:THEME.textMuted, marginTop:6, alignSelf:'flex-end' },
  quoteHint:{ color:'rgba(247,251,255,0.55)', fontSize:11, marginTop:6 },
});

/* === styles เสริมของการ์ดแนะนำหนังสือ === */
const recStyles = StyleSheet.create({
  card:{
    width: 116,
    padding: 10,
    borderRadius: 12,
    backgroundColor:'rgba(12,14,20,0.65)',
    borderWidth:1, borderColor:'rgba(255,255,255,0.08)'
  },
  coverWrap:{ width:'100%', height: 150, borderRadius:8, overflow:'hidden', backgroundColor:'rgba(255,255,255,0.10)', marginBottom:8 },
  cover:{ width:'100%', height:'100%' },
  coverEmpty:{ flex:1, alignItems:'center', justifyContent:'center' },
  title:{ color:THEME.textPrimary, fontWeight:'900', fontSize:12 },
  author:{ color:THEME.textMuted, fontSize:11, marginTop:2 },
});

/* === styles ของสถิติรายวัน === */
const dailyStyles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  list: { marginTop: 10 },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 8,
    borderRadius: 1,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(12,14,20,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },

  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  rowIcon: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(52,214,255,0.12)',
    borderWidth: 1, borderColor: 'rgba(52,214,255,0.35)',
  },
  rowLabel: { color: THEME.textMuted, fontWeight: '800', fontSize: 12, maxWidth: 180 },

  rowRight: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  rowValue: { color: THEME.textPrimary, fontWeight: '900', fontSize: 22, lineHeight: 24, textAlign: 'right' },
  rowUnit:  { color: THEME.textMuted, fontWeight: '700', fontSize: 12, marginBottom: 2, textAlign: 'right' },
});
