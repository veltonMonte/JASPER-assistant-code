self.addEventListener('install', (event) => {
  console.log('JASPER PWA Service Worker Instalado');
});

self.addEventListener('fetch', (event) => {
  // PWA simples sem cache offline forçado, apenas para permitir a instalação
  event.respondWith(fetch(event.request));
});
