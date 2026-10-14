# 🤖 JASPER - Assistente Pessoal de Inteligência Artificial

**JASPER** é um assistente pessoal de voz moderno, natural, rápido, modular e expansível, projetado para funcionar localmente em um servidor doméstico (notebook antigo) e ser controlado por comando de voz a partir de um smartphone na rede local.

O sistema não depende de ecossistemas proprietários (como Alexa ou Google Assistant), utilizando tecnologias abertas em **TypeScript + Node.js**, comunicação via **WebSockets**, e o **Google Gemini** como cérebro principal de Inteligência Artificial com Function Calling.

---

## 🚀 Funcionalidades Principais

- **Comandos de Voz em Português (pt-BR)** com síntese de voz (TTS) e reconhecimento contínuo.
- **Palavra de Ativação (Wake Word)**: Reconhecimento local da palavra *"JASPER"*.
- **Roteador Híbrido de Velocidade (Intent Router)**:
  - Comandos simples e determinísticos (ex: *"ligar meu PC"*, *"que horas são"*) são executados diretamente em **< 15ms** sem chamada ao LLM.
  - Comandos complexos e conversas continuam utilizando a IA raciocinada do Google Gemini.
- **Controle do Computador Principal (Wake-on-LAN)**: Liga o PC do usuário enviando pacotes mágicos UDP (`ligar_pc`, `verificar_pc`).
- **Pesquisa na Internet (`pesquisar_web`)**: Busca em tempo real sobre preços, notícias e especificações técnicas.
- **Envio de Mensagens (`enviar_mensagem`)**: Automação legítima via Telegram Bot API.
- **Sistema de Memória SQLite**: Memória temporária (contexto conversacional recente) e memória persistente (preferências e fatos salvos pelo usuário).
- **Métricas de Latência em Tempo Real**: Telemetria visual exibindo tempos de `STT`, `Intent Router`, `Gemini`, `Tools` e `TTS`.
- **Interface Mobile Futurista (PWA)**: Web Client responsivo com tema escuro, animações de pulso de estado (`IDLE`, `LISTENING`, `PROCESSING`, `EXECUTING`, `SPEAKING`, `ERROR`).

---

## 🏗️ Arquitetura de Software

```
jasper/
├── .env.example              # Exemplo de variáveis de ambiente
├── package.json              # Dependências do Node.js
├── tsconfig.json             # Configuração TypeScript
├── README.md                 # Documentação completa
├── src/
│   ├── config/config.ts      # Gerenciador de configurações centrais
│   ├── database/
│   │   ├── database.ts       # Conexão SQLite
│   │   └── schema.ts         # Tabela de memória, logs e mensagens
│   ├── ai/
│   │   ├── gemini.ts         # SDK Google Gemini com Function Calling
│   │   ├── prompts.ts        # System Prompt e personalidade do JASPER
│   │   └── context.ts        # Gerenciamento de histórico de conversas
│   ├── agent/
│   │   ├── agent.ts          # Orquestrador central do Agente
│   │   ├── router.ts         # Intent Router para respostas em milissegundos
│   │   ├── planner.ts        # Decomposição de tarefas complexas
│   │   └── memory.ts         # Gerenciador de memória do agente
│   ├── voice/
│   │   ├── stt.ts            # Speech-to-Text handler
│   │   ├── tts.ts            # Text-to-Speech handler
│   │   └── wakeword.ts       # Máquina de estados do assistente
│   ├── tools/
│   │   ├── index.ts          # Registro e exportação das ferramentas Gemini
│   │   ├── computer.ts       # ligar_pc (WOL), verificar_pc, desligar_pc
│   │   ├── web.ts            # pesquisar_web
│   │   ├── messaging.ts      # enviar_mensagem (Telegram)
│   │   ├── applications.ts   # abrir_programa
│   │   └── system.ts         # consultar_horario, criar_lembrete, salvar_memoria
│   └── server/
│       ├── server.ts         # Servidor HTTP Express
│       ├── websocket.ts      # Servidor WebSocket (streaming & eventos)
│       └── routes.ts         # Rotas REST API
└── public/
    ├── index.html            # Interface Web/PWA do Celular
    ├── styles.css            # Estilos em Dark Mode com glow e estados
    └── app.js                # Web Audio API, cliente WebSocket e Wake Word
```

---

## ⚙️ Instalação e Configuração

### 1. Clonar / Acessar o Projeto
Navegue até a pasta do projeto:
```bash
cd /home/velton/projetos/jasper
```

### 2. Instalar Dependências
```bash
npm install
```

### 3. Configurar Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env` e insira suas credenciais:
```bash
cp .env.example .env
```

Edite o arquivo `.env`:
- `GEMINI_API_KEY`: Sua chave de API do Google Gemini AI.
- `TARGET_PC_MAC`: Endereço MAC da placa de rede do seu PC principal (ex: `00:11:22:33:44:55`) para Wake-on-LAN.
- `TARGET_PC_IP`: IP local do PC principal (ex: `192.168.1.100`).
- `TELEGRAM_BOT_TOKEN`: Token do seu bot do Telegram (opcional).

---

## 🏃 Como Executar

### Modo de Desenvolvimento (Live Reload)
```bash
npm run dev
```

### Modo de Produção (Build & Start)
```bash
npm run build
npm start
```

Ao iniciar, o servidor exibirá os URLs de acesso:
- **HTTP**: `http://localhost:3000`
- **WebSocket**: `ws://localhost:3000/ws`
- **Acesso pelo Celular na Rede Wi-Fi**: `http://<IP_DO_NOTEBOOK>:3000`

---

## 🧪 Testando o JASPER

1. **Acesse no celular**: Abra o navegador do seu celular conectado à mesma rede Wi-Fi e digite `http://<IP_DO_NOTEBOOK>:3000`.
2. **Permissão de Microfone**: Aceite o acesso ao microfone no celular.
3. **Fale a palavra de ativação**:
   > *"JASPER, ligue meu PC"*
4. O Intent Router identificará a intenção em menos de **15ms**, enviará o sinal Wake-on-LAN e responderá por voz:
   > *"Pronto, estou ligando seu computador."*
5. **Perguntas Complexas**:
   > *"JASPER, pesquise quanto está custando o processador Ryzen 7 5700X"*
6. O sistema executará a ferramenta `pesquisar_web`, analisará os resultados com o Gemini e responderá resumidamente por voz.

---

## 🛡️ Licença e Expansão

Projeto desenvolvido sob arquitetura modular limpa e tipada. Novas ferramentas podem ser adicionadas facilmente na pasta `src/tools/`.
