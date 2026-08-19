from pathlib import Path
import json
import re

ROOT = Path('.')
USER = ROOT / 'Ozon_ChatGPT.user.js'
META = ROOT / 'Ozon_ChatGPT.meta.js'
LATEST = ROOT / 'latest.json'
HISTORY = ROOT / 'history.json'
ARCHIVE = ROOT / 'versions' / 'Ozon_ChatGPT批量生图下载器_V3.2.0.txt'

text = USER.read_text(encoding='utf-8')

text = text.replace('// @version      3.1.2', '// @version      3.2.0', 1)
text = re.sub(r'// @description  .*', '// @description  POD统一热更新版：发现新版弹窗提醒，点击“立刻更新”直接打开固定 GitHub Raw 脚本，由 Tampermonkey 接管覆盖确认。', text, count=1)
text = text.replace("const CURRENT_VERSION = '3.1.2';", "const CURRENT_VERSION = '3.2.0';")
text = text.replace("const APP_VERSION = '3.1.2';", "const APP_VERSION = '3.2.0';")
text = text.replace("const KAGURA_MANUAL_VERSION = '3.1.2';", "const KAGURA_MANUAL_VERSION = '3.2.0';")
text = text.replace('/* ===== Kagura 手动更新检查 V3.1.2（检查版本 + 打开 Tampermonkey） ===== */', '/* ===== Kagura 手动更新检查 V3.2.0（POD统一热更新） ===== */')

startup_pattern = re.compile(r'/\* KAGURA_STARTUP_UPDATE_REMINDER_V3033 \*/\n\(\(\) => \{.*?\n\}\)\(\);\n\n\n\(\(\) => \{', re.S)
startup_replacement = r'''/* KAGURA_POD_STYLE_UPDATE_V320 */
(() => {
  'use strict';

  const CURRENT_VERSION = '3.2.0';
  const MANIFEST_API = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/latest.json?ref=main';
  const INSTALL_URL = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js';
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
        headers: { Accept: 'application/vnd.github.raw+json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        onload(response) {
          if (response.status < 200 || response.status >= 300) return reject(new Error(`HTTP ${response.status || '未知'}`));
          try { resolve(JSON.parse(String(response.responseText || '').trim())); }
          catch (error) { reject(new Error(`版本信息解析失败：${error?.message || error}`)); }
        },
        onerror: () => reject(new Error('检查更新网络请求失败')),
        ontimeout: () => reject(new Error('检查更新请求超时')),
      });
    });
  }

  function openInstallPage(info) {
    const url = String(info?.install_url || INSTALL_URL).trim() || INSTALL_URL;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.documentElement.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
  }

  function ensureStyle() {
    if (document.getElementById('kagura-startup-update-style')) return;
    const style = document.createElement('style');
    style.id = 'kagura-startup-update-style';
    style.textContent = `
      .${OVERLAY_CLASS}{position:absolute;inset:0;z-index:20000;display:flex;align-items:center;justify-content:center;padding:14px;background:rgba(15,23,42,.50)}
      .kagura-startup-update-modal{width:min(380px,95%);max-height:88%;overflow:auto;background:#fff;color:#182230;border-radius:13px;padding:15px;box-shadow:0 18px 44px rgba(15,23,42,.32);font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
      .kagura-startup-update-title{text-align:center;font-size:17px;font-weight:800;margin-bottom:10px}
      .kagura-startup-update-info{white-space:pre-wrap;background:#f8fafc;border:1px solid #e4e7ec;border-radius:9px;padding:10px;max-height:240px;overflow:auto;margin-bottom:11px}
      .kagura-startup-update-tip{font-size:12px;color:#667085;margin:-2px 0 11px;text-align:center}
      .kagura-startup-update-actions{display:flex;gap:7px;justify-content:center;flex-wrap:wrap}
      .kagura-startup-update-actions button{border:0;border-radius:8px;padding:8px 12px;cursor:pointer;font-weight:700}
      .kagura-startup-update-now{background:#005bff;color:#fff}.kagura-startup-update-suppress{background:#fff3e0;color:#9a5a00}.kagura-startup-update-close{background:#eef2f6;color:#344054}
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

  async function showUpdate(info) {
    const panel = await waitForPanel();
    if (!panel || panel.querySelector(`.${OVERLAY_CLASS}`)) return;
    ensureStyle();
    const latest = String(info.version || '').trim();
    const notes = Array.isArray(info.changelog) ? info.changelog.map(String) : [];
    const noteText = notes.length ? notes.map((item, index) => `${index + 1}. ${item}`).join('\n') : '本版本未提供更新说明。';
    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    overlay.innerHTML = `<div class="kagura-startup-update-modal"><div class="kagura-startup-update-title">发现新版本 V${latest}</div><div class="kagura-startup-update-info">当前版本：V${CURRENT_VERSION}\n最新版本：V${latest}\n\n更新内容：\n${noteText}</div><div class="kagura-startup-update-tip">点击“立刻更新”会打开固定 GitHub Raw 脚本，由 Tampermonkey 显示升级/覆盖确认；不会静默自动更新。</div><div class="kagura-startup-update-actions"><button type="button" class="kagura-startup-update-now">立刻更新</button><button type="button" class="kagura-startup-update-suppress">不再提醒</button><button type="button" class="kagura-startup-update-close">关闭</button></div></div>`;
    panel.appendChild(overlay);
    overlay.querySelector('.kagura-startup-update-now').addEventListener('click', () => openInstallPage(info));
    overlay.querySelector('.kagura-startup-update-suppress').addEventListener('click', () => { GM_setValue(SUPPRESS_KEY, latest); overlay.remove(); });
    overlay.querySelector('.kagura-startup-update-close').addEventListener('click', () => overlay.remove());
  }

  async function checkOnOpen() {
    try {
      const info = await requestJson(MANIFEST_API);
      const latest = String(info.version || '').trim();
      if (!/^\d+(?:\.\d+){1,3}$/.test(latest)) return;
      if (compareVersion(latest, CURRENT_VERSION) <= 0) return;
      if (String(GM_getValue(SUPPRESS_KEY, '')) === latest) return;
      await showUpdate(info);
    } catch (error) { console.warn('[Kagura] 启动时检查更新失败：', error); }
  }

  setTimeout(checkOnOpen, 1200);
})();


(() => {'''
text, n = startup_pattern.subn(startup_replacement, text, count=1)
if n != 1: raise SystemExit(f'启动更新模块替换失败: {n}')

