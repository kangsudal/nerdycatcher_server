
# nerdycatcher_server

Render에 배포되는 WebSocket 서버

## 데이터 흐름  
ESP32 → Render 소켓서버 → Supabase

ESP32는 보안 웹소켓(WSS)을 통해 Render에 배포된 서버에 데이터를 전송합니다.  
서버는 받은 데이터를 Supabase의 `sensor_data` 테이블에 저장합니다.

## 예시 로그
```
✅ WebSocket 서버 시작됨: ws\://localhost:8080
🤝 클라이언트 연결됨
📨 수신된 메시지: {"temperature":25.3,"humidity":51,"light\_level":218,"plant\_id":1}
✅ Supabase 저장 성공
```

## 환경 변수 (.env)
```
SUPABASE\_URL=your\_supabase\_url
SUPABASE\_KEY=your\_supabase\_api\_key
```

## Render 설정
- **Root Directory**: `render-server`

## 🔗 관련 저장소
- [nerdycatcher_esp32](https://github.com/kangsudal/nerdycatcher_esp32): 센서 데이터를 측정하고 서버로 전송하는 ESP32 코드

