from pathlib import Path
import json

USER = Path('POD_ChatGPT.user.js')
s = USER.read_text(encoding='utf-8')

required = [
    '// @name         ChatGPT服装POD统一工作台 V1.2.2',
    '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.6',
    '// @version      1.6.6',
    "const APP_VERSION = '1.6.6';",
    "const CREATE_MENU_ROOT_SELECTOR='[popover],[data-radix-popper-content-wrapper],[data-radix-menu-content],[data-headlessui-portal],[data-floating-ui-portal],[role=\"menu\"],[role=\"dialog\"],[role=\"listbox\"],[data-state=\"open\"]';",
    '  function nearbyVisibleCreateFromRoots(before,plus){',
    '  async function waitCreateItemBounded(plus,before,timeout=5200,interval=180){',
]
for marker in required:
    count = s.count(marker)
    if count != 1:
        raise SystemExit(f'expected exactly one marker {marker!r}, got {count}')

s = s.replace('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.6', '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.7', 1)
s = s.replace('// @version      1.6.6', '// @version      1.6.7', 1)
old_desc = '// @description  服装POD统一工作台：V1.6.6 性能专项修复：创建图片改为可见菜单根限时轮询，并停止母版流程每秒读取输出目录句柄。'
new_desc = '// @description  服装POD统一工作台：V1.6.7 修复 ChatGPT 新版“+”菜单未命中标准弹层根导致无法定位创建图片；保持限频近加号兜底与性能保护。'
if s.count(old_desc) != 1:
    raise SystemExit('unexpected V1.6.6 description count')
s = s.replace(old_desc, new_desc, 1)
s = s.replace("const APP_VERSION = '1.6.6';", "const APP_VERSION = '1.6.7';", 1)

anchor = ' * - V1.6.6 性能专项修复：移除创建图片全页 MutationObserver，改为点击当前 composer 的“+”后仅在可见菜单根内进行短时限频轮询；同时停止视觉风格解析/生产文件设计每秒读取输出目录句柄。上传、发送 at-most-once、生图检测、下载与恢复核心不变。'
note = ' * - V1.6.7 创建图片菜单兼容修复：移除会误把侧栏当弹层的通用 [data-state="open"] 根匹配；当当前 composer 的“+”已确认 aria-expanded=true 时，增加低频、少次数、仅交互节点且按加号距离过滤的兜底定位，不恢复全页 div/span 高频扫描。\n'
if s.count(anchor) != 1:
    raise SystemExit('V1.6.6 changelog anchor missing')
s = s.replace(anchor, note + anchor, 1)

old_root = "const CREATE_MENU_ROOT_SELECTOR='[popover],[data-radix-popper-content-wrapper],[data-radix-menu-content],[data-headlessui-portal],[data-floating-ui-portal],[role=\"menu\"],[role=\"dialog\"],[role=\"listbox\"],[data-state=\"open\"]';"
new_root = "const CREATE_MENU_ROOT_SELECTOR='[popover],[data-radix-popper-content-wrapper],[data-radix-menu-content],[data-headlessui-portal],[data-floating-ui-portal],[role=\"menu\"],[role=\"dialog\"],[role=\"listbox\"]';"
s = s.replace(old_root, new_root, 1)

insert_at = s.index('  function nearbyVisibleCreateFromRoots(before,plus){')
new_helper = r'''  function findCreateNearPlusFallback(plus=findPlus()){
    if(!(plus instanceof Element))return null;
    const pr=plus.getBoundingClientRect(),re=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i,cand=[];
    for(const e of document.querySelectorAll(CREATE_CLICK_SELECTOR)){
      if(!(e instanceof Element)||!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel')||isSidebarLike(e))continue;
      const tx=plainText(e),aria=e.getAttribute('aria-label')||'';
      if((!re.test(tx)&&!re.test(aria))||/替换人物|人物替换|换人物/.test(`${tx} ${aria}`))continue;
      const r=e.getBoundingClientRect();if(r.width<70||r.height<22||r.height>190||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)continue;
      const dx=Math.max(0,pr.left-r.right,r.left-pr.right),dy=Math.max(0,pr.top-r.bottom,r.top-pr.bottom);
      if(dx>560||dy>620||Math.hypot(dx,dy)>760)continue;
      const score=createItemScore(e,plus);if(score<0)continue;
      cand.push({e,score:score+Math.max(0,700-Math.hypot(dx,dy)),tx:tx||aria,r});
    }
    cand.sort((a,b)=>b.score-a.score);return cand[0]||null;
  }
'''
s = s[:insert_at] + new_helper + s[insert_at:]

