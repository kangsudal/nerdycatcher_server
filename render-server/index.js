import express from 'express';
import { createServer } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
//푸쉬 알림을 위해 GoogleAuth, fetch 필요
import { GoogleAuth } from 'google-auth-library';
import fetch from 'node-fetch';
import fs from 'fs';

dotenv.config();

const app = express();
const server = createServer(app);

const PORT = process.env.PORT || 10000;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const wss = new WebSocketServer({ server });

const lastIssuePushMap = new Map();

app.get('/', (req, res) => {
  res.send('NerdyCatcher WebSocket + Express 서버 작동중');
});

// ------------------- 새로운 클라이언트 연결 처리 -------------------
wss.on('connection', (ws) => {
  console.log('🤝 클라이언트 연결됨');
  ws.isAuthenticated = false; //인증 상태 플래그

  //5초 안에 인증하지 않으면 연결을 자동으로 종료하는 타이머
  const authTimeout = setTimeout(() => {
    if (!ws.isAuthenticated) {
      console.log('인증 시간 초과하였습니다. 연결을 종료합니다.');
      ws.close();
    }
  }, 5000);

  // ------------------- 클라이언트로부터 메시지 수신 처리 -------------------
  ws.on('message', async (message) => {
    const data = message.toString();
    console.log('📨 수신된 메시지:', data);

    try {
      const json = JSON.parse(data);
      // --- 인증 로직 ---
      // 아직 인증되지 않은 클라이언트의 첫 메시지는 인증 메시지로 응답.
      if (!ws.isAuthenticated) {
        await authenticateClient(ws, json, authTimeout);
        // 첫 메시지에 대한 처리는 여기서 끝냅니다.
        return;
      }

      // --- 인증된 '기기' 클라이언트만 실행할 수 있는 코드 ---
      if (ws.clientType === 'device' && json.type === 'sensor_data') {
        console.log(`[기기: plant_id ${ws.device.plant_id}] 로부터 데이터 수신됨`);
        // 센서데이터를 DB에 저장
        await saveSensorData(json, ws.device);

        // 기기에 연결된 plant 정보 가져옴
        const plant = await fetchPlant(ws.device.plant_id);
        if (plant) {
          const { data: members, error } = await supabase
            .from('monitoring_members')
            .select('user_id')
            .eq('plant_id', plant.id);

          // 멤버가 존재할 경우에만
          if (members && members.length > 0) {
            // 이 식물을 구독한 사용자 클라이언트만 추림
            const memberIds = members.map(member => member.user_id);
            // 실시간 데이터 전송(차트볼수있게)
            broadcastSensorData(wss, json, plant, memberIds);
            // 식물정보(임계값 등)에 따른 푸쉬 알림
            checkAndSendPushNotification(json, plant);
          }
        }
      }

      if (ws.clientType === 'user' && json.type === 'led_control') {
        const plantId = json.plant_id;       // Flutter에서 plantId를 포함해야 함
        const state = json.state;            // 'on' 또는 'off'
        console.log(`💡 LED 제어 요청: plant_id=${plantId}, state=${state}`);

        // 해당 plantId를 가진 기기를 찾아서 제어 메시지를 전달
        wss.clients.forEach(client => {
          if (client.clientType === 'device'
            && client.isAuthenticated
            && client.device.plant_id === plantId) {
            client.send(JSON.stringify({ type: 'led_control', state }));
          }
        });
        return;
      }
    } catch (err) {
      console.error('⚠️ 메시지 처리 오류:', err.message);
    }
  });

  ws.on('close', () => {
    console.log(`👋 클라이언트 종료됨: ${ws.user?.email || (ws.device ? `plant_id ${ws.device.plant_id}` : `인증 안된 기기`)}`);
    clearTimeout(authTimeout);
  });
});

server.listen(PORT, () => {
  console.log(`서버 실행 중: ${PORT}`)
});

