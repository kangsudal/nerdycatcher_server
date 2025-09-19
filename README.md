
# nerdycatcher_server

Render에 배포되는 WebSocket 서버

## 전체 데이터 흐름  
ESP32 → Render 소켓서버 → Supabase/Flutter앱

ESP32는 보안 웹소켓(WSS)을 통해 Render에 배포된 서버에 데이터를 전송합니다.  

## API 설계 경험

ESP32와 Flutter 앱 간 **실시간 데이터 송수신**을 위해  
WebSocket 기반 API와 인증 구조를 직접 설계·구현한 경험이 있습니다.  

- ESP32 → Render 서버: WebSocket 연결 및 API Key 인증  
- Render 서버 → Supabase: 센서 데이터 저장  
- Render 서버 ↔ Flutter 앱: 실시간 데이터 전달 및 제어 메시지 송수신  
- Render 서버 → Firebase Cloud Messaging: 조건 발생 시 푸시 알림 전송  

### 데이터 흐름 예시

#### 1. 인증 메시지 (ESP32 → Render 서버)
```json
{
  "type": "auth_device",
  "apiKey": "device-123-abc"
}
```
#### 2. 센서 데이터 (ESP32 → Render 서버 → Supabase/Flutter)
```json
{
  "type": "sensor_data",
  "deviceId": "device-123",
  "temperature": 25.7,
  "humidity": 62,
  "timestamp": "2025-09-19T10:15:00Z"
}
```
#### 3. 제어 메시지 (Flutter 앱 → Render 서버 → ESP32)
```json
{
  "type": "control",
  "deviceId": "device-123",
  "command": "LED_ON"
}
```

#### 4. 알림 트리거 (Render 서버 → FCM)
```json
{
  "title": "온도 경고",
  "body": "Device-123의 온도가 30℃를 초과했습니다."
}
```

## 관련 저장소
- [nerdycatcher_esp32](https://github.com/kangsudal/nerdycatcher_esp32): 센서 데이터를 측정하고 서버로 전송하는 ESP32 코드

## blog
https://blog.naver.com/kangsudal-dev/223899093772
