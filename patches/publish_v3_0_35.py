from pathlib import Path
import json

ROOT = Path('.')
SCRIPT = ROOT / 'Ozon_ChatGPT.user.js'
META = ROOT / 'Ozon_ChatGPT.meta.js'
LATEST = ROOT / 'latest.json'
HISTORY = ROOT / 'history.json'
VERSIONS = ROOT / 'versions'

s = SCRIPT.read_text(encoding='utf-8')
if '// @version      3.0.34' not in s:
    raise SystemExit('Expected GitHub baseline V3.0.34 was not found')

VERSIONS.mkdir(exist_ok=True)
(VERSIONS / 'Ozon_ChatGPT批量生图下载器_V3.0.34.txt').write_text(s, encoding='utf-8')

s = s.replace('// @version      3.0.34', '// @version      3.0.35', 1)
s = s.replace("const APP_VERSION = '3.0.34';", "const APP_VERSION = '3.0.35';", 1)
s = s.replace("const KAGURA_MANUAL_VERSION = '3.0.34';", "const KAGURA_MANUAL_VERSION = '3.0.35';", 1)
s = s.replace("const CURRENT_VERSION = '3.0.34';", "const CURRENT_VERSION = '3.0.35';", 1)
s = s.replace(
    '// @description  完整正式版：新版提醒提供独立更新操作卡；点击右下角版本号可查看 GitHub 历史更新说明。',
    '// @description  完整正式版：新增清空原图目录和成品目录全部图片功能，二次确认防误删；保留历史更新与原生覆盖更新。',
    1,
)

old_source_picker = "const handle = await picker.call(unsafeWindow, { mode: 'read' });\n      await cSaveHandle(C_SOURCE_DIR_KEY, handle);"
new_source_picker = "const handle = await picker.call(unsafeWindow, { mode: 'readwrite' });\n      await cSaveHandle(C_SOURCE_DIR_KEY, handle);"
if old_source_picker not in s:
    raise SystemExit('Source folder picker patch target not found')
s = s.replace(old_source_picker, new_source_picker, 1)

choose_output = """    async function cChooseOutputFolder() {
      const picker = unsafeWindow.showDirectoryPicker || window.showDirectoryPicker;
      if (typeof picker !== 'function') throw new Error('当前浏览器不支持文件夹选择，请使用最新版Chrome或Edge。');
      const handle = await picker.call(unsafeWindow, { mode: 'readwrite' });
      await cSaveHandle(C_OUTPUT_DIR_KEY, handle);
      cOutputText.textContent = handle.name;
      cOutputText.title = handle.name;
      cLog(`成品文件夹已选择：${handle.name}`, 'success');
    }
"""
clear_functions = """
    async function cDeleteImagesRecursive(directoryHandle) {
      let removed = 0;
      for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file') {
          if (!cIsImageName(entry.name)) continue;
          await directoryHandle.removeEntry(entry.name);
          removed += 1;
          continue;
        }
        if (entry.kind === 'directory') {
          removed += await cDeleteImagesRecursive(entry);
        }
      }
      return removed;
    }

    async function cClearSourceAndOutputImages() {
      if (cState.running) throw new Error('请先暂停任务，再执行清空图片。');

      const source = await cGetHandle(C_SOURCE_DIR_KEY);
      const output = await cGetHandle(C_OUTPUT_DIR_KEY);
      if (!source) throw new Error('请先选择原图目录');
      if (!output) throw new Error('请先选择成品目录');

      const sourceName = source.name || '原图目录';
      const outputName = output.name || '成品目录';
      const first = confirm(`确定清空“${sourceName}”和“${outputName}”中的所有图片吗？\n\n只删除 JPG/JPEG/PNG/WEBP/GIF/BMP 图片，其他文件保留。此操作不可恢复。`);
      if (!first) {
        cLog('已取消清空图片', 'info');
        return;
      }

      const second = confirm(`二次确认：真的要删除两个目录中的全部图片吗？\n\n原图目录：${sourceName}\n成品目录：${outputName}`);
      if (!second) {
        cLog('二次确认未通过，已取消清空图片', 'info');
        return;
      }

      if ((await cPermission(source, 'readwrite', true)) !== 'granted') throw new Error('没有获得原图目录读写权限');
      if ((await cPermission(output, 'readwrite', true)) !== 'granted') throw new Error('没有获得成品目录读写权限');

      let sameDirectory = false;
      try {
        if (typeof source.isSameEntry === 'function') sameDirectory = await source.isSameEntry(output);
      } catch (_) {}

      const removedSource = await cDeleteImagesRecursive(source);
      const removedOutput = sameDirectory ? 0 : await cDeleteImagesRecursive(output);

      cState.running = false;
      cState.imagePaths = [];
      cState.index = 0;
      cState.currentBatch = [];
      cState.phase = 'idle';
      cSaveState();

      if (sameDirectory) {
        cLog(`原图目录与成品目录为同一目录，共删除 ${removedSource} 张图片`, 'warn');
      } else {
        cLog(`清空完成：原图目录删除 ${removedSource} 张，成品目录删除 ${removedOutput} 张`, 'warn');
      }
      if (cStatusText) cStatusText.textContent = '图片目录已清空，请重新放入原图后扫描';
    }
"""
if choose_output not in s:
    raise SystemExit('Output folder function patch target not found')
