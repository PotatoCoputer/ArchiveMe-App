import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  ScrollView, 
  ActivityIndicator 
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from './firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function AdminDashboardScreen() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState({
    totalUsers: 0,
    newUsersThisMonth: 0,
    totalBooks: 0,
    avgBooksPerUser: 0,
    totalPages: 0,
    avgPagesPerUser: 0,
    totalHours: 0,
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const userSnap = await getDocs(collection(db, 'users'));
        const usersData = [];
        let totalBooks = 0;
        let totalPages = 0;

        for (const doc of userSnap.docs) {
          const data = doc.data();
          const user = {
            id: doc.id,
            name: data.name || 'ไม่ระบุ',
            email: data.email || '-',
            createdAt: data.createdAt,
            pages: 0,
            books: 0,
          };

          // ดึง books subcollection
          const booksSnap = await getDocs(collection(db, `users/${doc.id}/books`));
          user.books = booksSnap.size;
          user.pages = booksSnap.docs.reduce((sum, b) => sum + (b.data().pages || 0), 0);

          totalBooks += user.books;
          totalPages += user.pages;
          usersData.push(user);
        }

        setUsers(usersData);

        const totalUsers = usersData.length;
        const now = new Date();
        const newUsersThisMonth = usersData.filter(u => {
          if (!u.createdAt) return false;
          const created = u.createdAt.toDate ? u.createdAt.toDate() : new Date(u.createdAt);
          return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
        }).length;

        const avgBooksPerUser = totalUsers ? Math.round(totalBooks / totalUsers) : 0;
        const avgPagesPerUser = totalUsers ? Math.round(totalPages / totalUsers) : 0;
        const totalHours = Math.round(totalPages / 18);

        setStats({
          totalUsers,
          newUsersThisMonth,
          totalBooks,
          avgBooksPerUser,
          totalPages,
          avgPagesPerUser,
          totalHours,
        });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={{ marginTop: 8 }}>กำลังโหลดข้อมูล...</Text>
      </View>
    );
  }

  return (
    <ScrollView 
  style={styles.container}
  contentContainerStyle={{ paddingBottom: 24 }} // เว้นขอบล่าง
>

      <Text style={styles.title}>แดชบอร์ดผู้ดูแลระบบ</Text>
      <Text style={styles.subtitle}>ภาพรวมของระบบและสถิติการใช้งานแอปพลิเคชัน</Text>

      <View style={styles.cardRow}>
        <View style={[styles.card, { borderColor: '#6366f1', borderWidth: 1 }]}>
          <Ionicons name="people" size={24} color="#6366f1" />
          <Text style={styles.cardTitle}>ผู้ใช้ทั้งหมด</Text>
          <Text style={styles.cardValue}>{stats.totalUsers}</Text>
          <Text style={styles.cardSub}>ผู้ใช้ใหม่เดือนนี้: {stats.newUsersThisMonth}</Text>
        </View>

        <View style={[styles.card, { borderColor: '#16a34a', borderWidth: 1 }]}>
          <Ionicons name="book" size={24} color="#16a34a" />
          <Text style={styles.cardTitle}>หนังสือทั้งหมด</Text>
          <Text style={styles.cardValue}>{stats.totalBooks}</Text>
          <Text style={styles.cardSub}>เฉลี่ย {stats.avgBooksPerUser} เล่ม/คน</Text>
        </View>
      </View>

      <View style={styles.cardRow}>
        <View style={[styles.card, { borderColor: '#f59e0b', borderWidth: 1 }]}>
          <Ionicons name="document-text" size={24} color="#f59e0b" />
          <Text style={styles.cardTitle}>จำนวนหน้า</Text>
          <Text style={styles.cardValue}>{stats.totalPages}</Text>
          <Text style={styles.cardSub}>เฉลี่ย {stats.avgPagesPerUser} หน้า/คน</Text>
        </View>

        <View style={[styles.card, { borderColor: '#10b981', borderWidth: 1 }]}>
          <Ionicons name="time" size={24} color="#10b981" />
          <Text style={styles.cardTitle}>เวลารวม</Text>
          <Text style={styles.cardValue}>{stats.totalHours}</Text>
          <Text style={styles.cardSub}>ชั่วโมง</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>ผู้ใช้ที่มีกิจกรรมมากที่สุด</Text>
        {users
          .sort((a, b) => b.pages - a.pages)
          .slice(0, 5)
          .map((u, i) => (
            <View key={i} style={styles.userCard}>
              <Ionicons name="person-circle" size={36} color="#6b7280" />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.userName}>{u.name}</Text>
                <Text style={styles.userEmail}>{u.email}</Text>
                <Text>หน้าที่อ่าน: {u.pages} | หนังสือที่อ่าน: {u.books}</Text>
              </View>
            </View>
          ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#6b7280', marginBottom: 16 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    marginHorizontal: 4,
    padding: 12,
    borderRadius: 12,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardTitle: { fontSize: 14, color: '#6b7280', marginTop: 4 },
  cardValue: { fontSize: 20, fontWeight: 'bold', marginTop: 2 },
  cardSub: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  section: { marginTop: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 8 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  userName: { fontWeight: 'bold' },
  userEmail: { fontSize: 12, color: '#6b7280' },
});
