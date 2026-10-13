#!/usr/bin/env python3
"""
JASPER - Módulo Avançado de Pesquisa Web Real-Time (Google News RSS + Multi-Engine + Parallel Worker)
"""

import sys
import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import re
import html
from datetime import datetime
import zoneinfo
from concurrent.futures import ThreadPoolExecutor, as_completed

TIMEZONES = {
    'dubai': 'Asia/Dubai',
    'tokio': 'Asia/Tokyo',
    'toquio': 'Asia/Tokyo',
    'nova york': 'America/New_York',
    'londres': 'Europe/London',
    'paris': 'Europe/Paris',
    'fortaleza': 'America/Fortaleza',
    'sao paulo': 'America/Sao_Paulo',
    'brasilia': 'America/Sao_Paulo',
    'lisboa': 'Europe/Lisbon',
    'madrid': 'Europe/Madrid',
    'pequim': 'Asia/Shanghai',
    'sydney': 'Australia/Sydney'
}

def obter_hora_cidade(cidade: str) -> str:
    cidade_clean = cidade.lower().strip()
    tz_name = None
    for key, val in TIMEZONES.items():
        if key in cidade_clean:
            tz_name = val
            break
            
    if not tz_name:
        try:
            url = f"https://wttr.in/{urllib.parse.quote(cidade)}?format=%j"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=4) as response:
                data = json.loads(response.read().decode())
                current_condition = data.get('current_condition', [{}])[0]
                temp = current_condition.get('temp_C', 'N/A')
                desc = current_condition.get('lang_pt', [{}])[0].get('value', current_condition.get('weatherDesc', [{}])[0].get('value', ''))
                return f"Informações de {cidade.title()}: Clima {desc}, Temperatura {temp}°C."
        except Exception:
            tz_name = 'UTC'

    try:
        tz = zoneinfo.ZoneInfo(tz_name)
        agora = datetime.now(tz)
        return f"🕒 Horário em {cidade.title()} ({tz_name}): {agora.strftime('%H:%M:%S')} (Data: {agora.strftime('%d/%m/%Y')})"
    except Exception as e:
        return f"Erro ao calcular horário para {cidade}: {str(e)}"


def limpar_query_pesquisa(query: str) -> str:
    """Remove termos de comando e foca nas palavras-chave essenciais para o buscador."""
    q = re.sub(
        r'^(jasper|por favor|monte|crie|gere|desenhe|mostre|faça|faca|pesquise|busque|ache|encontre|quero ver|quero saber|me diga|me mostre)\s+',
        '',
        query,
        flags=re.IGNORECASE
    )
    q = re.sub(
        r'\b(um gráfico com as|um grafico com as|um gráfico sobre|um grafico sobre|um gráfico de|um grafico de|gráficos de|graficos de|gráfico|grafico|chart)\b',
        '',
        q,
        flags=re.IGNORECASE
    )
    q = re.sub(r'\s+', ' ', q).strip()
    return q if len(q) > 2 else query


def pesquisar_ddg_lite(query: str, max_results: int = 6) -> list:
    """Busca orgânica no DuckDuckGo Lite para obter snippets e URLs reais sobre qualquer assunto."""
    try:
        clean_q = limpar_query_pesquisa(query)
        data = urllib.parse.urlencode({'q': clean_q}).encode('utf-8')
        req = urllib.request.Request(
            'https://lite.duckduckgo.com/lite/',
            data=data,
            headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            }
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            body = response.read().decode('utf-8', errors='ignore')
            links = re.findall(r'<a[^>]+href=[\'\"]([^\'\"]+)[\'\"][^>]*>(.*?)</a>', body, re.DOTALL)
            snippets = re.findall(r'<td class=[\'\"]result-snippet[\'\"]>(.*?)</td>', body, re.DOTALL)

            valid_links = []
            for href, text in links:
                if 'duckduckgo.com' in href or 'ad_domain' in href or href.startswith('/'):
                    continue
                clean_t = re.sub(r'<[^>]+>', '', html.unescape(text)).strip()
                if clean_t and href.startswith('http'):
                    valid_links.append((href, clean_t))

            results = []
            limit = min(len(valid_links), len(snippets), max_results)
            for i in range(limit):
                url, title = valid_links[i]
                snip = re.sub(r'<[^>]+>', '', html.unescape(snippets[i])).strip()
                if snip and title:
                    results.append({
                        'titulo': title,
                        'resumo': f"{title}: {snip}",
                        'url': url
                    })
            return results
    except Exception as e:
        return []