async function sendPushToPlantGroup(plantId, title, body) {
  // 1. monitoring_members 테이블에서 plantId가 일치하는 모든 멤버를 찾고
  // 그 멤버에 대응하는 user_id 목록 조회
  const { data: members, error } = await supabase
    .from('monitoring_members')
    .select('user_id, users(fcm_token)')
    .eq('plant_id', plantId);
  console.log("members 구조 확인:", JSON.stringify(members, null, 2));
  //members :
  // [
  //   {
  //     "users": {
  //       "fcm_token": "첫 번째 멤버의 휴대폰 주소"
  //     }
  //   },
  //   {
  //     "users": {
  //       "fcm_token": "두 번째 멤버의 휴대폰 주소"
  //     }
  //   }
  // ]

  if (error || !members || members.length === 0) {
    console.warn(`⚠️ plant_id:${plantId}에 대한 사용자를 찾을 수 없습니다.`);
    return;
  }

  // members 배열에서 바로 fcm_token 추출
  const tokens = members
    .map((member) => member.users?.fcm_token)
    .filter((token) => token); // null이나 undefined 토큰 제거

  if (tokens.length === 0) {
    console.warn(`FCM 토큰을 가진 사용자가 없습니다.`);
    return;
  }

  // 2. 구글 인증은 한 번만 실행
  const keyFilePath = '/etc/secrets/nerdycatcher-firebase-adminsdk-fbsvc-5e1eeecd7c.json';
  const credentials = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
  const auth = new GoogleAuth({
    credentials,
    scopes: 'https://www.googleapis.com/auth/firebase.messaging',
  });
  const accessToken = await auth.getAccessToken();
  const fcmEndpoint = `https://fcm.googleapis.com/v1/projects/nerdycatcher/messages:send`;

  // 3. 조회된 모든 사용자에게 알림 전송 (for...of 루프 사용)
  for (const fcmToken of tokens) {
    // member:
    //   {
    //     "users": {
    //       "fcm_token": "첫 번째 멤버의 휴대폰 주소"
    //     }
    //   },

    console.log(`📱 FCM 토큰 확인:`, fcmToken);
    if (!fcmToken) {
      console.warn(`FCM 토큰이 없음. `);
      continue;
    }

    const notificationPayload = {
      message: {
        token: fcmToken,
        notification: { title, body },
        data: {
          // 해당 식물의 대쉬보드 페이지로 이동
          "deeplink": "/dashboard",
          "plantId": plantId.toString(),
        }
      },
    };

    try {
      const res = await fetch(fcmEndpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(notificationPayload),
      });
      const result = await res.json();
      console.log(`📨 응답 상태: ${res.status}, 결과:`, result);

      if (res.ok) {
        console.log(`✅ ${fcmToken} (으)로 푸시 전송 성공`);
      } else {
        //실행은 됐지만 응답이 실패했을때
        console.error(`❌ FCM 응답 오류:`, JSON.stringify(result, null, 2));

        if (result?.error?.details) {
          result.error.details.forEach((detail, idx) => {
            console.log(`🔍 [${idx}] 오류 코드: ${detail.errorCode}`);
            console.log(`🔍 [${idx}] 메시지: ${detail.message}`);
            console.log(`🔍 [${idx}] 전체:`, JSON.stringify(detail, null, 2));
          });
        }

        console.log(`(res.status === 404 && result.error?.details?.[0]?.errorCode === 'UNREGISTERED'):${(res.status === 404 && result.error?.details?.[0]?.errorCode === 'UNREGISTERED')}`);
        console.log(`result.error?.details?.[0]?.errorCode):${result.error?.details?.[0]?.errorCode}`);
        try {
          if (res.status === 404 && result.error?.details?.[0]?.errorCode === 'UNREGISTERED') {
            console.warn(`Supabase에서 이 토큰 삭제: ${fcmToken}`);
            await supabase
              .from('users')
              .update({ fcm_token: null })
              .eq('fcm_token', fcmToken);
            continue; //전체 푸시 루프가 중단되지 않고 다음으로 넘어가도록
          }
        } catch (e) {
          console.log(`실패했음! : ${e}`);
        }
      }
    } catch (e) {
      console.error(`❌ ${fcmToken} (으)로 푸시 전송 오류:`, e.message);
    }

  }
}

