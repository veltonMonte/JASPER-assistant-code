import { dbManager } from '../database/database.js';
import { jasperWsServer } from './websocket.js';

export class Scheduler {
  private timer: NodeJS.Timeout | null = null;
  private intervalMs = 15000; // 15 segundos

  public start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.checkAlarms(), this.intervalMs);
    console.log(`⏰ Scheduler iniciado. Checando alarmes a cada ${this.intervalMs / 1000}s.`);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async checkAlarms() {
    try {
      const pendingAlarms = await dbManager.getPendingAlarms();
      
      for (const alarm of pendingAlarms) {
        console.log(`⏰ Disparando alarme/agenda: [${alarm.type}] ${alarm.message}`);
        
        // Dispara o evento via WebSocket
        jasperWsServer.broadcastToClients({
          type: 'ALARM_TRIGGER',
          alarmId: alarm.id,
          alarmType: alarm.type,
          message: alarm.message,
          triggerTime: alarm.trigger_time
        });

        // Marca como concluído
        await dbManager.markAlarmDone(alarm.id);
      }
    } catch (err) {
      console.error('❌ Erro no scheduler de alarmes:', err);
    }
  }
}

export const scheduler = new Scheduler();
