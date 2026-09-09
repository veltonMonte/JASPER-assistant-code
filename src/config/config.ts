import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface AppConfig {
  port: number;
  host: string;
  env: string;
  gemini: {
    apiKey: string;
    model: string;
    liveModel: string;
    voice: string;
  };
  telegram: {
    botToken: string;
    defaultChatId: string;
  };
  targetPc: {
    mac: string;
    ip: string;
    port: number;
  };
  database: {
    path: string;
  };
  security: {
    token: string;
  };
}

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    liveModel: process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-latest',
    voice: process.env.GEMINI_VOICE || 'Puck', // Vozes masculinas do Gemini Live: Puck, Fenrir, Charon, etc.
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    defaultChatId: process.env.TELEGRAM_DEFAULT_CHAT_ID || '',
  },
  targetPc: {
    mac: process.env.TARGET_PC_MAC || '00:11:22:33:44:55',
    ip: process.env.TARGET_PC_IP || '192.168.1.100',
    port: parseInt(process.env.TARGET_PC_PORT || '9', 10),
  },
  database: {
    path: path.resolve(process.cwd(), process.env.DATABASE_PATH || './jasper.db'),
  },
  security: {
    token: process.env.API_SECRET_TOKEN || 'jasper-secure-local-token',
  },
};
