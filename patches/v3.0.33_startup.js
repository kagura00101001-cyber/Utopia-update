/* KAGURA_STARTUP_UPDATE_REMINDER_V3033 */
(() => {
  'use strict';

  const CURRENT_VERSION = '3.0.33';
  const MANIFEST_API = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/latest.json?ref=main';
  const SUPPRESS_KEY = 'kaguraStartupUpdateSuppressVersion';
  const OVERLAY_CLASS = 'kagura-startup-update-overlay';

  function compareVersion(a, b) {
    const aa = String(a).split('.').map(v => Number(v) || 0);
    const bb = String(b).split('.').map(v => Number(v) || 0);
    const n = Math.max(aa.length, bb.length);
    for (let i = 0; i < n; i += 1) {
      if ((aa[i] || 0) > (bb[i] || 0)) return 1;
      if ((aa[i] || 0) < (bb[i] || 0)) return -1;
    }
    return 0;
  }

  function requestJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`,
        timeout: 30000,
        headers: {
          Accept: 'application/vnd.github.raw+json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error(`HTTP ${response.status || '未知'}`));
            return;
          }
          try {
            resolve(JSON.parse(String(response.responseText || '').trim()));
          } catch (error) {
            reject(new Error(`版本信息解析失败：${error?.message || error}`));
          }
        },
        onerror: () => reject(new Error('检查更新网络请求失败')),
        ontimeout: () => reject(new Error('检查更新请求超时')),
      });
    });
  }

  function removeLegacyReleaseNote() {
    document.querySelectorAll('#kagura-gpt-version-modal, [id*="version-modal"]').forEach(node => {
      if (String(node.textContent || '').includes('脚本更新说明')) node.remove();
    });
  }

  const legacyStyle = document.createElement('style');
  legacyStyle.id = 'kagura-disable-legacy-release-note';
  legacyStyle.textContent = '#kagura-gpt-version-modal{display:none!important;}';
  (document.head || document.documentElement).appendChild(legacyStyle);

  const legacyObserver = new MutationObserver(removeLegacyReleaseNote);
  legacyObserver.observe(document.documentElement, { childList: true, subtree: true });
  removeLegacyReleaseNote();

  function ensureStyle() {
    if (document.getElementById('kagura-startup-update-style')) return;
    const style = document.createElement('style');
    style.id = 'kagura-startup-update-style';
    style.textContent = `
      .${OVERLAY_CLASS}{position:absolute;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(15,23,42,.50)}
      .kagura-startup-update-modal{width:min(380px,95%);max-height:88%;overflow:auto;background:#fff;color:#182230;border-radius:13px;padding:15px;box-shadow:0 18px 44px rgba(15,23,42,.32);font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
      .kagura-startup-update-title{text-align:center;font-size:17px;font-weight:800;margin-bottom:10px}
      .kagura-startup-update-info{white-space:pre-wrap;background:#f8fafc;border:1px solid #e4e7ec;border-radius:9px;padding:10px;max-height:240px;overflow:auto;margin-bottom:11px}
      .kagura-startup-update-actions{display:flex;gap:7px;justify-content:center;flex-wrap:wrap}
      .kagura-startup-update-actions button{border:0;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:700}
      .kagura-startup-update-now{background:#005bff;color:#fff}
      .kagura-startup-update-suppress{background:#fff3e0;color:#9a5a00}
      .kagura-startup-update-close{background:#eef2f6;color:#344054}
    `;
    document.documentElement.appendChild(style);
  }

  async function waitForPanel(timeoutMs = 30000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const panel = document.querySelector('#kagura-gpt-panel, #kagura-ozon-panel');
      if (panel) return panel;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return null;
  }

  function openTampermonkey(resultBox) {
    const steps = '请在 Tampermonkey 中找到“ Ozon主图下载 + ChatGPT批量生图助手 ” → 编辑/铅笔 → 设置 → 检查用户脚本的更新 → Overwrite（覆盖）。';
    try {
      const tm = unsafeWindow?.external?.Tampermonkey || window?.external?.Tampermonkey;
      if (tm && typeof tm.openOptions === 'function') {
        tm.openOptions('nav=dashboard');
        resultBox.textContent += `\n\n已尝试打开 Tampermonkey 管理面板。${steps}`;
        return;
      }
    } catch (error) {
      console.warn('[Kagura] 无法直接打开 Tampermonkey：', error);
    }
    resultBox.textContent += `\n\n浏览器未开放 Tampermonkey 管理面板跳转接口。${steps}`;
  }

  async function showUpdate(info) {
    const panel = await waitForPanel();
    if (!panel || panel.querySelector(`.${OVERLAY_CLASS}`)) return;
    ensureStyle();

    const latest = String(info.version || '').trim();
    const notes = Array.isArray(info.changelog) ? info.changelog.map(String) : [];
    const noteText = notes.length
      ? notes.map((item, index) => `${index + 1}. ${item}`).join('\n')
      : '本版本未提供更新说明。';

    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.innerHTML = `
      <div class="kagura-startup-update-modal">
        <div class="kagura-startup-update-title">发现新版本 V${latest}</div>
        <div class="kagura-startup-update-info" data-role="info">当前版本：V${CURRENT_VERSION}\n最新版本：V${latest}\n\n更新内容：\n${noteText}</div>
        <div class="kagura-startup-update-actions">
          <button type="button" class="kagura-startup-update-now" data-role="now">立刻更新</button>
          <button type="button" class="kagura-startup-update-suppress" data-role="suppress">不再提醒</button>
          <button type="button" class="kagura-startup-update-close" data-role="close">关闭</button>
        </div>
      </div>`;
    panel.appendChild(overlay);

    const infoBox = overlay.querySelector('[data-role="info"]');
    overlay.querySelector('[data-role="now"]').addEventListener('click', () => openTampermonkey(infoBox));
    overlay.querySelector('[data-role="suppress"]').addEventListener('click', () => {
      GM_setValue(SUPPRESS_KEY, latest);
      overlay.remove();
    });
    overlay.querySelector('[data-role="close"]').addEventListener('click', () => overlay.remove());
  }

  async function checkOnOpen() {
    try {
      const info = await requestJson(MANIFEST_API);
      const latest = String(info.version || '').trim();
      if (!/^\d+(?:\.\d+){1,3}$/.test(latest)) return;
      if (compareVersion(latest, CURRENT_VERSION) <= 0) return;
      if (String(GM_getValue(SUPPRESS_KEY, '')) === latest) return;
      await showUpdate(info);
    } catch (error) {
      console.warn('[Kagura] 启动时检查更新失败：', error);
    }
  }

  setTimeout(checkOnOpen, 1200);
})();
