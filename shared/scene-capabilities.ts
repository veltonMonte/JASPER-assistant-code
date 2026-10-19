/**
 * JASPER 3D Scene Capabilities & Budgets
 *
 * Fonte única de verdade sobre capacidades de modelagem declarativa,
 * limites arquiteturais e instruções técnicas para o modelo Gemini.
 */

export const SCENE_BUDGETS = {
  version: 2 as const,
  maxHierarchyDepth: 8,
  maxTotalNodes: 256,
  maxTotalInstances: 512,
  maxGeometries: 128,
  maxMaterials: 64,
  maxVertices: 30000,
  maxTriangles: 60000,
  maxMeshVertices: 4000,
  maxMeshFaces: 8000,
  maxCurvePoints: 256,
  maxExtrudePoints: 256,
  maxHolesPerExtrude: 16,
  maxJsonBytes: 65536,
  maxLabels: 32,
  coordinateBound: 100, // [-100, 100]
  scaleMin: 0.0001,
  scaleMax: 100,
};

export const GEOMETRY_OPERATIONS = [
  {
    type: 'box',
    description: 'Paralelepípedo / cubo. Use para gabinetes, paredes, móveis, livros, telas, caixas e componentes retos.',
    fields: ['width (largura X)', 'height (altura Y)', 'depth (profundidade Z)'],
  },
  {
    type: 'sphere',
    description: 'Esfera ou elipsoide (quando combinada com escala não uniforme). Use para olhos, planetas, articulações, bolhas e cabeças arredondadas.',
    fields: ['radius', 'widthSegments (opcional)', 'heightSegments (opcional)'],
  },
  {
    type: 'cylinder',
    description: 'Cilindro ou tronco de cone. Use para rodas, eixos, canos, pernas, pistões, lentes e colunas.',
    fields: ['radiusTop', 'radiusBottom', 'height', 'radialSegments (opcional)'],
  },
  {
    type: 'cone',
    description: 'Cone reto. Use para pontas de foguete, pinos, espinhos, dentes afiados e copas cônicas.',
    fields: ['radius', 'height', 'radialSegments (opcional)'],
  },
  {
    type: 'capsule',
    description: 'Cápsula com extremidades hemisféricas. Use para membros orgânicos (braços, pernas), dedos, pílulas, toras e tubos fechados.',
    fields: ['radius', 'length (comprimento da parte central cilíndrica)', 'capSegments (opcional)', 'radialSegments (opcional)'],
  },
  {
    type: 'torus',
    description: 'Toro / anel. Use para anéis planetários, pneus, aros de óculos, juntas de vedação, fios enrolados e volantes.',
    fields: ['radius (raio do anel central)', 'tube (raio da espessura do tubo)', 'radialSegments (opcional)', 'tubularSegments (opcional)'],
  },
  {
    type: 'plane',
    description: 'Superfície plana bidimensional. Use para pisos, terrenos, folhas de papel, vidros finos e cartazes.',
    fields: ['width', 'height'],
  },
  {
    type: 'extrude',
    description: 'Extrusão de contorno poligonal 2D no plano XY, extrudido no eixo +Z com profundidade e suporte a furos internos. Use para plantas baixas com paredes e portas, asas recortadas, engrenagens e peças com aberturas.',
    fields: ['path (array de [x, y] do contorno)', 'holes (array de arrays [x, y] para furos)', 'depth', 'bevelEnabled (opcional)'],
  },
  {
    type: 'lathe',
    description: 'Revolução de perfil 2D ao redor do eixo Y (simetria axial). Use para vasos, copos, sinos, turbinas, garrafas, pratos e cones complexos.',
    fields: ['points (array de [x, y] onde x >= 0)', 'segments (opcional)', 'phiStart (opcional)', 'phiLength (opcional)'],
  },
  {
    type: 'tube',
    description: 'Tubo 3D ao longo de uma curva 3D suave. Use para caudas de dinossauro, cabos de computador, galhos de árvore, hastes de óculos, tubulações e artérias.',
    fields: ['path (array de [x, y, z] pontos de controle)', 'radius', 'tubularSegments (opcional)', 'closed (opcional)'],
  },
  {
    type: 'mesh',
    description: 'Malha poligonal indexada com vértices e faces explícitos. Use para formas orgânicas customizadas ou superfícies facetadas livres.',
    fields: ['vertices (array de [x, y, z])', 'faces (array de índices triangulares [i, j, k])'],
  },
];

