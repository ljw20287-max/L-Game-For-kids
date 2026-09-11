(function(){
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function(){
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  window.addEventListener('load', function(){
    const swUrl = new URL('sw.js', document.baseURI);
    const scopeUrl = new URL('./', swUrl);
    navigator.serviceWorker.register(swUrl.href, { scope: scopeUrl.href }).then(function(registration){
      if (!registration) return;
      if (registration.waiting) {
        registration.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      if (registration.addEventListener) registration.addEventListener('updatefound', function(){
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', function(){
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            worker.postMessage({ type: 'SKIP_WAITING' });
          }
        });
      });

      if (registration.update) {
        registration.update().catch(function(){});
      }
    }).catch(function(err){
      console.warn('PWA registration failed:', err);
    });
  });
})();