def pesquisar_google_news(query: str, max_results: int = 6) -> list:
    """Busca em tempo real via Google News RSS API."""
    try:
        clean_q = limpar_query_pesquisa(query)
        url = f"https://news.google.com/rss/search?q={urllib.parse.quote(clean_q)}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        })
        with urllib.request.urlopen(req, timeout=5) as response:
            xml_data = response.read()
            root = ET.fromstring(xml_data)
            
            results = []
            for item in root.findall('.//item')[:max_results]:
                title = item.find('title')
                pubDate = item.find('pubDate')
                link = item.find('link')
                
                title_text = title.text if title is not None else ""
                date_text = pubDate.text if pubDate is not None else ""
                url_text = link.text if link is not None else ""
                
                if title_text:
                    results.append({
                        'titulo': title_text,
                        'resumo': f"{title_text} (Notícia: {date_text})",
                        'url': url_text
                    })
            return results
    except Exception:
        return []


def pesquisar_wikipedia(query: str, max_results: int = 3) -> list:
    """Busca resumos conceituais na Wikipédia em Português para definições e biografias."""
    try:
        clean_q = limpar_query_pesquisa(query)
        url = f"https://pt.wikipedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(clean_q)}&utf8=&format=json"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            search_items = data.get('query', {}).get('search', [])
            results = []
            for item in search_items[:max_results]:
                title = item.get('title', '')
                snippet = re.sub(r'<[^>]+>', '', item.get('snippet', ''))
                page_url = f"https://pt.wikipedia.org/wiki/{urllib.parse.quote(title)}"
                if title and snippet:
                    results.append({
                        'titulo': f"Wikipédia - {title}",
                        'resumo': f"Definição (Wikipédia): {title} - {snippet}...",
                        'url': page_url
                    })
            return results
    except Exception:
        return []


def pesquisar_imagens(query: str, max_results: int = 8) -> list:
    """Busca imagens de alta qualidade via Bing/Google/Wikimedia Images."""
    results = []
    try:
        url = f"https://www.bing.com/images/search?q={urllib.parse.quote(query)}"
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        })
        with urllib.request.urlopen(req, timeout=5) as resp:
            body = resp.read().decode('utf-8', errors='ignore')
            murls = re.findall(r'murl&quot;:&quot;(https?://[^&]+)&quot;', body)
            turls = re.findall(r'turl&quot;:&quot;(https?://[^&]+)&quot;', body)
            titles = re.findall(r't&quot;:&quot;([^&]+)&quot;', body)
            purls = re.findall(r'purl&quot;:&quot;(https?://[^&]+)&quot;', body)

            for i in range(min(len(murls), max_results)):
                img_url = murls[i]
                thumb_url = turls[i] if i < len(turls) else img_url
                title = titles[i] if i < len(titles) else query
                source_url = purls[i] if i < len(purls) else img_url
                
                clean_title = re.sub(r'<[^>]+>', '', html.unescape(title)).strip()
                results.append({
                    'title': clean_title,
                    'image': img_url,
                    'thumbnail': thumb_url,
                    'url': source_url
                })
    except Exception:
        pass

    # Fallback Wikimedia se nenhuma imagem foi encontrada
    if not results:
        try:
            wiki_url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url|mime&format=json"
            req = urllib.request.Request(wiki_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=4) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                pages = data.get('query', {}).get('pages', {})
                for p_id, p_info in pages.items():
                    img_info = p_info.get('imageinfo', [{}])[0]
                    file_url = img_info.get('url')
                    if file_url and any(ext in file_url.lower() for ext in ['.jpg', '.jpeg', '.png', '.webp']):
                        results.append({
                            'title': p_info.get('title', query),
                            'image': file_url,
                            'thumbnail': file_url,
                            'url': file_url
                        })
                        if len(results) >= max_results:
                            break
        except Exception:
            pass

    return results


