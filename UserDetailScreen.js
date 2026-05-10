import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { db } from "./firebase";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
  writeBatch,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { useRoute, useNavigation } from "@react-navigation/native";

export default function UserDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { userId } = route.params || {};

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState({
    name: "-",
    email: "-",
    createdAt: "-",
    lastLogin: "-",
    lastSeenText: "-",
  });
  const [booksCount, setBooksCount] = useState(0);
  const [pagesTotal, setPagesTotal] = useState(0);
  const [statusCounts, setStatusCounts] = useState({
    reading: 0,
    finished: 0,
    wishlist: 0,
  });
  const [books, setBooks] = useState([]);

  // เวลาอ่าน (นาทีรวม)
  const [timeBuckets, setTimeBuckets] = useState({
    morning: 0,
    noon: 0,
    evening: 0,
    night: 0,
  });
  const [timeCounts, setTimeCounts] = useState({
    morning: 0,
    noon: 0,
    evening: 0,
    night: 0,
  });

  useEffect(() => {
    if (!userId) return;

    const run = async () => {
      try {
        // Load user
        const uref = doc(db, "users", userId);
        const usnap = await getDoc(uref);
        const u = usnap.data() || {};
        const thDate = (d) =>
          d?.toDate?.()?.toLocaleDateString("th-TH") ||
          (d ? new Date(d).toLocaleDateString("th-TH") : "-");

        const lastSeenDate =
          u.lastSeen?.toDate?.() || (u.lastSeen ? new Date(u.lastSeen) : null);
        const lastSeenText = lastSeenDate
          ? lastSeenDate.toLocaleString("th-TH", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "-";

        setUser({
          name: u.name || "ไม่ระบุ",
          email: u.email || "-",
          createdAt: u.createdAt ? thDate(u.createdAt) : "-",
          lastLogin: u.lastLogin ? thDate(u.lastLogin) : "-",
          lastSeenText,
        });

        // Load books
        const bsnap = await getDocs(collection(db, "users", userId, "books"));
        let pages = 0,
          reading = 0,
          finished = 0,
          wishlist = 0;
        const list = [];
        const sessionPromises = [];

        bsnap.forEach((b) => {
          const d = b.data() || {};
          const status = (d.status || "").trim();
          pages += Number(d.pages || 0);
          if (status === "กำลังอ่าน") reading += 1;
          else if (status === "อ่านจบแล้ว") finished += 1;
          else if (status === "อยากอ่าน") wishlist += 1;

          list.push({
            id: b.id,
            title: d.title || "ไม่ระบุชื่อเรื่อง",
            author: d.author || "-",
            category: d.category || "อื่นๆ",
            cover: d.cover || d.image || d.coverUri || null,
            status,
            pagesRead: Number(d.currentPage || d.totalPagesRead || 0),
            totalPages: Number(d.pages || d.total || 0),
          });

          // sessions ของแต่ละเล่ม
          const p = getDocs(
            collection(db, "users", userId, "books", b.id, "sessions")
          ).then((snap) => snap.docs.map((s) => s.data() || {}));
          sessionPromises.push(p);
        });

        // รวมสถิติช่วงเวลา
        const allSessions = await Promise.all(sessionPromises);
        let tb = { morning: 0, noon: 0, evening: 0, night: 0 };
        let cnt = { morning: 0, noon: 0, evening: 0, night: 0 };

        allSessions.flat().forEach((d) => {
          const minutes =
            Number(d.minutesUsed) || Number(d.minutes) || Number(d.duration) || 1;
          let t =
            d.createdAt?.toDate?.() ||
            d.timestamp?.toDate?.() ||
            (d.createdAt ? new Date(d.createdAt) : new Date());
          if (!t || isNaN(t.getTime())) return;
          const h = t.getHours();
          if (h >= 6 && h < 12) {
            tb.morning += minutes;
            cnt.morning += 1;
          } else if (h >= 12 && h < 18) {
            tb.noon += minutes;
            cnt.noon += 1;
          } else if (h >= 18 && h < 22) {
            tb.evening += minutes;
            cnt.evening += 1;
          } else {
            tb.night += minutes;
            cnt.night += 1;
          }
        });

        setBooksCount(bsnap.size);
        setPagesTotal(pages);
        setStatusCounts({ reading, finished, wishlist });
        setBooks(list);
        setTimeBuckets(tb);
        setTimeCounts(cnt);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };

    run();
  }, [userId]);

  const progressPct = useMemo(() => {
    if (!booksCount) return 0;
    return Math.round((statusCounts.finished * 100) / booksCount);
  }, [booksCount, statusCounts.finished]);

  // % ต่อช่วง + หาค่ามากสุด
  const timePercents = useMemo(() => {
    const { morning: m, noon: n, evening: e, night: ni } = timeBuckets;
    const sum = m + n + e + ni;
    if (!sum) {
      return {
        morning: 0,
        noon: 0,
        evening: 0,
        night: 0,
        topKey: "evening",
      };
    }
    const pct = {
      morning: Math.round((m * 100) / sum),
      noon: Math.round((n * 100) / sum),
      evening: Math.round((e * 100) / sum),
      night: Math.round((ni * 100) / sum),
    };
    let topKey = "morning";
    let topVal = pct.morning;
    ["noon", "evening", "night"].forEach((k) => {
      if (pct[k] > topVal) {
        topKey = k;
        topVal = pct[k];
      }
    });
    return { ...pct, topKey };
  }, [timeBuckets]);

  const labelOfTopTime = {
    morning: "เช้า (06:00 - 12:00)",
    noon: "กลางวัน (12:00 - 18:00)",
    evening: "เย็น (18:00 - 22:00)",
    night: "ก่อนนอน (22:00 - 06:00)",
  }[timePercents.topKey];

  // ===== ลบหนังสือ =====
  const confirmDeleteBook = (bookId, title) => {
    Alert.alert(
      "ยืนยันการลบหนังสือ",
      `ต้องการลบ “${title}” ออกจากผู้ใช้นี้หรือไม่?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบ",
          style: "destructive",
          onPress: async () => {
            try {
              // 1) ดึงข้อมูลหนังสือ 
              const bookRef = doc(db, "users", userId, "books", bookId);
              const bookSnap = await getDoc(bookRef);
              const bookData = bookSnap.data() || {};
              const wasFinished =
                (bookData.status || "").trim() === "อ่านจบแล้ว";

              // 2) รวม sessions ของเล่มนี้
              const sessCol = collection(
                db,
                "users",
                userId,
                "books",
                bookId,
                "sessions"
              );
              const sessSnap = await getDocs(sessCol);

              let pagesSum = 0,
                minutesSum = 0,
                sessionsCount = 0;

              sessSnap.forEach((s) => {
                const d = s.data();
                pagesSum += Number(d.pagesRead) || 0;
                minutesSum += Number(d.minutesUsed) || 0;
                sessionsCount += 1;
              });

              // fallback 
              if (pagesSum === 0)
                pagesSum =
                  Number(bookData.totalPagesRead) ||
                  Number(bookData.currentPage) ||
                  0;
              if (minutesSum === 0)
                minutesSum =
                  Number(bookData.totalReadingMinutes) ||
                  Number(bookData.totalMinutes) ||
                  0;

              // 3) หักค่าออกจาก aggregate ของ user
              const aggRef = doc(db, "users", userId, "stats", "aggregate");
              await runTransaction(db, async (tx) => {
                const snap = await tx.get(aggRef);
                if (!snap.exists()) return; 
                const cur = snap.data() || {};
                const next = {
                  totalPages: Math.max(
                    0,
                    Number(cur.totalPages || 0) - (pagesSum || 0)
                  ),
                  totalMinutes: Math.max(
                    0,
                    Number(cur.totalMinutes || 0) - (minutesSum || 0)
                  ),
                  totalSessions: Math.max(
                    0,
                    Number(cur.totalSessions || 0) - (sessionsCount || 0)
                  ),
                  finishedBooksCount: Math.max(
                    0,
                    Number(cur.finishedBooksCount || 0) -
                      (wasFinished ? 1 : 0)
                  ),
                  lastUpdated: serverTimestamp(),
                };
                tx.set(aggRef, next, { merge: true });
              });

              // 4) ลบ sessions ทั้งหมด + ลบหนังสือ (batch)
              const batch = writeBatch(db);
              sessSnap.forEach((s) => batch.delete(s.ref));
              batch.delete(bookRef);
              await batch.commit();

              // 5) อัปเดต state ฝั่งแอดมินทันที
              setBooks((prev) => prev.filter((b) => b.id !== bookId));
              setBooksCount((c) => Math.max(0, c - 1));
              setPagesTotal((p) =>
                Math.max(0, p - Number(bookData.pages || 0))
              );
              setStatusCounts((prev) => ({
                reading:
                  prev.reading -
                  ((bookData.status || "").trim() === "กำลังอ่าน" ? 1 : 0),
                finished:
                  prev.finished - (wasFinished ? 1 : 0),
                wishlist:
                  prev.wishlist -
                  ((bookData.status || "").trim() === "อยากอ่าน" ? 1 : 0),
              }));
            } catch (e) {
              console.error(e);
              Alert.alert("ลบไม่สำเร็จ", "เกิดข้อผิดพลาดระหว่างลบ");
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={{ marginTop: 8 }}>กำลังโหลดข้อมูล...</Text>
      </View>
    );
  }

  // ข้อมูลการ์ดช่วงเวลา 
  const timeItems = [
    { key: "morning", label: "เช้า (06:00 - 12:00)" },
    { key: "noon", label: "กลางวัน (12:00 - 18:00)" },
    { key: "evening", label: "เย็น (18:00 - 22:00)" },
    { key: "night", label: "ก่อนนอน (22:00 - 06:00)" },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* back link */}
      <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backRow}>
        <Ionicons name="chevron-back" size={18} color="#374151" />
        <Text style={{ color: "#374151" }}>กลับไปหน้าจัดการผู้ใช้</Text>
      </TouchableOpacity>

      <View style={styles.card}>
        {/* avatar */}
        <View style={styles.avatar}>
          <Ionicons name="person" size={40} color="#9ca3af" />
        </View>

        {/* name & email */}
        <Text style={styles.name}>{user.name}</Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            marginTop: 4,
          }}
        >
          <Ionicons name="mail-outline" size={16} color="#6b7280" />
          <Text style={styles.email}> {user.email}</Text>
        </View>

        <View style={styles.grid}>
          <InfoCell icon="calendar-outline" label="วันที่ลงทะเบียน" value={user.createdAt} />
          <InfoCell icon="time-outline" label="เข้าใช้งานครั้งล่าสุด" value={user.lastSeenText} />
          <InfoCell icon="library-outline" label="จำนวนหนังสือทั้งหมด" value={`${booksCount} เล่ม`} />
          <InfoCell icon="document-text-outline" label="จำนวนหน้าทั้งหมด" value={`${pagesTotal} หน้า`} />
        </View>

        {/* progress header */}
        <View style={styles.progressHeader}>
          <Text style={styles.progressLabel}>ความคืบหน้าโดยรวม</Text>
          <Text style={styles.progressPercentInline}>{progressPct}%</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
        </View>

        {/* สถานะหนังสือใน card */}
        <View style={styles.statusRowInCard}>
          <StatBox icon="book-outline" color="#3b82f6" bg="#eff6ff" label="กำลังอ่าน" value={`${statusCounts.reading} เล่ม`} />
          <StatBox icon="checkmark-circle-outline" color="#10b981" bg="#ecfdf5" label="อ่านจบแล้ว" value={`${statusCounts.finished} เล่ม`} />
          <StatBox icon="bookmark-outline" color="#f59e0b" bg="#fff7ed" label="อยากอ่าน" value={`${statusCounts.wishlist} เล่ม`} />
        </View>

        {/* การ์ดช่วงเวลาการอ่านยอดนิยม */}
        <View style={styles.timeCard}>
          <View style={styles.timeCardHeader}>
            <Text style={styles.timeCardTitle}>ช่วงเวลาการอ่านของผู้ใช้</Text>
            <Ionicons name="time-outline" size={16} color="#64748b" />
          </View>

          {timeItems.map(({ key, label }) => (
            <View key={key} style={{ marginTop: 8 }}>
              <View style={styles.timeRowTop}>
                <Text style={styles.timeRowLabel}>{label}</Text>
                <Text style={styles.timeRowPct}>
                  {timePercents[key]}% ({timeCounts[key] || 0})
                </Text>
              </View>
              <View style={styles.timeBarTrack}>
                <View
                  style={[
                    styles.timeBarFill,
                    {
                      width: `${timePercents[key]}%`,
                      backgroundColor:
                        key === timePercents.topKey ? "#6366f1" : "#c7d2fe",
                    },
                  ]}
                />
              </View>
            </View>
          ))}

          <Text style={styles.timeCardFoot}>
            ผู้ใช้นี้มักอ่านหนังสือในช่วง {labelOfTopTime}
          </Text>
        </View>
      </View>

      {/* หนังสือของผู้ใช้ */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>หนังสือของผู้ใช้</Text>

        {books.length === 0 ? (
          <Text style={{ color: "#6b7280", marginTop: 8 }}>
            ยังไม่มีข้อมูลหนังสือ
          </Text>
        ) : (
          books.map((b) => (
            <BookCard
              key={b.id}
              book={b}
              onDelete={() => confirmDeleteBook(b.id, b.title)}
            />
          ))
        )}
      </View>
    </ScrollView>
  );
}

/* ---------- Components ---------- */
function InfoCell({ icon, label, value }) {
  return (
    <View style={styles.infoCell}>
      <View style={styles.infoIcon}>
        <Ionicons name={icon} size={16} color="#6b7280" />
      </View>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function StatBox({ icon, color, bg, label, value }) {
  return (
    <View style={[styles.statBox, { backgroundColor: bg, borderColor: "#eef2ff" }]}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

function BookCard({ book, onDelete }) {
  const statusColor =
    book.status === "กำลังอ่าน"
      ? "#3b82f6"
      : book.status === "อ่านจบแล้ว"
      ? "#10b981"
      : "#f59e0b";
  const statusBg =
    book.status === "กำลังอ่าน"
      ? "#eff6ff"
      : book.status === "อ่านจบแล้ว"
      ? "#ecfdf5"
      : "#fff7ed";

  let progressText =
    book.totalPages > 0
      ? `${book.pagesRead} / ${book.totalPages} หน้า`
      : `${book.pagesRead} หน้า`;

  return (
    <View style={styles.bookCard}>
      {/* ปกหนังสือ */}
      <View style={styles.coverWrap}>
        {book.cover ? (
          <Image
            source={{ uri: book.cover }}
            style={styles.coverImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.coverFallback}>
            <Ionicons name="book-outline" size={26} color="#9ca3af" />
          </View>
        )}
      </View>

      {/* ข้อมูลหนังสือ */}
      <View style={{ flex: 1, marginLeft: 10 }}>
        <Text style={styles.bookTitle} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.bookAuthor} numberOfLines={1}>
          {book.author}
        </Text>

        <Text style={styles.bookMeta} numberOfLines={1}>
          📚 {book.category} • {progressText}
        </Text>

        {/* สถานะ */}
        <View
          style={{
            marginTop: 6,
            alignSelf: "flex-start",
            backgroundColor: statusBg,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 6,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "700", color: statusColor }}>
            {book.status || "ไม่ระบุสถานะ"}
          </Text>
        </View>
      </View>

      {/* ปุ่มลบ */}
      <TouchableOpacity
        onPress={onDelete}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="trash-outline" size={20} color="#dc2626" />
      </TouchableOpacity>
    </View>
  );
}

/* ---------- styles ---------- */
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f3f4f6", padding: 16 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  scrollContent: { paddingBottom: 40 },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 12,
    marginBottom: 8,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    borderWidth: 1,
    borderColor: "#eef0f4",
  },

  avatar: {
    width: 84,
    height: 84,
    borderRadius: 999,
    alignSelf: "center",
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 8,
  },
  name: { fontSize: 20, fontWeight: "800", color: "#111827", textAlign: "center" },
  email: { color: "#6b7280" },

  grid: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  infoCell: {
    flexBasis: "48%",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eef2f7",
  },
  infoIcon: { marginBottom: 6 },
  infoLabel: { color: "#6b7280", fontSize: 12 },
  infoValue: { marginTop: 2, fontWeight: "700", color: "#111827" },

  progressHeader: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressLabel: { color: "#6b7280", fontSize: 12 },
  progressPercentInline: { color: "#6b7280", fontSize: 12 },

  progressTrack: {
    height: 10,
    backgroundColor: "#e5e7eb",
    borderRadius: 999,
    overflow: "hidden",
    marginTop: 6,
  },
  progressFill: { height: 10, backgroundColor: "#6366f1", borderRadius: 999 },

  statusRowInCard: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    marginTop: 14,
  },
  statBox: {
    flex: 1,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  statLabel: { color: "#6b7280", marginTop: 6, marginBottom: 4 },
  statValue: { color: "#111827", fontWeight: "800" },

  /* Time-of-day card */
  timeCard: {
    marginTop: 14,
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  timeCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  timeCardTitle: { fontWeight: "800", color: "#0f172a" },

  timeRowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  timeRowLabel: { color: "#374151", fontSize: 13 },
  timeRowPct: { color: "#6b7280", fontSize: 12 },

  timeBarTrack: {
    marginTop: 6,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#e5e7eb",
    overflow: "hidden",
  },
  timeBarFill: {
    height: "100%",
    borderRadius: 999,
  },
  timeCardFoot: {
    marginTop: 10,
    color: "#6b7280",
    fontSize: 12,
  },

  /* Section หนังสือของผู้ใช้ */
  section: {
    marginTop: 20,
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },

  bookCard: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    backgroundColor: "#ffffff",
  },
  coverWrap: {
    width: 56,
    height: 56,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  coverImage: { width: "100%", height: "100%" },
  coverFallback: { flex: 1, alignItems: "center", justifyContent: "center" },

  bookTitle: { fontWeight: "800", fontSize: 14, color: "#111827" },
  bookAuthor: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  bookMeta: { fontSize: 12, color: "#6b7280", marginTop: 2 },
});
