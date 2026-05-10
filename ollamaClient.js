import { Platform } from 'react-native';
import Constants from 'expo-constants';

/* ----------------------------------------------------
 * 1) อ่านค่า HOST/PORT จาก app.json (ถ้ามี)
 *    - ใส่ไว้ใน app.json -> expo.extra.OLLAMA_HOST เช่น "http://192.168.1.5:11434"
 *    - หรือผ่าน ENV: EXPO_PUBLIC_OLLAMA_HOST
 * -------------------------------------------------- */
const envHost =
  Constants?.expoConfig?.extra?.OLLAMA_HOST ||
  process.env.EXPO_PUBLIC_OLLAMA_HOST;

/* ----------------------------------------------------
 * 2) ตั้งค่า host อัตโนมัติ
 *    - Android Emulator: ใช้ 10.0.2.2 (bridge ไป localhost ของเครื่อง PC)
 *    - iOS Simulator / Web / อุปกรณ์จริง: ให้ลอง localhost ก่อน
 *      (ถ้าทดสอบบนมือถือจริง ต้องเปลี่ยนเป็น IP LAN ของเครื่อง PC เอง)
 * -------------------------------------------------- */
const autoHost =
  Platform.OS === 'android'
    ? 'http://10.0.2.2:11434' // Android Emulator
    : 'http://localhost:11434'; // iOS Simulator / Web

/* ----------------------------------------------------
 * 3) base URL ที่ใช้จริง (env > auto)
 * -------------------------------------------------- */
export const OLLAMA_BASE_URL = envHost || autoHost;

/* ----------------------------------------------------
 * 4) ตั้งค่าโมเดลเริ่มต้น (เปลี่ยนได้ตามที่ติดตั้งใน ollama)
 *    ตัวอย่าง: 'qwen2.5:7b-instruct' หรือ 'llama2:latest'
 * -------------------------------------------------- */
export const DEFAULT_MODEL = 'qwen2.5:7b-instruct';

/* ----------------------------------------------------
 * 5) System Prompt: บังคับให้ตอบ "ภาษาไทยเท่านั้น"
 * -------------------------------------------------- */
const THAI_ONLY_SYSTEM =
  'คุณเป็นผู้ช่วย AI ที่ตอบคำถามเป็นภาษาไทยเท่านั้น ' +
  'ห้ามใช้ภาษาอื่น และให้คำตอบกระชับ ชัดเจน มีหัวข้อหรือรายการเมื่อเหมาะสม';

/* ----------------------------------------------------
 * 6) แปลง error ให้อ่านง่าย (ข้อความไทย)
 * -------------------------------------------------- */
function normalizeOllamaError(err) {
  const raw = String(err?.message || err || '');
  if (raw.includes('Network request failed')) {
    return (
      'เชื่อมต่อ Ollama ไม่ได้: Network request failed\n' +
      'กรุณาตรวจสอบว่า:\n' +
      "- พี่รัน 'ollama serve'\n" +
      '- มือถือ/อีมูเลเตอร์อยู่ในวงแลนเดียวกัน\n' +
      `- URL: ${OLLAMA_BASE_URL}\n` +
      'โปรดตรวจสอบ IP/พอร์ต 11434 และเครือข่ายให้ถูกต้อง'
    );
  }
  if (/fetch.*failed|Failed to fetch/i.test(raw)) {
    return `เรียก Ollama ไม่สำเร็จ (fetch failed)\nรายละเอียด: ${raw}`;
  }
  return raw;
}

/* ----------------------------------------------------
 * 7) เรียก Ollama (non-stream) → ได้ข้อความสรุปก้อนเดียว
 * -------------------------------------------------- */
export async function generateOllama({
  model = DEFAULT_MODEL,
  prompt = '',
  system = THAI_ONLY_SYSTEM,
  options, 
} = {}) {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        system,
        options,
        stream: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama ${res.status}: ${text}`);
    }

    const data = await res.json(); // { response: "...", done: true, ... }
    return data?.response ?? '';
  } catch (err) {
    throw new Error(normalizeOllamaError(err));
  }
}

/* ----------------------------------------------------
 * 8) เรียก Ollama (stream) → ส่งทีละ token (ไว้ทำตัวอักษรไหล ๆ)
 *    ใช้กับ UI ที่อยากโชว์ข้อความพิมพ์ออกมาทีละนิด
 * -------------------------------------------------- */
export async function streamOllama(
  {
    model = DEFAULT_MODEL,
    prompt = '',
    system = THAI_ONLY_SYSTEM,
    options,
  } = {},
  {
    onToken, 
    onDone, 
    onError, 
  } = {}
) {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        system,
        options,
        stream: true,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama ${res.status}: ${text}`);
    }

    const reader = res.body?.getReader?.();
    if (!reader) {
      throw new Error('ไม่สามารถอ่านสตรีมของ Ollama ได้ (reader ว่างเปล่า)');
    }

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? ''; 

      for (const line of lines) {
        const s = line.trim();
        if (!s) continue;

        try {
          const obj = JSON.parse(s); 
          if (obj?.response && typeof onToken === 'function') {
            onToken(obj.response);
          }
          if (obj?.done) {
            if (typeof onDone === 'function') onDone();
          }
        } catch {
        }
      }
    }

    if (buffer.trim()) {
      try {
        const obj = JSON.parse(buffer.trim());
        if (obj?.response && typeof onToken === 'function') {
          onToken(obj.response);
        }
      } catch {
      }
    }

    if (typeof onDone === 'function') onDone();
  } catch (err) {
    const msg = normalizeOllamaError(err);
    if (typeof onError === 'function') onError(msg);
  }
}

/* ----------------------------------------------------
 * 9) ยูทิลเล็ก ๆ: ตรวจโมเดลในเครื่อง (ollama list)
 * -------------------------------------------------- */
export async function listLocalModels() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama ${res.status}: ${text}`);
    }
    const data = await res.json(); 
    return data?.models ?? [];
  } catch (err) {
    throw new Error(normalizeOllamaError(err));
  }
}
