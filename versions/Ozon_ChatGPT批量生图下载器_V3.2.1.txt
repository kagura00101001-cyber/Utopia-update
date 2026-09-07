// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手
// @namespace    https://github.com/Kagura-userscripts
// @version      3.2.1
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js
// @description  V3.2.1 热更新修复版：固定加载并校验 V3.2.0 稳定核心，修复发布链版本不一致。
// @author       Kagura
// @match        https://www.ozon.ru/*
// @match        https://ozon.ru/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @icon         https://www.ozon.ru/favicon.ico
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
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

(() => {
  'use strict';

  const RELEASE_VERSION = '3.2.1';
  const CORE_VERSION = '3.2.0';
  const CORE_COMMIT = 'fec1f17f865b4f1fe91228dd63a39e5c57c244bc';
  const CORE_URL = `https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/${CORE_COMMIT}/versions/Ozon_ChatGPT%E6%89%B9%E9%87%8F%E7%94%9F%E5%9B%BE%E4%B8%8B%E8%BD%BD%E5%99%A8_V3.2.0.txt`;
  const CORE_CACHE_KEY = `kaguraPodStableCore_${CORE_VERSION}_${CORE_COMMIT.slice(0, 12)}`;
  const CORE_CACHE_VERSION_KEY = `${CORE_CACHE_KEY}_version`;

  const RELEASE_NOTES = [
    '基于 V3.2.0 稳定代码重新完成 V3.2.1 热更新发布链。',
    '修复 user.js、meta.js、latest.json 与 history.json 版本不一致的问题。',
    '启动更新检查、手动更新检查与界面版本号统一为 V3.2.1。',
    '保留 V3.2.0 全部业务逻辑和本地配置兼容性，本版不引入新的生图流程改动。',
    'V3.2.0 继续保留为固定回滚稳定核心。',
  ];

  function patchStableCore(source) {
    let code = String(source || '');
    if (code.length < 200000) throw new Error(`稳定核心文件异常：长度仅 ${code.length}`);

    const replacements = [
      ['// @version      3.2.0', '// @version      3.2.1'],
      ["const CURRENT_VERSION = '3.2.0';", "const CURRENT_VERSION = '3.2.1';"],
      ["const APP_VERSION = '3.2.0';", "const APP_VERSION = '3.2.1';"],
      ["const KAGURA_MANUAL_VERSION = '3.2.0';", "const KAGURA_MANUAL_VERSION = '3.2.1';"],
      ['/* KAGURA_POD_STYLE_UPDATE_V320 */', '/* KAGURA_POD_STYLE_UPDATE_V321 */'],
      ['Kagura 手动更新检查 V3.2.0（POD统一热更新）', 'Kagura 手动更新检查 V3.2.1（POD统一热更新）'],
    ];

    for (const [oldText, newText] of replacements) {
      if (!code.includes(oldText)) throw new Error(`稳定核心校验失败，缺少标记：${oldText}`);
      code = code.replace(oldText, newText);
    }

    const changelogPattern = /    const MODULE_CHANGELOG = \[\n[\s\S]*?\n    \]\.join\('\\n'\);/;
    const changelog = [
      '    const MODULE_CHANGELOG = [',
      '      `V${APP_VERSION} 更新内容：`,',
      ...RELEASE_NOTES.map(note => `      ${JSON.stringify(note)},`),
      "    ].join('\\n');",
    ].join('\n');
    if (!changelogPattern.test(code)) throw new Error('稳定核心校验失败：未找到 MODULE_CHANGELOG');
    code = code.replace(changelogPattern, changelog);

    if (!code.includes("const CURRENT_VERSION = '3.2.1';")
      || !code.includes("const APP_VERSION = '3.2.1';")
      || !code.includes("const KAGURA_MANUAL_VERSION = '3.2.1';")) {
      throw new Error('V3.2.1 核心版本替换校验失败');
    }
    return code;
  }

  function runCore(source, sourceLabel) {
    const patched = patchStableCore(source);
    console.info(`[Kagura POD] V${RELEASE_VERSION}：使用${sourceLabel}启动固定 V${CORE_VERSION} 稳定核心。`);
    // 直接 eval 让稳定核心继续使用当前 Tampermonkey 沙箱中的 GM_*、unsafeWindow 与 XLSX。
    eval(`${patched}\n//# sourceURL=Kagura_POD_Core_V${RELEASE_VERSION}.user.js`);
  }

  function fetchCore() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${CORE_URL}?_=${Date.now()}`,
        timeout: 45000,
        headers: {
          Accept: 'text/plain,*/*;q=0.8',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`稳定核心下载失败：HTTP ${response.status || '未知'}`));
            return;
          }
          const text = String(response.responseText || '');
          try {
            patchStableCore(text);
          } catch (error) {
            reject(error);
            return;
          }
          resolve(text);
        },
        onerror: () => reject(new Error('稳定核心下载网络错误')),
        ontimeout: () => reject(new Error('稳定核心下载超时')),
      });
    });
  }

  function showFatal(error) {
    console.error('[Kagura POD] V3.2.1 稳定核心启动失败：', error);
    const id = 'kagura-pod-core-load-error-v321';
    if (document.getElementById(id)) return;
    const box = document.createElement('div');
    box.id = id;
    box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;top:16px;max-width:420px;padding:12px 14px;border-radius:10px;background:#7f1d1d;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.28);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;white-space:pre-wrap';
    box.textContent = `Kagura POD V${RELEASE_VERSION} 启动失败\n${error?.message || error}\n\n请检查网络后刷新页面。`;
    (document.body || document.documentElement).appendChild(box);
  }

  async function boot() {
    const cached = GM_getValue(CORE_CACHE_KEY, '');
    const cachedVersion = String(GM_getValue(CORE_CACHE_VERSION_KEY, ''));

    if (typeof cached === 'string' && cached.length >= 200000 && cachedVersion === CORE_VERSION) {
      try {
        runCore(cached, '本地缓存');
        return;
      } catch (error) {
        console.warn('[Kagura POD] 缓存核心校验失败，将重新下载：', error);
        GM_deleteValue(CORE_CACHE_KEY);
        GM_deleteValue(CORE_CACHE_VERSION_KEY);
      }
    }

    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const source = await fetchCore();
        GM_setValue(CORE_CACHE_KEY, source);
        GM_setValue(CORE_CACHE_VERSION_KEY, CORE_VERSION);
        runCore(source, attempt === 1 ? '固定 GitHub 稳定归档' : `第 ${attempt} 次重试下载的固定稳定归档`);
        return;
      } catch (error) {
        lastError = error;
        console.warn(`[Kagura POD] 稳定核心加载第 ${attempt}/3 次失败：`, error);
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1200 * attempt));
      }
    }
    showFatal(lastError || new Error('未知启动错误'));
  }

  boot();
})();
