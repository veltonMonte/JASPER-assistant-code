import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { runProgram } from '../security/process.js';
import { assertPublicHttpUrl, publicHttpGet } from '../security/netguard.js';

const IMAGE_TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' };

export async function baixarMidia(url: string, tipo: 'video' | 'foto'): Promise<any> {
  if (tipo !== 'video' && tipo !== 'foto') throw new Error("Tipo desconhecido. Escolha 'video' ou 'foto'.");
  const target = await assertPublicHttpUrl(url);
  const downloadsDir = path.join(os.homedir(), 'Downloads', 'Jasper');
  if (tipo === 'foto') {
    const response = await publicHttpGet(target.href, { timeoutMs: 15_000, maxBytes: 10 * 1024 * 1024, responseType: 'arraybuffer' });
    const mime = String(response.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    const extension = IMAGE_TYPES[mime];
    if (!extension) throw new Error('A resposta não é uma imagem permitida (JPEG, PNG, GIF ou WebP).');
    const bytes = Buffer.from(response.data);
    if (!bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error('Imagem vazia ou maior que o limite de 10 MB.');
    await fs.mkdir(downloadsDir, { recursive: true });
    const filePath = path.join(downloadsDir, `imagem_${Date.now()}_${randomUUID()}.${extension}`);
    await fs.writeFile(filePath, bytes, { flag: 'wx' });
    return { success: true, message: `Foto salva em: ${filePath}`, filePath };
  }
  await fs.mkdir(downloadsDir, { recursive: true });
  const outputTemplate = path.join(downloadsDir, `video_${Date.now()}_${randomUUID()}.%(ext)s`);
  const result = await runProgram('yt-dlp', ['-o', outputTemplate, '--no-playlist', '--max-filesize', '50M', '--socket-timeout', '15', '--retries', '1', '--', target.href], {
    cwd: downloadsDir, timeoutMs: 600_000, maxBuffer: 1024 * 1024,
  });
  if (!result.ok) throw new Error(`Não foi possível baixar o vídeo: ${result.stderr.slice(0, 500)}`);
  return { success: true, message: `Vídeo salvo na pasta: ${downloadsDir}`, stdout: result.stdout.slice(0, 4000) };
}
