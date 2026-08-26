from pathlib import Path
import json

V='1.6.4'
USER=Path('POD_ChatGPT.user.js')
META=Path('POD_ChatGPT.meta.js')
LATEST=Path('POD_ChatGPT.latest.json')
HISTORY=Path('POD_ChatGPT.history.json')

s=USER.read_text(encoding='utf-8')
required=[
    '// @name         ChatGPT服装POD统一工作台 V1.2.2',
    '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.3',
    '// @version      1.6.3',
    "const APP_VERSION = '1.6.3';",
    '  function isSidebarLike(e){',
    '  function findPlus(){',
    '  function visibleMenuRoots(){',
    '  function findCreateItem(',
    '  function hasCreateChip(){',
    '  async function activateCreate(){',
]
for marker in required:
    if s.count(marker)!=1:
        raise SystemExit(f'expected exactly one marker {marker!r}, got {s.count(marker)}')

s=s.replace('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.3','// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.4',1)
s=s.replace('// @version      1.6.3','// @version      1.6.4',1)
old_desc='// @description  服装POD统一工作台：V1.6.3 增加损坏附件快速检测与上传失败自动恢复，避免偶发坏图/卡死导致整夜任务暂停。'
new_desc='// @description  服装POD统一工作台：V1.6.4 恢复已验证的“+→创建图片”弹层容错检测，并保留当前输入框绑定、侧栏排除与会话跳转保护。'
if s.count(old_desc)!=1: raise SystemExit('unexpected V1.6.3 description')
s=s.replace(old_desc,new_desc,1)
s=s.replace("const APP_VERSION = '1.6.3';","const APP_VERSION = '1.6.4';",1)
anchor=' * - V1.6.3 上传恢复增强：附件缩略图 complete=true 且 naturalWidth=0 连续8秒即判定损坏；无进度的不完整附件连续25秒判定卡死；上传超时也进入可恢复错误。首次原页面清理重试，第二次失败刷新当前会话后恢复同批，刷新后仍失败才暂停。'
note=' * - V1.6.4 创建图片菜单兼容修复：参考主图批量下载与洗图脚本 V3.1.1 的已验证弹层检测，显式菜单根定位失败时增加“当前 composer 附近的交互菜单项”容错扫描；保留精确前缀匹配、侧栏排除和会话路径保护。\n'
if s.count(anchor)!=1: raise SystemExit('V1.6.3 changelog anchor missing')
s=s.replace(anchor,note+anchor,1)

