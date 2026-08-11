// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手 V3.0.25
// @name:zh-CN   Ozon主图下载 + ChatGPT批量生图助手 V3.0.26
// @namespace    https://github.com/Kagura-userscripts
// @version      3.0.26
// @description  Kagura - 手动检查更新版；右下角版本按钮检查更新，不再自动更新
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
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const VERSION = '3.0.26';
  const BASE = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/';
  const PARTS = ['payload_01.txt', 'payload_02.txt', 'payload_03.txt', 'payload_04.txt'];
  const MANIFEST = BASE + 'latest.json';
  const INSTALL = BASE + 'Ozon_ChatGPT.user.js';
  const NOTICE_KEY = `kaguraManualUpdateNoticeSeen_${VERSION}`;

  function requestText(url, timeout = 60000) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`,
        timeout,
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        onload(r) {
          if (r.status >= 200 && r.status < 300) resolve(String(r.responseText || '').trim());
          else reject(new Error(`HTTP ${r.status || '未知'}`));
        },
        onerror: () => reject(new Error('网络请求失败')),
        ontimeout: () => reject(new Error('请求超时')),
      });
    });
  }

  async function gunzipBase64(base64) {
    if (typeof DecompressionStream !== 'function') throw new Error('当前浏览器不支持 DecompressionStream，请升级 Chrome/Edge');
    const binary = atob(base64.replace(/\s+/g, ''));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text();
  }

  function compareVersion(a, b) {
    const aa = String(a).split('.').map(v => Number(v) || 0);
    const bb = String(b).split('.').map(v => Number(v) || 0);
    for (let i = 0; i < Math.max(aa.length, bb.length); i += 1) {
      if ((aa[i] || 0) > (bb[i] || 0)) return 1;
      if ((aa[i] || 0) < (bb[i] || 0)) return -1;
    }
    return 0;
  }

  async function checkUpdate() {
    const info = JSON.parse(await requestText(MANIFEST, 30000));
    const latest = String(info.version || '').trim();
    if (!/^\d+(?:\.\d+){1,3}$/.test(latest)) throw new Error('远程版本号无效');
    return {
      latest,
      hasUpdate: compareVersion(latest, VERSION) > 0,
      changelog: Array.isArray(info.changelog) ? info.changelog.map(String) : [],
      installUrl: String(info.install_url || INSTALL),
    };
  }

  function openInstall(url = INSTALL) {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) location.href = url;
  }

  function addStyles() {
    GM_addStyle(`
      .kagura-manual-version-footer{display:flex;justify-content:flex-end;margin-top:8px}
      .kagura-manual-version-btn{border:0;border-radius:999px;background:#0f172a;color:#fff;padding:6px 10px;font:11px/1 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;cursor:pointer;box-shadow:0 3px 10px rgba(15,23,42,.16)}
      .kagura-manual-overlay{position:absolute;inset:0;z-index:999;display:none;align-items:center;justify-content:center;padding:12px;background:rgba(15,23,42,.46)}
      .kagura-manual-overlay.show{display:flex}
      .kagura-manual-modal{width:100%;max-height:90%;overflow:auto;padding:14px;border-radius:12px;background:#fff;color:#182230;box-shadow:0 14px 36px rgba(15,23,42,.28);font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
      .kagura-manual-title{text-align:center;font-weight:800;font-size:16px;margin-bottom:10px}
      .kagura-manual-content,.kagura-manual-result{white-space:pre-wrap;padding:9px 10px;border-radius:8px;background:#f4f7fb;color:#40516b;margin-bottom:9px;max-height:190px;overflow:auto}
      .kagura-manual-actions{display:flex;flex-wrap:wrap;gap:7px;justify-content:center}
      .kagura-manual-actions button{border:0;border-radius:8px;padding:8px 10px;cursor:pointer;font-weight:650;background:#eef3fb;color:#244061}
      .kagura-manual-actions .primary{background:#005bff;color:#fff}
      .kagura-manual-actions .success{background:#e8f7ee;color:#087a3f}
      .kagura-manual-check{display:flex;gap:7px;align-items:center;justify-content:center;margin:10px 0;color:#667085}
    `);
  }

  function showManualModal(panel, autoNotice = false) {
    if (!panel) return;
    let overlay = panel.querySelector(':scope > .kagura-manual-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'kagura-manual-overlay';
      overlay.innerHTML = `
        <div class="kagura-manual-modal">
          <div class="kagura-manual-title">版本信息 V${VERSION}</div>
          <div class="kagura-manual-content">V${VERSION} 更新内容：\n1. 取消 Tampermonkey 自动更新，改为手动检查更新。\n2. 点击脚本窗口右下角版本号，再点击“检查更新”。\n3. 只有主动检查时才访问 GitHub，发现新版后由你手动确认安装。\n4. 固定脚本身份，未来手动安装新版会覆盖此版本，不再每个版本新增一个脚本。\n5. 原有 Ozon / ChatGPT 自动化功能保持不变。</div>
          <div class="kagura-manual-result" data-role="result">不会后台自动检查。点击“检查更新”才会访问 GitHub。</div>
          <label class="kagura-manual-check"><input type="checkbox" data-role="hide"> 下次开启不再提醒本版本更新说明</label>
          <div class="kagura-manual-actions">
            <button type="button" class="success" data-role="check">检查更新</button>
            <button type="button" class="primary" data-role="install" style="display:none">打开更新安装页</button>
            <button type="button" data-role="close">关闭</button>
          </div>
        </div>`;
      panel.appendChild(overlay);
      overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('show'); });
      overlay.querySelector('[data-role="close"]').addEventListener('click', () => {
        if (overlay.querySelector('[data-role="hide"]').checked) GM_setValue(NOTICE_KEY, true);
        overlay.classList.remove('show');
      });
      overlay.querySelector('[data-role="check"]').addEventListener('click', async e => {
        const btn = e.currentTarget;
        const result = overlay.querySelector('[data-role="result"]');
        const install = overlay.querySelector('[data-role="install"]');
        btn.disabled = true;
        btn.textContent = '检查中…';
        install.style.display = 'none';
        result.textContent = '正在检查 GitHub 最新版本…';
        try {
          const info = await checkUpdate();
          if (info.hasUpdate) {
            const notes = info.changelog.length ? `\n\n更新内容：\n${info.changelog.map((v,i)=>`${i+1}. ${v}`).join('\n')}` : '';
            result.textContent = `发现新版本：V${info.latest}\n当前版本：V${VERSION}${notes}\n\n点击“打开更新安装页”后，在 Tampermonkey 页面手动确认更新。`;
            install.style.display = '';
            install.onclick = () => openInstall(info.installUrl);
          } else {
            result.textContent = `当前已经是最新版本：V${VERSION}`;
          }
        } catch (err) {
          result.textContent = `检查失败：${err?.message || err}`;
        } finally {
          btn.disabled = false;
          btn.textContent = '检查更新';
        }
      });
    }
    overlay.querySelector('[data-role="result"]').textContent = '不会后台自动检查。点击“检查更新”才会访问 GitHub。';
    overlay.querySelector('[data-role="install"]').style.display = 'none';
    overlay.querySelector('[data-role="hide"]').checked = false;
    overlay.classList.add('show');
    if (autoNotice) overlay.querySelector('[data-role="hide"]').focus?.();
  }

  function patchPanel(panel) {
    if (!panel || panel.dataset.kaguraManualUpdatePatched === '1') return;
    panel.dataset.kaguraManualUpdatePatched = '1';
    const isGpt = panel.id === 'kagura-gpt-panel';
    const title = panel.querySelector(isGpt ? '.kagura-gpt-header-title' : '.kagura-ozon-header-title');
    if (title) title.textContent = `${isGpt ? 'ChatGPT 批量生图下载器' : 'Ozon SKU主图下载器'} V${VERSION}`;

    const oldModal = panel.querySelector('#kagura-gpt-version-modal');
    oldModal?.classList.remove('show');

    let button = isGpt ? panel.querySelector('[data-role="version"]') : null;
    if (!button) {
      const body = panel.querySelector(isGpt ? '.kagura-gpt-body' : '.kagura-ozon-body');
      if (body) {
        const footer = document.createElement('div');
        footer.className = 'kagura-manual-version-footer';
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'kagura-manual-version-btn';
        button.textContent = `V${VERSION}`;
        footer.appendChild(button);
        body.appendChild(footer);
      }
    } else {
      button.textContent = `V${VERSION}`;
    }
    if (button) {
      button.addEventListener('click', e => {
        e.preventDefault();
        e.stopImmediatePropagation();
        showManualModal(panel, false);
      }, true);
    }

    if (!GM_getValue(NOTICE_KEY, false)) setTimeout(() => showManualModal(panel, true), 450);
  }

  async function start() {
    try {
      addStyles();
      const chunks = await Promise.all(PARTS.map(name => requestText(BASE + name)));
      const code = await gunzipBase64(chunks.join(''));
      (0, eval)(`${code}\n//# sourceURL=Ozon_ChatGPT_payload_base_V3.0.25.user.js`);

      const timer = setInterval(() => {
        const panel = document.querySelector('#kagura-gpt-panel, #kagura-ozon-panel');
        if (!panel) return;
        patchPanel(panel);
        clearInterval(timer);
      }, 250);
      setTimeout(() => clearInterval(timer), 30000);
    } catch (error) {
      console.error(`[Kagura ManualUpdate V${VERSION}] 加载失败：`, error);
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:420px;padding:12px 14px;border-radius:10px;background:#7f1d1d;color:#fff;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28)';
      box.textContent = `Kagura脚本 V${VERSION} 加载失败：${error?.message || error}。请检查网络后刷新页面。`;
      document.documentElement.appendChild(box);
    }
  }

  start();
})();
