from pathlib import Path
import json
import re

USER = Path('Ozon_ChatGPT.user.js')
META = Path('Ozon_ChatGPT.meta.js')
LATEST = Path('latest.json')
HISTORY = Path('history.json')
ARCHIVE = Path('versions/Ozon_ChatGPT批量生图下载器_V3.2.0.txt')

text = USER.read_text(encoding='utf-8')
original = text

# 版本号与描述
text = text.replace('// @version      3.1.2', '// @version      3.2.0', 1)
text = re.sub(r'// @description  .*', '// @description  POD统一热更新版：发现新版后点击“立刻更新”直接打开固定 GitHub Raw 脚本，由 Tampermonkey 接管升级/覆盖确认。', text, count=1)
text = text.replace("const CURRENT_VERSION = '3.1.2';", "const CURRENT_VERSION = '3.2.0';", 1)
text = text.replace("const APP_VERSION = '3.1.2';", "const APP_VERSION = '3.2.0';", 1)
text = text.replace("const KAGURA_MANUAL_VERSION = '3.1.2';", "const KAGURA_MANUAL_VERSION = '3.2.0';", 1)
text = text.replace('/* KAGURA_STARTUP_UPDATE_REMINDER_V3033 */', '/* KAGURA_POD_STYLE_UPDATE_V320 */', 1)
text = text.replace('/* ===== Kagura 手动更新检查 V3.1.2（检查版本 + 打开 Tampermonkey） ===== */', '/* ===== Kagura 手动更新检查 V3.2.0（POD统一热更新） ===== */', 1)

# 启动新版提醒：保留 latest.json / 不再提醒 / 关闭，只把“立刻更新”切换为 POD 的 Raw 安装链路。
manifest_line = "  const MANIFEST_API = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/latest.json?ref=main';"
if manifest_line not in text:
    raise SystemExit('找不到启动更新 MANIFEST_API')
text = text.replace(manifest_line, manifest_line + "\n  const INSTALL_URL = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js';", 1)

open_start = re.compile(r"  function openTampermonkey\(resultBox\) \{.*?\n  \}\n\n  async function showUpdate", re.S)
open_start_repl = r'''  function openPodInstallPage(info) {
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

  async function showUpdate'''
text, n = open_start.subn(open_start_repl, text, count=1)
if n != 1:
    raise SystemExit(f'启动更新打开函数替换失败: {n}')

text = text.replace("    const infoBox = overlay.querySelector('[data-role=\"info\"]');\n    overlay.querySelector('[data-role=\"now\"]').addEventListener('click', () => openTampermonkey(infoBox));", "    overlay.querySelector('[data-role=\"now\"]').addEventListener('click', () => openPodInstallPage(info));", 1)

# 启动弹窗增加 POD 行为说明。
text = text.replace(
    '<button type="button" class="kagura-startup-update-now" data-role="now">立刻更新</button>',
    '<button type="button" class="kagura-startup-update-now" data-role="now" title="打开固定 GitHub Raw 脚本，由 Tampermonkey 接管覆盖确认">立刻更新</button>',
    1,
)

# 右下角手动检查更新也统一走 POD Raw 链路。
manual_manifest = "  const KAGURA_MANIFEST_URL = 'https://api.github.com/repos/kagura00101001-cyber/Utopia-update/contents/latest.json?ref=main';"
if manual_manifest not in text:
    raise SystemExit('找不到手动更新 MANIFEST_URL')
text = text.replace(manual_manifest, manual_manifest + "\n  const KAGURA_INSTALL_URL = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js';", 1)

# checkLatest 返回 installUrl
manual_return_old = "      changelog: Array.isArray(info.changelog) ? info.changelog.map(String) : [],\n    };"
manual_return_new = "      changelog: Array.isArray(info.changelog) ? info.changelog.map(String) : [],\n      installUrl: String(info.install_url || KAGURA_INSTALL_URL).trim() || KAGURA_INSTALL_URL,\n    };"
if manual_return_old not in text:
    raise SystemExit('找不到手动更新 checkLatest 返回块')
text = text.replace(manual_return_old, manual_return_new, 1)

manual_open = re.compile(r"  function openTampermonkeyUpdate\(result\) \{.*?\n  \}\n\n  function showUpdateDialog", re.S)
manual_open_repl = r'''  function openPodStyleUpdate(info) {
    const url = String(info?.installUrl || KAGURA_INSTALL_URL).trim() || KAGURA_INSTALL_URL;
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.display = 'none';
    document.documentElement.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 1000);
  }

  function showUpdateDialog'''
text, n = manual_open.subn(manual_open_repl, text, count=1)
if n != 1:
    raise SystemExit(f'手动更新打开函数替换失败: {n}')

