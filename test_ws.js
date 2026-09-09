const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000/ws');
ws.on('open', () => {
  console.log('Connected!');
  ws.send(JSON.stringify({ type: 'TEXT_COMMAND', text: 'Olá JASPER!' }));
});
ws.on('message', (msg) => {
  console.log('Received:', msg.toString().substring(0, 100));
});
