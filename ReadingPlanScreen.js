// ReadingPlanScreen.js
import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, FlatList,
  Modal, Image, Pressable, Platform, KeyboardAvoidingView, ImageBackground
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { LinearGradient } from 'expo-linear-gradient';

import { auth, db } from './firebase';
import {
  addDoc, collection, onSnapshot, query, orderBy, serverTimestamp,
  updateDoc, doc, getDocs, writeBatch, runTransaction
} from 'firebase/firestore';

/* =================== DATA =================== */
const CATEGORIES = [
  'นวนิยาย','การพัฒนาตนเอง','ธุรกิจและการเงิน','จิตวิทยา','วิทยาศาสตร์',
  'ประวัติศาสตร์','ชีวประวัติ','ศิลปะและวัฒนธรรม','การเมือง','ปรัชญา',
  'สุขภาพ','ท่องเที่ยว','อาหาร','เทคโนโลยี','การศึกษา','แฟนตาซี',
  'วิทยาศาสตร์ความลับ','โรแมนติก','อื่นๆ',
];
const TABS = ['ทั้งหมด', 'กำลังอ่าน', 'อ่านจบแล้ว', 'อยากอ่าน'];

const deriveStatus = (read, total) => {
  if (total > 0 && read >= total) return 'อ่านจบแล้ว';
  if (read >= 1) return 'กำลังอ่าน';
  return 'อยากอ่าน';
};

const THEME = {
  bg: '#0f0a19',
  bg2: '#151026',
  cardSolid: '#1b1430',
  text: '#fdf4ff',
  textDim: '#c4b5fd',
  glass: 'rgba(255,255,255,0.04)',
  stroke: 'rgba(255,255,255,0.10)',
  strokeStrong: 'rgba(255,255,255,0.16)',
  accent2: '#22d3ee',
  accent3: '#34d399',
  chipDoing: '#818cf8',
  chipRead: '#22c55e',
  chipWish: '#f59e0b',
};
const GRAD_CARD = ['#2d1b4c', '#3b256c', '#4338ca'];
const GRAD_PILL = ['#22d3ee', '#34d399'];
const GRAD_DANGER = ['#ff7a59', '#ef4444'];

/* ===== Local cover files ===== */
const COVER_DIR = FileSystem.documentDirectory + 'covers';
async function ensureCoverDir() {
  const info = await FileSystem.getInfoAsync(COVER_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(COVER_DIR, { intermediates: true });
}
async function copyToCovers(fromUri, bookId, ext = 'jpg') {
  await ensureCoverDir();
  const dest = `${COVER_DIR}/${bookId}.${ext}`;
  try {
    const exist = await FileSystem.getInfoAsync(dest);
    if (exist.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
  } catch {}
  await FileSystem.copyAsync({ from: fromUri, to: dest });
  return dest;
}

function CardShell({ children, style }) {
  return (
    <LinearGradient colors={GRAD_CARD} start={{x:0,y:0}} end={{x:1,y:1}} style={[styles.cardBorder, style]}>
      <View style={styles.cardInner}>{children}</View>
    </LinearGradient>
  );
}

function FancyPopup({
  visible,
  mode = 'alert',
  type = 'info',
  title = '',
  message = '',
  onClose,
  onConfirm,
  confirmText = 'ยืนยัน',
  cancelText = 'ยกเลิก',
}) {
  const palette = {
    info:   { glow: '#22d3ee55', badgeBg: '#0b1722', icon: THEME.accent2 },
    success:{ glow: '#22c55e55', badgeBg: '#0d1a12', icon: '#22c55e' },
    warn:   { glow: '#f59e0b55', badgeBg: '#1f1205', icon: '#f59e0b' },
    danger: { glow: '#ef444455', badgeBg: '#1f0b0b', icon: '#ff7a59' },
  };
  const p = palette[type] || palette.info;

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.popupOverlay}>
        <View style={[styles.popupGlow, { shadowColor: p.glow }]} />
        <LinearGradient colors={['#2e215a','#221a45']} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.popupBorder}>
          <View style={styles.popupCard}>
            <View style={[styles.popupBadge, { backgroundColor: p.badgeBg, shadowColor: p.glow }]}>
              <Ionicons name="warning" size={24} color={p.icon} />
            </View>

            {!!title && <Text style={styles.popupTitle}>{title}</Text>}
            {!!message && <Text style={styles.popupMessage}>{message}</Text>}

            {mode === 'alert' ? (
              <View style={styles.popupBtnRowSingle}>
                <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.popupBtnGrad}>
                  <TouchableOpacity onPress={onClose} activeOpacity={0.9}>
                    <Text style={styles.popupBtnText}>ตกลง</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            ) : (
              <View style={styles.popupBtnRow}>
                <TouchableOpacity onPress={onClose} activeOpacity={0.9} style={styles.popupBtnGhost}>
                  <Text style={styles.popupBtnGhostText}>{cancelText}</Text>
                </TouchableOpacity>
                <LinearGradient colors={GRAD_DANGER} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.popupBtnGrad}>
                  <TouchableOpacity onPress={onConfirm} activeOpacity={0.9}>
                    <Text style={styles.popupBtnText}>{confirmText}</Text>
                  </TouchableOpacity>
                </LinearGradient>
              </View>
            )}
          </View>
        </LinearGradient>
      </View>
    </Modal>
  );
}

