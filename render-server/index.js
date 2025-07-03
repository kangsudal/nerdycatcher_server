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

      // 일단은 연결된 모든 클라이언트에게 데이터 전송
      wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'sensor_data',
            from: ws.clientName,
            data: {
              temperature: json.temperature,
              humidity: json.humidity,
              light_level: json.light_level,
              plant_id: json.plant_id,
            }
          }));
        }
      });

    //  온도 임계값 체크 후 '해당 식물을 구독한 그룹'에게 푸시 알림 발송
    if (json.temperature < 200) {
      console.log(`조도 임계값 미만! plant_id:${json.plant_id} 그룹에게 푸시 알림 발송 시도.`);
      await sendPushToPlantGroup(
        json.plant_id,
        '빛 세기 경고!',
        `현재 조도 ${json.temperature} lux가 임계값보다 낮습니다.`
      );
    }

    } catch (err) {
      console.error('⚠️ 메시지 파싱 오류:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`👋 클라이언트 종료됨: ${ws.clientName || '알 수 없음'}`);
  });
});

async function sendPushToPlantGroup(plantId, title, body) {
  // 1. 특정 plant_id를 가진 모든 사용자의 FCM 토큰 조회
  const { data: users, error } = await supabase
    .from('users')
    .select('fcm_token')
    .eq('plant_id', plantId); // <-- plant_id로 조회

  if (error || !users || users.length === 0) {
    console.warn(`⚠️ plant_id:${plantId}에 대한 사용자를 찾을 수 없습니다.`);
    return;
  }

  // 2. 구글 인증은 한 번만 실행
  const auth = new GoogleAuth({
    keyFile: './nerdycatcher-firebase-adminsdk-fbsvc-5e1eeecd7c.json',
    scopes: 'https://www.googleapis.com/auth/firebase.messaging',
  });
  const accessToken = await auth.getAccessToken();
  const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/nerdycatcher/messages:send`;

  // 3. 조회된 모든 사용자에게 알림 전송 (for...of 루프 사용)
  for (const user of users) {
    if (user.fcm_token) {
      const notificationPayload = {
        message: {
          token: user.fcm_token,
          notification: { title, body },
        },
      };

      try {
        await fetch(fcmEndpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(notificationPayload),
        });
        console.log(`✅ ${user.fcm_token} (으)로 푸시 전송 성공`);
      } catch (e) {
        console.error(`❌ ${user.fcm_token} (으)로 푸시 전송 오류:`, e.message);
      }
    }
  }
}