text = text.replace('data-role="open-tm" style="display:none">前往 Tampermonkey 更新</button>', 'data-role="open-tm" style="display:none">立刻更新</button>', 1)
text = text.replace('脚本窗口只负责手动检查版本；实际更新请使用 Tampermonkey 原生“检查用户脚本的更新”并选择 Overwrite（覆盖）。', '检查到新版后，点击“立刻更新”直接打开固定 GitHub Raw 脚本，由 Tampermonkey 显示升级/覆盖确认。不会静默自动更新。', 1)
text = text.replace(
    '`发现新版本：V${info.latest}\\n当前版本：V${KAGURA_MANUAL_VERSION}${notes}\\n\\n点击“前往 Tampermonkey 更新”打开 Tampermonkey 管理面板。为避免产生重复脚本，不会打开 Raw 安装页；实际更新请使用本脚本的“检查用户脚本的更新”并点 Overwrite（覆盖）。`;\n            openTm.style.display = \'\';\n            openTm.onclick = () => openTampermonkeyUpdate(result);',
    '`发现新版本：V${info.latest}\\n当前版本：V${KAGURA_MANUAL_VERSION}${notes}\\n\\n点击“立刻更新”将打开固定 GitHub Raw 脚本，由 Tampermonkey 接管升级/覆盖确认。`;\n            openTm.style.display = \'\';\n            openTm.onclick = () => openPodStyleUpdate(info);',
    1,
)
text = text.replace(
    '`当前版本：V${KAGURA_MANUAL_VERSION}\\n\\n点击“检查更新”只查询 GitHub 版本；发现新版后可点“前往 Tampermonkey 更新”打开管理面板。实际覆盖仍由 Tampermonkey 原生更新流程完成。`;',
    '`当前版本：V${KAGURA_MANUAL_VERSION}\\n\\n点击“检查更新”查询 GitHub；发现新版后点“立刻更新”，直接打开固定 Raw 脚本交给 Tampermonkey 覆盖确认。`;',
    1,
)

# 移除旧 V3.0.34 的更新按钮拦截：历史版本按钮仍保留，更新按钮不再弹四步操作卡。
listener = re.compile(r"  // Capture the old update buttons before their original click handlers run\.\n  document\.addEventListener\('click', event => \{.*?\n  \}, true\);", re.S)
listener_repl = r'''  // 版本号仍用于查看历史更新说明；所有更新按钮统一使用 POD Raw 安装链路。
  document.addEventListener('click', event => {
    const versionButton = event.target.closest?.('[data-role="version"], .kagura-gpt-version-btn, .kagura-ozon-version-btn');
    if (versionButton && !versionButton.classList.contains('kagura-manual-update-check')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showHistory(versionButton);
    }
  }, true);'''
text, n = listener.subn(listener_repl, text, count=1)
if n != 1:
    raise SystemExit(f'旧四步更新拦截移除失败: {n}')

# 安全检查：旧更新路径不得继续生效。
for forbidden in ['openTampermonkeyUpdate(result)', 'openTampermonkey(infoBox)', '前往 Tampermonkey 更新', 'showGuide(updateButton)', '不会打开 Raw 安装页']:
    if forbidden in text:
        raise SystemExit(f'仍残留旧更新路径: {forbidden}')

if text == original:
    raise SystemExit('脚本未发生任何修改')
USER.write_text(text, encoding='utf-8')

meta = META.read_text(encoding='utf-8')
meta = meta.replace('// @version      3.1.2', '// @version      3.2.0', 1)
meta = re.sub(r'// @description  .*', '// @description  POD统一热更新版：新版提醒和手动检查均直接打开固定 Raw 脚本，由 Tampermonkey 接管覆盖确认。', meta, count=1)
META.write_text(meta, encoding='utf-8')

latest = json.loads(LATEST.read_text(encoding='utf-8'))
latest['version'] = '3.2.0'
latest['published_at'] = '2026-08-19'
latest['install_url'] = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js'
latest['changelog'] = [
    '热更新模块统一改为当前 POD 脚本使用的更新方式。',
    '发现新版后弹窗提醒；点击“立刻更新”直接打开固定 GitHub Raw .user.js，由 Tampermonkey 显示升级/覆盖确认。',
    '右下角“检查更新”同步使用同一套 POD 更新链路，不再跳转 Tampermonkey 管理面板。',
    '移除旧的四步更新操作卡；点击版本号查看历史更新说明的功能继续保留。',
    '保持手动热更新原则：不静默下载、不自动替换、不自动执行，最终覆盖由用户在 Tampermonkey 页面确认。',
]
LATEST.write_text(json.dumps(latest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

history = json.loads(HISTORY.read_text(encoding='utf-8'))
versions = [v for v in history.setdefault('versions', []) if str(v.get('version')) != '3.2.0']
versions.insert(0, {
    'version': '3.2.0',
    'date': '2026-08-19',
    'notes': [
        '热更新模块统一切换为 POD 当前更新方式。',
        '启动新版提醒和右下角手动检查更新均直接打开固定 GitHub Raw .user.js。',
        '由 Tampermonkey 接管升级/覆盖确认，不再跳转管理面板或显示四步更新卡。',
        '保留 latest.json 更新说明、不再提醒、关闭和历史更新说明。',
        '继续禁止静默自动更新。',
    ],
})
history['versions'] = versions
HISTORY.write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
ARCHIVE.write_text(text, encoding='utf-8')
print('V3.2.0 POD updater patch complete')