def pesquisar_web(query: str) -> list:
    """
    Executa busca em paralelo (DuckDuckGo Lite + Google News + Wikipédia)
    para máxima velocidade e riqueza de informações.
    """
    query_lower = query.lower()
    is_news = any(w in query_lower for w in [
        'pesquisa', 'pesquisas', 'eleição', 'eleições', 'eleitoral', 'segundo turno',
        '2º turno', 'voto', 'votos', 'hoje', 'notícia', 'noticias', 'jogo', 'últimas',
        'placar', 'ao vivo', 'cotação', 'resultado', 'governo', 'presidente', 'prefeito'
    ])

    results = []

    # Executa os motores em paralelo usando ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=3) as executor:
        futures = {
            executor.submit(pesquisar_ddg_lite, query, 6): 'ddg',
            executor.submit(pesquisar_google_news, query, 6): 'news'
        }
        
        # Se for conceito/definição ou se não for estritamente notícia, inclui Wikipédia
        is_definition = any(w in query_lower for w in ['o que é', 'quem é', 'quem foi', 'história', 'definição', 'significado'])
        if is_definition or not is_news:
            futures[executor.submit(pesquisar_wikipedia, query, 3)] = 'wiki'

        for future in as_completed(futures):
            try:
                res = future.result()
                if res:
                    results.extend(res)
            except Exception:
                pass

    # Deduplicação por título normalizado
    seen_titles = set()
    unique_results = []
    for r in results:
        t_clean = re.sub(r'[^a-zA-Z0-9]', '', r['titulo'].lower())
        if t_clean and t_clean not in seen_titles:
            seen_titles.add(t_clean)
            unique_results.append(r)

    # Fallback se nada foi encontrado
    if not unique_results:
        clean_q = limpar_query_pesquisa(query)
        unique_results.append({
            'titulo': f'Pesquisa na Web: {clean_q}',
            'resumo': f'Busca para "{clean_q}" realizada na data de {datetime.now().strftime("%d/%m/%Y")}.',
            'url': f'https://duckduckgo.com/?q={urllib.parse.quote(clean_q)}'
        })

    return unique_results


def main():
    args = sys.argv[1:]
    
    if not args:
        query = "jogo do fortaleza hoje"
        mode = "text"
    elif args[0] == "--images":
        mode = "images"
        query = " ".join(args[1:]) if len(args) > 1 else "gato fofo"
    elif args[0] == "--json":
        mode = "json"
        query = " ".join(args[1:]) if len(args) > 1 else "bitcoin hoje"
    else:
        mode = "text"
        query = " ".join(args)

    query_lower = query.lower()

    if mode == "images":
        imgs = pesquisar_imagens(query)
        print(json.dumps(imgs, ensure_ascii=False))
        return

    if mode == "json":
        res = pesquisar_web(query)
        print(json.dumps(res, ensure_ascii=False))
        return

    if "horas" in query_lower or "horário" in query_lower or "fuso" in query_lower:
        cidades = ['dubai', 'toquio', 'tóquio', 'nova york', 'londres', 'paris', 'fortaleza', 'sao paulo', 'são paulo', 'madrid', 'lisboa', 'pequim', 'sydney']
        cidade_encontrada = 'dubai' if 'dubai' in query_lower else None
        if not cidade_encontrada:
            for c in cidades:
                if c in query_lower:
                    cidade_encontrada = c
                    break
        if not cidade_encontrada:
            cidade_encontrada = query.split()[-1]
            
        print(obter_hora_cidade(cidade_encontrada))
    else:
        res = pesquisar_web(query)
        for item in res:
            print(f"• {item['resumo']}")

if __name__ == '__main__':
    main()
