from pathlib import Path
import json

USER = Path('POD_ChatGPT.user.js')
s = USER.read_text(encoding='utf-8')

required = [
    '// @name         ChatGPT服装POD统一工作台 V1.2.2',
    '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.7',
    '// @version      1.6.7',
    "const APP_VERSION = '1.6.7';",
    '  function findCreateNearPlusFallback(plus=findPlus()){',
    '  async function waitCreateItemBounded(plus,before,timeout=5200,interval=180){',
    '    renderTaskList();\n    renderLogWindow(); // 只更新日志窗口顶部计时；正文仅在日志内容变化时重绘',
    "    const signature=JSON.stringify(tasks.map(t=>[t.key,t.id,t.row,t.prompt,t.status,t.error,(t.outputFiles||[]).join('|')]));",
    "setInterval(()=>{try{updatePanel()}catch(_){}},1000);",
]
for marker in required:
    count = s.count(marker)
    if count != 1:
        raise SystemExit(f'expected exactly one marker {marker!r}, got {count}')

s = s.replace('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.7', '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.8', 1)
s = s.replace('// @version      1.6.7', '// @version      1.6.8', 1)
old_desc = '// @description  服装POD统一工作台：V1.6.7 修复 ChatGPT 新版“+”菜单未命中标准弹层根导致无法定位创建图片；保持限频近加号兜底与性能保护。'
new_desc = '// @description  服装POD统一工作台：V1.6.8 性能架构修复：任务列表退出1秒心跳并限制可见DOM；创建图片改为加号局部几何探测，删除全页交互扫描。'
if s.count(old_desc) != 1:
    raise SystemExit('unexpected V1.6.7 description count')
s = s.replace(old_desc, new_desc, 1)
s = s.replace("const APP_VERSION = '1.6.7';", "const APP_VERSION = '1.6.8';", 1)

anchor = ' * - V1.6.7 创建图片菜单兼容修复：移除会误把侧栏当弹层的通用 [data-state="open"] 根匹配；当当前 composer 的“+”已确认 aria-expanded=true 时，增加低频、少次数、仅交互节点且按加号距离过滤的兜底定位，不恢复全页 div/span 高频扫描。'
note = ' * - V1.6.8 性能架构修复：任务列表彻底退出1秒心跳，状态变更/导入/筛选等真实事件才刷新；列表签名不再包含完整提示词，并把可见任务DOM限制为前80条。创建图片删除V1.6.7全页交互节点兜底，改为 aria-controls/aria-owns + 加号附近 elementFromPoint 局部几何探测。上传、发送at-most-once、生图检测、下载与恢复核心不变。\n'
if s.count(anchor) != 1:
    raise SystemExit('V1.6.7 changelog anchor missing')
s = s.replace(anchor, note + anchor, 1)

old_vars = "  let lastTaskListSignature = '';\n  let lastLogPreviewSignature = '';\n  let lastLogWindowSignature = '';"
new_vars = "  let lastTaskListSignature = '';\n  let lastTaskStateSignature = '';\n  let lastLogPreviewSignature = '';\n  let lastLogWindowSignature = '';"
if s.count(old_vars) != 1:
    raise SystemExit('task-list state variable marker mismatch')
s = s.replace(old_vars, new_vars, 1)

old_save = '''  function saveState(render = true) {
    GM_setValue(STATE_KEY, state);
    if (render) updatePanel();
  }
'''
new_save = '''  function taskListStateSignature(){
    return state.tasks.map(t=>`${t.key}|${t.status}|${t.updatedAt||''}|${(t.outputFiles||[]).length}`).join('||');
  }
  function refreshTaskListFromState(force=false){
    if(!panel||settings.flow!=='batch_generation')return;
    const sig=taskListStateSignature();
    if(force||sig!==lastTaskStateSignature){lastTaskStateSignature=sig;renderTaskList(force);}
  }
  function saveState(render = true) {
    GM_setValue(STATE_KEY, state);
    if (render) { updatePanel(); refreshTaskListFromState(); }
  }
'''
if s.count(old_save) != 1:
    raise SystemExit('saveState block mismatch')
s = s.replace(old_save, new_save, 1)