// 인증 팔찌가 없는 경우 검사하고 팔찌를 채워보낼지 말지 보는 함수
// 아직 인증되지 않은 클라이언트의 첫 메시지는 인증 메시지로 응답
async function authenticateClient(ws, json, authTimeout) {
  // 1. Flutter 앱(사용자)의 인증 처리
  if (json.type === 'auth' && json.token) {
    const { data: { user }, error } = await supabase.auth.getUser(json.token);
    if (error || !user) {
      console.log('❌ [사용자] 유효하지 않은 토큰. 연결을 종료합니다.');
      if (error) console.error('🔍 Supabase error:', error);
      return ws.close();
    }
    ws.isAuthenticated = true;
    ws.user = user; // 사용자 정보 저장
    ws.clientType = 'user';
    clearTimeout(authTimeout);
    console.log(`✅ [사용자] 인증 성공: ${ws.user.email}`);
    ws.send(JSON.stringify({ type: 'auth_success' }));
    return; // 인증 처리는 여기서 끝
  }

  // 2. ESP32(기기)의 인증 처리
  else if (json.type === 'auth_device' && json.apiKey) {
    const { data: device, error } = await supabase
      .from('devices')
      .select('id, plant_id') //id: 기기의 고유 UUID, plant_id: 이 기기가 모니터링하고있는 식물
      .eq('api_key', json.apiKey)
      .single();

    // device 변수의 내용물 예시
    // {
    //   "id": "기기의 고유 UUID",
    //   "plant_id": 1
    // }

    if (error || !device) {
      console.log('❌ [기기] 유효하지 않은 API 키. 연결을 종료합니다.');
      return ws.close();
    }
    ws.isAuthenticated = true;
    ws.device = device; // 기기 정보 저장
    ws.clientType = 'device';
    clearTimeout(authTimeout);
    console.log(`✅ [기기] 인증 성공: plant_id ${ws.device.plant_id}`);
    ws.send(JSON.stringify({ type: 'auth_success', plant_id: ws.device.plant_id, }));
    return; // 인증 처리는 여기서 끝
  }

  // 그 외의 경우 (잘못된 첫 메시지)
  else {
    console.log('❌ 인증되지 않은 첫 메시지. 연결을 종료합니다.');
    return ws.close();
  }
}

async function saveSensorData(sensorJson, deviceInfo) {
  // Supabase에 센서 데이터 저장
  const { error } = await supabase.from('sensor_data').insert([
    {
      temperature: sensorJson.temperature,
      humidity: sensorJson.humidity,
      light_level: sensorJson.light_level,
      plant_id: deviceInfo.plant_id, // 인증된 기기의 plant_id 사용
    }
  ]);

  if (error) console.error('❌ Supabase 저장 실패:', error.message);
  else console.log('✅ Supabase 저장 성공');

}

function broadcastSensorData(webSocketServer, sensorJson, plant, memberIds) {
  // 연결된 모든 사용자 중 모니터링 멤버로 등록되있는 클라이언트에게만 데이터 전송
  console.log(`[Broadcast] 모든 사용자에게 plant_id ${plant.id}의 데이터 전파`);
  webSocketServer.clients.forEach((client) => {
    // client가 인증된 'user' 타입일 때만 데이터 전송
    if (client.readyState === WebSocket.OPEN && client.isAuthenticated && client.clientType === 'user' && memberIds.includes(client.user.id)) {
      client.send(JSON.stringify({
        type: 'sensor_data',
        data: {
          temperature: sensorJson.temperature,
          humidity: sensorJson.humidity,
          light_level: sensorJson.light_level,
          plant_id: plant.id,
        }
      }));
    }
  });
}

