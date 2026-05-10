import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { db, functions } from "./firebase";
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const ACTIVE_NOW_MS = 1 * 60 * 1000;
const FILTERS = ["ทั้งหมด", "ออนไลน์", "ออฟไลน์"];

export default function ManageUsersScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(FILTERS[0]);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, "users"));
        const arr = [];
        const now = Date.now();

        for (const d of snap.docs) {
          const u = d.data() || {};

          let booksCount = 0;
          try {
            const bSnap = await getDocs(collection(db, "users", d.id, "books"));
            booksCount = bSnap.size;
          } catch {}

          const createdAt =
            u.createdAt?.toDate?.().toLocaleDateString("th-TH") || "-";
          const lastLogin =
            u.lastLogin?.toDate?.().toLocaleDateString("th-TH") || "-";

          const lastSeenDate =
            u.lastSeen?.toDate?.() || (u.lastSeen ? new Date(u.lastSeen) : null);
          const lastSeenMs = lastSeenDate ? lastSeenDate.getTime() : 0;

          const isActiveNow =
            !!lastSeenMs &&
            now - lastSeenMs <= ACTIVE_NOW_MS &&
            (u.online === undefined ? true : !!u.online);

          arr.push({
            id: d.id,
            name: u.name || "ไม่ระบุ",
            email: u.email || "-",
            createdAt,
            lastLogin,
            books: booksCount,
            lastSeenText: lastSeenDate
              ? lastSeenDate.toLocaleString("th-TH", {
                  dateStyle: "short",
                  timeStyle: "short",
                })
              : "-",
            isActiveNow,
          });
        }

        setUsers(arr);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "users"), (snap) => {
      const now = Date.now();
      const presence = {};
      snap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        const lastSeenDate =
          d.lastSeen?.toDate?.() || (d.lastSeen ? new Date(d.lastSeen) : null);
        const lastSeenMs = lastSeenDate ? lastSeenDate.getTime() : 0;

        const isActiveNow =
          !!lastSeenMs &&
          now - lastSeenMs <= ACTIVE_NOW_MS &&
          (d.online === undefined ? true : !!d.online);

        presence[docSnap.id] = {
          isActiveNow,
          lastSeenText: lastSeenDate
            ? lastSeenDate.toLocaleString("th-TH", {
                dateStyle: "short",
                timeStyle: "short",
              })
            : "-",
        };
      });

      setUsers((prev) =>
        prev.map((u) => (presence[u.id] ? { ...u, ...presence[u.id] } : u))
      );
    });

    return () => unsub();
  }, []);

  // ลบ books ของ user
  const deleteUserBooks = async (uid) => {
    const bSnap = await getDocs(collection(db, "users", uid, "books"));
    const jobs = bSnap.docs.map((b) =>
      deleteDoc(doc(db, "users", uid, "books", b.id))
    );
    await Promise.all(jobs);
  };

  // ลบ stats ของ user
  const deleteUserStats = async (uid) => {
    const sSnap = await getDocs(collection(db, "users", uid, "stats"));
    const jobs = sSnap.docs.map((s) =>
      deleteDoc(doc(db, "users", uid, "stats", s.id))
    );
    await Promise.all(jobs);
  };

  // reset aggregate stats เป็น 0
  const resetUserAggregate = async (uid) => {
    const aggRef = doc(db, "users", uid, "stats", "aggregate");
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(aggRef);
      if (!snap.exists()) return;
      tx.set(
        aggRef,
        {
          totalPages: 0,
          totalMinutes: 0,
          totalSessions: 0,
          finishedBooksCount: 0,
          lastUpdated: serverTimestamp(),
        },
        { merge: true }
      );
    });
  };

  const handleDeleteConfirmed = async (user) => {
    try {
      await deleteUserBooks(user.id);
      await deleteUserStats(user.id);
      await resetUserAggregate(user.id); // ✅ reset stats เป็นศูนย์
      await deleteDoc(doc(db, "users", user.id));

      try {
        const deleteAuthUser = httpsCallable(functions, "deleteAuthUser");
        await deleteAuthUser({ uid: user.id });
      } catch (err) {
        console.warn("เรียก Cloud Function ไม่สำเร็จ:", err?.message);
      }

      setUsers((prev) => prev.filter((u) => u.id !== user.id));
    } catch (e) {
      console.error(e);
      Alert.alert("เกิดข้อผิดพลาด", "ไม่สามารถลบผู้ใช้ได้");
    }
  };

  const confirmDelete = (user) => {
    Alert.alert(
      "ยืนยันการลบผู้ใช้",
      `ต้องการลบ “${user.name}” และข้อมูลทั้งหมดหรือไม่?`,
      [
        { text: "ยกเลิก", style: "cancel" },
        {
          text: "ลบ",
          style: "destructive",
          onPress: () => handleDeleteConfirmed(user),
        },
      ]
    );
  };

  const filtered = useMemo(() => {
    const q = (search || "").toLowerCase().trim();
    return users
      .filter((u) => {
        const matchesText =
          !q ||
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q);

        const matchesFilter =
          filter === "ทั้งหมด"
            ? true
            : filter === "ออนไลน์"
            ? u.isActiveNow
            : !u.isActiveNow;

        return matchesText && matchesFilter;
      })
      .sort((a, b) =>
        b.isActiveNow === a.isActiveNow ? 0 : b.isActiveNow ? 1 : -1
      );
  }, [users, search, filter]);

  if (loading) {
    return (
      <View
        style={[
          styles.container,
          { justifyContent: "center", alignItems: "center", flex: 1 },
        ]}
      >
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={{ marginTop: 8 }}>กำลังโหลดข้อมูล...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.pageTitle}>จัดการผู้ใช้</Text>
      <Text style={styles.pageSub}>ดูข้อมูลและจัดการผู้ใช้ทั้งหมดในระบบ</Text>

      {/* ค้นหา */}
      <View style={styles.searchRow}>
        <Ionicons name="search" size={18} color="#9ca3af" />
        <TextInput
          style={styles.searchInput}
          placeholder="ค้นหาผู้ใช้..."
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {/* ตัวกรอง */}
      <View style={styles.filterRow}>
        <Ionicons name="filter" size={18} color="#6b7280" />
        <Text style={styles.filterLabel}>กรอง:</Text>
        <View style={styles.segment}>
          {FILTERS.map((opt) => {
            const active = filter === opt;
            return (
              <Pressable
                key={opt}
                onPress={() => setFilter(opt)}
                style={[styles.segBtn, active && styles.segBtnActive]}
              >
                <Text style={[styles.segText, active && styles.segTextActive]}>
                  {opt}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ScrollView style={{ marginTop: 12 }}>
        {filtered.map((u) => (
          <View key={u.id} style={styles.userCard}>
            <Ionicons
              name={u.isActiveNow ? "person-circle" : "person-circle-outline"}
              size={40}
              color={u.isActiveNow ? "#10b981" : "#9ca3af"}
            />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={styles.userName}>{u.name}</Text>
                {u.isActiveNow && (
                  <View style={styles.badgeOnline}>
                    <View style={styles.dot} />
                    <Text style={styles.badgeText}>ออนไลน์</Text>
                  </View>
                )}
              </View>
              <Text style={styles.userEmail}>{u.email}</Text>
              <Text style={styles.metaText}>สมัครเมื่อ {u.createdAt}</Text>
              <Text style={styles.metaText}>จำนวนหนังสือ {u.books} เล่ม</Text>
              <Text style={[styles.metaText, { marginTop: 2 }]}>
                เข้าใช้งานครั้งล่าสุด: {u.lastSeenText}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("UserDetail", { userId: u.id })
                }
              >
                <Text style={styles.link}>รายละเอียด</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDelete(u)}>
                <Text style={styles.delete}>ลบ</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 16 },
  pageTitle: { fontSize: 20, fontWeight: "bold", color: "#111827" },
  pageSub: { fontSize: 12, color: "#6b7280", marginTop: 2, marginBottom: 12 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  searchInput: { marginLeft: 6, flex: 1 },
  filterRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterLabel: { color: "#374151" },
  segment: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 2,
  },
  segBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  segBtnActive: { backgroundColor: "#eef2ff" },
  segText: { color: "#374151", fontSize: 13 },
  segTextActive: { color: "#4f46e5", fontWeight: "700" },
  userCard: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  userName: { fontWeight: "bold", fontSize: 14, color: "#111827" },
  userEmail: { fontSize: 12, color: "#6b7280" },
  metaText: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  link: { color: "#2563eb", fontSize: 13, marginTop: 6 },
  delete: { color: "#dc2626", fontSize: 13, marginTop: 4 },
  badgeOnline: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    marginLeft: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: "#10b981",
    marginRight: 6,
  },
  badgeText: { color: "#065f46", fontSize: 11, fontWeight: "700" },
});
