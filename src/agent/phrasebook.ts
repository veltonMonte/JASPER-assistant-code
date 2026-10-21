/**
 * Livro de frases do Jasper para respostas diretas do roteador (sem passar pelo modelo).
 * Cada situação tem várias formas de dizer a mesma coisa; a escolha varia e evita
 * repetir a anterior, para não soar como resposta de máquina.
 */
export type PhraseKey =
  | 'pc_on' | 'pc_on_failed' | 'pc_online' | 'pc_offline' | 'pc_off' | 'terminal_ask';

export interface PhraseContext {
  /** Afinidade 0–100: a partir de 50 usa um registro mais próximo. */
  affinity?: number;
  /** Sorteio injetável para testes. */
  rng?: () => number;
  vars?: Record<string, string>;
}

type Variants = { neutral: string[]; close: string[] };

const BOOK: Record<PhraseKey, Variants> = {
  pc_on: {
    neutral: [
      'Mandei o sinal para ligar o computador. Ele leva um instante para acordar.',
      'Sinal enviado. Dê alguns segundos e o computador deve estar de pé.',
      'Estou acordando o computador agora; em instantes ele responde.',
    ],
    close: [
      'Mandei o sinal pra ligar o PC. Deixa ele acordar um instante.',
      'Sinal enviado! Em alguns segundos ele deve estar de pé.',
      'Tô acordando o computador agora, já já ele responde.',
    ],
  },
  pc_on_failed: {
    neutral: [
      'Não consegui enviar o sinal para ligar o computador: {motivo}',
      'O sinal de ligar não saiu. {motivo}',
    ],
    close: [
      'Não consegui mandar o sinal pra ligar o PC: {motivo}',
      'O sinal não saiu, e o motivo foi este: {motivo}',
    ],
  },
  pc_online: {
    neutral: [
      'O computador está ligado e respondendo normalmente na rede.',
      'Está online, sem nenhum problema à vista.',
    ],
    close: [
      'Tá ligado sim, respondendo normal na rede.',
      'Está online, tudo certo por aqui.',
    ],
  },
  pc_offline: {
    neutral: [
      'Não consigo falar com o computador agora; ele deve estar desligado ou fora da rede.',
      'Ele não respondeu. Provavelmente está desligado ou desconectado.',
    ],
    close: [
      'Não tô conseguindo falar com ele; deve estar desligado ou fora da rede.',
      'Nada de resposta por aqui. Parece desligado, quer que eu mande o sinal pra ligar?',
    ],
  },
  pc_off: {
    neutral: [
      'Pedido de desligamento enviado. O computador só desliga se o agente local estiver ativo nele.',
      'Mandei o pedido de desligamento; a conclusão depende do agente local no computador.',
    ],
    close: [
      'Pedido de desligamento enviado. Ele só apaga se o agente local estiver rodando lá.',
      'Mandei o desligamento; se o agente local não estiver ativo, ele não vai atender.',
    ],
  },
  terminal_ask: {
    neutral: [
      'Para {descricao}, preciso rodar "{comando}". Você confirma?',
      'Vou precisar executar "{comando}" para {descricao}. Posso seguir?',
    ],
    close: [
      'Pra {descricao}, vou rodar "{comando}". Posso?',
      'Isso pede o comando "{comando}", pra {descricao}. Manda ver?',
    ],
  },
};

const lastChoice = new Map<PhraseKey, number>();

export function say(key: PhraseKey, context: PhraseContext = {}): string {
  const variants = (context.affinity ?? 0) >= 50 ? BOOK[key].close : BOOK[key].neutral;
  const rng = context.rng ?? Math.random;
  let index = Math.min(variants.length - 1, Math.floor(rng() * variants.length));
  if (variants.length > 1 && lastChoice.get(key) === index) index = (index + 1) % variants.length;
  lastChoice.set(key, index);
  return variants[index].replace(/\{(\w+)\}/g, (_match, name: string) => context.vars?.[name] ?? '');
}

export const PHRASE_KEYS = Object.keys(BOOK) as PhraseKey[];
export function allVariants(key: PhraseKey): string[] { return [...BOOK[key].neutral, ...BOOK[key].close]; }
