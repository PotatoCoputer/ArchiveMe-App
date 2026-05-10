const USE_ANDROID_STUDIO_EMULATOR = false; 
const PC_IP = '10.1.250.88';               

const BASE_URL = USE_ANDROID_STUDIO_EMULATOR
  ? 'http://10.0.2.2:11434'   
  : `http://${PC_IP}:11434`;  

export async function askOllamaThai(prompt) {
  const system =
    'คุณเป็นผู้ช่วยด้านการอ่านหนังสือ พูดภาษาไทย สุภาพ กระชับ และให้คำแนะนำเชิงปฏิบัติที่ทำได้จริง';

  const res = await fetch(`${BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'qwen2.5:7b-instruct',
      prompt: `${system}\n\nคำถามของผู้ใช้: ${prompt}`,
      stream: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status} ${text}`);
  }
  const data = await res.json();
  return (data.response || '').trim();
}
