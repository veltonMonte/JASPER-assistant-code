import { dbManager } from '../database/database.js';
import { fetchTopicNews } from './news.js';
import { ProactiveService } from './service.js';
import type { ProactiveNotice } from './types.js';
let deliver = (_notice: ProactiveNotice): boolean => false;
export function setProactiveDelivery(callback: (notice: ProactiveNotice) => boolean) { deliver = callback; }
export const proactiveService = new ProactiveService({
  read: key => dbManager.getSetting(key),
  write: (key, value) => dbManager.saveSetting(key, value),
  fetchNews: fetchTopicNews,
  deliver: notice => deliver(notice),
});