// 식물의 정보(임계값 포함)를 가져옴
async function fetchPlant(plantId) {

  console.log(`[DB] id ${plantId}의 임계값 정보 조회...`);
  const { data: plant, error } = await supabase
    .from('plants')
    .select(`id,
      name, 
      threshold_settings(
        temperature_min,
        temperature_max, 
        humidity_min, 
        humidity_max, 
        light_min, 
        light_max
      )`
    )
    .eq('id', plantId)
    .single();

  if (error) {
    console.error(`❌ plant_id ${plantId} 정보 조회 실패:`, error.message);
    return null;
  }
  return plant;
  // {
  //   "id": 1,
  //   "name": "바질",
  //   "threshold_settings": {
  //     "temperature_min": 15,
  //     "temperature_max": 30,
  //     ...
  //   }
  // }
}

// 모든 임계값을 확인하고 필요 시 푸시 알림을 보내는 함수
// 문제별 푸시 시간 제한 기록용 Map
async function checkAndSendPushNotification(sensorJson, plant) {
  if (!plant.threshold_settings) return;

  const thresholdSettings = plant.threshold_settings;
  const now = Date.now();

  // 문제 발생시 푸시 보내되, 30초 제한
  async function sendPushWithThrottle(issueKey, title, body) {
    const lastSent = lastIssuePushMap.get(issueKey) || 0;
    if (now - lastSent >= 30_000) { // 30초
      lastIssuePushMap.set(issueKey, now);
      console.log(`[푸시 전송] ${issueKey}`);
      await sendPushToPlantGroup(plant.id, title, body);
    } else {
      console.log(`[푸시 생략] ${issueKey}는 최근 ${Math.floor((now - lastSent) / 1000)}초 전에 전송됨`);
    }
  }

  // --- 온도 확인 ---
  if (thresholdSettings.temperature_min && sensorJson.temperature < thresholdSettings.temperature_min) {
    await sendPushWithThrottle(
      `low_temp_${plant.id}`,
      `🌡️ ${plant.name} 저온 경고!`,
      `현재 온도 ${sensorJson.temperature}°C가 설정값(${thresholdSettings.temperature_min}°C)보다 낮습니다.`
    );
  }
  if (thresholdSettings.temperature_max && sensorJson.temperature > thresholdSettings.temperature_max) {
    await sendPushWithThrottle(
      `high_temp_${plant.id}`,
      `🌡️ ${plant.name} 고온 경고!`,
      `현재 온도 ${sensorJson.temperature}°C가 설정값(${thresholdSettings.temperature_max}°C)보다 높습니다.`
    );
  }

  // --- 습도 확인 ---
  if (thresholdSettings.humidity_min && sensorJson.humidity < thresholdSettings.humidity_min) {
    await sendPushWithThrottle(
      `low_humidity_${plant.id}`,
      `💧 ${plant.name} 건조 경고!`,
      `현재 습도 ${sensorJson.humidity}%가 설정값(${thresholdSettings.humidity_min}%)보다 낮습니다.`
    );
  }
  if (thresholdSettings.humidity_max && sensorJson.humidity > thresholdSettings.humidity_max) {
    await sendPushWithThrottle(
      `high_humidity_${plant.id}`,
      `💧 ${plant.name} 과습 경고!`,
      `현재 습도 ${sensorJson.humidity}%가 설정값(${thresholdSettings.humidity_max}%)보다 높습니다.`
    );
  }

  // --- 조도 확인 ---
  if (thresholdSettings.light_min && sensorJson.light_level < thresholdSettings.light_min) {
    await sendPushWithThrottle(
      `low_light_${plant.id}`,
      `☀️ ${plant.name} 빛 부족 경고!`,
      `현재 조도 ${sensorJson.light_level} lux가 설정값(${thresholdSettings.light_min} lux)보다 낮습니다.`
    );
  }
  if (thresholdSettings.light_max && sensorJson.light_level > thresholdSettings.light_max) {
    await sendPushWithThrottle(
      `high_light_${plant.id}`,
      `☀️ ${plant.name} 빛 과다 경고!`,
      `현재 조도 ${sensorJson.light_level} lux가 설정값(${thresholdSettings.light_max} lux)보다 높습니다.`
    );
  }
}