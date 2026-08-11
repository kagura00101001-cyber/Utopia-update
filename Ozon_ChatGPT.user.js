// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手 V3.0.25
// @namespace    https://github.com/Kagura-userscripts
// @version      3.0.25
// @description  Kagura - Ozon主图下载 + ChatGPT批量生图助手（自动更新版）
// @author       Kagura
// @match        https://www.ozon.ru/*
// @match        https://ozon.ru/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://www.ozon.ru/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        unsafeWindow
// @connect      ozone.ru
// @connect      ozon.ru
// @connect      *.ozone.ru
// @connect      *.ozon.ru
// @connect      raw.githubusercontent.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '3.0.25';
  const BASE = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/';
  const PARTS = ['payload_01.txt', 'payload_02.txt', 'payload_03.txt', 'payload_04.txt'];

  function getText(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${url}?v=${encodeURIComponent(VERSION)}&t=${Date.now()}`,
        timeout: 60000,
        headers: { 'Cache-Control': 'no-cache' },
        onload(response) {
          if (response.status >= 200 && response.status < 300) {
            resolve(String(response.responseText || '').trim());
          } else {
            reject(new Error(`HTTP ${response.status}`));
          }
        },
        onerror: () => reject(new Error('网络请求失败')),
        ontimeout: () => reject(new Error('请求超时')),
      });
    });
  }

  async function gunzipBase64(base64) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('当前浏览器不支持 DecompressionStream，请升级 Chrome/Edge');
    }
    const binary = atob(base64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  async function start() {
    try {
      const chunks = await Promise.all(PARTS.map(name => getText(BASE + name)));
      const code = await gunzipBase64(chunks.join(''));
      if (!code.includes("const APP_VERSION = '3.0.25'")) {
        throw new Error('远程脚本版本校验失败');
      }
      // 使用直接 eval，使完整主程序继续处于 Tampermonkey 沙箱内，可访问 GM_* 与 unsafeWindow。
      eval(`${code}\n//# sourceURL=Ozon_ChatGPT_payload_V${VERSION}.user.js`);
    } catch (error) {
      console.error(`[Kagura AutoUpdate V${VERSION}] 加载失败：`, error);
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:420px;padding:12px 14px;border-radius:10px;background:#7f1d1d;color:#fff;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28)';
      box.textContent = `Kagura脚本 V${VERSION} 远程代码加载失败：${error?.message || error}。请检查网络后刷新页面。`;
      document.documentElement.appendChild(box);
    }
  }

  start();
})();
