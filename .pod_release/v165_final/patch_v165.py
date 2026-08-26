from pathlib import Path
import json

V='1.6.5'
BASE='1.6.4'
USER=Path('POD_ChatGPT.user.js')
META=Path('POD_ChatGPT.meta.js')
LATEST=Path('POD_ChatGPT.latest.json')
HISTORY=Path('POD_ChatGPT.history.json')
VERSIONS=Path('versions')

s=USER.read_text(encoding='utf-8')
required=[
    '// @name         ChatGPT服装POD统一工作台 V1.2.2',
    '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.4',
    '// @version      1.6.4',
    "const APP_VERSION = '1.6.4';",
    '  function visibleMenuRoots(){',
    '  function findCreateItemFallback(',
    '  async function activateCreate(){',
]
for m in required:
    if s.count(m)!=1:
        raise SystemExit(f'expected exactly one marker {m!r}, got {s.count(m)}')

s=s.replace('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.4','// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.5',1)
s=s.replace('// @version      1.6.4','// @version      1.6.5',1)
old_desc='// @description  服装POD统一工作台：V1.6.4 恢复已验证的“+→创建图片”弹层容错检测，并保留当前输入框绑定、侧栏排除与会话跳转保护。'
new_desc='// @description  服装POD统一工作台：V1.6.5 创建图片入口改为 MutationObserver 事件驱动检测，移除长对话中的全页交互节点轮询，兼顾兼容性与性能。'
if s.count(old_desc)!=1: raise SystemExit('unexpected V1.6.4 description')
s=s.replace(old_desc,new_desc,1)
s=s.replace("const APP_VERSION = '1.6.4';","const APP_VERSION = '1.6.5';",1)

anchor=' * - V1.6.4 创建图片菜单兼容修复：参考主图批量下载与洗图脚本 V3.1.1 的已验证弹层检测，显式菜单根定位失败时增加“当前 composer 附近的交互菜单项”容错扫描；保留精确前缀匹配、侧栏排除和会话路径保护。'
note=' * - V1.6.5 创建图片入口性能修复：改用 MutationObserver 监听当前“+”按钮点击后新增/显隐的菜单节点，仅检查本次变化及新出现的弹层；删除 document 全页交互节点 fallback 轮询，保留精确前缀匹配、当前 composer 绑定、侧栏排除和会话跳转保护。\n'
if s.count(anchor)!=1: raise SystemExit('V1.6.4 changelog anchor missing')
s=s.replace(anchor,note+anchor,1)

