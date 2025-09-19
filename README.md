
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

### 인증 구조를 넣은 이유

#### 1.보안 강화

IoT 기기(ESP32)가 서버와 연결될 때, 아무 장치나 접속하면 안 되기 때문에 API Key 기반 인증을 넣음.

이를 통해 허가되지 않은 기기가 서버에 데이터를 보내거나, 제어 명령을 받는 걸 방지함.

#### 2.데이터 신뢰성 확보

인증된 기기에서 들어온 데이터만 DB(Supabase)에 저장되도록 하여, 데이터 무결성을 보장.

추후 데이터 분석이나 알림 조건에 활용할 때 신뢰할 수 있는 데이터만 다룸.

#### 3.서비스 확장성 고려

단순히 하나의 기기만 쓰는 게 아니라, 여러 ESP32 기기를 붙일 수 있도록 기기별 고유 API Key를 발급해 관리 가능.

나중에 사용자 계정과 기기를 매핑할 때도 확장성이 생김.

## 관련 저장소
- [nerdycatcher_esp32](https://github.com/kangsudal/nerdycatcher_esp32): 센서 데이터를 측정하고 서버로 전송하는 ESP32 코드

## blog
https://blog.naver.com/kangsudal-dev/223899093772
