const CACHE = "inspetor-cache-v1";
const ARQUIVOS_ESSENCIAIS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/base.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/dashboard.css",
  "./css/agenda.css",
  "./css/contratos.css",
  "./css/treinamentos.css",
  "./css/documentos.css",
  "./css/pendencias.css",
  "./css/anotacoes.css",
  "./js/app.js",
  "./js/firebase.js",
  "./js/auth.js",
  "./js/db.js",
  "./js/router.js",
  "./js/ui.js",
  "./js/editor.js",
  "./js/dashboard.js",
  "./js/agenda.js",
  "./js/contratos.js",
  "./js/visitas.js",
  "./js/anotacoes.js",
  "./js/treinamentos.js",
  "./js/documentos.js",
  "./js/pendencias.js",
  "./js/busca.js",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ARQUIVOS_ESSENCIAIS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((chaves) => Promise.all(chaves.filter((c) => c !== CACHE).map((c) => caches.delete(c))))
      .then(() => self.clients.claim())
  );
});

// App shell: cache-first. Dados do Firestore/Auth (fora da origem): network-only, sem interceptar.
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((resposta) => {
      if (resposta) return resposta;
      return fetch(event.request)
        .then((rede) => {
          const clone = rede.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, clone));
          return rede;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