start=s.index('  function isSidebarLike(e){')
end=s.index('  function setNativeValue',start)
new_block=r'''  function isSidebarLike(e){return Boolean(e?.closest?.('nav,aside,[data-testid*="sidebar"],[data-testid*="history"],[data-testid*="project"]'));}
  function findPlus(){
    const root=findComposer();if(!(root instanceof Element))return null;
    const sels=['button[data-testid="composer-plus-btn"]','#composer-plus-btn','button[aria-label="添加文件等"]','[role="button"][aria-label="添加文件等"]','button[data-testid*="composer-plus"]','[role="button"][data-testid*="composer-plus"]','button[aria-label="Add"]','button[aria-label*="添加文件"]','button[aria-label*="Attach"]'];
    for(const sel of sels){const a=[...root.querySelectorAll(sel)].filter(isVisible).filter(e=>!e.closest('#kagura-pod-panel')).filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true');if(a.length)return a.at(-1)}
    const ed=findPromptEditor(),ar=ed?.getBoundingClientRect();if(!ar)return null;
    const c=[...root.querySelectorAll('button,[role="button"]')].filter(isVisible).filter(e=>!e.closest('#kagura-pod-panel')).map(e=>{const r=e.getBoundingClientRect(),tx=text(e),test=e.getAttribute('data-testid')||'',aria=e.getAttribute('aria-label')||'';let score=0;const look=/composer-plus/i.test(test)||/添加文件|添加照片|附件|Attach|Add/i.test(`${aria} ${tx}`)||/^\+$/.test(tx);if(/composer-plus-btn/i.test(test))score+=1000;if(aria==='添加文件等')score+=600;if(look)score+=250;if(r.width>=22&&r.width<=76&&r.height>=22&&r.height<=76)score+=120;if(Math.abs((r.top+r.height/2)-(ar.top+ar.height/2))<80)score+=100;return{e,score,look}}).filter(x=>x.look).sort((a,b)=>b.score-a.score);
    return c[0]?.e||null;
  }
  function visibleMenuRoots(){
    const selectors='[popover],[data-radix-popper-content-wrapper],[data-radix-menu-content],[data-headlessui-portal],[data-floating-ui-portal],[role="menu"],[role="dialog"],[role="listbox"],[data-state="open"]';
    return [...document.querySelectorAll(selectors)].filter(e=>{if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel')||isSidebarLike(e))return false;const r=e.getBoundingClientRect();return r.width>=80&&r.height>=30&&r.bottom>=-10&&r.top<=innerHeight+10;});
  }
  function menuRootsAfterPlus(before,plus){
    const all=visibleMenuRoots(),fresh=all.filter(r=>!before?.has?.(r));
    const pr=plus?.getBoundingClientRect?.();
    const near=root=>{if(!pr)return true;const r=root.getBoundingClientRect();return r.bottom>=pr.top-760&&r.top<=pr.bottom+160&&r.right>=pr.left-220&&r.left<=pr.right+760;};
    if(fresh.length){const n=fresh.filter(near);return n.length?n:fresh;}
    return all.filter(near);
  }
  function createItemScore(target,plus){
    const tx=plainText(target),ta=target.getAttribute('aria-label')||'',re=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i;
    if(!re.test(tx)&&!re.test(ta))return -1;
    if(/替换人物|人物替换|换人物/.test(`${tx} ${ta}`))return -1;
    const r=target.getBoundingClientRect();if(r.width<70||r.height<22||r.height>190||r.bottom<0||r.top>innerHeight)return -1;
    const composer=findComposer(),cr=composer?.getBoundingClientRect?.(),pr=plus?.getBoundingClientRect?.();
    if(cr&&!(r.bottom>=cr.top-720&&r.top<=cr.bottom+120&&r.right>=cr.left-120&&r.left<=cr.right+120))return -1;
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
  function findCreateItem(roots=visibleMenuRoots(),plus=findPlus()){
    const clickSel='button,[role="button"],[role="menuitem"],[role="option"],[data-radix-collection-item],[tabindex]';
    const cand=[],seen=new Set(),re=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i;
    for(const root of roots||[]){
      if(!(root instanceof Element)||isSidebarLike(root))continue;
      for(const e of root.querySelectorAll(`${clickSel},div,span`)){
        if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel')||isSidebarLike(e))continue;
        const raw=plainText(e),aria=e.getAttribute('aria-label')||'';if(!re.test(raw)&&!re.test(aria))continue;
        let target=e.matches(clickSel)?e:e.closest(clickSel);
        if(!target||!root.contains(target))target=e;
        if(seen.has(target)||!isVisible(target)||isSidebarLike(target))continue;
        const score=createItemScore(target,plus);if(score<0)continue;
        seen.add(target);cand.push({e:target,score,tx:plainText(target),r:target.getBoundingClientRect()});
      }
    }
    cand.sort((a,b)=>b.score-a.score);return cand[0]||null;
  }
  function findCreateItemFallback(plus=findPlus()){
    const sel='button,[role="button"],[role="menuitem"],[role="option"],[data-radix-collection-item],[tabindex]';
    const re=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i,cand=[];
    for(const e of document.querySelectorAll(sel)){
      if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel')||isSidebarLike(e))continue;
      const tx=plainText(e),aria=e.getAttribute('aria-label')||'';if((!re.test(tx)&&!re.test(aria))||tx.length>240)continue;
      const score=createItemScore(e,plus);if(score<0)continue;cand.push({e,score,tx,r:e.getBoundingClientRect()});
    }
    cand.sort((a,b)=>b.score-a.score);return cand[0]||null;
  }
  function createMenuDiagnostics(plus=findPlus()){
    const roots=visibleMenuRoots(),texts=[];
    for(const root of roots.slice(0,6)){const tx=plainText(root);if(tx)texts.push(tx.slice(0,180));}
    const p=plus?`aria-expanded=${plus.getAttribute('aria-expanded')||'-'} aria-haspopup=${plus.getAttribute('aria-haspopup')||'-'} testid=${plus.getAttribute('data-testid')||'-'}`:'+按钮未找到';
    return `${p}；可见菜单=${roots.length}${texts.length?`；菜单文字=${texts.join(' || ')}`:''}`;
  }
  function hasCreateChip(){
    const c=findComposer(),ed=findPromptEditor(),er=ed?.getBoundingClientRect(),re=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)$/i;if(!(c instanceof Element))return false;
    for(const e of c.querySelectorAll('button,[role="button"],[data-testid*="chip"],[data-testid*="tool"],div,span')){if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel')||isSidebarLike(e))continue;if(!re.test(plainText(e)))continue;const r=e.getBoundingClientRect();if(!er||r.bottom>=er.top-140&&r.top<=er.bottom+80)return true;}return false;
  }
  async function activateCreate(){
    state.phase='activating_create_image';saveState();
    if(hasCreateChip()){log('已存在“创建图片”模式，无需重复添加','success');return;}
    const pathBefore=location.pathname;let last;
    for(let a=1;a<=3;a++){
      try{
        if(location.pathname!==pathBefore)throw new Error('创建图片入口错误：检测到会话跳转');
        const plus=await waitUntil(()=>findPlus(),7000,200);if(!plus)throw new Error('未找到当前输入框左侧“+”按钮');
        const rootsBefore=new Set(visibleMenuRoots());smartClick(plus);log(`已点击当前输入框左侧“+”按钮（${a}/3）`);
        await sleep(350);if(location.pathname!==pathBefore)throw new Error('创建图片入口错误：检测到会话跳转');
        const opened=await waitUntil(()=>{const roots=menuRootsAfterPlus(rootsBefore,plus);return plus.getAttribute('aria-expanded')==='true'||roots.length>0||Boolean(findCreateItemFallback(plus));},2600,250);
        if(!opened){log(`点击“+”后未确认菜单展开：${createMenuDiagnostics(plus)}`,'warn');}
        let info=await waitUntil(()=>findCreateItem(menuRootsAfterPlus(rootsBefore,plus),plus)||findCreateItemFallback(plus),4200,300);
        if(!info){
          log(`第一次未定位“创建图片”，按稳定脚本逻辑复位后快速重试。${createMenuDiagnostics(plus)}`,'warn');
          smartClick(findPlus()||plus);await sleep(300);smartClick(findPlus()||plus);await sleep(350);
          if(location.pathname!==pathBefore)throw new Error('创建图片入口错误：检测到会话跳转');
          info=await waitUntil(()=>findCreateItem(visibleMenuRoots(),plus)||findCreateItemFallback(plus),3200,300);
        }
        if(!info)throw new Error(`加号菜单已打开，但没有检测到“创建图片”。${createMenuDiagnostics(plus)}`);
        log(`已定位当前输入框“创建图片”菜单项：${info.tx||'创建图片'}；坐标 ${Math.round(info.r.left+info.r.width/2)},${Math.round(info.r.top+info.r.height/2)}`);
        if(!smartClick(info.e))throw new Error('已找到“创建图片”，但点击动作未成功派发');
        const chip=await waitUntil(()=>{if(location.pathname!==pathBefore)throw new Error('创建图片入口错误：检测到会话跳转');if(!findPromptEditor())throw new Error('创建图片入口错误：当前输入框已消失');return hasCreateChip();},5000,350);
        if(!chip)throw new Error(`点击后未检测到“创建图片”标签。${createMenuDiagnostics(plus)}`);
        log('创建图片模式添加成功','success');return;
      }catch(e){
        last=e;const msg=e?.message||String(e);log(`第 ${a} 次添加创建图片失败：${msg}`,'warn');
        if(/会话跳转|当前输入框已消失/.test(msg)){state.running=false;state.phase='error';saveState();throw new Error(msg);}
        await sleep(650);
      }
    }
    throw new Error(`创建图片模式添加失败：${last?.message||last}`);
  }

'''
s=s[:start]+new_block+s[end:]
USER.write_text(s,encoding='utf-8')

