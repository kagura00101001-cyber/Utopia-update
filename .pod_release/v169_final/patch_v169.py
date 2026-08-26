from pathlib import Path
import json

USER = Path('POD_ChatGPT.user.js')
s = USER.read_text(encoding='utf-8')

required = [
    '// @name         ChatGPT服装POD统一工作台 V1.2.2',
    '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.8',
    '// @version      1.6.8',
    "const APP_VERSION = '1.6.8';",
    '  function findCreateNearPlusLocal(plus=findPlus()){',
    '  async function waitCreateItemBounded(plus,before,timeout=5200,interval=240){',
    '  const TASK_LIST_RENDER_LIMIT=80;',
    '  function updateHeartbeat(){',
]
for marker in required:
    count = s.count(marker)
    if count != 1:
        raise SystemExit(f'expected exactly one marker {marker!r}, got {count}')

s = s.replace('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.8', '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.9', 1)
s = s.replace('// @version      1.6.8', '// @version      1.6.9', 1)
old_desc = '// @description  服装POD统一工作台：V1.6.8 性能架构修复：任务列表退出1秒心跳并限制可见DOM；创建图片改为加号局部几何探测，删除全页交互扫描。'
new_desc = '// @description  服装POD统一工作台：V1.6.9 修复新版加号菜单局部几何采样过稀导致漏检创建图片；保留V1.6.8性能架构与全页扫描禁令。'
if s.count(old_desc) != 1:
    raise SystemExit('unexpected V1.6.8 description count')
s = s.replace(old_desc, new_desc, 1)
s = s.replace("const APP_VERSION = '1.6.8';", "const APP_VERSION = '1.6.9';", 1)

anchor = ' * - V1.6.8 性能架构修复：任务列表退出 1 秒心跳，任务记录只在真实状态变化/筛选等事件刷新且最多渲染 80 条；创建图片删除 V1.6.7 的 document 全页交互扫描，改为 aria-controls/aria-owns + 当前加号附近 elementFromPoint 局部几何探测。'
note = ' * - V1.6.9 创建图片局部探测修复：根据 V1.6.8 实机日志，标准弹层根为 0 时原离散几何采样可能跨过真实菜单行；改为当前加号上方有限矩形条带的密集 elementFromPoint 采样，只检查命中元素及其祖先，不恢复 document 全页交互扫描。\n'
if s.count(anchor) != 1:
    raise SystemExit('V1.6.8 changelog anchor missing')
s = s.replace(anchor, note + anchor, 1)

start = s.index('  function findCreateNearPlusLocal(plus=findPlus()){')
end = s.index('  function nearbyVisibleCreateFromRoots(before,plus){', start)
old_block = s[start:end]
new_block = r'''  function createCandidateFromPointNode(node,plus){
    if(!(node instanceof Element)||!(plus instanceof Element))return null;
    const re=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i;
    let cur=node;
    for(let depth=0;cur&&cur!==document.body&&depth<10;depth++,cur=cur.parentElement){
      if(!(cur instanceof Element)||!isVisible(cur)||insideMessage(cur)||cur.closest('#kagura-pod-panel')||isSidebarLike(cur))continue;
      const tx=plainText(cur),aria=cur.getAttribute('aria-label')||'';
      if((!re.test(tx)&&!re.test(aria))||/替换人物|人物替换|换人物/.test(`${tx} ${aria}`))continue;
      let target=cur.matches(CREATE_CLICK_SELECTOR)?cur:cur.closest(CREATE_CLICK_SELECTOR);
      if(!(target instanceof Element)||insideMessage(target)||target.closest('#kagura-pod-panel')||isSidebarLike(target))continue;
      const score=createItemScore(target,plus);if(score<0)continue;
      return{e:target,score,tx:plainText(target)||tx||aria,r:target.getBoundingClientRect()};
    }
    return null;
  }
  function findCreateNearPlusLocal(plus=findPlus()){
    if(!(plus instanceof Element))return null;
    let best=null;const inspected=new Set(),pr=plus.getBoundingClientRect();
    const inspectRoot=(root,localSource)=>{
      if(!(root instanceof Element)||inspected.has(root)||!isVisible(root)||insideMessage(root)||root.closest('#kagura-pod-panel')||isSidebarLike(root))return;
      const r=root.getBoundingClientRect();
      if(r.width<70||r.height<24||r.width>760||r.height>820||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)return;
      inspected.add(root);
      const info=findCreateInside(root,plus);
      if(info&&(!best||info.score>best.score))best={...info,localSource};
    };
    for(const root of controlledCreateRoots(plus))inspectRoot(root,'aria-control');
    if(best)return best;

    // V1.6.8 的固定离散 yOffsets 在实机上会恰好跨过真实“创建图片”菜单行。
    // 这里只围绕当前 composer 加号上方有限区域做点采样；每个点只检查命中元素及其祖先，绝不全页 querySelectorAll。
    const px=pr.left+pr.width/2,py=pr.top+pr.height/2;
    const xOffsets=[-80,0,80,160,240,320,400,480];
    for(let dy=80;dy<=560;dy+=24){
      const y=Math.max(2,Math.min(innerHeight-3,py-dy));
      for(const xo of xOffsets){
        const x=Math.max(2,Math.min(innerWidth-3,px+xo));
        const node=document.elementFromPoint(x,y);
        const info=createCandidateFromPointNode(node,plus);
        if(info&&(!best||info.score>best.score))best={...info,localSource:'geometry-strip'};
        if(best&&best.score>=3200)return best;
      }
    }
    return best;
  }
'''
s = s[:start] + new_block + s[end:]

