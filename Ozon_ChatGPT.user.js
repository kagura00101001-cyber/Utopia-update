// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手
// @namespace    https://github.com/Kagura-userscripts
// @version      3.0.30
// @description  Kagura - V3.0.30 更新链路完整测试版
// @author       Kagura
// @match        https://www.ozon.ru/*
// @match        https://ozon.ru/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://www.ozon.ru/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dist/v3.0.30/part_01.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dist/v3.0.30/part_02.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dist/v3.0.30/part_03.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dist/v3.0.30/part_04.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dist/v3.0.30/part_05.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dist/v3.0.30/part_06.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dist/v3.0.30/part_07.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dist/v3.0.30/part_08.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dist/v3.0.30/part_09.js
// @require      https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/dist/v3.0.30/part_10.js
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
// @connect      api.github.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(async () => {
  'use strict';
  try {
    const b64 = String(globalThis.__KAGURA_V3030_B64__ || '').replace(/\s+/g, '');
    delete globalThis.__KAGURA_V3030_B64__;
    if (!b64) throw new Error('更新包为空');
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    if (typeof DecompressionStream !== 'function') {
      throw new Error('当前浏览器不支持 DecompressionStream');
    }
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    const code = await new Response(stream).text();
    (0, eval)(code + '\n//# sourceURL=Kagura_Ozon_ChatGPT_V3.0.30.full.user.js');
  } catch (error) {
    console.error('[Kagura V3.0.30] 更新包加载失败', error);
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;max-width:460px;padding:12px 14px;border-radius:10px;background:#7f1d1d;color:#fff;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28)';
    box.textContent = 'Kagura脚本 V3.0.30 更新包加载失败：' + (error?.message || error);
    document.documentElement.appendChild(box);
  }
})();
