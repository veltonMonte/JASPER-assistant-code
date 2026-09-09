const WebSocket = require('ws');
require('dotenv').config();

const uri = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${process.env.GEMINI_API_KEY}`;
const ws = new WebSocket(uri);

ws.on('open', () => {
  console.log('Connected');
  ws.send(JSON.stringify({
    setup: {
      model: `models/${process.env.GEMINI_LIVE_MODEL}`,
      tools: [{ functionDeclarations: [{ name: 'get_weather', description: 'Get weather', parameters: { type: 'object', properties: { location: { type: 'string' } } } }] }]
    }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('Received:', JSON.stringify(msg).substring(0, 200));

  if (msg.setupComplete) {
    ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text: 'What is the weather in London?' }] }],
        turnComplete: true
      }
    }));
  }

  if (msg.toolCall) {
    const call = msg.toolCall.functionCalls[0];
    console.log('Tool call received:', call);
    
    // Test toolResponse format
    const responsePayload = {
      toolResponse: {
        functionResponses: [{
          id: call.id,
          name: call.name,
          response: { weather: 'Sunny' }
        }]
      }
    };
    console.log('Sending toolResponse:', JSON.stringify(responsePayload));
    ws.send(JSON.stringify(responsePayload));
  }
});

ws.on('close', (code, reason) => {
  console.log('Closed', code, reason.toString());
});
