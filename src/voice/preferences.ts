import { dbManager } from '../database/database.js';
import { DEFAULT_VOICE_SETTINGS, validateVoiceSettings, type VoiceSettings } from './profiles.js';
interface VoiceStore { read(key: string): Promise<string | null>; write(key: string, value: string): Promise<void> }
const KEY = 'voice.preferences.v1';
export class VoicePreferences {
  private settings = { ...DEFAULT_VOICE_SETTINGS };
  private loading: Promise<void> | null = null;
  constructor(private store: VoiceStore) {}
  async get(): Promise<VoiceSettings> {
    if (!this.loading) this.loading = this.load().catch(error => { this.loading = null; throw error; });
    await this.loading;
    return { ...this.settings };
  }
  private async load(): Promise<void> {
    const raw = await this.store.read(KEY);
    if (raw) { try { this.settings = validateVoiceSettings(JSON.parse(raw)); } catch { this.settings = { ...DEFAULT_VOICE_SETTINGS }; } }
  }
  async update(patch: unknown): Promise<VoiceSettings> {
    const settings = validateVoiceSettings(patch, await this.get());
    await this.store.write(KEY, JSON.stringify(settings));
    this.settings = settings;
    return { ...settings };
  }
}
export const voicePreferences = new VoicePreferences({ read: key => dbManager.getSetting(key), write: (key, value) => dbManager.saveSetting(key, value) });
