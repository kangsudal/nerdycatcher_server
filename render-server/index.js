import WebSocket, { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 8080;

const supabaseUrl = process.env.SUPABASE_URL || 'https://aryfymqeyenwvfywinao.supabase.co';
const supabaseKey = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFyeWZ5bXFleWVud3ZmeXdpbmFvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkxOTQwNzUsImV4cCI6MjA2NDc3MDA3NX0.YOMv7Y2P3UoZwH9Glt7BGu9Uqqs8oYJe4qBtPz2DGZw';

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
    console.log('❎ 클라이언트 연결 종료');
  });
});