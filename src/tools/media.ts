import { exec } from 'child_process';
import os from 'os';
import path from 'path';
import fs from 'fs';
import axios from 'axios';

export async function baixarMidia(url: string, tipo: 'video' | 'foto'): Promise<any> {
  return new Promise(async (resolve, reject) => {
    try {
      const downloadsDir = path.join(os.homedir(), 'Downloads', 'Jasper');
      
      // Criar a pasta caso não exista
      if (!fs.existsSync(downloadsDir)) {
        fs.mkdirSync(downloadsDir, { recursive: true });
      }

      if (tipo === 'foto') {
        // Usa axios para baixar a imagem
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'stream'
        });

        const extensionMatch = url.match(/\.([a-zA-Z0-9]+)(?:[\?#]|$)/);
        const extension = extensionMatch ? extensionMatch[1] : 'jpg';
        const filename = `imagem_${Date.now()}.${extension}`;
        const filePath = path.join(downloadsDir, filename);

        const writer = fs.createWriteStream(filePath);
        response.data.pipe(writer);

        writer.on('finish', () => resolve({
          success: true,
          message: `Foto baixada com sucesso e salva em: ${filePath}`,
          filePath
        }));
        
        writer.on('error', (err) => reject({
          error: `Erro ao salvar a foto no disco: ${err.message}`
        }));
        
      } else if (tipo === 'video') {
        // Usa yt-dlp para baixar vídeos da internet
        const outputPath = path.join(downloadsDir, '%(title)s.%(ext)s');
        const command = `yt-dlp -o "${outputPath}" "${url}"`;

        exec(command, (error, stdout, stderr) => {
          if (error) {
            reject({
              error: `Erro ao baixar o vídeo. Certifique-se de que o yt-dlp está instalado. Detalhes: ${stderr || error.message}`
            });
            return;
          }

          resolve({
            success: true,
            message: `Vídeo baixado com sucesso na pasta: ${downloadsDir}`,
            stdout: stdout
          });
        });
      } else {
        reject({ error: `Tipo desconhecido: ${tipo}. Escolha 'video' ou 'foto'.` });
      }

    } catch (err: any) {
      reject({ error: `Erro na execução: ${err.message}` });
    }
  });
}