# Keep local scans bounded and slightly less frequent after making each scan denser.
s = s.replace('localScans++;nextLocalAt=now+480;', 'localScans++;nextLocalAt=now+560;', 1)

# Scope / performance regression guards.
if 'function findCreateNearPlusFallback(' in s:
    raise SystemExit('V1.6.7 full-document fallback returned')
if 'document.querySelectorAll(CREATE_CLICK_SELECTOR)' in s:
    raise SystemExit('full-document interactive scan returned')
if 'function createWatcher(' in s or 'observer.observe(document.body||document.documentElement' in s:
    raise SystemExit('whole-body observer regression detected')
if "setInterval(()=>{try{updatePanel()}catch(_){}},1000);" in s:
    raise SystemExit('heavy 1-second updatePanel heartbeat returned')
if 'function createCandidateFromPointNode(' not in s or 'localSource:\'geometry-strip\'' not in s:
    raise SystemExit('new local strip probe missing')
if 'for(let dy=80;dy<=560;dy+=24)' not in s or 'const xOffsets=[-80,0,80,160,240,320,400,480];' not in s:
    raise SystemExit('strip coverage markers missing')
if 'const yOffsets=[-34,-70,-110,-155,-205,-265,-335,-415];' in s:
    raise SystemExit('old sparse V1.6.8 yOffsets still present')
if "const pathBefore=location.pathname;let last;" not in s or 'isSidebarLike' not in s:
    raise SystemExit('route/sidebar safety guards missing')

USER.write_text(s, encoding='utf-8')
header_end = s.index('// ==/UserScript==') + len('// ==/UserScript==')
Path('POD_ChatGPT.meta.js').write_text(s[:header_end] + '\n', encoding='utf-8')

changelog = [
    '根据V1.6.8实机日志修复创建图片漏检：加号aria-expanded=true且标准可见弹层根为0时，原固定8个高度采样点可能从真实菜单项上下两侧跨过。',
    '局部兜底改为围绕当前composer加号上方有限矩形条带进行密集elementFromPoint采样；每个采样点只检查命中元素及其祖先，不执行document全页交互节点扫描，也不引入MutationObserver。',
    '继续优先使用aria-controls/aria-owns与标准可见弹层根；继续严格匹配创建图片/创作图片/生成图片前缀并排除替换人物、侧栏、历史记录和项目区域。',
    'V1.6.8的任务列表事件化刷新、80条DOM上限和轻量1秒heartbeat保持不变；上传恢复、发送at-most-once、生图检测、下载隔离、任务映射与暂停恢复核心不变。',
]
latest = {
    'version': '1.6.9',
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
if h.get('versions', [{}])[0].get('version') != '1.6.8':
    raise SystemExit('history head is not V1.6.8')
h['versions'].insert(0, {'version': '1.6.9', 'date': '2026-08-26', 'notes': changelog})
hp.write_text(json.dumps(h, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
