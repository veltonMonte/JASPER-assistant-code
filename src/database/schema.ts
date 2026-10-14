export const CREATE_TABLES_SQL = `
-- Tabela para armazenar preferências do usuário e dados persistentes da memória
CREATE TABLE IF NOT EXISTS memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  category TEXT DEFAULT 'general',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- Tabela para gerenciar os 6 parâmetros de personalidade estilo TARS (Interestelar)
CREATE TABLE IF NOT EXISTS personality_config (
  trait TEXT PRIMARY KEY,
  value INTEGER NOT NULL,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);


-- Tabela para histórico de conversas (para sessões passadas)
CREATE TABLE IF NOT EXISTS chat_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL, -- 'user' | 'assistant' | 'system' | 'tool'
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela para logs de performance e latência
CREATE TABLE IF NOT EXISTS performance_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  command_text TEXT,
  stt_ms INTEGER,
  router_ms INTEGER,
  gemini_ms INTEGER,
  tool_ms INTEGER,
  tts_ms INTEGER,
  total_ms INTEGER,
  route_type TEXT, -- 'DIRECT_INTENT' | 'GEMINI_AGENT'
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tabela para gerenciar alarmes e agendamentos
CREATE TABLE IF NOT EXISTS alarms_agenda (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL, -- 'alarm' ou 'agenda'
  trigger_time DATETIME NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;