text = text.replace("  const KAGURA_MANIFEST_URL = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/latest.json?ref=main';", "  const KAGURA_MANIFEST_URL = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/latest.json?ref=main';\n  const KAGURA_INSTALL_URL = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js';", 1)
text = text.replace("      changelog: Array.isArray(info.changelog) ? info.changelog.map(String) : [],\n    };", "      changelog: Array.isArray(info.changelog) ? info.changelog.map(String) : [],\n      installUrl: String(info.install_url || KAGURA_INSTALL_URL).trim() || KAGURA_INSTALL_URL,\n    };", 1)

old_open = re.compile(r"  function openTampermonkeyUpdate\(result\) \{.*?\n  \}\n\n  function showUpdateDialog", re.S)
new_open = r'''  function openPodStyleUpdate(info) {
    const url = String(info?.installUrl || KAGURA_INSTALL_URL).trim() || KAGURA_INSTALL_URL;
    const a = document.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.style.display = 'none';
    document.documentElement.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
  }

  function showUpdateDialog'''
text, n = old_open.subn(new_open, text, count=1)
if n != 1: raise SystemExit(f'手动更新打开函数替换失败: {n}')

text = text.replace('data-role="open-tm" style="display:none">前往 Tampermonkey 更新</button>', 'data-role="open-tm" style="display:none">立刻更新</button>')
text = text.replace('脚本窗口只负责手动检查版本；实际更新请使用 Tampermonkey 原生“检查用户脚本的更新”并选择 Overwrite（覆盖）。', '检查到新版后，点击“立刻更新”直接打开固定 GitHub Raw 脚本，由 Tampermonkey 显示升级/覆盖确认。不会静默自动更新。')
text = text.replace('`发现新版本：V${info.latest}\\n当前版本：V${KAGURA_MANUAL_VERSION}${notes}\\n\\n点击“前往 Tampermonkey 更新”打开 Tampermonkey 管理面板。为避免产生重复脚本，不会打开 Raw 安装页；实际更新请使用本脚本的“检查用户脚本的更新”并点 Overwrite（覆盖）。`;\n            openTm.style.display = \'\';\n            openTm.onclick = () => openTampermonkeyUpdate(result);', '`发现新版本：V${info.latest}\\n当前版本：V${KAGURA_MANUAL_VERSION}${notes}\\n\\n点击“立刻更新”将打开固定 GitHub Raw 脚本，由 Tampermonkey 接管升级/覆盖确认。`;\n            openTm.style.display = \'\';\n            openTm.onclick = () => openPodStyleUpdate(info);')
text = text.replace('`当前版本：V${KAGURA_MANUAL_VERSION}\\n\\n点击“检查更新”只查询 GitHub 版本；发现新版后可点“前往 Tampermonkey 更新”打开管理面板。实际覆盖仍由 Tampermonkey 原生更新流程完成。`;', '`当前版本：V${KAGURA_MANUAL_VERSION}\\n\\n点击“检查更新”查询 GitHub；发现新版后点“立刻更新”，直接打开固定 Raw 脚本交给 Tampermonkey 覆盖确认。`;')