m=META.read_text(encoding='utf-8')
for old,new in [
    ('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.3','// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.4'),
    ('// @version      1.6.3','// @version      1.6.4'),
    (old_desc,new_desc),
]:
    if old not in m: raise SystemExit(f'meta marker missing: {old}')
    m=m.replace(old,new,1)
META.write_text(m,encoding='utf-8')

notes=[
    '修复“+”菜单已经打开但脚本仍检测不到“创建图片”的问题：参考主图批量下载与洗图脚本 V3.1.1 的已验证弹层定位策略。',
    '保留当前菜单根优先检测；若 ChatGPT 新版菜单未暴露 role=menu / Radix 等可识别根节点，则仅对当前 composer 附近的交互菜单项执行容错扫描。',
    '“创建图片/创作图片/生成图片”继续要求位于菜单项文字开头，并保留 nav/aside/sidebar/history/project 排除，避免再次误点聊天或项目标题。',
    '继续保留当前会话路径保护：创建图片过程中如发生会话跳转或输入框消失，立即停止，不继续发送。',
    'V1.6.3 的坏附件检测、上传自动恢复，以及上传/发送/生图/下载/暂停恢复核心保持不变。'
]
LATEST.write_text(json.dumps({
    'version':V,
    'install_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
    'download_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
    'published_at':'2026-08-26',
    'changelog':notes,
},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

h=json.loads(HISTORY.read_text(encoding='utf-8'))
versions=h.setdefault('versions',[])
versions=[x for x in versions if str(x.get('version'))!=V]
versions.insert(0,{'version':V,'date':'2026-08-26','notes':notes})
h['versions']=versions
HISTORY.write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# release-time validation
out=USER.read_text(encoding='utf-8')
checks=[
    '// @name         ChatGPT服装POD统一工作台 V1.2.2',
    '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.4',
    '// @version      1.6.4',
    "const APP_VERSION = '1.6.4';",
    'function findCreateItemFallback',
    '当前 composer 附近的交互菜单项',
    "location.pathname!==pathBefore",
    'function waitUploads(expected,label,stableMs=4000)',
]
for marker in checks:
    if marker not in out: raise SystemExit(f'validation marker missing: {marker}')
print('V1.6.4 patch applied')
