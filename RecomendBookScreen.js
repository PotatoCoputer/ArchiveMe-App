import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, Image, ScrollView, TouchableOpacity, Linking, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

const THEME = {
  textPrimary: '#F7FBFF',
  textSecondary: 'rgba(247,251,255,0.85)',
  textMuted: 'rgba(247,251,255,0.70)',
  cyan: '#34D6FF',
  violet: '#7C4DFF',
};

const ensureHttps = (u) => {
  if (!u) return null;
  try {
    const trimmed = String(u).trim();
    if (trimmed.startsWith('http://')) return 'https://' + trimmed.slice(7);
    return trimmed;
  } catch { return null; }
};

const safeAuthor = (a) => {
  const s = (a || '').toString().trim().toLowerCase();
  if (!s || s === 'unknown' || s === 'unknow') return 'ไม่ทราบผู้เขียน';
  return a;
};

const CoverImage = ({ uri, style }) => {
  const [err, setErr] = useState(false);
  const src = ensureHttps(uri);
  if (!src || err) {
    return (
      <View style={[styles.cover, style, styles.coverEmpty]}>
        <Ionicons name="book" size={28} color="rgba(255,255,255,0.6)" />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: src }}
      style={[styles.cover, style]}
      onError={() => setErr(true)}
      resizeMode="cover"
    />
  );
};

const buildBookUrl = (book) => {
  const title = book?.title || '';
  const author = book?.author || '';
  const q = encodeURIComponent(`${title} ${author}`.trim());

  const raw = book?.raw || {};

  if (book?.source === 'gbooks') {
    const infoLink =
      raw?.volumeInfo?.infoLink ||
      raw?.volumeInfo?.canonicalVolumeLink ||
      raw?.selfLink;
    if (infoLink) return ensureHttps(infoLink);
    return `https://www.google.com/search?q=${q}`;
  }

  if (book?.source === 'openlib') {
    const workKey = raw?.key; 
    if (workKey) return `https://openlibrary.org${workKey}`;
    const olid =
      raw?.cover_edition_key ||
      (raw?.edition_key && raw.edition_key[0]) ||
      null;
    if (olid) return `https://openlibrary.org/books/${olid}`;
    return `https://www.google.com/search?q=${q}`;
  }

  if (book?.source === 'gutendex') {
    const f = raw?.formats || {};
    const htmlUrl =
      f['text/html; charset=utf-8'] ||
      f['text/html; charset=us-ascii'] ||
      f['text/html'];
    if (htmlUrl) return ensureHttps(htmlUrl);
    if (book?.id) return `https://www.gutenberg.org/ebooks/${book.id}`;
    return `https://www.google.com/search?q=${q}`;
  }

  return `https://www.google.com/search?q=${q}`;
};