export default function ReadingPlanScreen({ navigation }) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('ทั้งหมด');
  const [books, setBooks] = useState([]);
  const [visible, setVisible] = useState(false);

  // form
  const [title, setTitle]   = useState('');
  const [author, setAuthor] = useState('');
  const [pages, setPages]   = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('อยากอ่าน');
  const [newCoverTempUri, setNewCoverTempUri] = useState(null);

  const [popup, setPopup] = useState({
    show: false, mode: 'alert', type: 'info', title: '', message: '', onConfirm: null,
  });
  const closePopup = () => setPopup(p => ({ ...p, show: false }));

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const base = collection(db, 'users', uid, 'books');
    const q = query(base, orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(q, async (snap) => {
      const docsArr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setBooks(docsArr);

      const updates = [];
      for (const d of snap.docs) {
        const b = d.data();
        const total = Number(b.pages || 0);
        const read  = Math.min(Number(b.currentPage || 0), total);
        const computed = deriveStatus(read, total);
        if ((b.status || '') !== computed) {
          updates.push(updateDoc(doc(db, 'users', uid, 'books', d.id), { status: computed }).catch(()=>{}));
        }
      }
      if (updates.length) Promise.allSettled(updates);
    }, (e) => console.log('books onSnapshot error:', e));

    return () => unsub();
  }, []);

  const filtered = useMemo(() => {
    const key = search.trim().toLowerCase();
    const withDerived = books.map(b => {
      const total = Number(b.pages || 0);
      const read  = Math.min(Number(b.currentPage || 0), total);
      const pct   = total ? Math.round((read / total) * 100) : 0;
      const derived = deriveStatus(read, total);
      return { ...b, _read: read, _total: total, _pct: pct, _derivedStatus: derived };
    });

    let rows = activeTab === 'ทั้งหมด'
      ? withDerived
      : withDerived.filter(b => b._derivedStatus === activeTab);

    if (key) {
      rows = rows.filter(
        b =>
          (b.title || '').toLowerCase().includes(key) ||
          (b.author || '').toLowerCase().includes(key)
      );
    }
    return rows;
  }, [books, activeTab, search]);

  // pick cover
  const pickCoverForNew = async () => {
    const { status: perm } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm !== 'granted') {
      setPopup({ show: true, mode: 'alert', type: 'warn', title: 'ต้องการสิทธิ์', message: 'กรุณาอนุญาตเข้าถึงรูปภาพเพื่อเลือกปก' });
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [3, 4], quality: 0.9,
    });
    if (res.canceled) return;
    const asset = res.assets?.[0];
    if (!asset?.uri) return;
    setNewCoverTempUri(asset.uri);
  };

  const handleAddBook = async () => {
    if (!title || !author || !pages || !category) {
      setPopup({
        show: true, mode: 'alert', type: 'warn',
        title: 'กรอกข้อมูลไม่ครบ', message: 'กรุณากรอกชื่อ ผู้แต่ง จำนวนหน้า และประเภทให้ครบก่อนบันทึก',
      });
      return;
    }
    const uid = auth.currentUser?.uid;
    if (!uid) {
      setPopup({ show: true, mode: 'alert', type: 'warn', title: 'ยังไม่เข้าสู่ระบบ', message: 'กรุณาเข้าสู่ระบบก่อนเพิ่มหนังสือ' });
      return;
    }

    try {
      const docRef = await addDoc(collection(db, 'users', uid, 'books'), {
        title: title.trim(),
        author: author.trim(),
        pages: Number(pages),
        category,
        status,
        currentPage: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      if (newCoverTempUri) {
        const localUri = await copyToCovers(newCoverTempUri, docRef.id, 'jpg');
        await updateDoc(docRef, { coverUri: localUri, coverUpdatedAt: Date.now() });
      }

      setVisible(false);
      setTitle(''); setAuthor(''); setPages(''); setCategory(''); setStatus('อยากอ่าน');
      setNewCoverTempUri(null);

      setPopup({ show: true, mode: 'alert', type: 'success', title: 'บันทึกสำเร็จ', message: 'เพิ่มหนังสือเข้ารายการเรียบร้อย' });
    } catch (e) {
      console.log(e);
      setPopup({ show: true, mode: 'alert', type: 'danger', title: 'เกิดข้อผิดพลาด', message: String(e?.message || 'ไม่สามารถเพิ่มหนังสือได้') });
    }
  };

  const renderItem = ({ item }) => {
    const statusComputed = item._derivedStatus;
    const total = item._total;
    const read  = item._read;
    const pct   = item._pct;

    const formatDate = (ts) => {
      if (!ts) return '-';
      const d = ts?.toDate ? ts.toDate() : new Date(ts);
      return Number.isNaN(d.getTime()) ? '-' : d.toISOString().split('T')[0];
    };

    const confirmDelete = () => {
      const uid = auth.currentUser?.uid;
      if (!uid || !item?.id) return;

      const performDelete = async () => {
        try {
          const sessCol = collection(db, 'users', uid, 'books', item.id, 'sessions');
          const sessSnap = await getDocs(sessCol);
          let pagesSum = 0, minutesSum = 0, sessionsCount = 0;
          sessSnap.forEach(s => {
            const d = s.data();
            pagesSum   += Number(d.pagesRead)   || 0;
            minutesSum += Number(d.minutesUsed) || 0;
            sessionsCount += 1;
          });
          if (pagesSum === 0)   pagesSum   = Number(item.totalPagesRead)      || Number(item.currentPage) || 0;
          if (minutesSum === 0) minutesSum = Number(item.totalReadingMinutes) || Number(item.totalMinutes) || 0;

          const aggRef = doc(db, 'users', uid, 'stats', 'aggregate');
          await runTransaction(db, async (tx) => {
            const snap = await tx.get(aggRef);
            const cur = snap.exists() ? snap.data() : {};
            const next = {
              totalPages:   Math.max(0, Number(cur.totalPages||0)   - pagesSum),
              totalMinutes: Math.max(0, Number(cur.totalMinutes||0) - minutesSum),
              totalSessions:Math.max(0, Number(cur.totalSessions||0)- sessionsCount),
              lastUpdated: serverTimestamp(),
            };
            tx.set(aggRef, next, { merge: true });
          });

          const batch = writeBatch(db);
          const sessSnap2 = await getDocs(collection(db, 'users', uid, 'books', item.id, 'sessions'));
          sessSnap2.forEach(s => batch.delete(s.ref));
          batch.delete(doc(db, 'users', uid, 'books', item.id));
          await batch.commit();

          setPopup({ show: true, mode: 'alert', type: 'success', title: 'ลบสำเร็จ', message: 'ลบแผนการอ่านแล้ว' });
        } catch (e) {
          console.log('delete book error:', e);
          setPopup({ show: true, mode: 'alert', type: 'danger', title: 'ลบไม่สำเร็จ', message: 'เกิดข้อผิดพลาดระหว่างลบ' });
        }
      };

      setPopup({
        show: true, mode: 'confirm', type: 'danger',
        title: 'ลบรายการนี้?', message: `ต้องการลบ "${item.title || '-'}" ออกจากแผนการอ่านหรือไม่`,
        onConfirm: async () => { closePopup(); await performDelete(); },
      });
    };

    return (
      <CardShell style={{ marginBottom: 12 }}>
        <TouchableOpacity
          style={styles.cardRow}
          onPress={() => navigation.navigate('ReadingPlanDetail', { bookId: item.id })}
          activeOpacity={0.95}
        >
          {/* cover */}
          <View style={styles.coverWrap}>
            {item.coverUri ? (
              <Image source={{ uri: item.coverUri }} style={styles.coverImgLarge} resizeMode="cover" />
            ) : (
              <View style={[styles.coverImgLarge, styles.coverPlaceholder]}>
                <Ionicons name="image-outline" size={22} color="#94a3b8" />
              </View>
            )}
          </View>

          {/* content */}
          <View style={{ flex: 1 }}>
            <View style={styles.rowTop}>
              <View style={styles.titleRow}>
                <Text numberOfLines={1} style={styles.title}>{item.title || '-'}</Text>
                <View style={[styles.statusPill, chipStyle(statusComputed)]}>
                  <Text style={[styles.statusPillText, chipTextStyle(statusComputed)]}>
                    {statusComputed}
                  </Text>
                </View>
              </View>

              <TouchableOpacity onPress={confirmDelete} style={styles.delBtn}>
                <Ionicons name="trash-outline" size={18} color="#fca5a5" />
              </TouchableOpacity>
            </View>

            <Text numberOfLines={1} style={styles.author}>{item.author || '-'}</Text>

            <View style={styles.categoryRow}>
              <Ionicons name="pricetag-outline" size={12} color={THEME.textDim} />
              <Text style={styles.categoryText}> {item.category || 'ไม่ระบุ'}</Text>
            </View>

            {/* progress */}
            <View style={styles.progressBarBg}>
              <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={[styles.progressBarFill, { width: `${pct}%` }]} />
            </View>
            <View style={styles.progressRow}>
              <Text style={styles.progressSmall}>{read} / {total} หน้า</Text>
              <Text style={styles.progressSmall}>{pct}%</Text>
            </View>

            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={14} color={THEME.textDim} />
              <Text style={styles.meta}> เริ่ม: {formatDate(item.createdAt)}</Text>
            </View>
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={14} color={THEME.textDim} />
              <Text style={styles.meta}> จบ: {formatDate(item.finishedAt)}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </CardShell>
    );
  };

  return (
    <ImageBackground source={require('./assets/wallpaper.jpg')} style={styles.container} resizeMode="cover">
      <LinearGradient colors={['rgba(15,10,25,0.88)','rgba(26,19,37,0.94)']} style={StyleSheet.absoluteFill} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>แผนการอ่าน</Text>

        <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.addButton}>
          <TouchableOpacity style={styles.addButtonTap} onPress={() => setVisible(true)} activeOpacity={0.95}>
            <Ionicons name="add" size={18} color="#fff" />
            <Text style={styles.addText}>เพิ่มหนังสือ</Text>
          </TouchableOpacity>
        </LinearGradient>
      </View>

      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={THEME.textDim} style={{ marginRight: 6 }} />
        <TextInput
          placeholder="ค้นหาหนังสือ..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#9AA3AF"
          style={[{ flex: 1 }, styles.inputTextFix, { borderWidth: 0, backgroundColor: 'transparent' }]}
        />
        <TouchableOpacity style={styles.filterBtn}>
          <Ionicons name="filter" size={18} color={THEME.accent2} />
        </TouchableOpacity>
      </View>

      {/* Tabs */}
      <View style={styles.tabs}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.9}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ paddingBottom: 16 }}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: THEME.textDim, marginTop: 20 }}>ยังไม่มีหนังสือในรายการ</Text>}
      />

      {/* Modal เพิ่มหนังสือ */}
      <Modal visible={visible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%', alignItems: 'center' }}>
            <View style={styles.modalCardCompact}>
              <View style={{ padding: 14 }}>
                <Text style={styles.modalTitleCompact}>เพิ่มหนังสือใหม่</Text>

                {/* Cover picker */}
                <Pressable onPress={pickCoverForNew} style={styles.coverPickerCompact}>
                  {newCoverTempUri ? (
                    <>
                      <Image source={{ uri: newCoverTempUri }} style={styles.coverPickerImg} />
                      <View style={styles.coverPickerOverlayBottom}>
                        <Ionicons name="images-outline" size={14} color="#fff" />
                        <Text style={styles.coverPickerOverlayText}>แตะเพื่อเปลี่ยนรูปปก</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Ionicons name="image-outline" size={24} color={THEME.accent2} />
                      <Text style={styles.coverPickerHint}>แตะเพื่อเลือกรูปปก</Text>
                    </>
                  )}
                </Pressable>

                {/* Form */}
                <View style={styles.formRowTight}>
                  <Text style={styles.labelTight}>ชื่อหนังสือ</Text>
                  <TextInput
                    value={title}
                    onChangeText={setTitle}
                    placeholder="เช่น Atomic Habits"
                    placeholderTextColor="#b7a6ff"
                    style={[styles.inputTight, styles.inputTextFixTight]}
                  />
                </View>

                <View style={styles.formRowTight}>
                  <Text style={styles.labelTight}>ผู้แต่ง</Text>
                  <TextInput
                    value={author}
                    onChangeText={setAuthor}
                    placeholder="เช่น James Clear"
                    placeholderTextColor="#b7a6ff"
                    style={[styles.inputTight, styles.inputTextFixTight]}
                  />
                </View>

                <View style={styles.formRowInlineTight}>
                  <View style={{ flex: 1, marginRight: 6 }}>
                    <Text style={styles.labelTight}>จำนวนหน้า</Text>
                    <TextInput
                      value={pages}
                      onChangeText={(t)=> setPages(t.replace(/[^0-9]/g, ''))}
                      placeholder="เช่น 320"
                      placeholderTextColor="#b7a6ff"
                      keyboardType="number-pad"
                      style={[styles.inputTight, styles.inputTextFixTight]}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 6 }}>
                    <Text style={styles.labelTight}>สถานะ</Text>
                    <View style={styles.pickerWrapTight}>
                      <Picker
                        selectedValue={status}
                        onValueChange={setStatus}
                        style={[styles.pickerTight, styles.pickerText, Platform.OS==='android' && styles.pickerAndroidFix]}
                        dropdownIconColor={THEME.accent2}
                      >
                        <Picker.Item label="อยากอ่าน" value="อยากอ่าน" />
                      </Picker>
                    </View>
                  </View>
                </View>

                <View style={styles.formRowTight}>
                  <Text style={styles.labelTight}>ประเภท</Text>
                  <View style={styles.pickerWrapTight}>
                    <Picker
                      selectedValue={category}
                      onValueChange={setCategory}
                      style={[styles.pickerTight, styles.pickerText, Platform.OS==='android' && styles.pickerAndroidFix]}
                      dropdownIconColor={THEME.accent2}
                    >
                      <Picker.Item label="เลือกประเภท" value="" />
                      {CATEGORIES.map((c) => (<Picker.Item key={c} label={c} value={c} />))}
                    </Picker>
                  </View>
                </View>

                {/* Buttons */}
                <View style={styles.modalButtonsCompact}>
                  <TouchableOpacity style={styles.cancelButtonCompact} onPress={()=>{ setVisible(false); }}>
                    <Text style={styles.cancelTextCompact}>ยกเลิก</Text>
                  </TouchableOpacity>

                  <LinearGradient colors={GRAD_PILL} start={{x:0,y:0}} end={{x:1,y:0}} style={styles.saveButtonCompact}>
                    <TouchableOpacity onPress={handleAddBook} activeOpacity={0.95}>
                      <Text style={styles.saveTextCompact}>เพิ่มหนังสือ</Text>
                    </TouchableOpacity>
                  </LinearGradient>
                </View>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <FancyPopup
        visible={popup.show}
        mode={popup.mode}
        type={popup.type}
        title={popup.title}
        message={popup.message}
        onClose={closePopup}
        onConfirm={popup.onConfirm}
      />
    </ImageBackground>
  );
}