old_render = '''  function renderTaskList(force=false){
    if(!panel||settings.flow!=='batch_generation')return;
    const box=panel.querySelector('[data-role="task-list"]');if(!box)return;
    const tasks=filteredTasks();
    const signature=JSON.stringify(tasks.map(t=>[t.key,t.id,t.row,t.prompt,t.status,t.error,(t.outputFiles||[]).join('|')]));
    if(!force&&signature===lastTaskListSignature)return;
    lastTaskListSignature=signature;
    box.innerHTML=tasks.length?tasks.map(t=>`<div class="pod-task"><b>${escapeHtml(t.id)}</b><div class="pod-task-main"><div class="pod-task-file">Excel 第${escapeHtml(t.row||'-')}行 · 完整提示词</div><div class="pod-task-prompt" title="${escapeAttr(t.error||t.prompt||'')}">${escapeHtml(t.error||t.prompt||'缺少Excel完整提示词')}</div></div><span class="pod-badge s-${t.status}">${statusLabel(t.status)}</span></div>`).join(''):'<div style="padding:15px;text-align:center;color:#98a2b3">暂无任务</div>';
  }
'''
new_render = '''  const TASK_LIST_RENDER_LIMIT=80;
  function renderTaskList(force=false){
    if(!panel||settings.flow!=='batch_generation')return;
    const box=panel.querySelector('[data-role="task-list"]');if(!box)return;
    const allTasks=filteredTasks(),tasks=allTasks.slice(0,TASK_LIST_RENDER_LIMIT);
    const signature=JSON.stringify([allTasks.length,...tasks.map(t=>[t.key,t.id,t.row,t.status,t.updatedAt||'',(t.outputFiles||[]).length])]);
    if(!force&&signature===lastTaskListSignature)return;
    lastTaskListSignature=signature;
    if(!allTasks.length){box.innerHTML='<div style="padding:15px;text-align:center;color:#98a2b3">暂无任务</div>';return;}
    const rows=tasks.map(t=>`<div class="pod-task"><b>${escapeHtml(t.id)}</b><div class="pod-task-main"><div class="pod-task-file">Excel 第${escapeHtml(t.row||'-')}行 · 完整提示词</div><div class="pod-task-prompt" title="${escapeAttr(t.error||t.prompt||'')}">${escapeHtml(t.error||t.prompt||'缺少Excel完整提示词')}</div></div><span class="pod-badge s-${t.status}">${statusLabel(t.status)}</span></div>`).join('');
    const hidden=allTasks.length-tasks.length;
    const more=hidden>0?`<div style="padding:9px 12px;text-align:center;color:#667085;font-size:11px">为保持页面流畅，仅显示前 ${TASK_LIST_RENDER_LIMIT} / ${allTasks.length} 条；可用搜索或状态筛选缩小范围。</div>`:'';
    box.innerHTML=rows+more;
  }
'''
if s.count(old_render) != 1:
    raise SystemExit('renderTaskList block mismatch')
s = s.replace(old_render, new_render, 1)

s = s.replace(
    '    renderTaskList();\n    renderLogWindow(); // 只更新日志窗口顶部计时；正文仅在日志内容变化时重绘',
    '    renderLogWindow(); // 只更新日志窗口顶部计时；正文仅在日志内容变化时重绘',
    1,
)

heartbeat_anchor = '''  function compareVersion(a,b){const aa=String(a||'').split('.').map(x=>Number(x)||0),bb=String(b||'').split('.').map(x=>Number(x)||0),n=Math.max(aa.length,bb.length);for(let i=0;i<n;i++){if((aa[i]||0)>(bb[i]||0))return 1;if((aa[i]||0)<(bb[i]||0))return-1;}return 0;}
'''
heartbeat = '''  function updateHeartbeat(){
    if(!panel)return;
    if(isTemplateWorkflowFlow()){renderLogWindow();return;}
    if(settings.flow!=='batch_generation'){renderLogWindow();return;}
    const set=(role,val)=>{const el=panel.querySelector(`[data-role="${role}"]`);if(el)el.textContent=val;};
    set('total-time',formatDuration(totalRunMs()));
    set('batch-time',formatDuration(batchElapsed()));
    set('generation-time',formatDuration(generationElapsed()));
    set('generated',`${Number(state.detectedGeneratedCount||0)} / ${Number(state.expectedGeneratedCount||0)}`);
    renderLogWindow();
  }

'''
if s.count(heartbeat_anchor) != 1:
    raise SystemExit('heartbeat insertion anchor mismatch')
s = s.replace(heartbeat_anchor, heartbeat + heartbeat_anchor, 1)
s = s.replace("setInterval(()=>{try{updatePanel()}catch(_){}},1000);", "setInterval(()=>{try{updateHeartbeat()}catch(_){}},1000);", 1)
old_between="while(state.running&&Date.now()<end){state.phase='batch_wait';updatePanel();await sleep(Math.min(1000,end-Date.now()))}"
new_between="while(state.running&&Date.now()<end){state.phase='batch_wait';updateHeartbeat();await sleep(Math.min(1000,end-Date.now()))}"
if s.count(old_between) != 1:
    raise SystemExit('betweenBatches heartbeat marker mismatch')
