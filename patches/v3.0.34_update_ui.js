/* KAGURA_UPDATE_UI_V3034 */
(() => {
  'use strict';

  const HISTORY_API = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/history.json?ref=main';
  const GUIDE_OVERLAY = 'kagura-update-guide-overlay-v3034';
  const HISTORY_OVERLAY = 'kagura-update-history-overlay-v3034';

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
            reject(new Error(`历史更新说明解析失败：${error?.message || error}`));
          }
        },
        onerror: () => reject(new Error('网络请求失败')),
        ontimeout: () => reject(new Error('请求超时')),
      });
    });
  }

  function findPanel(node) {
    return node?.closest?.('#kagura-gpt-panel, #kagura-ozon-panel')
      || document.querySelector('#kagura-gpt-panel, #kagura-ozon-panel');
  }

  function ensureStyle() {
    if (document.getElementById('kagura-update-ui-style-v3034')) return;
    const style = document.createElement('style');
    style.id = 'kagura-update-ui-style-v3034';
    style.textContent = `
      .${GUIDE_OVERLAY}, .${HISTORY_OVERLAY}{position:absolute;inset:0;z-index:40000;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(15,23,42,.56)}
      .kagura-update-guide-card,.kagura-update-history-card{width:min(380px,96%);max-height:88%;display:flex;flex-direction:column;background:#fff;color:#182230;border-radius:13px;box-shadow:0 18px 46px rgba(15,23,42,.34);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;overflow:hidden}
      .kagura-update-card-head{padding:14px 15px 10px;text-align:center;font-size:17px;font-weight:800;border-bottom:1px solid #eef2f6}
      .kagura-update-guide-body{padding:13px 15px}
      .kagura-update-guide-tip{padding:9px 10px;margin-bottom:10px;background:#f0f7ff;border:1px solid #cfe2ff;border-radius:9px;color:#174ea6;font-weight:700}
      .kagura-update-guide-step{display:flex;gap:9px;align-items:flex-start;margin:9px 0}
      .kagura-update-guide-num{flex:0 0 24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#10a37f;color:#fff;font-weight:800;font-size:12px}
      .kagura-update-guide-text{padding-top:2px}
      .kagura-update-guide-text b{font-weight:800}
      .kagura-update-card-actions{display:flex;justify-content:center;gap:8px;padding:10px 14px 14px;border-top:1px solid #eef2f6;background:#fff}
      .kagura-update-card-actions button{border:0;border-radius:8px;padding:8px 14px;cursor:pointer;font-weight:750}
      .kagura-update-guide-close,.kagura-update-history-close{background:#10a37f;color:#fff}
      .kagura-update-history-body{padding:10px 12px;overflow:auto;min-height:120px}
      .kagura-update-history-meta{padding:8px 10px;margin-bottom:9px;background:#f8fafc;border:1px solid #e4e7ec;border-radius:8px;color:#475467}
      .kagura-update-history-item{border:1px solid #e4e7ec;border-radius:9px;margin-bottom:8px;overflow:hidden;background:#fff}
      .kagura-update-history-item summary{cursor:pointer;list-style:none;padding:10px 11px;font-weight:800;background:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:8px}
      .kagura-update-history-item summary::-webkit-details-marker{display:none}
      .kagura-update-history-version{color:#087a3f}
      .kagura-update-history-date{font-size:11px;color:#667085;font-weight:600}
      .kagura-update-history-notes{padding:9px 12px 10px;margin:0;white-space:pre-wrap;color:#344054}
      .kagura-update-history-loading{padding:18px 8px;text-align:center;color:#667085}
    `;
    document.documentElement.appendChild(style);
  }

  function showGuide(sourceNode) {
    const panel = findPanel(sourceNode);
    if (!panel) return;
    ensureStyle();
    panel.querySelector(`.${GUIDE_OVERLAY}`)?.remove();

    const overlay = document.createElement('div');
    overlay.className = GUIDE_OVERLAY;
    overlay.innerHTML = `
      <div class="kagura-update-guide-card">
        <div class="kagura-update-card-head">最快更新方式</div>
        <div class="kagura-update-guide-body">
          <div class="kagura-update-guide-tip">不需要滚动更新说明，按下面 4 步即可原地覆盖更新。</div>
          <div class="kagura-update-guide-step"><span class="kagura-update-guide-num">1</span><div class="kagura-update-guide-text">点击浏览器右上角 <b>Tampermonkey</b> 图标。</div></div>
          <div class="kagura-update-guide-step"><span class="kagura-update-guide-num">2</span><div class="kagura-update-guide-text">进入 <b>管理面板</b>，找到“ Ozon主图下载 + ChatGPT批量生图助手 ”。</div></div>
          <div class="kagura-update-guide-step"><span class="kagura-update-guide-num">3</span><div class="kagura-update-guide-text">点右侧 <b>铅笔/编辑 → 设置 → 检查用户脚本的更新</b>。</div></div>
          <div class="kagura-update-guide-step"><span class="kagura-update-guide-num">4</span><div class="kagura-update-guide-text">更新页点击 <b>Overwrite（覆盖）</b>。不会新增第二条脚本。</div></div>
        </div>
        <div class="kagura-update-card-actions"><button type="button" class="kagura-update-guide-close">我知道了</button></div>
      </div>`;
    panel.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.kagura-update-guide-close').addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });
  }

  async function showHistory(sourceNode) {
    const panel = findPanel(sourceNode);
    if (!panel) return;
    ensureStyle();
    panel.querySelector(`.${HISTORY_OVERLAY}`)?.remove();

    const overlay = document.createElement('div');
    overlay.className = HISTORY_OVERLAY;
    overlay.innerHTML = `
      <div class="kagura-update-history-card">
        <div class="kagura-update-card-head">历史更新说明</div>
        <div class="kagura-update-history-body"><div class="kagura-update-history-loading">正在读取 GitHub 历史记录…</div></div>
        <div class="kagura-update-card-actions"><button type="button" class="kagura-update-history-close">关闭</button></div>
      </div>`;
    panel.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.querySelector('.kagura-update-history-close').addEventListener('click', close);
    overlay.addEventListener('click', event => {
      if (event.target === overlay) close();
    });

    const body = overlay.querySelector('.kagura-update-history-body');
    try {
      const data = await requestJson(HISTORY_API);
      const versions = Array.isArray(data.versions) ? data.versions : [];
      body.textContent = '';

      const meta = document.createElement('div');
      meta.className = 'kagura-update-history-meta';
      meta.textContent = `当前安装：V${typeof GM_info !== 'undefined' && GM_info?.script?.version ? GM_info.script.version : '未知'}${data.since ? `\n历史记录：V${data.since} 起` : ''}`;
      body.appendChild(meta);

      if (!versions.length) {
        const empty = document.createElement('div');
        empty.className = 'kagura-update-history-loading';
        empty.textContent = '暂无历史更新说明。';
        body.appendChild(empty);
        return;
      }

      versions.forEach((entry, index) => {
        const details = document.createElement('details');
        details.className = 'kagura-update-history-item';
        if (index === 0) details.open = true;

        const summary = document.createElement('summary');
        const version = document.createElement('span');
        version.className = 'kagura-update-history-version';
        version.textContent = `V${String(entry.version || '')}`;
        const date = document.createElement('span');
        date.className = 'kagura-update-history-date';
        date.textContent = String(entry.date || '');
        summary.append(version, date);

        const notes = document.createElement('div');
        notes.className = 'kagura-update-history-notes';
        const list = Array.isArray(entry.notes) ? entry.notes.map(String) : [];
        notes.textContent = list.length ? list.map((item, i) => `${i + 1}. ${item}`).join('\n') : '无详细说明。';

        details.append(summary, notes);
        body.appendChild(details);
      });
    } catch (error) {
      body.innerHTML = '';
      const failed = document.createElement('div');
      failed.className = 'kagura-update-history-loading';
      failed.textContent = `读取历史更新说明失败：${error?.message || error}`;
      body.appendChild(failed);
    }
  }

  // Capture the old update buttons before their original click handlers run.
  document.addEventListener('click', event => {
    const updateButton = event.target.closest?.('.kagura-startup-update-now, .kagura-manual-update-actions [data-role="open-tm"]');
    if (updateButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showGuide(updateButton);
      return;
    }

    const versionButton = event.target.closest?.('[data-role="version"], .kagura-gpt-version-btn, .kagura-ozon-version-btn');
    if (versionButton && !versionButton.classList.contains('kagura-manual-update-check')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showHistory(versionButton);
    }
  }, true);
})();
