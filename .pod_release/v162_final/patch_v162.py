from pathlib import Path
import json

USER = Path('POD_ChatGPT.user.js')
s = USER.read_text(encoding='utf-8')

required = [
    '// @name         ChatGPT服装POD统一工作台 V1.2.2',
    '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.1',
    '// @version      1.6.1',
    "const APP_VERSION = '1.6.1';",
    '  function findPlus(){',
    '  function visibleMenuRoots(){',
    '  function findCreateItem(){',
    '  function hasCreateChip(){',
    '  async function activateCreate(){',
]
for marker in required:
    count = s.count(marker)
    if count != 1:
        raise SystemExit(f'expected exactly one marker {marker!r}, got {count}')

s = s.replace('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.1', '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.2', 1)
s = s.replace('// @version      1.6.1', '// @version      1.6.2', 1)
old_desc = '// @description  服装POD统一工作台：V1.6.1 修复长对话中“添加创建图片模式”阶段因全页DOM高频扫描导致浏览器无响应的问题。'
new_desc = '// @description  服装POD统一工作台：V1.6.2 修复“创建图片”入口误匹配聊天/项目标题导致切换会话的问题，并将入口严格绑定当前输入框菜单。'
if s.count(old_desc) != 1:
    raise SystemExit('unexpected V1.6.1 description count')
s = s.replace(old_desc, new_desc, 1)
s = s.replace("const APP_VERSION = '1.6.1';", "const APP_VERSION = '1.6.2';", 1)

anchor = ' * - V1.6.1 性能修复：创建图片菜单项只在当前可见菜单/弹层内检索；创建图片标签只在输入框区域检测，并降低轮询频率，避免长对话全页DOM重复布局导致浏览器无响应。'
note = ' * - V1.6.2 创建图片入口修复：仅在当前 composer 的“+”按钮新打开菜单中匹配以“创建图片/创作图片/生成图片”开头的真实菜单项；排除侧边栏、历史与项目区域，并增加会话路径跳转保护，避免误点“替换人物生成图片”等聊天标题。\n'
if s.count(anchor) != 1:
    raise SystemExit('V1.6.1 changelog anchor missing')
s = s.replace(anchor, note + anchor, 1)

