/** A geração de documentos geométricos usa o transporte textual; a narração tem áudio próprio. */
export function isVisualRequest(text:string,hasActiveScene=false):boolean {
  const clean=text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const action=/\b(crie|criar|gere|gerar|modele|modelar|monte|montar|mostre|mostrar|faca|desenhe|explique|representacao|modelo|modelagem)\b/.test(clean);
  if(action&&/\b(3d|tridimensional|modelagem|cena|planta|diagrama|representacao|apresentacao visual)\b/.test(clean))return true;
  return hasActiveScene&&/\b(aumente|diminua|remova|retire|adicione|inclua|troque|mude|altere|separe|desfaca|desfazer|volte|ajuste)\b/.test(clean);
}
