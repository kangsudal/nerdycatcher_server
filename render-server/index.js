import WebSocket, { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 8080;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const wss = new WebSocketServer({ port: PORT });

console.log(`✅ WebSocket 서버 시작됨: ws://localhost:${PORT}`);

wss.on('connection', (ws) => {
  console.log('🤝 클라이언트 연결됨');

  ws.on('message', async (message) => {
    const data = message.toString();
    console.log('📨 수신된 메시지:', data);

    try {
      const json = JSON.parse(data);

      if (json.type === 'identify') {
        ws.clientName = json.name; // 클라이언트 이름 저장
        console.log(`🔖 클라이언트 식별: ${ws.clientName}`);
        return;
      }
      console.log(`${ws.clientName ?? '알 수 없음'} 으로부터 데이터 수신됨`);
      const { error } = await supabase.from('sensor_data').insert([
        {
          temperature: json.temperature,
          humidity: json.humidity,
          light_level: json.light_level,
          plant_id: json.plant_id
        }
      ]);
      if (error) console.error('❌ Supabase 저장 실패:', error.message);
      else console.log('✅ Supabase 저장 성공');
    } catch (err) {
      console.error('⚠️ 메시지 파싱 오류:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`👋 클라이언트 종료됨: ${ws.clientName || '알 수 없음'}`);
  });
});