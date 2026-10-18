/** Enquadramento proporcional às dimensões reais, incluindo objetos muito pequenos. */
export function sceneFraming(diagonal:number,aspect:number,fovDegrees=40) {
  const radius=Math.max(1e-6,diagonal/2),halfFov=fovDegrees*Math.PI/360;
  const limiting=Math.min(halfFov,Math.atan(Math.tan(halfFov)*Math.max(.01,aspect)));
  const distance=radius/Math.sin(limiting)*1.15;
  return {radius,distance,near:Math.max(1e-8,distance/10000),far:Math.max(distance*12,radius*20,.001),fogDensity:.25/(distance+radius),labelNear:Math.max(1e-7,radius*.025)};
}
