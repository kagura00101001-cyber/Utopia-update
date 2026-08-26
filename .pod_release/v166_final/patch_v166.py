from pathlib import Path
import json

USER = Path('POD_ChatGPT.user.js')
s = USER.read_text(encoding='utf-8')

required = [
    '// @name         ChatGPT服装POD统一工作台 V1.2.2',
    '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.5',
    '// @version      1.6.5',
    "const APP_VERSION = '1.6.5';",
    '  function createWatcher(plus,before,timeout=5200){',
    '  function resetCreateMenu(){',
    '        const watcher=createWatcher(plus,before,5200);',
    '        const info=await watcher.promise;',
    '  function updateStylePanel(){',
    'updateTemplateWorkflowFolderLabel();renderLogWindow();}',
]
for marker in required:
    count = s.count(marker)
    if count != 1:
        raise SystemExit(f'expected exactly one marker {marker!r}, got {count}')

s = s.replace('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.5', '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.6', 1)
s = s.replace('// @version      1.6.5', '// @version      1.6.6', 1)
old_desc = '// @description  服装POD统一工作台：V1.6.5 创建图片入口改为 MutationObserver 事件驱动检测，移除长对话中的全页交互节点轮询，兼顾兼容性与性能。'
new_desc = '// @description  服装POD统一工作台：V1.6.6 性能专项修复：创建图片改为可见菜单根限时轮询，并停止母版流程每秒读取输出目录句柄。'
if s.count(old_desc) != 1:
    raise SystemExit('unexpected V1.6.5 description count')
s = s.replace(old_desc, new_desc, 1)
s = s.replace("const APP_VERSION = '1.6.5';", "const APP_VERSION = '1.6.6';", 1)

anchor = ' * - V1.6.5 创建图片入口性能修复：改用 MutationObserver 监听当前“+”按钮点击后新增/显隐的菜单节点，仅检查本次变化及新出现的弹层；删除 document 全页交互节点 fallback 轮询，保留精确前缀匹配、当前 composer 绑定、侧栏排除和会话跳转保护。'
note = ' * - V1.6.6 性能专项修复：移除创建图片全页 MutationObserver，改为点击当前 composer 的“+”后仅在可见菜单根内进行短时限频轮询；同时停止视觉风格解析/生产文件设计每秒读取输出目录句柄。上传、发送 at-most-once、生图检测、下载与恢复核心不变。\n'
if s.count(anchor) != 1:
    raise SystemExit('V1.6.5 changelog anchor missing')
s = s.replace(anchor, note + anchor, 1)

start = s.index('  function createWatcher(plus,before,timeout=5200){')
end = s.index('  function resetCreateMenu(){', start)
new_helper = r'''  async function waitCreateItemBounded(plus,before,timeout=5200,interval=180){
    const started=Date.now();let scans=0;
    while(Date.now()-started<timeout){
      if(!state.running)throw new PausedError();
      const info=nearbyVisibleCreateFromRoots(before,plus);scans++;
      if(info)return{...info,source:'bounded-visible-root',scans};
      await sleep(interval);
    }
    return null;
  }
'''
s = s[:start] + new_helper + s[end:]

repls = [
    ('        const watcher=createWatcher(plus,before,5200);\n', ''),
    ("        if(!smartClick(plus)){watcher.stop();throw new Error('当前输入框“+”按钮点击失败');}\n", "        if(!smartClick(plus))throw new Error('当前输入框“+”按钮点击失败');\n"),
    ('        log(`已点击当前输入框左侧“+”按钮（${a}/3），开始事件驱动监听新弹层`);\n', '        log(`已点击当前输入框左侧“+”按钮（${a}/3），开始限时检测可见菜单`);\n'),
    ('        const info=await watcher.promise;\n', '        const info=await waitCreateItemBounded(plus,before,5200,180);\n'),
    ('        if(!info)throw new Error(`加号菜单已尝试打开，但事件监听未发现“创建图片”。${createMenuDiagnostics(plus)}`);\n', '        if(!info)throw new Error(`加号菜单已尝试打开，但限时检测未发现“创建图片”。${createMenuDiagnostics(plus)}`);\n'),
    ('        log(`事件监听已定位“创建图片”菜单项：${info.tx||\'创建图片\'}；来源 ${info.source||\'mutation\'}；坐标 ${Math.round(info.r.left+info.r.width/2)},${Math.round(info.r.top+info.r.height/2)}`);\n', '        log(`已定位“创建图片”菜单项：${info.tx||\'创建图片\'}；来源 ${info.source||\'bounded-poll\'}；坐标 ${Math.round(info.r.left+info.r.width/2)},${Math.round(info.r.top+info.r.height/2)}`);\n'),
]
for old, new in repls:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'activateCreate marker mismatch ({count}): {old[:90]!r}')
    s = s.replace(old, new, 1)

