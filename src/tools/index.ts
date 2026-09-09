import { ligarPC, verificarPC, desligarPC } from './computer.js';
import { pesquisarWeb, acessarSite } from './web.js';
import { enviarMensagem } from './messaging.js';
import { abrirPrograma } from './applications.js';
import { consultarHorario, criarLembrete, salvarMemoria, buscarMemoria } from './system.js';
import { toggleDevice, getDeviceStatus } from './smarthome.js';

/**
 * Declaração das ferramentas disponíveis para o modelo Google Gemini (Function Calling)
 */
export const geminiToolDeclarations = [
  {
    name: 'ligar_pc',
    description: 'Envia um sinal Wake-on-LAN para ligar o computador principal do usuário na rede local.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
  {
    name: 'verificar_pc',
    description: 'Verifica se o computador do usuário está atualmente ligado e online na rede local.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
  {
    name: 'desligar_pc',
    description: 'Solicita o desligamento do computador do usuário.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
  {
    name: 'pesquisar_web',
    description: 'Pesquisa informações atualizadas na internet em tempo real (notícias, esportes, preços, cotações, horas).',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'O termo ou pergunta exata para buscar na internet.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'acessar_site',
    description: 'Acessa diretamente uma URL ou site da web para ler o conteúdo de texto da página (ex: notícias, portais, artigos).',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: {
          type: 'STRING',
          description: 'O endereço ou URL do site a ser lido (ex: g1.globo.com, ge.globo.com, wikipedia.org).',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'enviar_mensagem',
    description: 'Envia uma mensagem de texto para um contato especifico (ex: via Telegram).',
    parameters: {
      type: 'OBJECT',
      properties: {
        contato: {
          type: 'STRING',
          description: 'Nome do contato ou destinatário (ex: João, Maria).',
        },
        mensagem: {
          type: 'STRING',
          description: 'O texto exato da mensagem a ser enviada.',
        },
      },
      required: ['contato', 'mensagem'],
    },
  },
  {
    name: 'abrir_programa',
    description: 'Abre um programa ou aplicativo no computador do usuário (ex: VS Code, Chrome, Spotify).',
    parameters: {
      type: 'OBJECT',
      properties: {
        programa: {
          type: 'STRING',
          description: 'O nome do programa a ser aberto.',
        },
      },
      required: ['programa'],
    },
  },
  {
    name: 'consultar_horario',
    description: 'Obtém o horário e a data atual oficial formatados.',
    parameters: {
      type: 'OBJECT',
      properties: {},
      required: [],
    },
  },
  {
    name: 'criar_lembrete',
    description: 'Cria um lembrete com data/horário e texto especifico.',
    parameters: {
      type: 'OBJECT',
      properties: {
        dataHorario: {
          type: 'STRING',
          description: 'Data e horário em que o lembrete deve disparar (ex: amanhã às 14:00).',
        },
        texto: {
          type: 'STRING',
          description: 'O conteúdo ou descrição do lembrete.',
        },
      },
      required: ['dataHorario', 'texto'],
    },
  },
  {
    name: 'salvar_memoria',
    description: 'Armazena uma preferência ou informação relevante do usuário na memória de longo prazo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        chave: {
          type: 'STRING',
          description: 'Identificador ou assunto da informação (ex: cor_favorita, modelo_placa_mae).',
        },
        valor: {
          type: 'STRING',
          description: 'O dado a ser guardado.',
        },
      },
      required: ['chave', 'valor'],
    },
  },
  {
    name: 'buscar_memoria',
    description: 'Busca uma informação salva previamente na memória de longo prazo.',
    parameters: {
      type: 'OBJECT',
      properties: {
        chave: {
          type: 'STRING',
          description: 'A chave ou identificador a procurar.',
        },
      },
      required: ['chave'],
    },
  },
  {
    name: 'toggle_device',
    description: 'Liga ou desliga um dispositivo inteligente da casa (luzes, ar-condicionado, TV, etc.).',
    parameters: {
      type: 'OBJECT',
      properties: {
        deviceName: {
          type: 'STRING',
          description: 'O nome do dispositivo a ser controlado (ex: luz da sala, ar-condicionado do quarto).',
        },
        state: {
          type: 'STRING',
          description: 'O estado desejado: on (ligar) ou off (desligar).',
          enum: ['on', 'off']
        },
      },
      required: ['deviceName', 'state'],
    },
  },
  {
    name: 'get_device_status',
    description: 'Consulta se um dispositivo inteligente da casa está atualmente ligado ou desligado.',
    parameters: {
      type: 'OBJECT',
      properties: {
        deviceName: {
          type: 'STRING',
          description: 'O nome do dispositivo a consultar (ex: luz da sala).',
        },
      },
      required: ['deviceName'],
    },
  },
  {
    name: 'renderizar_grafico',
    description: 'Renderiza um gráfico na interface do usuário. Use isso sempre que o usuário pedir um exemplo gráfico.',
    parameters: {
      type: 'OBJECT',
      properties: {
        chartConfig: {
          type: 'STRING',
          description: 'A string JSON contendo as chaves: type (bar ou line), data (array de objetos), xKey, series (array de objetos com dataKey, name, color). Ex: { "type": "bar", "data": [{"name": "A", "uv": 400}], "xKey": "name", "series": [{"dataKey": "uv", "name": "Valor", "color": "#06b6d4"}] }',
        },
      },
      required: ['chartConfig'],
    },
  },
];

/**
 * Executa a ferramenta solicitada pelo Gemini ou pelo Intent Router pelo nome
 */
export async function executeToolByName(name: string, args: Record<string, any> = {}): Promise<any> {
  console.log(`🛠️ Executando Ferramenta: [${name}] com argumentos:`, JSON.stringify(args));
  const startTime = Date.now();
  let result: any;

  switch (name) {
    case 'ligar_pc':
      result = await ligarPC();
      break;
    case 'verificar_pc':
      result = await verificarPC();
      break;
    case 'desligar_pc':
      result = await desligarPC();
      break;
    case 'pesquisar_web':
      result = await pesquisarWeb(args.query || '');
      break;
    case 'acessar_site':
      result = await acessarSite(args.url || '');
      break;
    case 'enviar_mensagem':
      result = await enviarMensagem(args.contato || '', args.mensagem || '');
      break;
    case 'abrir_programa':
      result = await abrirPrograma(args.programa || '');
      break;
    case 'consultar_horario':
      result = await consultarHorario();
      break;
    case 'criar_lembrete':
      result = await criarLembrete(args.dataHorario || '', args.texto || '');
      break;
    case 'salvar_memoria':
      result = await salvarMemoria(args.chave || '', args.valor || '', args.categoria || 'general');
      break;
    case 'buscar_memoria':
      result = await buscarMemoria(args.chave || '');
      break;
    case 'toggle_device':
      result = await toggleDevice(args.deviceName || '', args.state || 'on');
      break;
    case 'get_device_status':
      result = await getDeviceStatus(args.deviceName || '');
      break;
    case 'renderizar_grafico':
      result = { chartConfig: args.chartConfig, success: true };
      break;
    default:
      result = { error: `Ferramenta "${name}" desconhecida ou não registrada.` };
  }

  const durationMs = Date.now() - startTime;
  console.log(`✅ Ferramenta [${name}] concluída em ${durationMs}ms`);
  return { ...result, _executionTimeMs: durationMs };
}
