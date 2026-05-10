import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  RefreshControl,
  Modal,
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

export default function StartedBooksScreen() {
  const uid = auth.currentUser?.uid;
  const navigation = useNavigation();

  const [rawBooks, setRawBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // dropdown states
  const [catOpen, setCatOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด');
  const [sortOrder, setSortOrder] = useState('newest'); 

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(collection(db, 'users', uid, 'books'), (qs) => {
      const data = qs.docs
        .map((d) => {
          const b = { id: d.id, ...d.data() };
          const total = Number(b.pages || 0);
          const read  = Math.min(Number(b.currentPage || 0), total);
          const derivedStatus =
            total > 0 && read >= total ? 'อ่านจบแล้ว' : (read >= 1 ? 'กำลังอ่าน' : 'อยากอ่าน');
          return { ...b, _derivedStatus: derivedStatus, _read: read, _total: total, createdAt: b.createdAt };
        })
        .filter(b => b._derivedStatus === 'กำลังอ่าน'); 
      setRawBooks(data);
      setLoading(false);
      setRefreshing(false);
    });
    return () => unsub();
  }, [uid]);

  const toMillis = (ts) => {
    if (!ts) return 0;
    if (typeof ts === 'number') return ts;
    if (ts?.toDate) return ts.toDate().getTime();
    const d = new Date(ts);
    const m = d.getTime();
    return Number.isNaN(m) ? 0 : m;
  };
  const formatDate = (ts) => {
    if (!ts) return '-';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('th-TH');
  };

  //  หมวดหมู่จากข้อมูลจริง
  const categories = useMemo(() => {
    const count = new Map();
    rawBooks.forEach(b => {
      const c = (b.category || 'ไม่ระบุหมวดหมู่').trim();
      count.set(c, (count.get(c) || 0) + 1);
    });
    const ranked = [...count.entries()]
      .sort((a,b) => (b[1]-a[1]) || a[0].localeCompare(b[0], 'th'))
      .map(([name]) => name);
    return ['ทั้งหมด', ...ranked];
  }, [rawBooks]);

  // กรอง + เรียง
  const books = useMemo(() => {
    const filtered = rawBooks.filter(b =>
      selectedCategory === 'ทั้งหมด'
        ? true
        : (b.category || 'ไม่ระบุหมวดหมู่').trim() === selectedCategory
    );
    const sorted = [...filtered].sort((a, b) => {
      const am = toMillis(a.createdAt);
      const bm = toMillis(b.createdAt);
      return sortOrder === 'newest' ? bm - am : am - bm;
    });
    return sorted;
  }, [rawBooks, selectedCategory, sortOrder]);

  const onRefresh = () => setRefreshing(true); 

  const renderItem = ({ item: b }) => (
    <View style={styles.card}>
      {/* ปก */}
      {b.coverUri ? (
        <Image
          source={{ uri: b.coverUri }}
          style={styles.coverImg}
          resizeMode="cover"
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
          <Text style={styles.bookTitle} numberOfLines={2}>
            {b.title || 'ไม่มีชื่อเล่ม'}
          </Text>
          <View style={[styles.badge, { backgroundColor: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.35)' }]}>
            <Text style={[styles.badgeText, { color: '#93C5FD' }]}>กำลังอ่าน</Text>
          </View>
        </View>

        <View style={styles.metaBlock}>
          <View style={styles.metaTopRow}>
            {!!b.category && (
              <View style={styles.catPill}>
                <Ionicons name="pricetag-outline" size={12} color={UI.cyan} />
                <Text style={styles.catTxt} numberOfLines={1}>{b.category}</Text>
              </View>
            )}
          </View>
          <Text style={styles.metaDate}>เริ่มอ่านเมื่อ {formatDate(b.createdAt)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      {/* Header */}
      <LinearGradient colors={['#0b1526', '#0b1220']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backWrap} hitSlop={8}>
          <Ionicons name="arrow-back" size={20} color={UI.cyan} />
          <Text style={styles.backTxt}>กลับ</Text>
        </TouchableOpacity>
        <Text style={styles.title}>หนังสือที่กำลังอ่าน</Text>
        <View style={{ width: 56 }} />
      </LinearGradient>

      {/* Toolbar: counter + dropdowns */}
      <View style={styles.toolbar}>
        <Text style={styles.countText}>
          ทั้งหมด <Text style={{ color: UI.text }}>{books.length}</Text> เล่ม
        </Text>

        <View style={styles.toolbarRow}>
          <TouchableOpacity style={styles.dropdown} activeOpacity={0.9} onPress={()=>setCatOpen(true)}>
            <Ionicons name="albums-outline" size={16} color={UI.dim} />
            <Text style={styles.dropdownText} numberOfLines={1}>{selectedCategory}</Text>
            <Ionicons name="chevron-down" size={16} color={UI.dim} />
          </TouchableOpacity>

          <TouchableOpacity style={styles.dropdown} activeOpacity={0.9} onPress={()=>setSortOpen(true)}>
            <Ionicons name="swap-vertical" size={16} color={UI.dim} />
            <Text style={styles.dropdownText}>
              {sortOrder === 'newest' ? 'ใหม่สุด → เก่าสุด' : 'เก่าสุด → ใหม่สุด'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={UI.dim} />
          </TouchableOpacity>
        </View>
      </View>

      {/* List */}
      <FlatList
        contentContainerStyle={styles.listContent}
        data={books}
        keyExtractor={(it) => it.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Ionicons name="sparkles-outline" size={22} color={UI.cyan} />
            <Text style={styles.emptyText}>ยังไม่มีหนังสือที่กำลังอ่าน</Text>
            <Text style={styles.emptySub}>เริ่มจากเพิ่มหนังสือในแผนการอ่านก่อนนะ</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing || loading} onRefresh={onRefresh} tintColor={UI.cyan} />}
        showsVerticalScrollIndicator={false}
      />

      {/* Category Modal (ดึงจากข้อมูลจริง) */}
      <Modal visible={catOpen} transparent animationType="fade" onRequestClose={()=>setCatOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="albums-outline" size={18} color={UI.cyan} />
              <Text style={styles.modalTitle}>เลือกหมวดหมู่</Text>
            </View>

            <FlatList
              data={categories}
              keyExtractor={(c) => c}
              renderItem={({item: cat}) => (
                <TouchableOpacity
                  style={[styles.optionBtn, selectedCategory === cat && styles.optionActive]}
                  onPress={() => { setSelectedCategory(cat); setCatOpen(false); }}
                  activeOpacity={0.9}
                >
                  <Text style={[styles.optionText, selectedCategory === cat && styles.optionTextActive]} numberOfLines={1}>
                    {cat}
                  </Text>
                  {selectedCategory === cat && <Ionicons name="checkmark" size={16} color={UI.cyan} />}
                </TouchableOpacity>
              )}
            />

            <TouchableOpacity onPress={()=>setCatOpen(false)} style={styles.modalClose} activeOpacity={0.9}>
              <Text style={{ color:UI.cyan, fontWeight:'800' }}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sort Modal */}
      <Modal visible={sortOpen} transparent animationType="fade" onRequestClose={()=>setSortOpen(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Ionicons name="swap-vertical" size={18} color={UI.cyan} />
              <Text style={styles.modalTitle}>เรียงตามวันที่เพิ่ม</Text>
            </View>

            {[
              { key: 'newest', label: 'ใหม่สุด → เก่าสุด' },
              { key: 'oldest', label: 'เก่าสุด → ใหม่สุด' },
            ].map(opt => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.optionBtn, sortOrder === opt.key && styles.optionActive]}
                onPress={() => { setSortOrder(opt.key); setSortOpen(false); }}
                activeOpacity={0.9}
              >
                <Text style={[styles.optionText, sortOrder === opt.key && styles.optionTextActive]}>
                  {opt.label}
                </Text>
                {sortOrder === opt.key && <Ionicons name="checkmark" size={16} color={UI.cyan} />}
              </TouchableOpacity>
            ))}

            <TouchableOpacity onPress={()=>setSortOpen(false)} style={styles.modalClose} activeOpacity={0.9}>
              <Text style={{ color:UI.cyan, fontWeight:'800' }}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
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
  countText: { color: UI.dim, marginBottom: 8, fontWeight:'800' },
  toolbarRow: { flexDirection:'row', gap:10 },

  dropdown: {
    flex:1,
    height:40,
    borderRadius:12,
    borderWidth:1,
    borderColor: UI.border,
    backgroundColor: '#0b2230',
    paddingHorizontal:10,
    flexDirection:'row',
    alignItems:'center',
    gap:8
  },
  dropdownText: { color: UI.text, fontWeight:'800', flex:1 },

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

  metaBlock: { marginTop: 6 },
  metaTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaDate: { color: UI.dim, fontSize: 12, marginTop: 4 },

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

  // Modal styles
  modalWrap: { flex:1, backgroundColor:'rgba(0,0,0,0.45)', alignItems:'center', justifyContent:'center', padding:16 },
  modalCard: {
    width:'92%', maxHeight:'70%',
    borderRadius:16,
    backgroundColor: '#0b2230',
    borderWidth:1, borderColor: UI.border,
    padding:14
  },
  modalHeader: { flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 },
  modalTitle: { color: UI.text, fontWeight:'900' },
  optionBtn: {
    paddingVertical:12, paddingHorizontal:12,
    borderRadius:10,
    borderWidth:1, borderColor: UI.border,
    backgroundColor: '#0f2c3d',
    marginBottom:8,
    flexDirection:'row', alignItems:'center', justifyContent:'space-between'
  },
  optionActive: { backgroundColor:'rgba(34,211,238,0.14)', borderColor:'#22d3ee' },
  optionText: { color: UI.text, fontWeight:'800' },
  optionTextActive: { color: UI.cyan },
  modalClose: { alignSelf:'flex-end', marginTop:6 },
});