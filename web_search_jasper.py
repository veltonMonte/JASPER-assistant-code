#!/usr/bin/env python3
"""
JASPER - Módulo Avançado de Pesquisa Web Real-Time (Google News RSS + Multi-Engine + Time API)
"""

import sys
import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import re
from datetime import datetime
import zoneinfo

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


def pesquisar_google_news(query: str, max_results: int = 6) -> list:
    """Busca em tempo real via Google News RSS API em alta velocidade sem bloqueios."""
    try:
        url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
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
                        'resumo': f"{title_text} (Publicado em: {date_text})",
                        'url': url_text
                    })
            return results
    except Exception as e:
        return []


def pesquisar_duckduckgo_api(query: str) -> list:
    try:
        url = f"https://api.duckduckgo.com/?q={urllib.parse.quote(query)}&format=json&no_html=1"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=4) as response:
            data = json.loads(response.read().decode())
            results = []
            if data.get('AbstractText'):
                results.append({'titulo': data.get('Heading', query), 'resumo': data.get('AbstractText')})
            return results
    except Exception:
        return []


def pesquisar_web(query: str) -> list:
    # 1. Busca em tempo real via Google News RSS API
    results = pesquisar_google_news(query)
    
    # 2. Se a busca por notícias não trouxe resultados, tenta DuckDuckGo API
    if not results:
        results = pesquisar_duckduckgo_api(query)
        
    if not results:
        results.append({
            'titulo': 'Resultado da Pesquisa',
            'resumo': f'Busca para "{query}" realizada na internet na data de hoje ({datetime.now().strftime("%d/%m/%Y")}).'
        })
        
    return results


def main():
    if len(sys.argv) > 1:
        query = " ".join(sys.argv[1:])
    else:
        query = "jogo do fortaleza hoje"

    query_lower = query.lower()
    
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