start = s.index('  function findPlus(){')
end = s.index('  function setNativeValue', start)
new_block = r'''  function isSidebarLike(e){return Boolean(e?.closest?.('nav,aside,[data-testid*="sidebar"],[data-testid*="history"],[data-testid*="project"]'));}
  function findPlus(){const root=findComposer();if(!(root instanceof Element))return null;const sels=['button[data-testid="composer-plus-btn"]','#composer-plus-btn','button[aria-label="添加文件等"]','[role="button"][aria-label="添加文件等"]','button[data-testid*="composer-plus"]','[role="button"][data-testid*="composer-plus"]','button[aria-label="Add"]','button[aria-label*="添加文件"]','button[aria-label*="Attach"]'];for(const s of sels){const a=[...root.querySelectorAll(s)].filter(isVisible).filter(e=>!e.closest('#kagura-pod-panel')).filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true');if(a.length)return a.at(-1)}const ed=findPromptEditor(),ar=ed?.getBoundingClientRect();if(!ar)return null;const c=[...root.querySelectorAll('button,[role="button"]')].filter(isVisible).filter(e=>!e.closest('#kagura-pod-panel')).map(e=>{const r=e.getBoundingClientRect(),tx=text(e),test=e.getAttribute('data-testid')||'',aria=e.getAttribute('aria-label')||'';let score=0;const look=/composer-plus/i.test(test)||/添加文件|添加照片|附件|Attach|Add/i.test(`${aria} ${tx}`)||/^\+$/.test(tx);if(/composer-plus-btn/i.test(test))score+=1000;if(aria==='添加文件等')score+=600;if(look)score+=250;if(r.width>=22&&r.width<=76&&r.height>=22&&r.height<=76)score+=120;if(Math.abs((r.top+r.height/2)-(ar.top+ar.height/2))<80)score+=100;return{e,score,look}}).filter(x=>x.look).sort((a,b)=>b.score-a.score);return c[0]?.e||null;}
  function visibleMenuRoots(){return [...document.querySelectorAll('[popover],[data-radix-popper-content-wrapper],[data-radix-menu-content],[data-headlessui-portal],[data-floating-ui-portal],[role="menu"],[role="dialog"],[role="listbox"],[data-state="open"]')].filter(e=>isVisible(e)&&!insideMessage(e)&&!e.closest('#kagura-pod-panel')&&!isSidebarLike(e));}
  function menuRootsAfterPlus(before,plus){const all=visibleMenuRoots(),fresh=all.filter(r=>!before?.has?.(r));if(fresh.length)return fresh;const pr=plus?.getBoundingClientRect?.();if(!pr)return all;return all.filter(root=>{const r=root.getBoundingClientRect();return r.bottom>=pr.top-700&&r.top<=pr.bottom+140&&r.right>=pr.left-140&&r.left<=pr.right+560;});}
  function findCreateItem(roots=visibleMenuRoots()){const re=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i,clickSel='button,[role="button"],[role="menuitem"],[role="option"],[data-radix-collection-item],a',cand=[],seen=new Set();for(const root of roots||[]){if(!(root instanceof Element)||isSidebarLike(root))continue;for(const e of root.querySelectorAll(`${clickSel},div,span`)){if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel')||isSidebarLike(e))continue;const raw=plainText(e),aria=e.getAttribute('aria-label')||'';if(!re.test(raw)&&!re.test(aria))continue;const target=e.matches(clickSel)?e:e.closest(clickSel);if(!target||!root.contains(target)||seen.has(target)||!isVisible(target)||isSidebarLike(target))continue;const tx=plainText(target),ta=target.getAttribute('aria-label')||'';if(!re.test(tx)&&!re.test(ta))continue;if(/替换人物|人物替换|换人物/.test(`${tx} ${ta}`))continue;const r=target.getBoundingClientRect();if(r.width<70||r.height<22||r.height>180)continue;let score=1500;if(/^(创建图片|创作图片)(?:\s|$)/i.test(`${tx} ${ta}`))score+=2200;if(/可视化呈现任何内容|可视化/.test(tx))score+=1400;if(target.matches('[role="menuitem"],button,[role="button"]'))score+=600;seen.add(target);cand.push({e:target,score,tx,r});}}cand.sort((a,b)=>b.score-a.score);return cand[0]||null;}
  function hasCreateChip(){const c=findComposer(),ed=findPromptEditor(),er=ed?.getBoundingClientRect(),re=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)$/i;if(!(c instanceof Element))return false;for(const e of c.querySelectorAll('button,[role="button"],[data-testid*="chip"],[data-testid*="tool"],div,span')){if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel')||isSidebarLike(e))continue;if(!re.test(plainText(e)))continue;const r=e.getBoundingClientRect();if(!er||r.bottom>=er.top-140&&r.top<=er.bottom+80)return true;}return false;}
  async function activateCreate(){state.phase='activating_create_image';saveState();if(hasCreateChip()){log('已存在“创建图片”模式，无需重复添加','success');return;}const pathBefore=location.pathname;let last;for(let a=1;a<=3;a++){try{if(location.pathname!==pathBefore)throw new Error('创建图片入口错误：检测到会话跳转');const plus=await waitUntil(()=>findPlus(),7000,200);if(!plus)throw new Error('未找到当前输入框左侧“+”按钮');const rootsBefore=new Set(visibleMenuRoots());smartClick(plus);log(`已点击当前输入框左侧“+”按钮（${a}/3）`);await sleep(500);if(location.pathname!==pathBefore)throw new Error('创建图片入口错误：检测到会话跳转');let info=await waitUntil(()=>{const roots=menuRootsAfterPlus(rootsBefore,plus);return findCreateItem(roots);},4500,300);if(!info){smartClick(findPlus()||plus);await sleep(450);if(location.pathname!==pathBefore)throw new Error('创建图片入口错误：检测到会话跳转');info=await waitUntil(()=>findCreateItem(menuRootsAfterPlus(rootsBefore,plus)),3500,300);}if(!info)throw new Error('当前输入框加号菜单中未找到“创建图片”');log(`已定位当前输入框“创建图片”菜单项：${info.tx||'创建图片'}`);smartClick(info.e);const chip=await waitUntil(()=>{if(location.pathname!==pathBefore)throw new Error('创建图片入口错误：检测到会话跳转');if(!findPromptEditor())throw new Error('创建图片入口错误：当前输入框已消失');return hasCreateChip();},5000,350);if(!chip)throw new Error('点击后未检测到“创建图片”标签');log('创建图片模式添加成功','success');return;}catch(e){last=e;const msg=e?.message||String(e);log(`第 ${a} 次添加创建图片失败：${msg}`,'warn');if(/会话跳转|当前输入框已消失/.test(msg)){state.running=false;state.phase='error';saveState();throw new Error(msg);}await sleep(700)}}throw new Error(`创建图片模式添加失败：${last?.message||last}`);}

'''
s = s[:start] + new_block + s[end:]

checks = [
    "const root=findComposer();if(!(root instanceof Element))return null;",
    "function menuRootsAfterPlus(before,plus)",
    "创建图片入口错误：检测到会话跳转",
    "if(/替换人物|人物替换|换人物/.test",
    "findCreateItem(menuRootsAfterPlus(rootsBefore,plus))",
]
for marker in checks:
    if marker not in s:
        raise SystemExit(f'new V1.6.2 marker missing: {marker}')
if "const re=/(创建图片|创作图片|生成图片|create\\s*image|generate\\s*image)/i;const cand=[]" in s:
    raise SystemExit('legacy loose V1.6.1 create-image matcher still present')

USER.write_text(s, encoding='utf-8')
header_end = s.index('// ==/UserScript==') + len('// ==/UserScript==')
Path('POD_ChatGPT.meta.js').write_text(s[:header_end] + '\n', encoding='utf-8')

changelog = [
    '修复“创建图片”入口误匹配：V1.6.1 日志曾把“替换人物生成图片”聊天/项目标题识别成创建图片菜单项，V1.6.2 改为只匹配以“创建图片/创作图片/生成图片”开头的真实菜单项。',
    '创建图片入口严格绑定当前 composer：加号按钮只在当前输入框区域查找，菜单优先限制为本次点击后新出现/靠近加号的弹层。',
    '显式排除 nav/aside/sidebar/history/project 区域，避免点击左侧聊天、项目或历史记录。',
    '增加当前会话路径保护：点击创建图片过程中如检测到 conversation 路径变化或输入框消失，立即停止且不继续发送。',
    '上传、附件稳定检测、提示词写入、发送确认、生图检测、下载隔离与暂停恢复核心保持不变。',
]
latest = {
    'version': '1.6.2',
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
if h.get('versions', [{}])[0].get('version') != '1.6.1':
    raise SystemExit('history head is not V1.6.1')
h['versions'].insert(0, {'version': '1.6.2', 'date': '2026-08-26', 'notes': changelog})
hp.write_text(json.dumps(h, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
