// ==UserScript==
// @name         ChatGPT服装POD统一工作台 V1.2.2
// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.9
// @namespace    https://github.com/Kagura-userscripts
// @version      1.5.9
// @description  服装POD统一工作台：V1.5.9 将“创建图片”入口改为事件驱动局部检测，兼容 ChatGPT Composer 重载，移除全页高频 div/span 扫描并保留 V1.5.8 稳定发送保护。
// @author       Kagura
// @updateURL    https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.meta.js
// @downloadURL  https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @require      https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @connect      *.oaiusercontent.com
// @connect      *
// @run-at       document-idle
// ==/UserScript==

(() => {
  'use strict';

  const RELEASE_VERSION = '1.5.9';
  const CORE_VERSION = '1.5.8';
  const CORE_COMMIT = '56194dc106d34a31f2734aa33d4b628f756837f5';
  const CORE_URL = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/' + CORE_COMMIT + '/POD_ChatGPT.user.js';
  const CORE_CACHE_KEY = 'kaguraPodStableCore_' + CORE_VERSION + '_' + CORE_COMMIT.slice(0, 12);
  const CORE_CACHE_VERSION_KEY = CORE_CACHE_KEY + '_version';

  const RELEASE_NOTE = 'V1.5.9 创建图片检测事件化：只观察当前 Composer 与新出现菜单节点，兼容 Composer 重载；移除 document 全页 div/span 高频扫描，继续保留 V1.5.8 同批成功凭证、单次刷新恢复与 at-most-once 发送保护。';

  const CREATE_BLOCK = String.raw`  function visibleMenuRoots(){
    const selector='[popover],[data-radix-popper-content-wrapper],[data-radix-menu-content],[data-headlessui-portal],[data-floating-ui-portal],[role="menu"],[role="dialog"],[role="listbox"]';
    return [...document.querySelectorAll(selector)].filter(e=>isVisible(e)&&!insideMessage(e)&&!e.closest('#kagura-pod-panel'));
  }
  const KAGURA_CREATE_POPUP_SELECTOR='[popover],[data-radix-popper-content-wrapper],[data-radix-menu-content],[data-headlessui-portal],[data-floating-ui-portal],[role="menu"],[role="dialog"],[role="listbox"]';
  const KAGURA_CREATE_ITEM_SELECTOR='button,[role="button"],[role="menuitem"],[role="option"],[data-radix-collection-item],[data-testid*="menu"],[data-testid*="tool"],[aria-label]';
  const KAGURA_CREATE_ITEM_RE=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i;
  const KAGURA_CREATE_MODE_RE=/^(创建图片|创作图片|生成图片|图像生成|create\s*image|generate\s*image)(?:\s|$)/i;
  function kaguraCreateRoots(plus){
    const out=[];
    const add=e=>{if(e instanceof Element&&isVisible(e)&&!insideMessage(e)&&!e.closest('#kagura-pod-panel')&&!out.includes(e))out.push(e);};
    for(const attr of ['aria-controls','aria-owns']){
      for(const id of String(plus?.getAttribute?.(attr)||'').split(/\s+/).filter(Boolean))add(document.getElementById(id));
    }
    visibleMenuRoots().forEach(add);
    return out;
  }
  function kaguraScoreCreateItem(e,plus){
    if(!(e instanceof Element)||!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel'))return null;
    const tx=(plainText(e)+' '+(e.getAttribute?.('aria-label')||'')).replace(/\s+/g,' ').trim();
    if(!tx||tx.length>240||!KAGURA_CREATE_ITEM_RE.test(tx))return null;
    const r=e.getBoundingClientRect();
    if(r.width<45||r.height<18||r.height>190)return null;
    let score=1000;
    if(/^创建图片(?:\s|$)/.test(tx))score+=900;
    if(/可视化/.test(tx))score+=320;
    if(e.matches('button,[role="menuitem"],[role="option"],[role="button"]'))score+=420;
    if(e.closest('[role="menu"],[role="dialog"],[data-radix-popper-content-wrapper],[data-radix-menu-content]'))score+=520;
    if(plus instanceof Element){
      const p=plus.getBoundingClientRect();
      const dx=Math.abs((r.left+r.width/2)-(p.left+p.width/2));
      const dy=Math.abs((r.top+r.height/2)-(p.top+p.height/2));
      if(dx>800||dy>800)return null;
      score+=Math.max(0,520-Math.round((dx+dy)/2));
    }
    return {e,score,tx,r};
  }
  function kaguraBestCreateItem(nodes,plus){
    const items=[];
    for(const e of nodes){const hit=kaguraScoreCreateItem(e,plus);if(hit)items.push(hit);}
    items.sort((a,b)=>b.score-a.score);
    return items[0]||null;
  }
  function kaguraScanCreateRoot(root,plus){
    if(!(root instanceof Element))return null;
    const nodes=[];
    if(root.matches?.(KAGURA_CREATE_ITEM_SELECTOR))nodes.push(root);
    nodes.push(...root.querySelectorAll(KAGURA_CREATE_ITEM_SELECTOR));
    return kaguraBestCreateItem(nodes,plus);
  }
  function findCreateItem(plus=findPlus()){
    const hits=[];
    for(const root of kaguraCreateRoots(plus)){const hit=kaguraScanCreateRoot(root,plus);if(hit)hits.push(hit);}
    hits.sort((a,b)=>b.score-a.score);
    return hits[0]||null;
  }
  function kaguraFindCreateByPoint(plus){
    if(!(plus instanceof Element))return null;
    const p=plus.getBoundingClientRect(),nodes=new Set();
    const xs=[-280,-210,-140,-70,0,70,140,210,280].map(d=>p.left+p.width/2+d).filter(x=>x>2&&x<innerWidth-2);
    const ys=[45,85,125,170,220,280,350,430].map(d=>p.top-d).filter(y=>y>2&&y<innerHeight-2);
    for(const x of xs)for(const y of ys){
      const hit=document.elementFromPoint(x,y);
      const item=hit?.closest?.(KAGURA_CREATE_ITEM_SELECTOR);
      if(item)nodes.add(item);
    }
    return kaguraBestCreateItem([...nodes],plus);
  }
  function kaguraScanAddedForCreate(node,plus){
    if(!(node instanceof Element))return null;
    const direct=kaguraScoreCreateItem(node,plus);
    if(direct)return direct;
    if(node.matches?.(KAGURA_CREATE_POPUP_SELECTOR)){
      const inPopup=kaguraScanCreateRoot(node,plus);
      if(inPopup)return inPopup;
    }
    const popup=node.closest?.(KAGURA_CREATE_POPUP_SELECTOR);
    if(popup){const inParent=kaguraScanCreateRoot(popup,plus);if(inParent)return inParent;}
    for(const child of node.querySelectorAll?.(KAGURA_CREATE_POPUP_SELECTOR)||[]){
      const inChild=kaguraScanCreateRoot(child,plus);
      if(inChild)return inChild;
    }
    return null;
  }
  function kaguraWaitCreateItem(plus,timeout=6500){
    const immediate=findCreateItem(plus)||kaguraFindCreateByPoint(plus);
    if(immediate)return Promise.resolve(immediate);
    return new Promise(resolve=>{
      let done=false,observer=null,timer=null,fallback=null;
      const finish=value=>{if(done)return;done=true;try{observer?.disconnect()}catch(_){}clearTimeout(timer);clearInterval(fallback);resolve(value||null);};
      const root=document.body||document.documentElement;
      if(root){
        observer=new MutationObserver(records=>{
          for(const record of records){
            for(const node of record.addedNodes){
              const hit=kaguraScanAddedForCreate(node,plus);
              if(hit){finish(hit);return;}
            }
          }
        });
        observer.observe(root,{childList:true,subtree:true});
      }
      fallback=setInterval(()=>{
        const livePlus=findPlus()||plus;
        const hit=findCreateItem(livePlus)||kaguraFindCreateByPoint(livePlus);
        if(hit)finish(hit);
      },900);
      timer=setTimeout(()=>finish(findCreateItem(findPlus()||plus)||kaguraFindCreateByPoint(findPlus()||plus)),Math.max(1200,Number(timeout)||6500));
    });
  }
  function kaguraWaitPlus(timeout=8000){
    const immediate=findPlus();
    if(immediate)return Promise.resolve(immediate);
    return new Promise(resolve=>{
      let done=false,observer=null,timer=null,fallback=null,queued=false;
      const finish=value=>{if(done)return;done=true;try{observer?.disconnect()}catch(_){}clearTimeout(timer);clearInterval(fallback);resolve(value||null);};
      const check=()=>{queued=false;const hit=findPlus();if(hit)finish(hit);};
      const queue=()=>{if(done||queued)return;queued=true;requestAnimationFrame(check);};
      const root=document.body||document.documentElement;
      if(root){observer=new MutationObserver(queue);observer.observe(root,{childList:true,subtree:true});}
      fallback=setInterval(check,900);
      timer=setTimeout(()=>finish(findPlus()),Math.max(1200,Number(timeout)||8000));
      queue();
    });
  }
  function hasCreateChip(){
    const c=findComposer();
    if(!(c instanceof Element))return false;
    const nodes=[...c.querySelectorAll('button,[role="button"],[data-testid*="tool"],[data-testid*="chip"],[aria-label],div,span')];
    for(const e of nodes){
      if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel'))continue;
      const tx=(plainText(e)+' '+(e.getAttribute?.('aria-label')||'')).replace(/\s+/g,' ').trim();
      if(tx.length<=180&&KAGURA_CREATE_MODE_RE.test(tx))return true;
    }
    return false;
  }
  function hasCreateChipLoose(){return hasCreateChip();}
  function createModePresent(){return hasCreateChip();}
  function kaguraWaitCreateMode(timeout=6500){
    if(createModePresent())return Promise.resolve(true);
    return new Promise(resolve=>{
      let done=false,observer=null,timer=null,fallback=null,queued=false;
      const finish=value=>{if(done)return;done=true;try{observer?.disconnect()}catch(_){}clearTimeout(timer);clearInterval(fallback);resolve(Boolean(value));};
      const check=()=>{queued=false;if(createModePresent())finish(true);};
      const queue=()=>{if(done||queued)return;queued=true;requestAnimationFrame(check);};
      const root=document.body||document.documentElement;
      if(root){observer=new MutationObserver(queue);observer.observe(root,{childList:true,subtree:true});}
      fallback=setInterval(check,900);
      timer=setTimeout(()=>finish(createModePresent()),Math.max(1200,Number(timeout)||6500));
      queue();
    });
  }
  async function activateCreate(){
    state.phase='activating_create_image';saveState();
    if(createModePresent()){rememberCreateModeProof();log('已存在“创建图片”模式，无需重复添加','success');return true;}
    if(recentCreateModeProof()){log('本批刚刚已确认“创建图片”模式成功；当前DOM标签瞬时未命中，沿用已确认状态，不重复点击“+”','warn');return true;}
    let last;
    for(let a=1;a<=3;a++){
      try{
        const plus=await kaguraWaitPlus(8000);
        if(!plus)throw new Error('未找到当前输入框左侧“+”按钮');
        smartClick(plus);
        log('已点击当前Composer左侧“+”按钮（'+a+'/3），等待新菜单节点');
        let info=await kaguraWaitCreateItem(plus,6500);
        if(!info){
          const rebound=findPlus();
          if(rebound&&rebound!==plus){
            log('检测到Composer/“+”节点已重建，切换到当前有效节点继续本批','warn');
            smartClick(rebound);
            info=await kaguraWaitCreateItem(rebound,5000);
          }
        }
        if(!info)throw new Error('当前Composer菜单中未检测到“创建图片”');
        log('事件监听定位到“创建图片”菜单项：'+(info.tx||'创建图片'));
        smartClick(info.e);
        if(!await kaguraWaitCreateMode(6500))throw new Error('点击后当前Composer未检测到“创建图片”模式标签');
        rememberCreateModeProof();
        log('创建图片模式添加成功（事件驱动检测）','success');
        return true;
      }catch(e){
        last=e;
        log('第 '+a+' 次添加创建图片失败：'+e.message,'warn');
        await sleep(700);
      }
    }
    throw new CreateModeRetryableError('创建图片模式连续3次激活失败：'+(last?.message||last));
  }

  function setNativeValue`;

  function replaceOnce(source, oldText, newText, label) {
    if (!source.includes(oldText)) throw new Error('稳定核心校验失败，缺少标记：' + label);
    return source.replace(oldText, newText);
  }

  function patchStableCore(source) {
    let code = String(source || '');
    if (code.length < 240000) throw new Error('V1.5.8 稳定核心文件异常：长度仅 ' + code.length);

    code = replaceOnce(code, '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.8', '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.9', '中文脚本名 V1.5.8');
    code = replaceOnce(code, '// @version      1.5.8', '// @version      1.5.9', '@version V1.5.8');
    code = replaceOnce(code,
      '// @description  服装POD统一工作台：V1.5.8 修复创建图片已成功却被后续误判的问题；加入本批短期成功凭证、多重创建图片检测，并在真正连续3次激活失败且尚未发送时仅刷新1次后自动重试。',
      '// @description  服装POD统一工作台：V1.5.9 将“创建图片”入口改为事件驱动局部检测，兼容 ChatGPT Composer 重载，移除全页高频 div/span 扫描并保留 V1.5.8 稳定发送保护。',
      '@description V1.5.8');
    code = replaceOnce(code, '   * ChatGPT服装POD统一工作台 V1.5.8', '   * ChatGPT服装POD统一工作台 V1.5.9', '核心标题 V1.5.8');
    code = replaceOnce(code,
      ' * - V1.5.8 创建图片状态增强：已成功激活后记录同批短期成功凭证并加入composer局部宽松证据检测，避免瞬时假阴性导致重复点+；真正连续3次激活失败且尚未发送时只刷新1次后自动重新准备本批，刷新后仍失败才暂停。',
      ' * - V1.5.8 创建图片状态增强：已成功激活后记录同批短期成功凭证并加入composer局部宽松证据检测，避免瞬时假阴性导致重复点+；真正连续3次激活失败且尚未发送时只刷新1次后自动重新准备本批，刷新后仍失败才暂停。\n * - ' + RELEASE_NOTE,
      'V1.5.8 更新记录');
    code = replaceOnce(code, "const APP_VERSION = '1.5.8';", "const APP_VERSION = '1.5.9';", 'APP_VERSION V1.5.8');

    const blockPattern = /  function visibleMenuRoots\(\)\{[\s\S]*?\n  function setNativeValue/;
    const matches = code.match(new RegExp(blockPattern.source, 'g')) || [];
    if (matches.length !== 1) throw new Error('创建图片核心块校验失败：匹配数量=' + matches.length);
    code = code.replace(blockPattern, CREATE_BLOCK);

    const createStart = code.indexOf('  function visibleMenuRoots()');
    const createEnd = code.indexOf('  function setNativeValue', createStart);
    if (createStart < 0 || createEnd <= createStart) throw new Error('创建图片事件化替换后边界校验失败');
    const section = code.slice(createStart, createEnd);
    if (!section.includes('new MutationObserver') || !section.includes('addedNodes') || !section.includes('kaguraWaitCreateItem')) {
      throw new Error('创建图片事件监听核心未完整写入');
    }
    if (section.includes("document.querySelectorAll('button,[role=\"button\"],[role=\"menuitem\"],[role=\"option\"],[data-radix-collection-item],div,span')")) {
      throw new Error('仍检测到旧版 document 全页 div/span 创建图片扫描');
    }
    if (!code.includes("const APP_VERSION = '1.5.9';") || !code.includes('// @version      1.5.9')) {
      throw new Error('V1.5.9 版本替换校验失败');
    }
    return code;
  }

  function runCore(source, sourceLabel) {
    const patched = patchStableCore(source);
    console.info('[Kagura POD] V' + RELEASE_VERSION + '：使用' + sourceLabel + '启动固定 V' + CORE_VERSION + ' 稳定核心，并应用事件驱动创建图片补丁。');
    eval(patched + '\n//# sourceURL=Kagura_POD_Core_V' + RELEASE_VERSION + '.user.js');
  }

  function fetchCore() {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: CORE_URL + '?_=' + Date.now(),
        timeout: 45000,
        headers: { Accept: 'text/plain,*/*;q=0.8', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        onload(response) {
          if (response.status < 200 || response.status >= 300) {
            reject(new Error('V1.5.8 稳定核心下载失败：HTTP ' + (response.status || '未知')));
            return;
          }
          const text = String(response.responseText || '');
          try { patchStableCore(text); } catch (error) { reject(error); return; }
          resolve(text);
        },
        onerror: () => reject(new Error('V1.5.8 稳定核心下载网络错误')),
        ontimeout: () => reject(new Error('V1.5.8 稳定核心下载超时')),
      });
    });
  }

  function showFatal(error) {
    console.error('[Kagura POD] V1.5.9 稳定核心启动失败：', error);
    const id = 'kagura-pod-core-load-error-v159';
    if (document.getElementById(id)) return;
    const box = document.createElement('div');
    box.id = id;
    box.style.cssText = 'position:fixed;z-index:2147483647;right:16px;top:16px;max-width:430px;padding:12px 14px;border-radius:10px;background:#7f1d1d;color:#fff;box-shadow:0 10px 30px rgba(0,0,0,.28);font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;white-space:pre-wrap';
    box.textContent = '服装POD统一工作台 V' + RELEASE_VERSION + ' 启动失败\n' + (error?.message || error) + '\n\n请检查网络后刷新页面。';
    (document.body || document.documentElement).appendChild(box);
  }

  async function boot() {
    const cached = GM_getValue(CORE_CACHE_KEY, '');
    const cachedVersion = String(GM_getValue(CORE_CACHE_VERSION_KEY, ''));
    if (typeof cached === 'string' && cached.length >= 240000 && cachedVersion === CORE_VERSION) {
      try { runCore(cached, '本地缓存'); return; }
      catch (error) {
        console.warn('[Kagura POD] 缓存稳定核心校验失败，将重新下载：', error);
        GM_deleteValue(CORE_CACHE_KEY);
        GM_deleteValue(CORE_CACHE_VERSION_KEY);
      }
    }

    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const source = await fetchCore();
        GM_setValue(CORE_CACHE_KEY, source);
        GM_setValue(CORE_CACHE_VERSION_KEY, CORE_VERSION);
        runCore(source, attempt === 1 ? '固定 GitHub V1.5.8 稳定归档' : '第 ' + attempt + ' 次重试下载的固定稳定归档');
        return;
      } catch (error) {
        lastError = error;
        console.warn('[Kagura POD] 稳定核心加载第 ' + attempt + '/3 次失败：', error);
        if (attempt < 3) await new Promise(resolve => setTimeout(resolve, 1200 * attempt));
      }
    }
    showFatal(lastError || new Error('未知启动错误'));
  }

  boot();
})();