listener_pattern = re.compile(r"  // Capture the old update buttons before their original click handlers run\.\n  document\.addEventListener\('click', event => \{.*?\n  \}, true\);", re.S)
listener_replacement = r'''  // 版本号仍用于查看历史更新说明；更新按钮统一走 POD Raw 安装链路。
  document.addEventListener('click', event => {
    const versionButton = event.target.closest?.('[data-role="version"], .kagura-gpt-version-btn, .kagura-ozon-version-btn');
    if (versionButton && !versionButton.classList.contains('kagura-manual-update-check')) {
      event.preventDefault(); event.stopImmediatePropagation(); showHistory(versionButton);
    }
  }, true);'''
text, n = listener_pattern.subn(listener_replacement, text, count=1)
if n != 1: raise SystemExit(f'旧更新按钮拦截移除失败: {n}')

for forbidden in ['openTampermonkeyUpdate(result)', '前往 Tampermonkey 更新', '不会打开 Raw 安装页', 'showGuide(updateButton)']:
    if forbidden in text: raise SystemExit(f'仍残留旧更新逻辑: {forbidden}')

USER.write_text(text, encoding='utf-8')

meta = META.read_text(encoding='utf-8')
meta = meta.replace('// @version      3.1.2', '// @version      3.2.0', 1)
meta = re.sub(r'// @description  .*', '// @description  POD统一热更新版：发现新版后直接打开固定 Raw 脚本，由 Tampermonkey 接管升级/覆盖确认。', meta, count=1)
META.write_text(meta, encoding='utf-8')

latest = json.loads(LATEST.read_text(encoding='utf-8'))
latest.update({'version':'3.2.0','published_at':'2026-08-19','install_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js'})
latest['changelog'] = ['热更新模块统一改为当前 POD 脚本的更新方式。','发现新版后弹窗提醒；点击“立刻更新”直接打开固定 GitHub Raw .user.js，由 Tampermonkey 显示升级/覆盖确认。','右下角“检查更新”同步改为同一套 POD 更新链路，不再跳转 Tampermonkey 管理面板或显示旧四步操作卡。','继续保留“不再提醒/关闭”、latest.json 更新说明以及点击版本号查看历史更新说明。','不静默自动下载、不自动替换、不自动执行新版本，最终覆盖必须由用户在 Tampermonkey 页面手动确认。']
LATEST.write_text(json.dumps(latest, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

history = json.loads(HISTORY.read_text(encoding='utf-8'))
versions = [v for v in history.setdefault('versions', []) if str(v.get('version')) != '3.2.0']
versions.insert(0, {'version':'3.2.0','date':'2026-08-19','notes':['热更新模块统一切换为 POD 当前更新方式。','“立刻更新”直接打开固定 GitHub Raw .user.js，由 Tampermonkey 接管升级/覆盖确认。','启动新版提醒与右下角手动检查更新统一使用同一条更新链路。','移除旧的 Tampermonkey 管理面板跳转和四步更新操作卡。','保留手动确认原则，不进行静默自动更新。']})
history['versions'] = versions
HISTORY.write_text(json.dumps(history, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
ARCHIVE.write_text(text, encoding='utf-8')
print('V3.2.0 patch complete')
