
export interface PersonalityConfig {
  humor: number;
  honestidade: number;
  sarcasmo: number;
  formalidade: number;
  verbosidade: number;
  empatia: number;
}

export const DEFAULT_PERSONALITY: PersonalityConfig = {
  humor: 60,
  honestidade: 90,
  sarcasmo: 40,
  formalidade: 30,
  verbosidade: 50,
  empatia: 70,
};

import sqlite3 from 'sqlite3';
import { config } from '../config/config.js';
import { CREATE_TABLES_SQL } from './schema.js';

class DatabaseManager {
  private db: sqlite3.Database | null = null;

  public init(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(config.database.path, (err) => {
        if (err) {
          console.error('❌ erro ao conectar ao SQLite:', err.message);
          return reject(err);
        }
        console.log(`💾 Banco de dados SQLite conectado em: ${config.database.path}`);
        this.createSchema()
          .then(resolve)
          .catch(reject);
      });
    });
  }

  private createSchema(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));
      this.db.exec(CREATE_TABLES_SQL, (err) => {
        if (err) {
          console.error('❌ Erro ao criar schema do banco:', err.message);
          return reject(err);
        }
        console.log('✅ Schema de tabelas SQLite verificado/criado com sucesso.');
        resolve();
      });
    });
  }

  // --- Operações de Memória Persistente ---

  public getMemory(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(null);
      const query = `SELECT value FROM memory WHERE key = ?`;
      this.db.get(query, [key], (err, row: { value: string } | undefined) => {
        if (err) return reject(err);
        resolve(row ? row.value : null);
      });
    });
  }

  public getAllMemories(): Promise<Array<{ key: string; value: string; category: string }>> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      const query = `SELECT key, value, category FROM memory ORDER BY key ASC`;
      this.db.all(query, [], (err, rows: Array<{ key: string; value: string; category: string }>) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  public saveMemory(key: string, value: string, category: string = 'general'): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const query = `
        INSERT INTO memory (key, value, category, updated_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          category = excluded.category,
          updated_at = CURRENT_TIMESTAMP
      `;
      this.db.run(query, [key, value, category], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  public deleteMemory(key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(false);
      const query = `DELETE FROM memory WHERE key = ?`;
      this.db.run(query, [key], function (err) {
        if (err) return reject(err);
        resolve((this.changes || 0) > 0);
      });
    });
  }

  // --- Operações de Log de Performance ---

  public logPerformance(metrics: {
    commandText: string;
    sttMs: number;
    routerMs: number;
    geminiMs: number;
    toolMs: number;
    ttsMs: number;
    totalMs: number;
    routeType: 'DIRECT_INTENT' | 'GEMINI_AGENT';
  }): Promise<void> {
    return new Promise((resolve) => {
      if (!this.db) return resolve();
      const query = `
        INSERT INTO performance_logs
        (command_text, stt_ms, router_ms, gemini_ms, tool_ms, tts_ms, total_ms, route_type)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `;
      this.db.run(
        query,
        [
          metrics.commandText,
          metrics.sttMs,
          metrics.routerMs,
          metrics.geminiMs,
          metrics.toolMs,
          metrics.ttsMs,
          metrics.totalMs,
          metrics.routeType,
        ],
        (err) => {
          if (err) console.error('Erro ao gravar log de performance:', err.message);
          resolve();
        }
      );
    });
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close(() => {
          this.db = null;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // --- Operações de Alarme e Agenda ---

  public createAlarm(type: 'alarm' | 'agenda', triggerTime: string, message: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const query = `INSERT INTO alarms_agenda (type, trigger_time, message, status) VALUES (?, ?, ?, 'pending')`;
      this.db.run(query, [type, triggerTime, message], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  public getPendingAlarms(): Promise<Array<{ id: number; type: string; trigger_time: string; message: string }>> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);
      const query = `SELECT * FROM alarms_agenda WHERE status = 'pending' AND datetime(trigger_time) <= datetime('now', 'localtime')`;
      this.db.all(query, [], (err, rows: any) => {
        if (err) return reject(err);
        resolve(rows || []);
      });
    });
  }

  public markAlarmDone(id: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const query = `UPDATE alarms_agenda SET status = 'done' WHERE id = ?`;
      this.db.run(query, [id], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  // --- Operações de Personalidade TARS ---

  public getPersonality(): Promise<PersonalityConfig> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve({ ...DEFAULT_PERSONALITY });
      const query = `SELECT trait, value FROM personality_config`;
      this.db.all(query, [], async (err, rows: Array<{ trait: string; value: number }>) => {
        if (err) return reject(err);
        const result: PersonalityConfig = { ...DEFAULT_PERSONALITY };
        if (rows && rows.length > 0) {
          for (const r of rows) {
            if (r.trait in result) {
              (result as any)[r.trait] = Math.max(0, Math.min(100, Number(r.value)));
            }
          }
          resolve(result);
        } else {
          // Inicializa os padrões no SQLite
          for (const [trait, val] of Object.entries(DEFAULT_PERSONALITY)) {
            await this.setPersonalityTrait(trait, val);
          }
          resolve(result);
        }
      });
    });
  }

  public setPersonalityTrait(trait: string, value: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve();
      const val = Math.max(0, Math.min(100, Math.round(value)));
      const query = `
        INSERT INTO personality_config (trait, value, updated_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(trait) DO UPDATE SET
          value = excluded.value,
          updated_at = CURRENT_TIMESTAMP
      `;
      this.db.run(query, [trait, val], (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  public async updatePersonality(partial: Partial<PersonalityConfig>): Promise<PersonalityConfig> {
    for (const [trait, val] of Object.entries(partial)) {
      if (val !== undefined && typeof val === "number") {
        await this.setPersonalityTrait(trait, val);
      }
    }
    return this.getPersonality();
  }

  public async resetPersonality(): Promise<PersonalityConfig> {
    for (const [trait, val] of Object.entries(DEFAULT_PERSONALITY)) {
      await this.setPersonalityTrait(trait, val);
    }
    return { ...DEFAULT_PERSONALITY };
  }

}

export const dbManager = new DatabaseManager();