s=s.replace(old_between,new_between,1)

old_fallback = r'''  function findCreateNearPlusFallback(plus=findPlus()){
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
new_fallback = r'''  function controlledCreateRoots(plus){
    if(!(plus instanceof Element))return[];
    const out=[],seen=new Set();
    for(const attr of ['aria-controls','aria-owns']){
      for(const id of String(plus.getAttribute(attr)||'').split(/\s+/).filter(Boolean)){
        const root=document.getElementById(id);
        if(root instanceof Element&&!seen.has(root)&&isVisible(root)&&!insideMessage(root)&&!root.closest('#kagura-pod-panel')&&!isSidebarLike(root)){seen.add(root);out.push(root);}
      }
    }
    return out;
  }
  function findCreateNearPlusLocal(plus=findPlus()){
    if(!(plus instanceof Element))return null;
    let best=null;const inspected=new Set(),pr=plus.getBoundingClientRect();
    const inspect=(root,localSource)=>{
      if(!(root instanceof Element)||inspected.has(root)||!isVisible(root)||insideMessage(root)||root.closest('#kagura-pod-panel')||isSidebarLike(root))return;
      const r=root.getBoundingClientRect();
      if(r.width<70||r.height<24||r.width>760||r.height>820||r.bottom<0||r.top>innerHeight||r.right<0||r.left>innerWidth)return;
      inspected.add(root);
      const info=findCreateInside(root,plus);
      if(info&&(!best||info.score>best.score))best={...info,localSource};
    };
    for(const root of controlledCreateRoots(plus))inspect(root,'aria-control');
    if(best)return best;
    const px=pr.left+pr.width/2,py=pr.top+pr.height/2;
    const xOffsets=[-90,-30,35,110,190,270,350];
    const yOffsets=[-34,-70,-110,-155,-205,-265,-335,-415];
    for(const yo of yOffsets){
      for(const xo of xOffsets){
        const x=Math.max(2,Math.min(innerWidth-3,px+xo)),y=Math.max(2,Math.min(innerHeight-3,py+yo));
        let cur=document.elementFromPoint(x,y);
        for(let depth=0;cur&&cur!==document.body&&depth<9;depth++,cur=cur.parentElement){
          if(!(cur instanceof Element)||insideMessage(cur)||cur.closest('#kagura-pod-panel')||isSidebarLike(cur))continue;
          const r=cur.getBoundingClientRect();
          const dx=Math.max(0,pr.left-r.right,r.left-pr.right),dy=Math.max(0,pr.top-r.bottom,r.top-pr.bottom);
          if(dx>520||dy>650)continue;
          inspect(cur,'geometry');
          if(best&&best.score>=3200)return best;
        }
      }
    }
    return best;
  }
