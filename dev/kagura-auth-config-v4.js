/* Kagura Auth V4 - development endpoint config */
(() => {
  'use strict';

  const AUTH_API_BASE = 'https://kagura-license-api.1715396266.workers.dev';

  function applyAuthConfig() {
    if (!globalThis.KaguraAuth?.configure) return false;
    globalThis.KaguraAuth.configure({
      apiBase: AUTH_API_BASE,
      timeoutMs: 20000,
      validationCacheMs: 60000,
      heartbeatMs: 5 * 60 * 1000,
    });
    return true;
  }

  if (!applyAuthConfig()) {
    const timer = setInterval(() => {
      if (applyAuthConfig()) clearInterval(timer);
    }, 100);
    setTimeout(() => clearInterval(timer), 10000);
  }

  globalThis.KAGURA_AUTH_API_BASE = AUTH_API_BASE;
})();
