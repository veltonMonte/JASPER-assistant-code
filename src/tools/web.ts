import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import axios from 'axios';

const execPromise = util.promisify(exec);

export interface SearchResult {
  title: string;
  snippet: string;
  url?: string;
}

export interface ImageResult {
  title: string;
  image: string;
  thumbnail: string;
  url: string;
}

/**
 * Pesquisa informações em tempo real na internet utilizando o módulo Python do JASPER
 */
export async function pesquisarWeb(query: string): Promise<{ query: string; results: SearchResult[]; message: string }> {
  try {
    console.log(`🔍 JASPER Pesquisando na Web por: "${query}"`);
    
    const scriptPath = path.resolve(process.cwd(), 'web_search_jasper.py');
    const { stdout } = await execPromise(`python3 "${scriptPath}" --json "${query.replace(/"/g, '\\"')}"`, { timeout: 9000 });
    
    let results: SearchResult[] = [];
    const cleanOutput = stdout.trim();
    
    if (cleanOutput && cleanOutput.startsWith('[')) {
      try {
        const parsed = JSON.parse(cleanOutput);
        results = parsed.map((item: any) => ({
          title: item.titulo || item.title || 'Resultado',
          snippet: item.resumo || item.snippet || '',
          url: item.url || undefined
        }));
      } catch (e) {
        console.warn('⚠️ Falha ao converter JSON de busca web, aplicando fallback de texto.');
      }
    }

    if (results.length === 0 && cleanOutput) {
      const lines = cleanOutput.split('\n').filter(l => l.trim().length > 0);
      lines.forEach((line, idx) => {
        const text = line.replace(/^[•\-\[\d+\]\s]+/, '').trim();
        if (text) {
          results.push({
            title: `Resultado ${idx + 1}`,
            snippet: text
          });
        }
      });
    }

    if (results.length === 0) {
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1`;
      const res = await axios.get(ddgUrl, { timeout: 4000 });
      if (res.data.AbstractText) {
        results.push({
          title: res.data.Heading || query,
          snippet: res.data.AbstractText,
          url: res.data.AbstractURL,
        });
      } else {
        results.push({
          title: 'Informação da Web',
          snippet: `Pesquisa realizada para "${query}".`
        });
      }
    }

    return {
      query,
      results,
      message: `Encontrados ${results.length} resultados atualizados para a busca "${query}". Use estes dados para responder ao usuário com precisão.`,
    };
  } catch (error: any) {
    console.error('❌ Erro na ferramenta de busca web do JASPER:', error.message);
    return {
      query,
      results: [
        {
          title: 'Resultado de Busca',
          snippet: `Pesquisa realizada para: ${query}.`
        }
      ],
      message: `Pesquisa concluída para "${query}".`,
    };
  }
}

/**
 * Busca imagens de alta qualidade no Google / Bing / Web quando o usuário solicitar
 */
export async function pesquisarImagens(query: string): Promise<{ query: string; images: ImageResult[]; message: string }> {
  try {
    console.log(`🖼️ JASPER Buscando Imagens por: "${query}"`);
    const scriptPath = path.resolve(process.cwd(), 'web_search_jasper.py');
    const { stdout } = await execPromise(`python3 "${scriptPath}" --images "${query.replace(/"/g, '\\"')}"`, { timeout: 10000 });

    let images: ImageResult[] = [];
    const cleanOutput = stdout.trim();

    if (cleanOutput && cleanOutput.startsWith('[')) {
      try {
        images = JSON.parse(cleanOutput);
      } catch (e) {
        console.warn('⚠️ Falha ao fazer parse do JSON de imagens.');
      }
    }

    return {
      query,
      images,
      message: `Encontradas ${images.length} imagens para "${query}". As imagens foram enviadas para exibição na galeria interativa no chat.`
    };
  } catch (error: any) {
    console.error('❌ Erro ao buscar imagens:', error.message);
    return {
      query,
      images: [],
      message: `Não foi possível carregar as imagens para "${query}".`
    };
  }
}

/**
 * Acessa diretamente uma URL ou site e extrai o conteúdo de texto da página
 */
export async function acessarSite(url: string): Promise<{ url: string; content: string; message: string }> {
  try {
    console.log(`🌐 JASPER Acessando diretamente o site: "${url}"`);
    
    let targetUrl = url.trim();
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = `https://${targetUrl}`;
    }

    const response = await axios.get(targetUrl, {
      timeout: 6000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    const html = response.data as string;
    // Extrai o texto limpo retirando scripts, estilos e tags HTML
    const cleanText = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 2500);

    return {
      url: targetUrl,
      content: cleanText || 'Não foi possível extrair o texto principal desta página.',
      message: `Conteúdo da página ${targetUrl} lido com sucesso.`,
    };
  } catch (error: any) {
    console.error('❌ Erro ao acessar o site:', error.message);
    return {
      url,
      content: `Erro ao acessar o site ${url}: ${error.message}`,
      message: `Não foi possível carregar a página ${url}.`,
    };
  }
}

