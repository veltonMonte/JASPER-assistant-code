import * as THREE from 'three';

export function disposeObject(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse(object => {
    const drawable = object as THREE.Mesh;
    if (drawable.geometry) geometries.add(drawable.geometry);
    if (drawable.material) (Array.isArray(drawable.material) ? drawable.material : [drawable.material]).forEach(material => materials.add(material));
    if (object instanceof THREE.InstancedMesh) object.dispose();
    if ('element' in object && (object as any).element instanceof HTMLElement) (object as any).element.remove();
  });
  materials.forEach(material => {
    for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
    if (material instanceof THREE.ShaderMaterial) for (const uniform of Object.values(material.uniforms)) if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
  });
  geometries.forEach(geometry => geometry.dispose());
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  root.clear();
}