start=s.index('  function visibleMenuRoots(){')
end=s.index('  function hasCreateChip(){',start)
new_helpers=r'''  const CREATE_MENU_ROOT_SELECTOR='[popover],[data-radix-popper-content-wrapper],[data-radix-menu-content],[data-headlessui-portal],[data-floating-ui-portal],[role="menu"],[role="dialog"],[role="listbox"],[data-state="open"]';
  const CREATE_CLICK_SELECTOR='button,[role="button"],[role="menuitem"],[role="option"],[data-radix-collection-item],[tabindex]';
  function visibleMenuRoots(){
    return [...document.querySelectorAll(CREATE_MENU_ROOT_SELECTOR)].filter(e=>{
      if(!(e instanceof Element)||!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel')||isSidebarLike(e))return false;
      const r=e.getBoundingClientRect();return r.width>=70&&r.height>=28&&r.bottom>=0&&r.top<=innerHeight;
    });
  }
  function createItemScore(target,plus){
    if(!(target instanceof Element)||!isVisible(target)||insideMessage(target)||target.closest('#kagura-pod-panel')||isSidebarLike(target))return -1;
    const tx=plainText(target),ta=target.getAttribute('aria-label')||'',re=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i;
    if(!re.test(tx)&&!re.test(ta))return -1;
    if(/替换人物|人物替换|换人物/.test(`${tx} ${ta}`))return -1;
    const r=target.getBoundingClientRect();if(r.width<70||r.height<22||r.height>190||r.bottom<0||r.top>innerHeight)return -1;
    const composer=findComposer(),cr=composer?.getBoundingClientRect?.(),pr=plus?.getBoundingClientRect?.();
    if(cr&&!(r.bottom>=cr.top-760&&r.top<=cr.bottom+140&&r.right>=cr.left-140&&r.left<=cr.right+140))return -1;
    let score=1500;
    if(/^(创建图片|创作图片)(?:\s|$)/i.test(`${tx} ${ta}`))score+=2200;
    if(/可视化呈现任何内容|可视化/.test(tx))score+=1500;
    if(/任何内容/.test(tx))score+=450;
    if(/visualize|visualise/i.test(tx))score+=700;
    if(target.matches('[role="menuitem"],button,[role="button"],[data-radix-collection-item]'))score+=650;
    if(getComputedStyle(target).cursor==='pointer')score+=120;
    if(pr){const cx=r.left+r.width/2,cy=r.top+r.height/2,px=pr.left+pr.width/2,py=pr.top+pr.height/2;score+=Math.max(0,900-Math.hypot(cx-px,cy-py));}
    return score;
  }
  function findCreateInside(root,plus=findPlus()){
    if(!(root instanceof Element)||isSidebarLike(root))return null;
    const re=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i,cand=[],seen=new Set();
    const nodes=[];
    if(root.matches?.(`${CREATE_CLICK_SELECTOR},div,span`))nodes.push(root);
    try{nodes.push(...root.querySelectorAll(`${CREATE_CLICK_SELECTOR},div,span`));}catch(_){}
    for(const e of nodes){
      if(!(e instanceof Element)||!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel')||isSidebarLike(e))continue;
      const raw=plainText(e),aria=e.getAttribute('aria-label')||'';if(!re.test(raw)&&!re.test(aria))continue;
      let target=e.matches(CREATE_CLICK_SELECTOR)?e:e.closest(CREATE_CLICK_SELECTOR);
      if(!target)target=e;
      if(seen.has(target))continue;
      const score=createItemScore(target,plus);if(score<0)continue;
      seen.add(target);cand.push({e:target,score,tx:plainText(target),r:target.getBoundingClientRect()});
    }
    cand.sort((a,b)=>b.score-a.score);return cand[0]||null;
  }
  function nearbyVisibleCreateFromRoots(before,plus){
    const roots=visibleMenuRoots(),fresh=roots.filter(r=>!before?.has?.(r)),pool=fresh.length?fresh:roots;
    let best=null;
    for(const root of pool){const info=findCreateInside(root,plus);if(info&&(!best||info.score>best.score))best=info;}
    return best;
  }
  function createWatcher(plus,before,timeout=5200){
    let done=false,observer=null,timer=null,observedMutations=0;
    let resolvePromise;
    const promise=new Promise(resolve=>{resolvePromise=resolve});
    const finish=value=>{if(done)return;done=true;try{observer?.disconnect()}catch(_){}if(timer)clearTimeout(timer);resolvePromise(value||null);};
    const inspect=node=>{
      if(done||!(node instanceof Element)||node.closest?.('#kagura-pod-panel')||isSidebarLike(node))return null;
      const candidates=[node];
      let p=node.parentElement;
      for(let i=0;i<4&&p&&p!==document.body;i++,p=p.parentElement)candidates.push(p);
      for(const root of candidates){const info=findCreateInside(root,plus);if(info)return info;}
      return null;
    };
    observer=new MutationObserver(records=>{
      observedMutations+=records.length;
      for(const rec of records){
        if(rec.type==='childList'){
          for(const n of rec.addedNodes){if(!(n instanceof Element))continue;const info=inspect(n);if(info){finish({...info,source:'mutation',observedMutations});return;}}
        }else if(rec.type==='attributes'&&rec.target instanceof Element){
          const info=inspect(rec.target);if(info){finish({...info,source:'attribute',observedMutations});return;}
        }
      }
      const rooted=nearbyVisibleCreateFromRoots(before,plus);if(rooted)finish({...rooted,source:'visible-root',observedMutations});
    });
    observer.observe(document.body||document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','data-state','aria-hidden','aria-expanded']});
    timer=setTimeout(()=>{const rooted=nearbyVisibleCreateFromRoots(before,plus);finish(rooted?{...rooted,source:'timeout-root',observedMutations}:null);},timeout);
    return{promise,stop:()=>finish(null)};
  }
  function resetCreateMenu(){
    try{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));}catch(_){}
    try{document.dispatchEvent(new KeyboardEvent('keyup',{key:'Escape',code:'Escape',bubbles:true,cancelable:true}));}catch(_){}
  }
  function createMenuDiagnostics(plus=findPlus()){
    const roots=visibleMenuRoots(),texts=[];for(const root of roots.slice(0,5)){const tx=plainText(root);if(tx)texts.push(tx.slice(0,180));}
    const p=plus?`aria-expanded=${plus.getAttribute('aria-expanded')||'-'} aria-haspopup=${plus.getAttribute('aria-haspopup')||'-'} testid=${plus.getAttribute('data-testid')||'-'}`:'+按钮未找到';
    return `${p}；当前可见弹层根=${roots.length}${texts.length?`；弹层文字=${texts.join(' || ')}`:''}`;
  }
'''
s=s[:start]+new_helpers+s[end:]