export const REPETITION_MODES = [
  {
    type: 'linear',
    description: 'Repetição unidirecional com deslocamento constante. Use para dentes em fila, postes, degraus de escada.',
    fields: ['count', 'offset: [dx, dy, dz]'],
  },
  {
    type: 'grid',
    description: 'Grade bidimensional ou tridimensional regular. Use para teclas de teclado mecânico, matrizes de LEDs, janelas de edifício.',
    fields: ['counts: [nx, ny, nz]', 'spacing: [dx, dy, dz]', 'center: boolean (opcional)'],
  },
  {
    type: 'radial',
    description: 'Distribuição circular em torno de um raio. Use para pás de ventilador, parafusos de roda, pétalas de flor.',
    fields: ['count', 'radius', 'axis: "y" | "x" | "z"', 'startAngle (opcional)', 'arc (opcional)'],
  },
  {
    type: 'transforms',
    description: 'Lista explícita de matrizes/transformações de instâncias com rotação/escala individual.',
    fields: ['instances: Array<{ position?, rotation?, scale? }>'],
  },
];

/**
 * Gera a instrução técnica de modelagem 3D para ser injetada no System Prompt do Jasper
 */
export function sceneCapabilitiesPrompt(): string {
  const ops = GEOMETRY_OPERATIONS.map(op => `- ${op.type}: ${op.description} Campos: ${op.fields.join('; ')}.`).join('\n');
  const reps = REPETITION_MODES.map(r => `- ${r.type}: ${r.description} Campos: ${r.fields.join('; ')}.`).join('\n');

  return `SISTEMA DE MODELAGEM 3D LIVRE (SceneSpec v2):
Você pode criar qualquer objeto, mecanismo, criatura, veículo, planta arquitetônica ou cena espacial livremente combinando operações geométricas declarativas.
NUNCA invente comandos fictícios ou assuma presets para assuntos novos. Construa a cena usando a especificação abaixo:

FORMATO DO DOCUMENTO:
{ version: 2, id?: "cena_estavel", title?: "Assunto", metadata?: {unit: "generic", view: "perspective"}, geometries?: {id: geometria}, materials?: {id: material}, nodes: [{id, name?, geometryId? ou geometry?, materialId? ou material?, position?: [x,y,z], rotation?: [rx,ry,rz], scale?: [sx,sy,sz], repetition?, label?, children?: [nós]}] }.
Um grupo tem children e não precisa de geometry. Cada geometria usa type e os campos abaixo. Não há uma lista de assuntos cadastrados.
Escala é aplicada antes da rotação e da translação. Filhos usam coordenadas locais. Plane e extrude estão no plano XY; gire [-1.5708,0,0] para um piso horizontal. Metadados de unidade não reescalam números automaticamente.
Materiais: {color:"#RRGGBB", roughness?:0..1, metalness?:0..1, emissive?:"#RRGGBB", emissiveIntensity?:0..2, opacity?:0..1, transparent?:boolean, wireframe?:boolean}.
Limites: ${JSON.stringify(SCENE_BUDGETS)}. Curvas tube: 2..64 pontos; perfil lathe: 2..64; segmentos: 3..32 (tubularSegments até 96). O cliente reduz a tesselação em aparelhos fracos. Distribua detalhes por relevância; repetições e descendentes contam no orçamento expandido.

OPERAÇÕES GEOMÉTRICAS DISPONÍVEIS:
${ops}

REPETIÇÕES EFICIENTES (INSTANCIAMENTO):
Quando houver elementos repetidos (ex: teclas de teclado, dentes, rodas, parafusos, janelas, árvores em fileira), REUTILIZE a mesma geometryId e materialId e utilize 'repetition' no nó:
${reps}

REGRAS DE CONSTRUÇÃO E HIERARQUIA:
1. Identificadores: Todo nó deve ter 'id' estável e sem espaços (ex: 'tronco', 'cabeca', 'haste_esq', 'tecla_matriz').
2. Sistema de Coordenadas: Eixo Y aponta para cima (+Y = topo, +X = direita, +Z = frente). Rotações em radianos [rx, ry, rz] na ordem Euler XYZ.
3. Relação Pai-Filho: Use grupos neutros (children, sem geometry e sem rotation/scale) para organizar a estrutura principal. Coloque a geometria do corpo e suas partes como irmãos nesse grupo. A rotação de um cilindro/esfera alongada também gira TODOS os filhos: por isso aplique rotação e escala nas folhas geométricas, não no recipiente de olhos, pernas, rodas ou apoios. Só transforme grupos inteiros quando o pedido exigir uma peça articulada. Pernas de apoio e paredes ficam no eixo Y, nunca de cabeça para baixo.
4. Materiais: Defina cores hexadecimais harmoniosas (#RRGGBB), roughness (0=espelho, 1=fosco), metalness (0=plástico/madeira/pele, 1=metal).
5. Rótulos e Pontos de Interesse: Adicione 'label' apenas nas partes fundamentais explicativas da apresentação.
6. Plantas e Arquitetura: Para plantas de casas/edifícios, defina 'metadata: { view: "top" }' e monte paredes via 'extrude' ou caixas dispostas, com cômodos identificáveis.
7. Montagem relativa: prefira place em vez de adivinhar posições para peças apoiadas. Formato: place:{on:"id",align?:"center|front|back|left|right",gap?:numero,inset?:numero,offset?:[x,y,z]} ou {under:"id"}, {beside:"id",side:"left|right|front|back"}, {floor:0}. Referências são entre irmãos do mesmo grupo ou ao pai imediato quando ele tem geometry/geometryId. Ao referenciar o pai, considera-se apenas sua geometria, no sistema local dele. Nunca referencie o próprio nó ou descendente. Sem ciclos. floor indica a altura do apoio; on/under calculam o contato; gap negativo une discretamente superfícies. offset é relativo ao encaixe. O servidor calcula position e mantém a relação nas edições. Para pernas ou rodas simétricas use repetition grid/transforms; grupos aceitam place. Para formas orgânicas articuladas, coordenadas locais continuam disponíveis.
8. Identidade visual: escolha um tipo concreto e mantenha suas proporções. Construa primeiro a silhueta com os volumes principais conectados, depois apoios e detalhes. Um animal deve ter crânio e focinho distinguíveis do tronco, membros nas posições anatômicas e cauda/orelhas/espinhos quando forem característicos. Um veículo precisa de carroceria, cabine e rodas alinhadas. O reconhecimento vem dessas características, não de acrescentar olhos a uma esfera. Não acrescente piso ou terreno a um objeto isolado: o estúdio já fornece palco e chão. Use piso somente quando fizer parte da cena arquitetônica ou ambiente pedido.
9. Verificação espacial antes de responder: confira mentalmente a cena vista de lado. O topo fica em +Y, o chão em Y=0. Corpo alongado pode apontar para X ou Z, mas os apoios continuam verticais no eixo Y global. Nenhum grupo principal recebe rotação de 90/180 graus para orientar só uma primitiva. Para inverter um cone ou orientar uma cápsula, rode apenas essa folha, deixando outros nós fora dela. O menor Y dos pés/apoios é zero; cabeça e detalhes devem tocar o volume principal.
10. Acabamento: priorize silhueta reconhecível e proporções antes de detalhes. Use 12 a 40 nós para objetos, até 50 para cenas complexas, 3 a 5 materiais reutilizados e 3 a 8 rótulos. Cada suporte deve tocar a peça apoiada. Telas precisam de base ou dobradiça; olhos em pares; rodas no mesmo eixo. Nunca substitua um assunto por um objeto genérico.
11. Variedade de formas: para criaturas combine elipsoides, cápsulas e curvas; para vasos e copos use lathe; para recortes e fachadas use extrude; para tubos e cabos use tube. Não forme animais somente com caixas. Reserve mesh para silhuetas que as outras operações não expressam; evite listas longas de vértices.
12. Materiais: use ids descritivos wood_light, wood_dark, plastic_matte, plastic_gloss, metal_brushed, fabric, rubber, glass ou screen quando apropriado. Continue enviando color e propriedades declarativas. Cores médias/claras contrastantes, com escuros só em pequenos detalhes. Vidro com opacity 0.25 a 0.4; tela pode emitir luz leve. Nenhuma textura externa é necessária.
13. Tempo de resposta: por padrão entregue uma cena completa e compacta, uma etapa e uma explicação de 2 a 4 frases. Use dicionários e repetition para partes iguais. Só acrescente múltiplas etapas quando o pedido exigir uma aula. Não gere centenas de peças para enfeitar.
14. Modificações Incrementais: Ao receber pedidos de alteração sobre uma cena ativa (ex: "aumente a cauda", "troque a cor"), preserve os 'id's originais e altere as propriedades correspondentes.`;
}
