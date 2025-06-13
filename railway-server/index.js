import express from 'express';
import dotenv from 'dotenv';
import WebSocket from 'ws';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

const renderSocketUrl = process.env.RENDER_ENDPOINT || 'wss://nerdycatcher-socket-server.onrender.com';

app.post('/send', async (req, res) => {
  const { sensor, value } = req.body;

  if (!sensor || value === undefined) {
    return res.status(400).json({ error: 'sensor, value 필드가 필요합니다.' });
  }

  const ws = new WebSocket(renderSocketUrl);

  ws.on('open', () => {
    ws.send(JSON.stringify({ sensor, value }));
    ws.close();
    res.json({ status: '✅ 데이터 전송 완료' });
  });

  ws.on('error', (err) => {
    console.error('❌ WebSocket 오류:', err.message);
    res.status(500).json({ error: 'WebSocket 전송 실패' });
  });
});

app.listen(PORT, () => {
  console.log(`🚀 중계서버 실행 중: http://localhost:${PORT}`);
});