start=s.index('  async function activateCreate(){')
end=s.index('  function setNativeValue',start)
new_activate=r'''  async function activateCreate(){
    state.phase='activating_create_image';saveState();
    if(hasCreateChip()){log('已存在“创建图片”模式，无需重复添加','success');return;}
    const pathBefore=location.pathname;let last;
    for(let a=1;a<=3;a++){
      try{
        if(location.pathname!==pathBefore)throw new Error('创建图片入口错误：检测到会话跳转');
        resetCreateMenu();await sleep(180);
        const plus=await waitUntil(()=>findPlus(),7000,200);if(!plus)throw new Error('未找到当前输入框左侧“+”按钮');
        const before=new Set(visibleMenuRoots());
        const watcher=createWatcher(plus,before,5200);
        if(!smartClick(plus)){watcher.stop();throw new Error('当前输入框“+”按钮点击失败');}
        log(`已点击当前输入框左侧“+”按钮（${a}/3），开始事件驱动监听新弹层`);
        const info=await watcher.promise;
        if(location.pathname!==pathBefore)throw new Error('创建图片入口错误：检测到会话跳转');
        if(!info)throw new Error(`加号菜单已尝试打开，但事件监听未发现“创建图片”。${createMenuDiagnostics(plus)}`);
        log(`事件监听已定位“创建图片”菜单项：${info.tx||'创建图片'}；来源 ${info.source||'mutation'}；坐标 ${Math.round(info.r.left+info.r.width/2)},${Math.round(info.r.top+info.r.height/2)}`);
        if(!smartClick(info.e))throw new Error('已找到“创建图片”，但点击动作未成功派发');
        const chip=await waitUntil(()=>{if(location.pathname!==pathBefore)throw new Error('创建图片入口错误：检测到会话跳转');if(!findPromptEditor())throw new Error('创建图片入口错误：当前输入框已消失');return hasCreateChip();},5000,350);
        if(!chip)throw new Error(`点击后未检测到“创建图片”标签。${createMenuDiagnostics(plus)}`);
        log('创建图片模式添加成功','success');return;
      }catch(e){
        last=e;const msg=e?.message||String(e);log(`第 ${a} 次添加创建图片失败：${msg}`,'warn');
        if(/会话跳转|当前输入框已消失/.test(msg)){state.running=false;state.phase='error';saveState();throw new Error(msg);}
        resetCreateMenu();await sleep(450);
      }
    }
    throw new Error(`创建图片模式添加失败：${last?.message||last}`);
  }

'''
s=s[:start]+new_activate+s[end:]

if 'findCreateItemFallback' in s: raise SystemExit('global fallback function still present')
if 'document.querySelectorAll(sel)' in s[s.index('const CREATE_MENU_ROOT_SELECTOR'):s.index('function setNativeValue',s.index('const CREATE_MENU_ROOT_SELECTOR'))]:
    raise SystemExit('full-page interactive fallback scan still present in create-image block')
USER.write_text(s,encoding='utf-8')

m=META.read_text(encoding='utf-8')
for old,new in [
    ('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.4','// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.5'),
    ('// @version      1.6.4','// @version      1.6.5'),
    (old_desc,new_desc),
]:
    if m.count(old)!=1: raise SystemExit(f'meta marker mismatch: {old}')
    m=m.replace(old,new,1)
META.write_text(m,encoding='utf-8')

latest={
  'version':V,
  'install_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
  'download_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
  'published_at':'2026-08-26',
  'changelog':[
    '创建图片入口改为 MutationObserver 事件驱动：在点击当前 composer 的“+”之前开始监听，只处理本次新增或显隐变化的菜单节点。',
    '删除 V1.6.4 的 document 全页交互节点 fallback 轮询，避免长对话中反复 querySelectorAll + 布局计算造成卡顿。',
    '保留可见弹层根的一次性轻量兜底，兼容 ChatGPT 将菜单复用为既有 DOM 仅切换 data-state/class 的情况。',
    '继续要求“创建图片/创作图片/生成图片”位于菜单项文字开头，并排除 nav/aside/sidebar/history/project，防止误点聊天标题。',
    '保留当前会话路径保护、V1.6.3 坏附件/上传恢复，以及发送 at-most-once、生图检测、下载隔离和夜间恢复逻辑。'
  ]
}
LATEST.write_text(json.dumps(latest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

hist=json.loads(HISTORY.read_text(encoding='utf-8'))
versions=hist.setdefault('versions',[])
versions=[x for x in versions if str(x.get('version'))!=V]
versions.insert(0,{
  'version':V,
  'date':'2026-08-26',
  'notes':latest['changelog']
})
hist['versions']=versions
HISTORY.write_text(json.dumps(hist,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

VERSIONS.mkdir(exist_ok=True)
(VERSIONS/f'POD_ChatGPT统一工作台_V{V}.txt').write_text(s,encoding='utf-8')
print('patched',V)
