import * as Notifications from 'expo-notifications';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const CHANNEL_ID = 'reading';

const THAI_DAYS = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];

/** ขอสิทธิการแจ้งเตือน  */
export async function requestNotificationPermission() {
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const res = await Notifications.requestPermissionsAsync();
    return res.status === 'granted';
  }
  return true;
}

function buildOccurrences(schedule, fromDate, toDate) {
  const results = [];
  const cur = new Date(fromDate.getTime());
  cur.setHours(0,0,0,0);

  const end = new Date(toDate.getTime());
  end.setHours(23,59,59,999);

  while (cur <= end) {
    const dayName = THAI_DAYS[cur.getDay()]; // 0..6
    const times = schedule?.[dayName];
    if (times && typeof times === 'object') {
      Object.keys(times).forEach((hhmm) => {
        const [h, m] = hhmm.split(':').map(n => Number(n) || 0);
        const run = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate(), h, m, 0, 0);
        if (run >= fromDate && run <= end) {
          results.push(run);
        }
      });
    }
    cur.setDate(cur.getDate() + 1);
  }
  results.sort((a,b) => a.getTime() - b.getTime());
  return results;
}

export async function scheduleReadingNotifications(uid, book, windowDays = 14) {
  if (!uid || !book?.id || !book?.readingSchedule) return;

  const now = new Date();
  const from = new Date(now.getTime());
  const to   = new Date(now.getTime() + windowDays * 86400000);

  const occurrences = buildOccurrences(book.readingSchedule, from, to);
  if (!occurrences.length) {
    await updateDoc(doc(db, 'users', uid, 'books', book.id), {
      notificationIds: [],
      notificationsThrough: null,
      notificationsUpdatedAt: serverTimestamp(),
    });
    return;
  }

  const ids = [];
  for (const runAt of occurrences) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'ถึงเวลาอ่านหนังสือ 📚',
        body: `มาอ่าน "${book.title || 'หนังสือ'}" ตามตารางกันครับ`,
        sound: 'default',
        data: { type: 'reading', bookId: book.id },
      },
      trigger: { date: runAt, channelId: CHANNEL_ID },
    });
    ids.push(id);
  }

  await updateDoc(doc(db, 'users', uid, 'books', book.id), {
    notificationIds: ids,
    notificationsThrough: to,
    notificationsUpdatedAt: serverTimestamp(),
  }, { merge: true });
}

export async function topUpFutureNotifications(uid, book, windowDays = 14) {
  if (!uid || !book?.id || !book?.readingSchedule) return;

  const throughRaw = book.notificationsThrough;
  const through = throughRaw?.toDate ? throughRaw.toDate() : (throughRaw ? new Date(throughRaw) : null);

  const now = new Date();
  const targetThrough = new Date(now.getTime() + windowDays * 86400000);

  if (through && through >= targetThrough) return;

  const from = new Date((through && through.getTime()) || now.getTime());
  from.setDate(from.getDate() + 1);
  from.setHours(0,0,0,0);

  const to = targetThrough;

  const occurrences = buildOccurrences(book.readingSchedule, from, to);
  if (!occurrences.length) {
    await updateDoc(doc(db, 'users', uid, 'books', book.id), {
      notificationsThrough: to,
      notificationsUpdatedAt: serverTimestamp(),
    }, { merge: true });
    return;
  }

  const newIds = [];
  for (const runAt of occurrences) {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'ถึงเวลาอ่านหนังสือ 📚',
        body: `มาอ่าน "${book.title || 'หนังสือ'}" ตามตารางกันครับ`,
        sound: 'default',
        data: { type: 'reading', bookId: book.id },
      },
      trigger: { date: runAt, channelId: CHANNEL_ID },
    });
    newIds.push(id);
  }

  const ref = doc(db, 'users', uid, 'books', book.id);
  const snap = await getDoc(ref);
  const prevIds = (snap.data()?.notificationIds || []).filter(Boolean);

  await updateDoc(ref, {
    notificationIds: [...prevIds, ...newIds],
    notificationsThrough: to,
    notificationsUpdatedAt: serverTimestamp(),
  });
}

/** ยกเลิกแจ้งเตือนทั้งหมดของเล่มนี้ */
export async function cancelReadingNotifications(uid, bookId) {
  if (!uid || !bookId) return;
  const ref = doc(db, 'users', uid, 'books', bookId);
  const snap = await getDoc(ref);
  const ids = (snap.data()?.notificationIds || []).filter(Boolean);

  for (const id of ids) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {}
  }

  await updateDoc(ref, {
    notificationIds: [],
    notificationsThrough: null,
    notificationsUpdatedAt: serverTimestamp(),
  });
}

export async function cancelIfGoalExpired(uid, book) {
  const raw = book?.goal?.targetDate;
  if (!raw) return;

  const target = raw?.toDate ? raw.toDate() : new Date(raw);
  if (!(target instanceof Date) || Number.isNaN(target.getTime())) return;

  const end = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59, 999);
  if (new Date() > end) {
    await cancelReadingNotifications(uid, book.id);
  }
}


export async function cancelAllBookNotifications(uid, bookId) {
  return cancelReadingNotifications(uid, bookId);
}

export async function scheduleWeeklyReminderForBook({
  uid,
  bookId,
  title,
  dayNameTh,
  timeHHMM,
  sessionMinutes = 30,
}) {
  if (!uid || !bookId || !dayNameTh || !timeHHMM) return;

  const idx = THAI_DAYS.indexOf(dayNameTh); // 0..6
  if (idx < 0) return;
  const weekday = idx + 1; // 1..7

  const [hourStr, minStr] = timeHHMM.split(':');
  const hour = Number(hourStr) || 0;
  const minute = Number(minStr) || 0;

  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: 'ถึงเวลาอ่านหนังสือ 📚',
      body: `มาอ่าน “${title || 'หนังสือ'}” กันสัก ${sessionMinutes} นาที`,
      sound: 'default',
      data: { type: 'reading', bookId },
    },
    trigger: {
      channelId: CHANNEL_ID,
      repeats: true,
      weekday, 
      hour,
      minute,
    },
  });

  const ref = doc(db, 'users', uid, 'books', bookId);
  const snap = await getDoc(ref);
  const prev = (snap.data()?.notificationIds || []).filter(Boolean);
  await updateDoc(ref, {
    notificationIds: [...prev, id],
    notificationsUpdatedAt: serverTimestamp(),
  });
}
