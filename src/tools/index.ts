import { ligarPC, verificarPC, desligarPC } from './computer.js';
import { pesquisarWeb, acessarSite, pesquisarImagens } from './web.js';
import { enviarMensagem } from './messaging.js';
import { abrirPrograma } from './applications.js';
import { consultarHorario, criarLembrete, salvarMemoria, buscarMemoria, agendarAlarme } from './system.js';
import { toggleDevice, getDeviceStatus } from './smarthome.js';
import { executarTerminal } from './terminal.js';
import { baixarMidia } from './media.js';
import { ajustarPersonalidade, consultarPersonalidade, restaurarPersonalidadePadrao } from './personality.js';

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
    name: 'pesquisar_imagens',
    description: 'Busca e exibe imagens/fotos da internet no chat quando o usuário solicitar para ver imagens, fotos ou ilustrações.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'O termo de busca para pesquisar imagens (ex: gato fofo, paisagem de praia, logo do python).',
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
    name: 'agendar_alarme',
    description: 'Cria um alarme ou compromisso na agenda do sistema que será disparado e notificado no momento exato.',
    parameters: {
      type: 'OBJECT',
      properties: {
        tipo: {
          type: 'STRING',
          description: 'O tipo de notificação ("alarm" para alarmes, "agenda" para compromissos)',
        },
        dataHorario: {
          type: 'STRING',
          description: 'A data e hora exata no formato YYYY-MM-DD HH:MM:SS. Exemplo: "2026-09-10 19:30:00"',
        },
        mensagem: {
          type: 'STRING',
          description: 'O título ou mensagem que será mostrada quando o alarme tocar (ex: "Acordar!", "Reunião de equipe").',
        }
      },
      required: ['tipo', 'dataHorario', 'mensagem'],
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
    name: 'renderizar_tabela',
    description: 'Renderiza uma tabela rica, interativa e estilizada no chat com ordenação e busca. Use OBRIGATORIAMENTE sempre que o usuário pedir para gerar, mandar ou ver tabelas, rankings, classificações (ex: top 10 filmes, tabela da série A do Brasileirão, comparativos).',
    parameters: {
      type: 'OBJECT',
      properties: {
        tableConfig: {
          type: 'STRING',
          description: 'String JSON contendo { title, columns: [{ key, label, align? }], rows: [Record<string, any>] }.',
        },
      },
      required: ['tableConfig'],
    },
  },
  {
    name: 'renderizar_grafico',
    description: 'Renderiza um gráfico interativo (barras, linhas ou área) na interface. Use OBRIGATORIAMENTE sempre que o usuário pedir para gerar, montar ou ver gráficos, estatísticas de pesquisas eleitorais, comparativos ou dados numéricos visuais.',
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
  {
    name: 'executar_terminal',
    description: 'Executa comandos no terminal do sistema local do usuário (Linux). Use para listar arquivos, rodar scripts, gerenciar processos, etc. O comando ficará pausado até que o usuário aprove.',
    parameters: {
      type: 'OBJECT',
      properties: {
        comando: {
          type: 'STRING',
          description: 'O comando exato de shell/bash a ser executado (ex: ls -la, pwd, echo "teste"). Não envie comandos que usam sudo.',
        },
      },
      required: ['comando'],
    },
  },
  {
    name: 'baixar_midia',
    description: 'Baixa vídeos (do YouTube, Instagram, etc) ou fotos/imagens da internet e salva diretamente no computador do usuário.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: {
          type: 'STRING',
          description: 'A URL do vídeo ou foto a ser baixado.',
        },
        tipo: {
          type: 'STRING',
          description: 'O tipo de mídia a ser baixado ("video" ou "foto").',
          enum: ['video', 'foto']
        },
      },
      required: ['url', 'tipo'],
    },
  },
  {
    name: 'renderizar_video',
    description: 'Renderiza um reprodutor de vídeo interativo no chat para que o usuário possa assistir a um vídeo do YouTube ou link direto.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: {
          type: 'STRING',
          description: 'A URL do vídeo a ser exibido (ex: link do YouTube ou .mp4).',
        },
      },
      required: ['url'],
    },
  },
];

import { toolEvents } from '../events/toolEvents.js';

/**
 * Executa a ferramenta solicitada pelo Gemini ou pelo Intent Router pelo nome
 */
export async function executeToolByName(name: string, args: Record<string, any> = {}): Promise<any> {
  console.log(`🛠️ Executando Ferramenta: [${name}] com argumentos:`, JSON.stringify(args));
  const startTime = Date.now();
  toolEvents.emit('pipeline_action_start', { tool: name, args });
  let result: any;

  try {
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
      case 'pesquisar_imagens':
        result = await pesquisarImagens(args.query || '');
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
      case 'agendar_alarme':
        result = await agendarAlarme(args.tipo || '', args.dataHorario || '', args.mensagem || '');
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
      case 'renderizar_grafico': {
        let finalConfig = args.chartConfig;
        if (typeof finalConfig === 'object') {
          finalConfig = JSON.stringify(finalConfig);
        } else if (!finalConfig && (args.data || args.series)) {
          const chartType = args.chartType || args.type || 'bar';
          const data = args.data || [];
          const xKey = args.xKey || (data[0] ? Object.keys(data[0])[0] : 'name');
          const keys = args.dataKeys || (data[0] ? Object.keys(data[0]).filter((k: string) => k !== xKey) : ['valor']);
          const colors = ['#38bdf8', '#818cf8', '#34d399', '#f472b6', '#fbbf24'];
          const series = args.series || keys.map((k: string, i: number) => ({
            dataKey: k,
            name: k.charAt(0).toUpperCase() + k.slice(1),
            color: colors[i % colors.length]
          }));
          finalConfig = JSON.stringify({
            title: args.title || 'Gráfico de Dados',
            type: chartType,
            data,
            xKey,
            series
          });
        }
        result = { chartConfig: finalConfig, success: true, message: 'Gráfico interativo gerado e renderizado com sucesso.' };
        break;
      }
      case 'renderizar_tabela': {
        let finalConfig = args.tableConfig;
        if (typeof finalConfig === 'object') {
          finalConfig = JSON.stringify(finalConfig);
        } else if (!finalConfig && (args.columns || args.rows || args.data)) {
          finalConfig = JSON.stringify({
            title: args.title || 'Tabela de Dados',
            columns: args.columns || [],
            rows: args.rows || args.data || [],
          });
        }
        result = { tableConfig: finalConfig, success: true, message: 'Tabela interativa gerada e renderizada com sucesso.' };
        break;
      }
      case 'renderizar_video':
        result = { url: args.url, success: true };
        break;
      case 'executar_terminal':
        result = await executarTerminal(args.comando || '');
        break;
      case 'baixar_midia':
        result = await baixarMidia(args.url || '', args.tipo || 'video');
        break;
      default:
        result = { error: `Ferramenta "${name}" desconhecida ou não registrada.` };
    }
  } catch (err: any) {
    result = { error: err.message || 'Erro desconhecido na execução da ferramenta.' };
  }

  const durationMs = Date.now() - startTime;
  const isSuccess = !result?.error && result?.success !== false;
  toolEvents.emit('pipeline_action_end', { tool: name, durationMs, success: isSuccess, args, result });
  console.log(`✅ Ferramenta [${name}] concluída em ${durationMs}ms`);
  return { ...result, _executionTimeMs: durationMs };
}

