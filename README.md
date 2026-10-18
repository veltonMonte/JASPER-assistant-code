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

## Notícias e presença do Jasper

Abra **Notícias e presença** pelo sino na navegação ou no painel **Seu Jasper**.
Os assuntos iniciais são Fortaleza Esporte Clube, futebol e placares, política brasileira e cinema/trailers. Você pode adicionar ou remover interesses e salvar suas escolhas.

- As fontes de notícias são consultadas a cada dois minutos. Manchetes sem fonte/data, antigas e repetidas não são anunciadas. O painel mantém links para as publicações.
- O Jasper anuncia novidades quando você está disponível, sem interromper escuta, respostas, digitação ou confirmações de terminal. Política tem intervalo mínimo de uma hora entre avisos.
- Perguntas e comentários sobre a hora aparecem em intervalos aleatórios de 25 a 60 minutos. É possível desligar cada tipo de fala.
- O horário de silêncio inicial é das 23h às 8h, no fuso de Fortaleza, e pode ser alterado no painel.
- A voz espontânea funciona com a página aberta e visível após uma interação. Use **Testar voz** para conferir o áudio. Placares dependem das notícias publicadas, sem promessa de cobertura lance a lance.
- Preferências e controle de repetições ficam no SQLite, separados da memória de conversa. As consultas são feitas pelo servidor local; não exigem uma chave adicional de notícias.

As mídias do chat preservam a visualização dos gráficos e o carregamento das imagens durante respostas em streaming. Blocos de mídia incompletos exibem um estado de preparação até estarem prontos.

Validação das novas funções: `npm run test:features`. Para atualizar a versão servida: `npm run build` na raiz e `npm run build --prefix client`.

As leituras de notícias, comentários ocasionais e o botão **Testar voz** usam a mesma voz Gemini configurada para a conversa. O servidor prepara o áudio completo como WAV (PCM16, mono, 24 kHz); o navegador decodifica o arquivo e o reproduz na velocidade original. Interromper a leitura também cancela uma geração ainda pendente. Se a voz natural estiver indisponível, a mensagem permanece no chat para tentar novamente.

### Escuta automática

Em um dispositivo autorizado, o microfone inicia automaticamente quando a conexão de voz fica pronta e retoma após uma reconexão. Na primeira utilização, permita o acesso ao microfone no navegador. O botão de microfone pausa a escuta; essa escolha permanece após recarregar até você ativá-la novamente.

### Voz e presença

Em **Seu Jasper → Voz e presença**, compare Orus, Algieba, Algenib e Charon, escolha o ritmo e use **Ouvir prévia** antes de aplicar. As preferências ficam salvas no banco local e valem para conversas e notícias. O perfil inicial usa Algenib, com timbre médio-grave, presença e fala formal, espontânea e ironia discreta. As opções do painel passam a definir a voz no lugar da configuração antiga `GEMINI_VOICE`.

### Estúdio visual

Peça por voz ou texto: **“Jasper, explique o fluxo de uma API em uma apresentação visual”** ou **“Crie uma representação 3D de um satélite”**. O Jasper abre o Estúdio visual em uma tela própria e apresenta de uma a seis etapas. Diagramas mostram blocos e conexões; objetos 3D podem ser girados e ampliados. Cada etapa recebe uma narração com a voz configurada, e a próxima fala é preparada enquanto a atual toca. Use os controles para pausar, repetir, avançar ou voltar à conversa. O ícone **Apresentação visual** reabre a última apresentação enquanto a página está aberta.

Os objetos 3D são composições estilizadas de formas geométricas criadas para explicar ideias. Não são modelos técnicos exatos nem arquivos CAD. A geração visual requer a conexão Gemini; a narração usa o serviço de voz natural já configurado. Em navegadores sem WebGL, o texto da etapa continua disponível.

## Acesso seguro à API (Fase 1)

O servidor usa `127.0.0.1` por padrão. Para acesso pelo Tailscale, configure
`HOST` com o endereço IP do Tailscale do notebook; não use `0.0.0.0` para essa
finalidade. O agente remoto continua fora do escopo desta fase e não deve ser
ativado antes das fases próprias de autenticação e execução remota.

Somente `GET /api/health` é público. As demais rotas exigem
`Authorization: Bearer <credencial>`, aceitando a sessão do dispositivo emitida
pelo WebSocket ou `API_SECRET_TOKEN` para clientes de máquina. O navegador envia
sua sessão automaticamente, sem armazenar o token global da API.

Em produção, `API_SECRET_TOKEN` deve existir, ter no mínimo 32 caracteres e não
ser o antigo valor de exemplo. Em desenvolvimento, se não houver um valor forte,
o servidor gera uma credencial temporária e a exibe uma vez no console; ela
muda ao reiniciar. Não coloque credenciais em URLs nem no código do cliente.

Por padrão, HTTP e WebSocket aceitam a mesma origem. Para origens adicionais,
configure `ALLOWED_ORIGINS` como uma lista de origens completas separadas por
vírgula, por exemplo `https://jasper.example,http://127.0.0.1:5173`. A lista,
quando definida, substitui a regra de mesma origem; inclua todos os endereços
legítimos utilizados. Não são aceitos curingas. O proxy Vite identifica o IP
original somente em desenvolvimento, a partir de uma conexão local e sua
origem na porta 5173. Cabeçalhos de proxies genéricos nunca elevam uma conexão
a computador principal. A identidade por dispositivo substitui essa mitigação
na Fase 5.

Novos dispositivos são aprovados exclusivamente pelos botões do computador
principal. O modelo não pode aprovar aparelhos ou comandos. No terminal,
confirmações explícitas de voz são aceitas apenas quando o risco permite;
comandos de alto risco exigem o botão e a revisão do comando literal. A opção
de lembrar vale apenas para o mesmo comando de leitura, por 30 minutos.
