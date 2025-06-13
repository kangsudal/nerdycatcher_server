✅ 프로젝트 구성 개요
	•	📦 GitHub 레포지토리: nerdycatcher_socket_server
	•	🧭 Render: 중계 서버 (중간에서 데이터를 WSS 서버로 전달)
	•	🚉 Railway: WebSocket(WSS) 서버 (ESP32에서 연결되는 대상)
	•	🗃 Supabase: 데이터 저장소 (중계 서버에서 Supabase로 저장)

```
nerdycatcher_socket_server/
├── socket-server/         # Railway (wss 서버)
│   ├── index.js
│   ├── package.json
│   └── ...
└── relay-server/          # Render (중계 서버)
    ├── index.js
    ├── package.json
    └── ... 
```
