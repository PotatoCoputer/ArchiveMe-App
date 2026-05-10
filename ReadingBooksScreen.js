import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { auth, db } from './firebase';
import { collection, onSnapshot } from 'firebase/firestore';

const UI = {
  bg: '#0b1220',
  panel: '#0e1526',
  border: 'rgba(255,255,255,0.08)',
  text: '#E8F1FF',
  dim: 'rgba(232,241,255,0.78)',
  cyan: '#22D3EE',
  mint: '#34D399',
  slate: '#94a3b8',
};

const CATEGORIES = [
  'นวนิยาย','การพัฒนาตนเอง','ธุรกิจและการเงิน','จิตวิทยา','วิทยาศาสตร์',
  'ประวัติศาสตร์','ชีวประวัติ','ศิลปะและวัฒนธรรม','การเมือง','ปรัชญา',
  'สุขภาพ','ท่องเที่ยว','อาหาร','เทคโนโลยี','การศึกษา','แฟนตาซี',
  'วิทยาศาสตร์ความลับ','โรแมนติก','อื่นๆ',
];

export default function ReadingWishBooksScreen() {
  const uid = auth.currentUser?.uid;
  const navigation = useNavigation();

  const [books, setBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // ตัวกรองหมวดหมู่
  const [selectedCat, setSelectedCat] = useState('ทั้งหมด');

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(collection(db, 'users', uid, 'books'), (qs) => {
      const data = qs.docs
        .map((d) => {
          const b = { id: d.id, ...d.data() };
          const total = Number(b.pages || 0);
          const read = Math.min(Number(b.currentPage || 0), total);
          const derived =
            total > 0 && read >= total ? 'อ่านจบแล้ว' : read >= 1 ? 'กำลังอ่าน' : 'อยากอ่าน';
          return {
            ...b,
            _derivedStatus: derived,
            _read: read,
            _total: total,
            createdAt: b.createdAt,
          };
        })
        .filter((b) => b._derivedStatus === 'อยากอ่าน');
      setBooks(data);
      setLoading(false);
      setRefreshing(false);
    });
    return () => unsub();
  }, [uid]);

  // สร้างรายการหมวดที่มีอยู่จริงในข้อมูล
  const categoryOptions = useMemo(() => {
    const count = new Map();
    books.forEach(b => {
      const c = (b.category || 'อื่นๆ').trim();
      count.set(c, (count.get(c) || 0) + 1);
    });
    const present = [...count.entries()]
      .sort((a,b)=> b[1]-a[1])
      .map(([name]) => name);
    const merged = Array.from(new Set(['ทั้งหมด', ...present, ...CATEGORIES]));
    return merged;
  }, [books]);

  // กรอง + เรียง
  const listFiltered = useMemo(() => {
    const arr = selectedCat === 'ทั้งหมด'
      ? books
      : books.filter(b => (b.category || 'อื่นๆ').trim() === selectedCat);

    return [...arr].sort((a, b) => {
      const ta = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
      const tb = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
      return tb - ta;
    });
  }, [books, selectedCat]);

  const onRefresh = () => setRefreshing(true); 

  const formatDate = (ts) => {
    if (!ts) return '-';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('th-TH');
  };

  // ===== renderers =====
  const renderItem = ({ item: b }) => (
    <View style={styles.card}>
      {/* ปก */}
      {b.coverUri ? (
        <Image
          source={{ uri: b.coverUri }}
          style={styles.coverImg}
          resizeMode="cover"
          onError={() => {}}
        />
      ) : (
        <View style={styles.coverFallback}>
          <LinearGradient
            colors={['rgba(34,211,238,0.12)', 'rgba(52,211,153,0.12)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <Ionicons name="book-outline" size={26} color={UI.slate} />
        </View>
      )}

      {/* เนื้อหา */}
      <View style={{ flex: 1 }}>
        <View style={styles.titleRow}>
          <Text style={styles.bookTitle} numberOfLines={2} ellipsizeMode="tail">
            {b.title || 'ไม่มีชื่อเล่ม'}
          </Text>
          <View style={[styles.badge, badgeStyle(b._derivedStatus)]}>
            <Text style={[styles.badgeText, badgeTextStyle(b._derivedStatus)]}>
              {b._derivedStatus}
            </Text>
          </View>
        </View>

        {!!b.author && <Text style={styles.author}>โดย {b.author}</Text>}

        <View style={styles.metaRow}>
          {!!b.category && (
            <View style={styles.catPill}>
              <Ionicons name="pricetag-outline" size={12} color={UI.cyan} />
              <Text style={styles.catTxt} numberOfLines={1}>
                {b.category}
              </Text>
            </View>
          )}
          <Text style={styles.meta}>เพิ่มเมื่อ {formatDate(b.createdAt)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <LinearGradient
        colors={['#0b1526', '#0b1220']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backWrap} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={UI.cyan} />
          <Text style={styles.backTxt}>กลับ</Text>
        </TouchableOpacity>

        <Text style={styles.title}>รายการ “อยากอ่าน”</Text>

        <View style={{ width: 56 }} />
      </LinearGradient>

      <View style={styles.toolbar}>
        <Text style={styles.countText}>
          ทั้งหมด {listFiltered.length} เล่ม{selectedCat !== 'ทั้งหมด' ? ` • หมวด: ${selectedCat}` : ''}
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow}
        >
          {categoryOptions.map((cat) => (
            <TouchableOpacity
              key={cat}
              onPress={() => setSelectedCat(cat)}
              activeOpacity={0.9}
              style={[
                styles.catChip,
                selectedCat === cat && { backgroundColor: 'rgba(34,211,238,0.15)', borderColor: 'rgba(34,211,238,0.45)' },
              ]}
            >
              <Ionicons
                name="pricetag-outline"
                size={12}
                color={selectedCat === cat ? UI.cyan : UI.dim}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.catChipTxt, selectedCat === cat && { color: UI.cyan, fontWeight: '800' }]}>
                {cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* List */}
      <FlatList
        contentContainerStyle={styles.listContent}
        data={listFiltered}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="sparkles-outline" size={22} color={UI.cyan} />
            <Text style={styles.emptyText}>ยังไม่มีหนังสือในรายการอยากอ่าน</Text>
            <Text style={styles.emptySub}>ไปที่หน้า “เพิ่มหนังสือ” เพื่อเริ่มต้นเลย</Text>
          </View>
        }
        refreshControl={
          <RefreshControl refreshing={refreshing || loading} onRefresh={onRefresh} tintColor={UI.cyan} />
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

function badgeStyle(status) {
  switch (status) {
    case 'กำลังอ่าน':
      return { backgroundColor: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.35)' };
    case 'อยากอ่าน':
      return { backgroundColor: 'rgba(245,158,11,0.12)', borderColor: 'rgba(245,158,11,0.35)' };
    default:
      return { backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.35)' };
  }
}
function badgeTextStyle(status) {
  switch (status) {
    case 'กำลังอ่าน':
      return { color: '#93C5FD' };
    case 'อยากอ่าน':
      return { color: '#FBBF24' };
    default:
      return { color: '#6EE7B7' };
  }
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: UI.bg },

  header: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backWrap: { flexDirection: 'row', alignItems: 'center', width: 56, gap: 6 },
  backTxt: { color: UI.cyan, fontWeight: '800' },
  title: { color: UI.text, fontWeight: '900', fontSize: 18 },

  toolbar: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: UI.border,
    backgroundColor: '#0b1322',
  },
  countText: { color: UI.dim, marginBottom: 8 },

  catRow: { gap: 8, paddingRight: 6 },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  catChipTxt: { color: UI.dim, fontSize: 13 },

  listContent: { padding: 14, paddingBottom: 24 },

  card: {
    flexDirection: 'row',
    gap: 12,
    borderRadius: 14,
    padding: 12,
    backgroundColor: UI.panel,
    borderWidth: 1,
    borderColor: UI.border,
    shadowColor: '#22D3EE',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },

  // ปก
  coverImg: {
    width: 66,
    height: 88,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: UI.border,
  },
  coverFallback: {
    width: 66,
    height: 88,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: UI.border,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
  bookTitle: {
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
    color: UI.text,
    fontSize: 16,
    fontWeight: '800',
    lineHeight: 20,
  },
  author: { color: UI.dim, marginTop: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  meta: { color: UI.dim, fontSize: 12 },

  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(34,211,238,0.35)',
    backgroundColor: 'rgba(34,211,238,0.10)',
  },
  catTxt: { color: UI.cyan, fontSize: 12, maxWidth: 120 },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  badgeText: { fontWeight: '800', fontSize: 12 },

  emptyBox: {
    marginTop: 24,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: UI.panel,
    alignItems: 'center',
    gap: 6,
  },
  emptyText: { color: UI.text, fontWeight: '900' },
  emptySub: { color: UI.dim, fontSize: 12 },
});
