/** Enquadramento proporcional às dimensões reais, incluindo objetos muito pequenos. */
export function sceneFraming(diagonal:number,aspect:number,fovDegrees=40) {
  const radius=Math.max(1e-6,diagonal/2),halfFov=fovDegrees*Math.PI/360;
  const limiting=Math.min(halfFov,Math.atan(Math.tan(halfFov)*Math.max(.01,aspect)));
  const distance=radius/Math.sin(limiting)*1.15;
  return {radius,distance,near:Math.max(1e-8,distance/10000),far:Math.max(distance*12,radius*20,.001),fogDensity:.25/(distance+radius),labelNear:Math.max(1e-7,radius*.025)};
}

/** Mantém o eixo vertical do OrbitControls, inclusive ao alternar plantas e objetos. */
export function sceneView(view?: string, studio = true) {
  const direction: [number,number,number] = view === 'top' ? [0,1,.0001] : view === 'front' ? [0,.15,1] : [.85,.55,1.2];
  return { direction, up: [0,1,0] as [number,number,number], minPolar: .00001, maxPolar: studio ? Math.PI*.48 : Math.PI };
}