old_wait = '''  async function waitCreateItemBounded(plus,before,timeout=5200,interval=180){
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
new_wait = '''  async function waitCreateItemBounded(plus,before,timeout=5200,interval=180){
    const started=Date.now();let scans=0,fallbackScans=0,nextFallbackAt=0;
    while(Date.now()-started<timeout){
      if(!state.running)throw new PausedError();
      const info=nearbyVisibleCreateFromRoots(before,plus);scans++;
      if(info)return{...info,source:'bounded-visible-root',scans,fallbackScans};
      const now=Date.now(),expanded=plus?.getAttribute?.('aria-expanded')==='true';
      if(expanded&&fallbackScans<7&&now>=nextFallbackAt){
        const fallback=findCreateNearPlusFallback(plus);fallbackScans++;nextFallbackAt=now+650;
        if(fallback)return{...fallback,source:'bounded-near-plus',scans,fallbackScans};
      }
      await sleep(interval);
    }
    return null;
  }
'''
if s.count(old_wait) != 1:
    raise SystemExit('waitCreateItemBounded body mismatch')
s = s.replace(old_wait, new_wait, 1)

old_diag = "    const p=plus?`aria-expanded=${plus.getAttribute('aria-expanded')||'-'} aria-haspopup=${plus.getAttribute('aria-haspopup')||'-'} testid=${plus.getAttribute('data-testid')||'-'}`:'+按钮未找到';\n    return `${p}；当前可见弹层根=${roots.length}${texts.length?`；弹层文字=${texts.join(' || ')}`:''}`;"
new_diag = "    const p=plus?`aria-expanded=${plus.getAttribute('aria-expanded')||'-'} aria-haspopup=${plus.getAttribute('aria-haspopup')||'-'} testid=${plus.getAttribute('data-testid')||'-'}`:'+按钮未找到';\n    const near=plus&&plus.getAttribute('aria-expanded')==='true'?findCreateNearPlusFallback(plus):null;\n    return `${p}；当前可见弹层根=${roots.length}${texts.length?`；弹层文字=${texts.join(' || ')}`:''}${near?`；近加号候选=${near.tx}`:''}`;"
if s.count(old_diag) != 1:
    raise SystemExit('diagnostics marker mismatch')
s = s.replace(old_diag, new_diag, 1)

# Scope / performance guards.
if '[data-state="open"]' in s[s.index('const CREATE_MENU_ROOT_SELECTOR'):s.index('const CREATE_CLICK_SELECTOR')]:
    raise SystemExit('generic data-state=open root matcher still present')
if 'function createWatcher(' in s or 'observer.observe(document.body||document.documentElement' in s:
    raise SystemExit('whole-body observer regression detected')
if 'function findCreateNearPlusFallback(' not in s:
    raise SystemExit('near-plus fallback missing')
if 'fallbackScans<7' not in s or 'nextFallbackAt=now+650' not in s:
    raise SystemExit('fallback rate-limit guards missing')
if "document.querySelectorAll(CREATE_CLICK_SELECTOR)" not in s:
    raise SystemExit('interactive-only fallback scan missing')
# Never reintroduce broad div/span fallback.
if "document.querySelectorAll('button,[role=\"button\"],[role=\"menuitem\"],[role=\"option\"],[data-radix-collection-item],div,span')" in s:
    raise SystemExit('broad full-document div/span create scan detected')
if "const pathBefore=location.pathname;let last;" not in s or 'isSidebarLike' not in s:
    raise SystemExit('route/sidebar safety guards missing')

USER.write_text(s, encoding='utf-8')
header_end = s.index('// ==/UserScript==') + len('// ==/UserScript==')
Path('POD_ChatGPT.meta.js').write_text(s[:header_end] + '\n', encoding='utf-8')

changelog = [
    '修复 ChatGPT 当前新版“+”菜单已经 aria-expanded=true，但真实菜单没有命中 role=menu/Radix 等标准弹层根，导致脚本只看到左侧历史/项目区域而找不到“创建图片”的问题。',
    '移除菜单根选择器中的通用 [data-state="open"]，避免把侧栏、抽屉或其他长期打开区域误当成当前“+”菜单。',
    '当“+”已确认展开时，增加受控兜底：只扫描可交互节点，严格匹配“创建图片/创作图片/生成图片”开头，并要求节点与当前 composer 加号空间距离足够近；约650ms一次，最多7次。',
    '继续禁止全页 div/span 高频扫描与全页 MutationObserver；V1.6.6 的输出目录句柄性能修复、上传恢复、发送 at-most-once、生图检测、下载与恢复核心保持不变。',
]
latest = {
    'version': '1.6.7',
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
if h.get('versions', [{}])[0].get('version') != '1.6.6':
    raise SystemExit('history head is not V1.6.6')
h['versions'].insert(0, {'version': '1.6.7', 'date': '2026-08-26', 'notes': changelog})
hp.write_text(json.dumps(h, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