old_tail = 'updateTemplateWorkflowFolderLabel();renderLogWindow();}'
if s.count(old_tail) != 1:
    raise SystemExit('updateStylePanel folder-read marker mismatch')
s = s.replace(old_tail, 'renderLogWindow();}', 1)

if 'function createWatcher(' in s or 'watcher.promise' in s or 'watcher.stop()' in s:
    raise SystemExit('createWatcher remnants remain')
if 'observer.observe(document.body||document.documentElement' in s:
    raise SystemExit('whole-body create MutationObserver still present')
if 'function waitCreateItemBounded(' not in s:
    raise SystemExit('bounded create-image polling helper missing')
if "const pathBefore=location.pathname;let last;" not in s:
    raise SystemExit('conversation route guard missing')
if 'isSidebarLike' not in s:
    raise SystemExit('sidebar exclusion missing')
if 'findCreateItemFallback' in s:
    raise SystemExit('full-document fallback must remain absent')

usp = s.index('  function updateStylePanel(){')
uep = s.index('\n\n  function renderWorkspace(){', usp)
if 'updateTemplateWorkflowFolderLabel()' in s[usp:uep]:
    raise SystemExit('per-second output folder handle read still present in updateStylePanel')

for stable in [
    'async function waitUploads(',
    'async function sendPrompt(',
    'async function processBatch()',
]:
    if stable not in s:
        raise SystemExit(f'stable core marker missing: {stable}')

USER.write_text(s, encoding='utf-8')
header_end = s.index('// ==/UserScript==') + len('// ==/UserScript==')
Path('POD_ChatGPT.meta.js').write_text(s[:header_end] + '\n', encoding='utf-8')

changelog = [
    '创建图片入口移除 V1.6.5 的全页 MutationObserver；点击当前 composer 的“+”后，只对可见菜单根进行约 180ms 间隔、最长约 5.2 秒的有限检测。',
    '继续保留当前 composer 绑定、严格“创建图片/创作图片/生成图片”前缀匹配、侧栏排除与会话路径保护，不恢复 document 全页 fallback。',
    '视觉风格解析/生产文件设计的 1 秒状态刷新不再读取 IndexedDB 输出目录句柄；目录标签仅在启动、切换流程、工作区渲染或选择目录等真实事件更新。',
    '上传恢复、发送 at-most-once、生图检测、结果映射、独立下载、暂停继续与夜间恢复核心保持不变。',
]
latest = {
    'version': '1.6.6',
    'install_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
    'download_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
    'published_at': '2026-08-26',
    'changelog': changelog,
}
latest_text = json.dumps(latest, ensure_ascii=False, indent=2) + '\n'
Path('POD_ChatGPT.latest.json').write_text(latest_text, encoding='utf-8')
Path('POD_ChatGPT_latest.json').write_text(latest_text, encoding='utf-8')

hp = Path('POD_ChatGPT.history.json')
h = json.loads(hp.read_text(encoding='utf-8'))
if h.get('versions', [{}])[0].get('version') != '1.6.5':
    raise SystemExit('history head is not V1.6.5')
h['versions'].insert(0, {'version': '1.6.6', 'date': '2026-08-26', 'notes': changelog})
hp.write_text(json.dumps(h, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
