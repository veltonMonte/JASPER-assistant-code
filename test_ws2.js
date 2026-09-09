const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:3000/ws');
ws.on('open', () => {
  console.log('Connected!');
  ws.send(JSON.stringify({ type: 'TEXT_COMMAND', text: 'Olá JASPER!' }));
});
ws.on('message', (msg) => {
  const data = JSON.parse(msg.toString());
  if (data.type === 'TURN_COMPLETE') {
    console.log('Turn complete. Sending second question...');
    ws.send(JSON.stringify({ type: 'TEXT_COMMAND', text: 'Tudo bem com voce?' }));
  }
  if (data.type === 'LIVE_TEXT_CHUNK') {
    console.log('Received text:', data.text);
  }
});