if 'function cClearSourceAndOutputImages' in s:
    raise SystemExit('Clear-images function already exists unexpectedly')
s = s.replace(choose_output, choose_output + clear_functions, 1)

old_buttons = """        cCreateButton('导出待确认', 'kagura-gpt-success', cExportPendingQueue),
        cCreateButton('跳过当前批', '', cSkipBatch),
        cCreateButton('清空进度', 'kagura-gpt-danger', cReset),
        cCreateButton('清除授权', 'kagura-gpt-danger', cForgetFolders),"""
new_buttons = """        cCreateButton('导出待确认', 'kagura-gpt-success', cExportPendingQueue),
        cCreateButton('跳过当前批', '', cSkipBatch),
        cCreateButton('清空图片', 'kagura-gpt-danger', cClearSourceAndOutputImages),
        cCreateButton('清空进度', 'kagura-gpt-danger', cReset),
        cCreateButton('清除授权', 'kagura-gpt-danger', cForgetFolders),"""
if old_buttons not in s:
    raise SystemExit('Buttons patch target not found')
s = s.replace(old_buttons, new_buttons, 1)

SCRIPT.write_text(s, encoding='utf-8')
(VERSIONS / 'Ozon_ChatGPT批量生图下载器_V3.0.35.txt').write_text(s, encoding='utf-8')

META.write_text("""// ==UserScript==
// @name         Ozon主图下载 + ChatGPT批量生图助手
// @namespace    https://github.com/Kagura-userscripts
// @version      3.0.35
// @description  Ozon主图下载 + ChatGPT批量生图助手 更新元数据
// @author       Kagura
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js
// ==/UserScript==
""", encoding='utf-8')

changelog = [
    '新增“清空图片”按钮，一次清空原图目录和成品目录中的全部图片。',
    '危险删除操作必须连续进行两次确认，任意一次取消都不会删除文件。',
    '支持递归清理子文件夹中的 JPG/JPEG/PNG/WEBP/GIF/BMP，其他非图片文件保持不变。',
    '原图目录从本版起申请读写权限；旧目录授权在执行清空时会再次请求读写权限。',
    '从 V3.0.34 起在 GitHub versions 目录保留每个正式版本的 TXT 归档，后续本项目脚本默认同步上传 GitHub。',
]
latest = {
    'version': '3.0.35',
    'install_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js',
    'published_at': '2026-08-13',
    'changelog': changelog,
}
LATEST.write_text(json.dumps(latest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

history = json.loads(HISTORY.read_text(encoding='utf-8')) if HISTORY.exists() else {
    'title': 'Ozon主图下载 + ChatGPT批量生图助手',
    'since': '3.0.34',
    'versions': [],
}
history['since'] = '3.0.34'
items = [x for x in history.get('versions', []) if str(x.get('version')) != '3.0.35']
items.insert(0, {'version': '3.0.35', 'date': '2026-08-13', 'notes': changelog})
history['versions'] = items
HISTORY.write_text(json.dumps(history, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