/* ===== Chips (shared) ===== */
function chipStyle(status) {
  switch (status) {
    case 'กำลังอ่าน':  return { backgroundColor: 'rgba(129,140,248,0.18)', borderColor:'rgba(129,140,248,0.38)' };
    case 'อ่านจบแล้ว': return { backgroundColor: 'rgba(34,197,94,0.18)',  borderColor:'rgba(34,197,94,0.38)' };
    default:            return { backgroundColor: 'rgba(245,158,11,0.18)', borderColor:'rgba(245,158,11,0.38)' };
  }
}
function chipTextStyle(status) {
  switch (status) {
    case 'กำลังอ่าน':  return { color: THEME.chipDoing };
    case 'อ่านจบแล้ว': return { color: THEME.chipRead };
    default:            return { color: THEME.chipWish };
  }
}

/* =================== STYLES =================== */
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: THEME.bg },

  /* Header */
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: THEME.text },

  addButton: {
    borderRadius: 999, overflow: 'hidden',
    ...Platform.select({ ios:{shadowColor:'#22d3ee',shadowOpacity:0.35,shadowRadius:10,shadowOffset:{width:0,height:6}}, android:{elevation:4} }),
  },
  addButtonTap: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, gap: 6 },
  addText: { color: '#fff', fontWeight: '900' },

  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: THEME.glass, borderColor: THEME.stroke, borderWidth: 1,
    borderRadius: 14, paddingHorizontal: 12, marginBottom: 12
  },
  filterBtn: { padding: 6 },
  inputTextFix: {
    fontSize: 16, lineHeight: 20, textAlignVertical:'center', includeFontPadding:false,
    paddingVertical: Platform.OS === 'android' ? 10 : 12, color: THEME.text
  },

  /* Tabs */
  tabs: { flexDirection: 'row', marginBottom: 10 },
  tab: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, marginRight: 8,
    backgroundColor: THEME.glass, borderWidth: 1, borderColor: THEME.stroke
  },
  activeTab: { backgroundColor: 'transparent', borderColor: THEME.accent2 },
  tabText: { color: THEME.textDim, fontWeight: '700' },
  activeTabText: { color: THEME.text, fontWeight: '800' },

  /* Card shell */
  cardBorder: {
    borderRadius: 18, padding: 1,
    ...Platform.select({ ios:{shadowColor:'#22d3ee',shadowOpacity:0.25,shadowRadius:12,shadowOffset:{width:0,height:6}}, android:{elevation:0} })
  },
  cardInner: { backgroundColor: THEME.glass, borderWidth: 1, borderColor: THEME.stroke, borderRadius: 17 },

  /* Inside card */
  cardRow: { flexDirection: 'row', alignItems: 'stretch', gap: 12, padding: 12 },

  coverWrap: {
    alignSelf: 'stretch', aspectRatio: 3/4, maxWidth: 120,
    borderRadius: 12, overflow: 'hidden', backgroundColor: THEME.bg2, position:'relative'
  },
  coverImgLarge: { width: '100%', height: '100%' },
  coverPlaceholder: { alignItems:'center', justifyContent:'center' },

  statusChip: { position: 'absolute', left: 6, top: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, borderWidth: 1 },
  statusChipText: { fontSize: 10, fontWeight: '800' },

  rowTop: { flexDirection:'row', alignItems:'center', justifyContent:'space-between' },

  titleRow: { flexDirection:'row', alignItems:'center', flex:1, minWidth:0 },
  title: { fontSize: 16, fontWeight: '900', color: THEME.text, flexShrink: 1, maxWidth: '80%' },

  statusPill: {
    marginLeft: 6,
    paddingHorizontal: 8, paddingVertical: 2,
    borderRadius: 999, borderWidth: 1,
    alignSelf: 'center',
  },
  statusPillText: { fontSize: 11, fontWeight: '800' },

  delBtn: { padding: 6, marginRight: -6 },

  author: { color: THEME.textDim, marginTop: 2 },

  categoryRow: { flexDirection:'row', alignItems:'center', marginTop: 6, marginBottom: 6 },
  categoryText: { color: THEME.textDim, fontWeight:'600' },

  progressBarBg: { height: 8, backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: 999, overflow: 'hidden' },
  progressBarFill: { height: 8, borderRadius: 999 },

  progressRow: { marginTop: 6, flexDirection: 'row', justifyContent: 'space-between' },
  progressSmall: { fontSize: 12, color: THEME.textDim },

  dateRow: { flexDirection:'row', alignItems:'center', marginTop: 8 },
  meta: { color: THEME.textDim },

  /* Modal (Add Book) */
  modalOverlay: { flex:1, justifyContent:'center', alignItems:'center', backgroundColor:'rgba(0,0,0,0.45)' },
  modalCardCompact: {
    width: '92%',
    borderRadius: 18,
    backgroundColor: THEME.cardSolid,
    borderWidth: 1,
    borderColor: THEME.strokeStrong,
    ...Platform.select({ ios:{shadowColor:'#000',shadowOpacity:0.35,shadowRadius:16,shadowOffset:{width:0,height:10}}, android:{elevation:8} }),
  },
  modalTitleCompact: { fontSize: 16, fontWeight:'900', color: THEME.text, marginBottom: 10 },

  coverPickerCompact: {
    alignSelf: 'center', width:170, height:185, borderRadius: 14,
    backgroundColor:'rgba(255,255,255,0.08)',
    borderWidth: 2, borderColor: THEME.strokeStrong, borderStyle:'dashed',
    alignItems:'center', justifyContent:'center', marginBottom:12, overflow:'hidden'
  },
  coverPickerImg: { width:'100%', height:'100%' },
  coverPickerHint: { marginTop:8, color: THEME.accent2, fontWeight:'800' },
  coverPickerOverlayBottom: {
    position:'absolute', left:0, right:0, bottom:0, paddingVertical:8, paddingHorizontal:10,
    backgroundColor:'rgba(0,0,0,0.35)', flexDirection:'row', gap:6, justifyContent:'center', alignItems:'center'
  },
  coverPickerOverlayText: { color:'#fff', fontWeight:'700', fontSize:12 },

  formRowTight: { marginBottom: 10 },
  formRowInlineTight: { flexDirection: 'row', marginBottom: 10 },
  labelTight: { color: THEME.text, fontWeight: '800', marginBottom: 4, fontSize: 13 },

  inputTight: { borderWidth:1, borderColor:THEME.strokeStrong, borderRadius:10, paddingHorizontal:10, backgroundColor:'rgba(255,255,255,0.10)' },
  inputTextFixTight: {
    fontSize:14, lineHeight:18, includeFontPadding:false,
    textAlignVertical:'center', paddingVertical:Platform.OS==='android'?8:10, color:THEME.text
  },

  pickerWrapTight: { borderWidth:1, borderColor:THEME.strokeStrong, borderRadius:10, overflow:'hidden', backgroundColor:'rgba(255,255,255,0.10)' },
  pickerTight: { height:52 },
  pickerText: { color: THEME.text },
  pickerAndroidFix: { paddingVertical:0, marginTop:-2 },

  modalButtonsCompact: { flexDirection:'row', justifyContent:'flex-end', marginTop: 8, gap: 10 },
  cancelButtonCompact: { paddingVertical:10, paddingHorizontal:12 },
  cancelTextCompact: { color: THEME.textDim, fontWeight:'700', fontSize:14 },
  saveButtonCompact: { borderRadius:10, overflow:'hidden' },
  saveTextCompact: { color: '#fff', fontWeight:'900', fontSize:14, paddingVertical:10, paddingHorizontal:16 },

  popupOverlay: { flex: 1, backgroundColor:'rgba(0,0,0,0.55)', alignItems:'center', justifyContent:'center', padding:24 },
  popupGlow: { position:'absolute', width:'80%', height:220, borderRadius:20, shadowOpacity:0.7, shadowRadius:24, shadowOffset:{width:0,height:0} },
  popupBorder: { width:'100%', maxWidth:420, padding:1.2, borderRadius:18, borderWidth:1, borderColor:'rgba(255,255,255,0.08)' },
  popupCard: { backgroundColor: THEME.cardSolid, borderRadius:17, borderWidth:1, borderColor: THEME.strokeStrong, paddingVertical:16, paddingHorizontal:16 },
  popupBadge: { alignSelf:'center', width:56, height:56, borderRadius:16, alignItems:'center', justifyContent:'center', marginTop:-34, marginBottom:8, shadowOpacity:0.8, shadowRadius:18, shadowOffset:{width:0,height:0}, borderWidth:1, borderColor:'rgba(255,255,255,0.12)' },
  popupTitle: { color: THEME.text, fontWeight:'900', fontSize:16, textAlign:'center', marginBottom:4 },
  popupMessage: { color: THEME.textDim, textAlign:'center', lineHeight:20 },
  popupBtnRowSingle: { marginTop:16, flexDirection:'row', justifyContent:'center' },
  popupBtnRow: { marginTop:16, flexDirection:'row', justifyContent:'space-between', gap:12 },
  popupBtnGhost: { flex:1, paddingVertical:11, paddingHorizontal:14, borderRadius:12, borderWidth:1.5, borderColor:'rgba(255,255,255,0.16)', backgroundColor:'rgba(255,255,255,0.04)', alignItems:'center' },
  popupBtnGhostText: { color: THEME.text, fontWeight:'800' },
  popupBtnGrad: { flex:1, borderRadius:12, overflow:'hidden', alignItems:'center' },
  popupBtnText: { color:'#fff', fontWeight:'900', paddingVertical:11, paddingHorizontal:16, textAlign:'center' },
});
