# Projeto: JASPER - Assistente Pessoal e Smart Home Integrado

## Visão Geral do Projeto
O JASPER (anteriormente JASPER) é um assistente virtual conversacional altamente responsivo, operado por voz e texto, com ênfase na integração de automação residencial (Smart Home) e execução de tarefas locais no computador (Wake-on-LAN). Ele utiliza o **Gemini Live API (v1beta)** com streaming de áudio nativo (PCM 16kHz) via WebSockets para proporcionar conversas em tempo real fluidas e com interrupções naturais (barge-in).

A arquitetura frontend foi desenhada focando em design premium contemporâneo, evitando os estereótipos comuns de IAs. O painel central exibe estados geométricos abstratos que comunicam sua atividade cognitiva, aliado a uma paleta gráfica Graphite/Slate com destaques em Neon Cyan (JASPER Accent).

## Tecnologias Utilizadas
- **Backend:** Node.js (TypeScript), Express, `ws` (WebSockets).
- **IA e Voz:** API Gemini v1beta (BidiGenerateContent), conversão PCM nativa.
- **Frontend:** Vanilla HTML/CSS/JS com `AudioContext` para buffering contínuo de áudio sem dependência do elemento `<audio>`. 
- **Integração Externa:** Wake-on-LAN (`wake_on_lan`), Mockups de chamadas HTTP para controle Smart Home.
- **Tipografia e Ícones:** Space Grotesk, Inter, e Phosphor Icons.

## Histórico de Implementações Recentes
Durante a última iteração de desenvolvimento, os seguintes avanços foram concluídos:

1. **Reestruturação Visual (Identity Upgrade):**
   - Projeto completamente renomeado de JASPER para JASPER.
   - Refatoração da folha de estilos `styles.css` eliminando interfaces "genéricas de chat" e adotando o padrão dark sofisticado.
   - O orbe de atividade foi substituído por geometria abstrata sincronizada a classes CSS (`.shape`, `.s1`, `.s2`) reagindo aos eventos de `IDLE`, `LISTENING`, `PROCESSING` e `SPEAKING`.
   - Remoção completa de Emojis do código; implementação sistemática de Phosphor Icons.
   
2. **Nova Arquitetura Frontend (`index.html` e `app.js`):**
   - Criação de um Painel Contextual Lateral (`aside.context-panel`) para monitorar o status de dispositivos (ex: luz, ar condicionado) sem precisar demandar informações textuais constantes da IA.
   - Sistema unificado de Chat com cartões de ações (`msg-action`) no lugar de textos longos descritivos.
   
3. **Integração Wake-on-LAN (WoL):**
   - Script de ferramentas `src/tools/wol.ts` adicionado com o pacote `wake_on_lan` para permitir acionamento de um computador da rede.
   - Variáveis configuráveis adicionadas no `.env` (`DESKTOP_MAC_ADDRESS`).

4. **Integração Smart Home:**
   - Criação do scaffold de automação residencial `src/tools/smarthome.ts` com funções `toggleDevice` e `getDeviceStatus`.
   - Adicionadas declarações de função dentro do contexto do Gemini, permitindo ao LLM acionar e desligar equipamentos domésticos de maneira natural durante a conversa.

5. **Sessão de Desenvolvimento (Hoje):**
   - **Renderização de Gráficos:** Integração com a biblioteca `recharts` e criação da tool `renderizar_grafico` para permitir a geração e exibição correta de gráficos de linha/barras nativos diretamente na interface de chat, mesmo quando operando sob o modelo de voz do Gemini Live.
   - **Correção Visual:** Ajustes no `ChartComponent` substituindo classes utilitárias não suportadas por estilos inline diretos, sanando o bug de containers invisíveis (retângulo preto).
   - **Filtro de Raciocínio Aprimorado:** Refinamento agressivo no sistema `cleanTextMonologue` (cliente e servidor) mapeando heurísticas de contagem de palavras e idiomas para bloquear o vazamento de monólogos em inglês (ex: *"Constructing the Line Chart"*) no chat do usuário.
   - **Personalidade da IA:** Revisão do `JASPER_SYSTEM_PROMPT` para injetar comportamento humorístico, sarcasmo amigável, piadas e referências robustas a filmes da cultura pop (Matrix, Star Wars, Homem de Ferro).
   - **Configuração Remota via Tailscale:** Ativação manual e autenticação do daemon do `tailscaled` via root, inserindo o servidor Linux na malha VPN. Isso habilitou o acesso externo nativo e seguro à interface do JASPER pelo IP `100.108.231.26` via dispositivos remotos.
   - **Diagnóstico Wake-on-LAN:** Inspeção de conectividade inter-dispositivos via Tailscale e explicação técnica do fluxo exigido pelo pacote mágico (MAC address local) para o disparo da funcionalidade `ligar_pc`.

## Como Executar
O servidor depende dos arquivos `.env` e TypeScript rodando.
```bash
npm run dev
```
Ao inicializar, a API abre portas locais WebSocket e HTTP, disponibilizando o cliente visual em `localhost:3000` ou similar (também acessível externamente pelo IP local ou Tailscale). O backend negocia conexões BidiWebSocket com o Gemini e orquestra execuções locais quando funções (Tools) são chamadas via texto ou detecção de fala.