'''
if s.count(old_fallback) != 1:
    raise SystemExit('V1.6.7 full-document fallback block mismatch')
s = s.replace(old_fallback, new_fallback, 1)

old_wait = '''  async function waitCreateItemBounded(plus,before,timeout=5200,interval=180){
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
new_wait = '''  async function waitCreateItemBounded(plus,before,timeout=5200,interval=240){
    const started=Date.now();let scans=0,localScans=0,nextLocalAt=0;
    while(Date.now()-started<timeout){
      if(!state.running)throw new PausedError();
      const info=nearbyVisibleCreateFromRoots(before,plus);scans++;
      if(info)return{...info,source:'bounded-visible-root',scans,localScans};
      const now=Date.now(),expanded=plus?.getAttribute?.('aria-expanded')==='true';
      if(expanded&&now>=nextLocalAt){
        const local=findCreateNearPlusLocal(plus);localScans++;nextLocalAt=now+480;
        if(local)return{...local,source:`bounded-${local.localSource||'local-geometry'}`,scans,localScans};
      }
      await sleep(interval);
    }
    return null;
  }
'''
if s.count(old_wait) != 1:
    raise SystemExit('waitCreateItemBounded V1.6.7 body mismatch')
s = s.replace(old_wait, new_wait, 1)

old_diag = "    const p=plus?`aria-expanded=${plus.getAttribute('aria-expanded')||'-'} aria-haspopup=${plus.getAttribute('aria-haspopup')||'-'} testid=${plus.getAttribute('data-testid')||'-'}`:'+按钮未找到';\n    const near=plus&&plus.getAttribute('aria-expanded')==='true'?findCreateNearPlusFallback(plus):null;\n    return `${p}；当前可见弹层根=${roots.length}${texts.length?`；弹层文字=${texts.join(' || ')}`:''}${near?`；近加号候选=${near.tx}`:''}`;"
new_diag = "    const p=plus?`aria-expanded=${plus.getAttribute('aria-expanded')||'-'} aria-haspopup=${plus.getAttribute('aria-haspopup')||'-'} testid=${plus.getAttribute('data-testid')||'-'}`:'+按钮未找到';\n    const local=plus&&plus.getAttribute('aria-expanded')==='true'?findCreateNearPlusLocal(plus):null;\n    return `${p}；当前可见弹层根=${roots.length}${texts.length?`；弹层文字=${texts.join(' || ')}`:''}${local?`；局部候选=${local.tx}(${local.localSource||'local'})`:''}`;"
if s.count(old_diag) != 1:
    raise SystemExit('V1.6.7 diagnostics marker mismatch')
s = s.replace(old_diag, new_diag, 1)

if 'function findCreateNearPlusFallback(' in s:
    raise SystemExit('V1.6.7 full-document fallback still present')
if 'document.querySelectorAll(CREATE_CLICK_SELECTOR)' in s:
    raise SystemExit('document-wide interactive create scan still present')
if 'function findCreateNearPlusLocal(' not in s or 'document.elementFromPoint(x,y)' not in s:
    raise SystemExit('local geometry create detection missing')
if 'function controlledCreateRoots(' not in s:
    raise SystemExit('aria controlled-root detection missing')
if 'function createWatcher(' in s or 'observer.observe(document.body||document.documentElement' in s:
    raise SystemExit('whole-body observer regression detected')
if "document.querySelectorAll('button,[role=\"button\"],[role=\"menuitem\"],[role=\"option\"],[data-radix-collection-item],div,span')" in s:
    raise SystemExit('broad full-document div/span create scan detected')
if 'const TASK_LIST_RENDER_LIMIT=80;' not in s:
    raise SystemExit('task list DOM limit missing')
if 't.row,t.prompt,t.status' in s:
    raise SystemExit('task list signature still contains full prompt')
update_start=s.index('  function updatePanel(){')
update_end=s.index('  function updateHeartbeat(){',update_start)
if 'renderTaskList();' in s[update_start:update_end]:
    raise SystemExit('task list still attached to full panel update')
if "setInterval(()=>{try{updatePanel()}catch(_){}},1000);" in s:
    raise SystemExit('one-second full updatePanel heartbeat still present')
if old_between in s:
    raise SystemExit('betweenBatches still calls full updatePanel every second')
if "setInterval(()=>{try{updateHeartbeat()}catch(_){}},1000);" not in s:
    raise SystemExit('lightweight heartbeat missing')
if "const pathBefore=location.pathname;let last;" not in s or 'isSidebarLike' not in s:
    raise SystemExit('route/sidebar safety guards missing')
for stable in ['async function waitUploads(','async function sendPrompt(','async function processBatch()','async function downloadNormal(']:
    if stable not in s:
        raise SystemExit(f'stable core marker missing: {stable}')

USER.write_text(s, encoding='utf-8')
header_end = s.index('// ==/UserScript==') + len('// ==/UserScript==')
Path('POD_ChatGPT.meta.js').write_text(s[:header_end] + '\n', encoding='utf-8')

changelog = [
    '任务列表从1秒状态心跳中彻底移除：只有导入Excel、任务状态持久化、搜索/筛选、手动操作等真实事件才刷新任务列表，避免空闲和生图期间持续处理整批任务数据。',
    '任务列表变更签名不再包含完整提示词正文；任务记录DOM最多显示当前筛选结果前80条，更多任务通过搜索/状态筛选查看，降低500条长提示词带来的主线程和DOM压力。',
    '创建图片入口删除V1.6.7的document全页交互节点兜底；菜单未命中标准弹层根时，优先使用加号aria-controls/aria-owns，再以加号附近少量elementFromPoint坐标探测真实局部菜单容器，只在局部容器内匹配创建图片。',
    '1秒心跳仅更新运行时间、生图计数和日志窗口计时；保留当前composer绑定、严格创建图片前缀、侧栏排除和会话路径保护。上传恢复、发送at-most-once、生图检测、下载隔离、任务映射与暂停恢复核心不变。',
]
latest = {
    'version': '1.6.8',
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
if h.get('versions', [{}])[0].get('version') != '1.6.7':
    raise SystemExit('history head is not V1.6.7')
h['versions'].insert(0, {'version': '1.6.8', 'date': '2026-08-26', 'notes': changelog})
hp.write_text(json.dumps(h, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
