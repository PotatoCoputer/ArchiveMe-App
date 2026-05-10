
import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

const APP_CAL_NAME = 'AchieveMe Reading';

export async function ensureCalendarPermissions() {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  if (status !== 'granted') throw new Error('Calendar permission denied');
}

async function getDefaultCalendarSource() {
  if (Platform.OS === 'ios') {
    const srcs = await Calendar.getSourcesAsync();
    const local = srcs.find(s => s.type === Calendar.SourceType.LOCAL);
    return local || srcs[0];
  } else {
    const cals = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    return cals.find(c => c.source) ? cals[0].source : { isLocalAccount: true, name: APP_CAL_NAME };
  }
}

export async function ensureAppCalendar() {
  await ensureCalendarPermissions();
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const exist = calendars.find(c => c.title === APP_CAL_NAME);
  if (exist) return exist.id;

  const source = await getDefaultCalendarSource();
  const id = await Calendar.createCalendarAsync({
    title: APP_CAL_NAME,
    color: '#4f46e5',
    entityType: Calendar.EntityTypes.EVENT,
    sourceId: source.id,
    source,
    name: APP_CAL_NAME,
    ownerAccount: 'personal',
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
  return id;
}


const TH_DAY_TO_INDEX = {
  'อาทิตย์': 0, 'จันทร์': 1, 'อังคาร': 2, 'พุธ': 3, 'พฤหัสบดี': 4, 'ศุกร์': 5, 'เสาร์': 6,
};

function nextDateForWeekday(targetDow, from = new Date()) {
  const d = new Date(from);
  const diff = (targetDow + 7 - d.getDay()) % 7;
  d.setDate(d.getDate() + (diff === 0 ? 7 : diff)); 
  d.setHours(0,0,0,0);
  return d;
}

function parseHHMM(hhmm = '08:00') {
  const [h, m] = (hhmm || '08:00').split(':').map(v => Number(v) || 0);
  return { h, m };
}

export async function addReadingEventsForBook(book, readingSchedule, weeks = 8) {
  const calId = await ensureAppCalendar();

  const now = new Date();
  for (const dayTh of Object.keys(readingSchedule || {})) {
    const times = readingSchedule[dayTh] || {};
    const dow = TH_DAY_TO_INDEX[dayTh];
    if (dow === undefined) continue;

   
    let startDate = nextDateForWeekday(dow, now);

    for (let w = 0; w < weeks; w++) {
   
      const day = new Date(startDate.getTime() + (w * 7 * 24 * 60 * 60 * 1000));

      for (const hhmm of Object.keys(times)) {
        const minutes = Number(times[hhmm]) || 30;
        const { h, m } = parseHHMM(hhmm);

        const begin = new Date(day);
        begin.setHours(h, m, 0, 0);
        const end = new Date(begin.getTime() + minutes * 60000);

        await Calendar.createEventAsync(calId, {
          title: `อ่านหนังสือ: ${book?.title || 'เล่มหนึ่ง'}`,
          startDate: begin,
          endDate: end,
          notes: `เป้าหมาย: ${book?.dailyGoal || '-'} หน้า`,
          timeZone: undefined, 
        });
      }
    }
  }
}
