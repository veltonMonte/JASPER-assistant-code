/**
 * JASPER 3D Scene Specification (Version 2)
 *
 * Contrato compartilhado e versionado para descrição declarativa de cenas e objetos 3D livres.
 * Utilizado por servidor, cliente, validadores e prompts do modelo.
 *
 * Convenções do sistema de coordenadas:
 * - Sistema cartesiano à direita, com eixo Y para cima (+Y = cima, +X = direita, +Z = frente).
 * - Rotações expressas em radianos na ordem Euler XYZ.
 * - Ordem de transformações locais: Escala -> Rotação -> Translação.
 * - Coordenadas de nós filhos são relativas ao nó pai (hierarquia local).
 * - Coordenadas globais resultam da composição das matrizes da raiz até o nó folha.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export interface SceneMetadata {
  /** Unidade de medida espacial */
  unit?: 'meter' | 'centimeter' | 'millimeter' | 'generic';
  /** Dimensões aproximadas da caixa envolvente total [largura, altura, profundidade] */
  dimensions?: Vec3;
  /** Enquadramento de câmera preferencial */
  view?: 'perspective' | 'top' | 'isometric' | 'front';
  /** Descrição resumida da cena gerada */
  description?: string;
  /** Tags ou categorias conceituais (ex: 'arquitetura', 'organico', 'mecanico') */
  tags?: string[];
}

export type SceneGeometryDef =
  | {
      type: 'box';
      width: number;
      height: number;
      depth: number;
    }
  | {
      type: 'sphere';
      radius: number;
      widthSegments?: number;
      heightSegments?: number;
    }
  | {
      type: 'cylinder';
      radiusTop: number;
      radiusBottom: number;
      height: number;
      radialSegments?: number;
    }
  | {
      type: 'cone';
      radius: number;
      height: number;
      radialSegments?: number;
    }
  | {
      type: 'capsule';
      radius: number;
      length: number;
      capSegments?: number;
      radialSegments?: number;
    }
  | {
      type: 'torus';
      radius: number;
      tube: number;
      radialSegments?: number;
      tubularSegments?: number;
    }
  | {
      type: 'plane';
      width: number;
      height: number;
    }
  | {
      type: 'extrude';
      /** Contorno poligonal 2D no plano XY, extrudido no eixo +Z */
      path: Vec2[];
      /** Lista de furos/aberturas internas (cada furo é um polígono 2D) */
      holes?: Vec2[][];
      /** Profundidade da extrusão */
      depth: number;
      bevelEnabled?: boolean;
      bevelThickness?: number;
      bevelSize?: number;
    }
  | {
      type: 'lathe';
      /** Perfil 2D [x, y] com x >= 0 rotacionado ao redor do eixo Y */
      points: Vec2[];
      segments?: number;
      phiStart?: number;
      phiLength?: number;
    }
  | {
      type: 'tube';
      /** Caminho 3D contínuo através de pontos de controle */
      path: Vec3[];
      radius: number;
      tubularSegments?: number;
      radialSegments?: number;
      closed?: boolean;
    }
  | {
      type: 'mesh';
      /** Lista explícita de vértices 3D */
      vertices: Vec3[];
      /** Índices triangulares de cada face [i, j, k] */
      faces: [number, number, number][];
    };

export interface SceneMaterialDef {
  /** Cor hexadecimal no formato #RRGGBB */
  color: string;
  /** Rugosidade entre 0.0 (polido/espelhado) e 1.0 (fosco) */
  roughness?: number;
  /** Metalicidade entre 0.0 (dielétrico) e 1.0 (metálico) */
  metalness?: number;
  /** Cor de emissão luminosa em #RRGGBB */
  emissive?: string;
  /** Intensidade da emissão luminosa (0.0 a 2.0) */
  emissiveIntensity?: number;
  /** Opacidade entre 0.0 e 1.0 */
  opacity?: number;
  /** Define se o material aceita transparência */
  transparent?: boolean;
  /** Renderiza apenas arestas aramadas */
  wireframe?: boolean;
}

export interface SceneTransform {
  position?: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
}

export type SceneRepetition =
  | {
      type: 'linear';
      count: number;
      offset: Vec3;
    }
  | {
      type: 'grid';
      counts: [number, number, number];
      spacing: Vec3;
      center?: boolean;
    }
  | {
      type: 'radial';
      count: number;
      radius: number;
      axis?: 'y' | 'x' | 'z';
      startAngle?: number;
      arc?: number;
    }
  | {
      type: 'transforms';
      instances: SceneTransform[];
    };

export interface ScenePointOfInterest {
  id: string;
  name: string;
  position: Vec3;
  target?: Vec3;
  distance?: number;
}

export interface SceneNode {
  /** Apoio e alinhamento relativos a um irmão ou à geometria do pai imediato. */
  place?: import('./scene-placement.js').Placement;
  /** Identificador único e estável do nó */
  id: string;
  /** Nome legível do nó (ex: 'cabeca', 'roda_dianteira_esq', 'parede_norte') */
  name?: string;
  /** Referência ao dicionário de geometrias compartilhadas da cena */
  geometryId?: string;
  /** Referência ao dicionário de materiais compartilhados da cena */
  materialId?: string;
  /** Definição geométrica em linha (quando não reutilizada) */
  geometry?: SceneGeometryDef;
  /** Definição de material em linha (quando não reutilizado) */
  material?: SceneMaterialDef;
  /** Posição local [x, y, z] */
  position?: Vec3;
  /** Rotação local Euler em radianos [rx, ry, rz] */
  rotation?: Vec3;
  /** Escala local [sx, sy, sz] */
  scale?: Vec3;
  /** Configuração para multiplicação repetida ou instanciada do nó */
  repetition?: SceneRepetition;
  /** Rótulo visual flutuante (curto, para destaques) */
  label?: string;
  /** Descrição explicativa curta */
  description?: string;
  /** Nós filhos na hierarquia de transformação */
  children?: SceneNode[];
}

export interface SceneSpec {
  /** Versão do contrato declarativo (obrigatoriamente 2) */
  version: 2;
  /** Identificador da cena */
  id?: string;
  /** Título do assunto modelado */
  title?: string;
  /** Metadados de enquadramento, unidade e dimensões */
  metadata?: SceneMetadata;
  /** Geometrias reutilizáveis compartilhadas */
  geometries?: Record<string, SceneGeometryDef>;
  /** Materiais reutilizáveis compartilhados */
  materials?: Record<string, SceneMaterialDef>;
  /** Árvore de nós da cena */
  nodes: SceneNode[];
  /** Pontos de interesse para foco da câmera */
  pointsOfInterest?: ScenePointOfInterest[];
}

/**
 * Operações de alteração incremental sobre uma cena existente
 */
export type ScenePatchOperation =
  | { op: 'updateNode'; nodeId: string; patch: Partial<Omit<SceneNode, 'id' | 'children'>> }
  | { op: 'removeNode'; nodeId: string }
  | { op: 'addNode'; parentNodeId?: string; node: SceneNode }
  | { op: 'updateMaterial'; materialId: string; patch: Partial<SceneMaterialDef> }
  | { op: 'updateGeometry'; geometryId: string; geometry: SceneGeometryDef }
  | { op: 'setMetadata'; metadata: Partial<SceneMetadata> };

export interface ScenePatch {
  targetSceneId?: string;
  operations: ScenePatchOperation[];
}