export default function RecomendBookScreen({ route, navigation }) {
  const book = route?.params?.book || {};
  const title = book?.title || 'หนังสือ';
  const author = safeAuthor(book?.author);
  const thumb = ensureHttps(book?.thumb);

  const sourceName = useMemo(() => {
    if (book?.source === 'openlib') return 'Open Library';
    if (book?.source === 'gbooks') return 'Google Books';
    if (book?.source === 'gutendex') return 'Project Gutenberg';
    return 'แหล่งข้อมูลภายนอก';
  }, [book?.source]);

  const handleOpenLink = async () => {
    const url = buildBookUrl(book);
    try {
      const can = await Linking.canOpenURL(url);
      if (!can) throw new Error('cannot open');
      await Linking.openURL(url);
    } catch {
      Alert.alert('เปิดลิงก์ไม่สำเร็จ', 'ลองใหม่อีกครั้งหรือตรวจสอบการเชื่อมต่ออินเทอร์เน็ต');
    }
  };

  return (
    <View style={styles.screen}>
      {/* BG */}
      <LinearGradient
        colors={['#0b1220', '#101c2c', '#0b1220']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />

      <ScrollView contentContainerStyle={styles.body}>
        {/* Header */}
        <Text style={styles.h1} numberOfLines={2}>{title}</Text>
        <Text style={styles.sub}>โดย {author}</Text>

        {/* Cover */}
        <View style={styles.coverWrap}>
          <CoverImage uri={thumb} style={{ borderRadius: 14 }} />
        </View>

        {/* Meta */}
        <View style={styles.metaRow}>
          <View style={styles.pill}>
            <Ionicons name="library-outline" size={14} color={THEME.cyan} />
            <Text style={styles.pillText}>แหล่งที่มา: {sourceName}</Text>
          </View>
          {book?.id ? (
            <View style={[styles.pill, { marginLeft: 8 }]}>
              <Ionicons name="key-outline" size={14} color={THEME.cyan} />
              <Text style={styles.pillText} numberOfLines={1}>ID: {book.id}</Text>
            </View>
          ) : null}
        </View>

        {/* CTA */}
        <View style={styles.btnRow}>
          <TouchableOpacity
            style={[styles.btn, styles.btnPrimary]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={[THEME.cyan, THEME.violet]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <Text style={styles.btnPrimaryText}>กลับ</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.btn, styles.btnGhost]}
            onPress={handleOpenLink}
            activeOpacity={0.85}
          >
            <Ionicons name="open-outline" size={18} color={THEME.cyan} />
            <Text style={styles.btnGhostText}>เปิดเว็บหนังสือ</Text>
          </TouchableOpacity>
        </View>

        {/* Description */}
        <View style={styles.section}>
          <Text style={styles.h2}>คำแนะนำ</Text>
          <Text style={styles.p}>
            หนังสือเล่มนี้ถูกแนะนำตามหัวข้อที่คุณสนใจ
            คุณสามารถกด “เปิดเว็บหนังสือ” เพื่อดูรายละเอียด รีวิว หรือซื้อได้จากแหล่งข้อมูลโดยตรง
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:{ flex:1, backgroundColor:'#0b1220' },
  body:{ padding:16 },
  h1:{ color:THEME.textPrimary, fontSize:22, fontWeight:'900', letterSpacing:0.2 },
  sub:{ color:THEME.textSecondary, marginTop:6 },
  coverWrap:{
    marginTop:14,
    borderRadius:16,
    overflow:'hidden',
    backgroundColor:'rgba(255,255,255,0.06)',
    borderWidth:1, borderColor:'rgba(255,255,255,0.10)',
    alignSelf:'center',
  },
  cover:{ width:220, height:320 },
  coverEmpty:{ alignItems:'center', justifyContent:'center' },
  metaRow:{ flexDirection:'row', alignItems:'center', marginTop:12, flexWrap:'wrap' },
  pill:{
    flexDirection:'row', alignItems:'center', gap:6,
    paddingHorizontal:10, height:26, borderRadius:13,
    backgroundColor:'rgba(52,214,255,0.10)',
    borderWidth:1, borderColor:'rgba(52,214,255,0.35)',
  },
  pillText:{ color:'#C7E7FF', fontWeight:'800', fontSize:12 },
  btnRow:{ flexDirection:'row', gap:10, marginTop:16 },
  btn:{ flex:1, height:46, borderRadius:12, alignItems:'center', justifyContent:'center', flexDirection:'row', gap:8, overflow:'hidden' },
  btnPrimaryText:{ color:'#0D1016', fontWeight:'900' },
  btnGhost:{ backgroundColor:'rgba(52,214,255,0.10)', borderWidth:1, borderColor:'rgba(52,214,255,0.45)' },
  btnGhostText:{ color:THEME.cyan, fontWeight:'900' },
  section:{ marginTop:18 },
  h2:{ color:THEME.textPrimary, fontWeight:'900', marginBottom:6 },
  p:{ color:THEME.textSecondary, lineHeight:20 },
});
