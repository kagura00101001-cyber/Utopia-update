// ==UserScript==
// @name         ChatGPT服装POD统一工作台
// @name:zh-CN   ChatGPT服装POD统一工作台 V1.2.3
// @namespace    https://github.com/Kagura-userscripts
// @version      1.2.3
// @description  服装POD统一工作台：V1.2.3 修复Excel空白表头误判和34条问题，按有效任务量选择工作表，完整中文生图提示词最高优先，并优化任务表导入显示。
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

  /*
   * ================================================================
   * ChatGPT服装POD统一工作台 V1.2.3
   * ================================================================
   * 架构原则：
   * - 完全独立运行，不依赖 Ozon/洗图脚本，不动态加载/执行旧脚本。
   * - ChatGPT 页面交互、附件稳定检测、创建图片、提示词无损写入、
   *   发送确认、生成进度/懒加载恢复等，沿用已验证 V3.1.2 的实现思路。
   * - Excel任务、任务范围、pending/done/error、中断恢复、POD输出命名为新逻辑。
   * - V1.2.0 起采用“统一工作台 + 流程适配器”结构：一个界面完成一个完整流程；当前完整实现批量生图，后续流程共享同一交互核心。
 * - V1.2.1 仅调整模板图选项布局与启停交互，不修改已验证的 ChatGPT 上传/发送/生图检测核心。
 * - V1.2.2 调整运行参数布局、日志/任务列表按需重绘、母提示词可留空、Excel完整提示词列优先识别，并加入独立手动热更新提醒。
 * - V1.2.3 修复空白单元格被误判为表头导致只识别34条的问题；所有工作表按有效任务量评分，完整中文生图提示词最高优先；任务表改为按钮选择并显示实际识别信息。
   * - 已确认发送后的任务遵循 at-most-once：优先恢复检测，不轻易重复发送。
   * ================================================================
   */

  const APP_VERSION = '1.2.3';
  const APP_NAME = `ChatGPT服装POD统一工作台 V${APP_VERSION}`;

  const STATE_KEY = 'kaguraPodStandaloneStateV120';
  const SETTINGS_KEY = 'kaguraPodStandaloneSettingsV120';
  const LOG_KEY = 'kaguraPodStandaloneLogsV120';
  const LEGACY_STATE_KEY = 'kaguraPodStandaloneStateV110';
  const LEGACY_SETTINGS_KEY = 'kaguraPodStandaloneSettingsV110';
  const LEGACY_LOG_KEY = 'kaguraPodStandaloneLogsV110';

  const DB_NAME = 'kagura-pod-standalone-v1';
  const DB_STORE = 'handles';
  const SOURCE_KEY = 'source-directory';
  const OUTPUT_KEY = 'output-directory';
  const TEMPLATE_KEY = 'template-file';

  // 独立手动热更新通道：只检查/提醒，不会自动下载、替换或执行新版。
  const UPDATE_MANIFEST = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.latest.json';
  const UPDATE_DOWNLOAD_FALLBACK = 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js';
  const UPDATE_SUPPRESS_KEY = 'kaguraPodUpdateSuppressVersionV1';

  const BASE_REBUILD_PROMPT = [
    '你将收到多张服装、成衣或模特展示参考图。每张参考图代表一个独立POD任务，必须严格一图对应一图处理，禁止不同参考图之间混用图案元素。',
    '任务是高相似重建每张参考图中用于POD生产的印花/图案本体，而不是重做整件衣服或商品场景。',
    '1. 只提取并重建衣服上的核心图案、文字、Logo、装饰纹样和与印花直接相关的视觉元素。',
    '2. 忠实保持原图案主体、构图、比例、颜色、文字拼写、字体风格、线条、纹理、明暗、层次和整体视觉风格，不自行重新设计。',
    '3. 删除衣服轮廓、布料底色、褶皱、缝线、领口、袖子、模特、人体、衣架、背景、桌面、环境、商品阴影和与图案无关的元素。',
    '4. 若原图案因衣服褶皱、透视或弧面产生变形，按照合理的二维平面结构还原，不把布料变形复制进生产图。',
    '5. 输出完整、正向、居中的二维平面图案，四周保留合理安全留白；不要生成T恤Mockup、模特穿着效果或场景图。',
    '6. 不新增参考图中不存在的文字、Logo、符号或装饰；看不清的细节不要擅自编造。',
    '7. 尽可能保留高清细节和清晰边缘。背景优先透明；若无法可靠透明，则使用纯白背景。',
    '8. 本批上传几张参考图，就必须生成几张结果图；输出顺序严格对应上传顺序。'
  ].join('\n');

  const BASE_ENHANCE_PROMPT = [
    '你将收到多张独立POD图案参考图。必须严格一图对应一图处理，禁止不同图片之间混用元素。',
    '请对每张图案进行高保真高清重建，保持原图案内容、构图、比例、文字、Logo、颜色、线条、纹理和风格不变，不重新设计、不添加元素、不删除元素。',
    '重点修复低清、锯齿、压缩噪点、模糊边缘和细节丢失，使轮廓与纹理更清晰，适合后续POD印花生产。',
    '输出完整二维平面图案，不生成衣服、模特、Mockup、场景；优先透明背景，无法可靠透明时使用纯白背景。',
    '本批上传几张参考图，就必须生成几张结果图；输出顺序严格对应上传顺序。'
  ].join('\n');

  const DEFAULT_STATE = {
    tasks: [],
    importedFileName: '',
    importedSheetName: '',
    importedHeaders: {},
    importedStats: {},
    imagePaths: [],
    running: false,
    phase: 'idle',
    batchNo: 1,
    currentBatchKeys: [],
    currentBatchPaths: [],
    expectedGeneratedCount: 0,
    detectedGeneratedCount: 0,
    startedAt: 0,
    totalRunMs: 0,
    runSegmentStartedAt: 0,
    batchStartedAt: 0,
    generationStartedAt: 0,
    lastBatchElapsedMs: 0,
    lastGenerationElapsedMs: 0,
    generatedCountChangedAt: 0,
    resumeContext: null,
  };

  const DEFAULT_SETTINGS = {
    flow: 'batch_generation',
    mode: 'rebuild',
    rebuildPrompt: BASE_REBUILD_PROMPT,
    enhancePrompt: BASE_ENHANCE_PROMPT,
    customPrompt: '',
    batchSize: 3,
    rangeStart: 1,
    rangeEnd: 999999,
    useTemplate: false,
    newChatEachBatch: true,
    uploadTimeout: 180000,
    generationTimeout: 900000,
    stableSeconds: 15,
    intervalMin: 4000,
    intervalMax: 7000,
    filter: 'all',
    search: '',
  };

  const savedState = GM_getValue(STATE_KEY, null) ?? GM_getValue(LEGACY_STATE_KEY, null);
  const savedSettings = GM_getValue(SETTINGS_KEY, null) ?? GM_getValue(LEGACY_SETTINGS_KEY, {});
  const savedLogs = GM_getValue(LOG_KEY, null) ?? GM_getValue(LEGACY_LOG_KEY, []);
  let state = normalizeState(savedState);
  let settings = { ...DEFAULT_SETTINGS, ...(savedSettings || {}) };
  if (!['batch_generation', 'style_reverse', 'diecut_design'].includes(settings.flow)) settings.flow = 'batch_generation';
  let logs = Array.isArray(savedLogs) ? savedLogs.slice(-3000) : [];

  let panel = null;
  let logWindow = null;
  let workerActive = false;
  let logAutoScroll = true;
  let lastTaskListSignature = '';
  let lastLogPreviewSignature = '';
  let lastLogWindowSignature = '';

  class PausedError extends Error { constructor(){ super('任务已暂停'); this.name='PausedError'; } }
  class UploadRetryableError extends Error { constructor(m){ super(m || '附件上传失败'); this.name='UploadRetryableError'; } }

  function normalizeState(saved) {
    const merged = saved && typeof saved === 'object' ? { ...DEFAULT_STATE, ...saved } : { ...DEFAULT_STATE };
    if (!Array.isArray(merged.tasks)) merged.tasks = [];
    if (!Array.isArray(merged.imagePaths)) merged.imagePaths = [];
    if (!Array.isArray(merged.currentBatchKeys)) merged.currentBatchKeys = [];
    if (!Array.isArray(merged.currentBatchPaths)) merged.currentBatchPaths = [];
    return merged;
  }

  function saveState(render = true) {
    GM_setValue(STATE_KEY, state);
    if (render) updatePanel();
  }
  function saveSettings(render = false) {
    GM_setValue(SETTINGS_KEY, settings);
    if (render) updatePanel();
  }
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function nowText(d=new Date()){ return d.toLocaleTimeString('zh-CN',{hour12:false}); }
  function stamp(d=new Date()) { const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`; }
  function formatDuration(ms){ const s=Math.max(0,Math.floor(Number(ms||0)/1000)); const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),ss=s%60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`; }
  function phaseLabel(p=state.phase){ return ({idle:'等待配置',ready:'准备开始',preparing:'准备当前批次',uploading_source:'上传参考图',activating_create_image:'添加创建图片模式',uploading_template:'上传模板图',writing_prompt:'写入提示词',sending:'发送并确认提交',generating:'等待/检测生图',downloading:'下载保存',recovering:'恢复检测',refreshing:'刷新同步结果',batch_wait:'批次间等待',pending:'异常待确认',error:'异常暂停',done:'全部完成'})[p]||String(p||'未知'); }
  function totalRunMs(){ return Number(state.totalRunMs||0)+(state.runSegmentStartedAt?Math.max(0,Date.now()-state.runSegmentStartedAt):0); }
  function batchElapsed(){ return state.batchStartedAt?Date.now()-state.batchStartedAt:Number(state.lastBatchElapsedMs||0); }
  function generationElapsed(){ return state.generationStartedAt?Date.now()-state.generationStartedAt:Number(state.lastGenerationElapsedMs||0); }
  function startRunClock(){ if(!state.startedAt)state.startedAt=Date.now(); if(!state.runSegmentStartedAt)state.runSegmentStartedAt=Date.now(); }
  function stopRunClock(){ if(state.runSegmentStartedAt){ state.totalRunMs=Number(state.totalRunMs||0)+Math.max(0,Date.now()-state.runSegmentStartedAt); state.runSegmentStartedAt=0; } }
  function finishBatchTimers(){ if(state.batchStartedAt)state.lastBatchElapsedMs=Date.now()-state.batchStartedAt; if(state.generationStartedAt)state.lastGenerationElapsedMs=Date.now()-state.generationStartedAt; state.batchStartedAt=0;state.generationStartedAt=0;state.generatedCountChangedAt=0;state.expectedGeneratedCount=0;state.detectedGeneratedCount=0; }

  function log(message,type='info'){
    const d=new Date();
    const entry={time:d.toISOString(),localTime:nowText(d),type,message:String(message),batchNo:Number(state.batchNo||0),phase:state.phase,expected:Number(state.expectedGeneratedCount||0),detected:Number(state.detectedGeneratedCount||0)};
    logs.push(entry); if(logs.length>3000) logs=logs.slice(-3000); GM_setValue(LOG_KEY,logs);
    const method=type==='error'?'error':type==='warn'?'warn':'log'; console[method](`[${APP_NAME}] ${message}`);
    renderLogPreview(); renderLogWindow();
  }
  function logLine(e){ const p=e.type==='error'?'失败':e.type==='success'?'成功':e.type==='warn'?'提示':'信息'; const b=e.batchNo?` [第${e.batchNo}批]`:''; const g=e.expected?` [生图${e.detected}/${e.expected}]`:''; return `[${e.localTime||''}] ${p}${b}${g}：${e.message}`; }
  function downloadText(name,text,type='text/plain;charset=utf-8'){ const u=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),2500); }
  function exportLogs(){ const head=[`脚本：${APP_NAME}`,`导出：${new Date().toLocaleString('zh-CN',{hour12:false})}`,`页面：${location.href}`,`总运行：${formatDuration(totalRunMs())}`,`当前阶段：${phaseLabel()}`,'-----------------------------------']; downloadText(`POD运行日志_V${APP_VERSION}_${stamp()}.txt`,'\uFEFF'+[...head,...logs.map(logLine)].join('\r\n')); }

  function openDb(){ return new Promise((resolve,reject)=>{ const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(DB_STORE))r.result.createObjectStore(DB_STORE)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||new Error('无法打开授权数据库')); }); }
  async function saveHandle(key,handle){const db=await openDb();await new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(handle,key);tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();}
  async function getHandle(key){const db=await openDb();const h=await new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readonly');const r=tx.objectStore(DB_STORE).get(key);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)});db.close();return h;}
  async function clearHandles(){const db=await openDb();await new Promise((res,rej)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});db.close();}
  async function permission(handle,mode='read',request=false){if(!handle)return'denied';const o={mode};try{if(await handle.queryPermission(o)==='granted')return'granted';if(request&&await handle.requestPermission(o)==='granted')return'granted';}catch(_){}return'denied';}
  async function chooseSource(){const picker=unsafeWindow.showDirectoryPicker||window.showDirectoryPicker;if(typeof picker!=='function')throw new Error('当前浏览器不支持选择文件夹，请使用最新版Chrome/Edge');const h=await picker.call(unsafeWindow,{mode:'readwrite'});await saveHandle(SOURCE_KEY,h);await updateFolderLabels();log(`参考图目录：${h.name}`,'success');await scanImages();}
  async function chooseOutput(){const picker=unsafeWindow.showDirectoryPicker||window.showDirectoryPicker;if(typeof picker!=='function')throw new Error('当前浏览器不支持选择文件夹');const h=await picker.call(unsafeWindow,{mode:'readwrite'});await saveHandle(OUTPUT_KEY,h);log(`输出目录：${h.name}`,'success');updateFolderLabels();}
  async function chooseTemplate(){const picker=unsafeWindow.showOpenFilePicker||window.showOpenFilePicker;if(typeof picker!=='function')throw new Error('当前浏览器不支持选择模板图');const [h]=await picker.call(unsafeWindow,{multiple:false,types:[{description:'图片',accept:{'image/*':['.jpg','.jpeg','.png','.webp']}}]});if(!h)return;await saveHandle(TEMPLATE_KEY,h);settings.useTemplate=true;saveSettings();log(`模板图：${h.name}`,'success');updateFolderLabels();}
  function naturalCompare(a,b){return String(a).localeCompare(String(b),'zh-CN',{numeric:true,sensitivity:'base'});}
  function isImageName(n){return /\.(?:jpe?g|png|webp|gif|bmp)$/i.test(n||'');}
  async function listImages(dir,prefix=''){const arr=[];for await(const e of dir.values()){const p=prefix?`${prefix}/${e.name}`:e.name;if(e.kind==='file'&&isImageName(e.name))arr.push(p);else if(e.kind==='directory')arr.push(...await listImages(e,p));}return arr;}
  async function scanImages(){const h=await getHandle(SOURCE_KEY);if(!h)throw new Error('请先选择参考图目录');if(await permission(h,'read',true)!=='granted')throw new Error('没有参考图读取权限');state.imagePaths=(await listImages(h)).sort(naturalCompare);if(!state.imagePaths.length)throw new Error('参考图目录没有找到图片');state.phase='ready';resolveAllTasks();saveState();log(`已扫描 ${state.imagePaths.length} 张参考图`,'success');}
  async function getFileByPath(dir,path){const parts=String(path).split('/').filter(Boolean);let cur=dir;for(let i=0;i<parts.length-1;i++)cur=await cur.getDirectoryHandle(parts[i]);return (await cur.getFileHandle(parts.at(-1))).getFile();}
  async function writeBlob(dir,name,blob){if(await permission(dir,'readwrite',false)!=='granted')throw new Error('输出目录写入权限失效，请重新选择');const fh=await dir.getFileHandle(name,{create:true});const w=await fh.createWritable();await w.write(blob);await w.close();}

  function norm(v){return String(v??'').trim().toLowerCase().replace(/[\s\n\r\t_\-—–（）()【】\[\]：:]/g,'');}
  const ID_HEADERS=['序号','编号','任务编号','dna编号','dna','id','no','款号','图号','图片编号'];
  const PROMPT_HEADER_PRIORITY=[
    ['完整中文生图提示词',300],
    ['完整中文提示词',290],
    ['完整生图提示词',280],
    ['完整提示词',270],
    ['成图提示词',240],
    ['中文生图提示词',235],
    ['中文提示词',230],
    ['生成提示词',210],
    ['生图提示词',205],
    ['图片提示词',195],
    ['prompt',185],
    ['提示词',170],
  ];
  const IMAGE_HEADERS=['参考图','参考图片','原图','图片文件','图片名','文件名','image','filename','file','主图'];

  function headerScore(v,list){
    const h=norm(v);
    if(!h)return 0; // 关键修复：空字符串不能参与 includes，否则任何表头都会误命中空白单元格。
    let s=0;
    for(const x of list){
      const k=norm(x);
      if(!k)continue;
      if(h===k)s=Math.max(s,160);
      else if(h.length<=24&&k.length>=2&&(h.includes(k)||k.includes(h)))s=Math.max(s,80);
    }
    return s;
  }

  function promptHeaderScore(v){
    const h=norm(v);
    if(!h)return 0; // 同上，禁止空白单元格成为“完整提示词”候选。
    let best=0;
    for(const [name,score] of PROMPT_HEADER_PRIORITY){
      const k=norm(name);
      if(!k)continue;
      if(h===k) best=Math.max(best,score);
      else if(h.length<=32&&k.length>=2&&(h.includes(k)||k.includes(h))) best=Math.max(best,Math.max(100,score-85));
    }
    return best;
  }

  function candidateDataStats(rows,headerRow,id,prompt,image){
    let idCount=0,promptCount=0,imageCount=0,taskRows=0;
    const end=rows.length;
    for(let r=headerRow+1;r<end;r++){
      const row=rows[r]||[];
      const rid=id>=0?String(row[id]??'').trim():'';
      const p=prompt>=0?String(row[prompt]??'').trim():'';
      const img=image>=0?String(row[image]??'').trim():'';
      if(rid)idCount++;
      if(p)promptCount++;
      if(img)imageCount++;
      if(rid||p||img)taskRows++;
    }
    return {idCount,promptCount,imageCount,taskRows};
  }

  function detectSheet(workbook){
    let best=null;
    const candidates=[];
    for(const sn of workbook.SheetNames){
      const rows=XLSX.utils.sheet_to_json(workbook.Sheets[sn],{header:1,raw:false,defval:'',blankrows:true});
      for(let r=0;r<Math.min(40,rows.length);r++){
        const row=rows[r]||[];
        let id=-1,prompt=-1,image=-1,is=0,ps=0,ims=0;
        for(let c=0;c<row.length;c++){
          let q=headerScore(row[c],ID_HEADERS); if(q>is){is=q;id=c}
          q=promptHeaderScore(row[c]); if(q>ps){ps=q;prompt=c}
          q=headerScore(row[c],IMAGE_HEADERS); if(q>ims){ims=q;image=c}
        }
        if(!is||id<0)continue;
        const stats=candidateDataStats(rows,r,id,prompt,image);
        if(!stats.taskRows)continue;

        /*
         * 排名原则：
         * 1) 有真实提示词列的任务表明显优先；
         * 2) 其后比较实际非空提示词数量和有效任务行数量，而不是只看表头文字；
         * 3) 最后才用表头匹配分数做细粒度决胜。
         * 这样“500条提示词”会稳定胜过“规则说明/统计表”等辅助工作表。
         */
        const score=
          (ps>0?100000000:0)
          + stats.promptCount*100000
          + stats.taskRows*1000
          + stats.idCount*100
          + stats.imageCount*10
          + is*20 + ps*10 + ims;
        const candidate={sheetName:sn,rows,headerRow:r,id,prompt,image,score,idScore:is,promptScore:ps,imageScore:ims,...stats};
        candidates.push(candidate);
        if(!best||candidate.score>best.score)best=candidate;
      }
    }
    if(best)best.candidates=candidates;
    return best;
  }

  function taskId(v,index){let s=String(v??'').trim();if(!s)s=String(index+1);if(/^\d+(?:\.0+)?$/.test(s))s=String(parseInt(s,10));return s;}
  function basename(p){return String(p||'').split('/').pop()||'';}
  function stem(p){return basename(p).replace(/\.[^.]+$/,'');}
  function sanitizeName(n){return String(n||'').replace(/[\\/:*?"<>|\x00-\x1F]/g,'_').replace(/[. ]+$/g,'').slice(0,150)||'POD';}
  async function importExcel(file){
    const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
    const m=detectSheet(wb);
    if(!m) throw new Error('没有识别到有效任务表。请确认至少存在“编号 / 任务编号 / 序号 / ID”等编号列。');
    const tasks=[];
    for(let r=m.headerRow+1;r<m.rows.length;r++){
      const row=m.rows[r]||[];
      const prompt=m.prompt>=0?String(row[m.prompt]??'').trim():'';
      const rawId=String(row[m.id]??'').trim();
      const img=m.image>=0?String(row[m.image]??'').trim():'';
      if(!prompt&&!rawId&&!img) continue;
      const id=taskId(rawId,tasks.length);
      tasks.push({key:`${id}::${r+1}`,id,imageName:img,prompt,status:'pending',sourcePath:'',outputFiles:[],error:'',attempts:0,row:r+1,updatedAt:new Date().toISOString()});
    }
    if(!tasks.length) throw new Error('任务表没有读取到有效任务行');
    state.tasks=tasks;
    state.importedFileName=file.name;
    state.importedSheetName=m.sheetName;
    state.importedHeaders={
      id:String(m.rows[m.headerRow][m.id]||''),
      prompt:m.prompt>=0?String(m.rows[m.headerRow][m.prompt]||''):'',
      image:m.image>=0?String(m.rows[m.headerRow][m.image]||''):''
    };
    state.importedStats={
      headerRow:m.headerRow+1,
      idCount:m.idCount||0,
      promptCount:m.promptCount||0,
      imageCount:m.imageCount||0,
      taskRows:m.taskRows||tasks.length,
      candidateCount:Array.isArray(m.candidates)?m.candidates.length:0,
    };
    state.batchNo=1;state.currentBatchKeys=[];state.currentBatchPaths=[];state.resumeContext=null;
    resolveAllTasks();refreshMissingPromptStates();state.phase='ready';saveState();
    const promptInfo=m.prompt>=0?`提示词列“${state.importedHeaders.prompt}”非空 ${m.promptCount||0} 条`:'未检测到提示词列';
    log(`Excel导入成功：${file.name}｜工作表“${m.sheetName}”｜编号列“${state.importedHeaders.id}”｜${promptInfo}｜最终任务 ${tasks.length} 条`,'success');
  }
  function resolveAllTasks(){if(!state.tasks.length||!state.imagePaths.length)return;const byBase=new Map(),byStem=new Map(),byNumeric=new Map();for(const path of state.imagePaths){const base=basename(path).toLowerCase(),st=stem(path).toLowerCase();byBase.set(base,path);if(!byStem.has(st))byStem.set(st,path);if(/^\d+$/.test(st)){const nk=String(Number(st));if(!byNumeric.has(nk))byNumeric.set(nk,path);}}for(const t of state.tasks){let p='';if(t.imageName){const ib=basename(t.imageName).toLowerCase(),is=stem(t.imageName).toLowerCase();p=byBase.get(ib)||byStem.get(is)||(/^\d+$/.test(is)?byNumeric.get(String(Number(is))):'')||'';}const tid=String(t.id).toLowerCase();if(!p)p=byStem.get(tid)||(/^\d+$/.test(tid)?byNumeric.get(String(Number(tid))):'')||'';t.sourcePath=p;if(!p&&t.status!=='done'){t.error='未匹配到参考图';}else if(t.error==='未匹配到参考图')t.error='';}}
  function activeTasks(){const a=Math.max(1,Number(settings.rangeStart)||1),b=Math.max(a,Number(settings.rangeEnd)||999999);return state.tasks.filter((t,i)=>i+1>=a&&i+1<=b);}
  function pendingTasks(){return activeTasks().filter(t=>t.status!=='done'&&t.status!=='skipped'&&t.sourcePath);}
  function findTask(key){return state.tasks.find(t=>t.key===key)||null;}
  function currentBatchTasks(){return state.currentBatchKeys.map(findTask).filter(Boolean);}

  function basePrompt(){if(settings.mode==='enhance')return String(settings.enhancePrompt||'').trim();if(settings.mode==='custom')return String(settings.customPrompt||'').trim();return String(settings.rebuildPrompt||'').trim();}
  function taskHasEffectivePrompt(task){return Boolean(basePrompt()||String(task?.prompt||'').trim());}
  function refreshMissingPromptStates(){
    const hasBase=Boolean(basePrompt());
    for(const t of state.tasks){
      const hasRow=Boolean(String(t.prompt||'').trim());
      const isPromptError=t.status==='error'&&/^缺少提示词/.test(String(t.error||''));
      if(!hasBase&&!hasRow&&t.status!=='done'&&t.status!=='confirm'&&t.status!=='skipped'){
        t.status='error';
        t.error='缺少提示词：母提示词和Excel当前行提示词均为空';
        t.updatedAt=new Date().toISOString();
      }else if((hasBase||hasRow)&&isPromptError){
        t.status='pending';
        t.error='';
        t.updatedAt=new Date().toISOString();
      }
    }
  }
  function buildBatchPrompt(tasks){
    const base=basePrompt();
    const lines=[];
    if(base) lines.push(base);
    lines.push('【本批任务映射】');
    tasks.forEach((t,i)=>{
      lines.push(`第${i+1}张参考图｜任务编号：${t.id}`);
      if(String(t.prompt||'').trim()) lines.push(`${base?'该图补充要求':'该图完整要求'}：${String(t.prompt).trim()}`);
    });
    lines.push(`请严格生成 ${tasks.length} 张结果图，顺序与上传的 ${tasks.length} 张参考图完全一致。`);
    return lines.filter(Boolean).join('\n');
  }

  async function validateHandles(request=true){const source=await getHandle(SOURCE_KEY),output=await getHandle(OUTPUT_KEY),template=await getHandle(TEMPLATE_KEY);if(!source)throw new Error('请先选择参考图目录');if(!output)throw new Error('请先选择输出目录');if(await permission(source,'read',request)!=='granted')throw new Error('没有参考图目录读取权限');if(await permission(output,'readwrite',request)!=='granted')throw new Error('没有输出目录写入权限');if(settings.useTemplate){if(!template)throw new Error('已启用模板图，但尚未选择模板图');if(await permission(template,'read',request)!=='granted')throw new Error('没有模板图读取权限');}return{source,output,template};}

  // ========================== 稳定 ChatGPT 交互层 ==========================
  function isVisible(el){if(!(el instanceof Element))return false;const r=el.getBoundingClientRect(),s=getComputedStyle(el);return r.width>1&&r.height>1&&s.visibility!=='hidden'&&s.display!=='none'&&Number(s.opacity||1)>0;}
  function text(el){return `${el?.innerText||el?.textContent||''} ${el?.getAttribute?.('aria-label')||''} ${el?.getAttribute?.('title')||''}`.trim();}
  async function waitUntil(check,timeout,interval=500,allowPaused=false){const start=Date.now();let last;while(Date.now()-start<timeout){if(!allowPaused&&!state.running)throw new PausedError();try{const r=await check();if(r)return r;}catch(e){last=e;}await sleep(interval);}if(last)throw last;return null;}
  function findClickable(patterns,root=document){const re=new RegExp(patterns.join('|'),'i');return [...root.querySelectorAll('button,[role="button"],[role="menuitem"],a')].filter(isVisible).filter(e=>!e.closest('#kagura-pod-panel')).filter(e=>re.test(text(e))).sort((a,b)=>a.getBoundingClientRect().top-b.getBoundingClientRect().top)[0]||null;}
  function findPromptEditor(){const sels=['#prompt-textarea','textarea[name="prompt-textarea"]','textarea[data-testid="prompt-textarea"]','form[data-type="unified-composer"] textarea','form[data-type="unified-composer"] [contenteditable="true"]','[data-composer-surface="true"] textarea','[data-composer-surface="true"] [contenteditable="true"]','div[contenteditable="true"][data-lexical-editor="true"]','main textarea','main div[contenteditable="true"]'];const seen=new Set(),arr=[];for(const sel of sels)for(const e of document.querySelectorAll(sel)){if(seen.has(e))continue;seen.add(e);if(!isVisible(e)||e.closest('#kagura-pod-panel'))continue;if(!(e instanceof HTMLTextAreaElement)&&!(e instanceof HTMLInputElement)&&e.getAttribute('contenteditable')!=='true')continue;const r=e.getBoundingClientRect();if(r.width<120||r.height<12)continue;let score=r.bottom;if(e.id==='prompt-textarea')score+=20000;if(e.getAttribute('name')==='prompt-textarea')score+=15000;if(e.closest('form[data-type="unified-composer"]'))score+=12000;if(e.closest('[data-composer-surface="true"]'))score+=10000;if(e.closest('form'))score+=3000;if(r.top>innerHeight*.45)score+=1500;if(e.closest('[data-message-author-role],article')&&!e.closest('form[data-type="unified-composer"],[data-composer-surface="true"]'))score-=30000;arr.push({e,score,r});}arr.sort((a,b)=>b.score-a.score||b.r.bottom-a.r.bottom);return arr[0]?.e||null;}
  function findComposer(){const e=findPromptEditor();return e?.closest('form[data-type="unified-composer"]')||e?.closest('[data-composer-surface="true"]')||e?.closest('form')||document.querySelector('form[data-type="unified-composer"]')||document.querySelector('[data-composer-surface="true"]')||document;}
  async function goNewChat(){const d=document.querySelector('a[data-testid="create-new-chat-button"],button[data-testid="create-new-chat-button"],a[aria-label*="新聊天"],button[aria-label*="新聊天"],a[aria-label*="New chat"],button[aria-label*="New chat"]')||findClickable(['新聊天','新建聊天','New chat']);if(d)d.click();else{history.pushState({},'', '/');window.dispatchEvent(new PopStateEvent('popstate'));}if(!await waitUntil(()=>findPromptEditor(),30000,500))throw new Error('新建对话后未找到输入框');await sleep(1000);}
  function findFileInput(){const a=[...document.querySelectorAll('input[type="file"]')];return a.find(i=>!i.accept||/image|png|jpe?g|webp|\*/i.test(i.accept))||a[0]||null;}
  async function ensureFileInput(){let i=findFileInput();if(i)return i;const add=document.querySelector('button[data-testid*="composer-plus"],button[aria-label*="添加照片"],button[aria-label*="添加文件"],button[aria-label*="Attach"],button[aria-label*="Upload"]')||findClickable(['添加照片','添加文件','上传文件','Attach','Upload','Add photos']);if(add){add.click();await sleep(500)}i=findFileInput();if(i)return i;const m=findClickable(['添加照片和文件','上传文件','Add photos and files','Upload file','Attach files']);if(m){m.click();await sleep(500)}i=findFileInput();if(!i)throw new Error('未找到ChatGPT上传控件，页面结构可能变化');return i;}
  function countAttachments(){const c=findComposer();const rm=[...c.querySelectorAll('button[aria-label*="移除"],button[aria-label*="Remove"],button[aria-label*="删除附件"],button[aria-label*="Delete attachment"]')].filter(isVisible);if(rm.length)return rm.length;const explicit=[...c.querySelectorAll('[data-testid="composer-attachment"],[data-testid="attachment"],[data-testid*="attachment-item"]')].filter(isVisible);if(explicit.length)return explicit.length;return [...c.querySelectorAll('img')].filter(img=>{const r=img.getBoundingClientRect();return isVisible(img)&&r.width>=32&&r.height>=32&&r.width<=240&&r.height<=240}).length;}
  function detectUploadFailure(){const retry=/(?:上传到\s*files\.oaiusercontent\.com\s*失败|files\.oaiusercontent\.com[^\n]{0,120}(?:失败|failed)|文件上传失败|上传失败|Upload failed|Failed to upload|Network error|网络(?:错误|问题)|你已上传过此文件|already uploaded this file)/i;const limit=/(?:上传限制|上传次数.*上限|达到.*上传.*限制|upload limit|too many files|rate limit)/i;const nodes=[...document.querySelectorAll('[role="alert"],[role="dialog"],[aria-live="assertive"],[aria-live="polite"],[data-testid*="toast"],[class*="toast"],[class*="error"]')].filter(n=>isVisible(n)&&!n.closest('#kagura-pod-panel'));for(const n of nodes){const m=text(n).replace(/\s+/g,' ').trim();if(limit.test(m))return{failed:true,retryable:false,message:m};if(retry.test(m))return{failed:true,retryable:true,message:m};}return{failed:false,retryable:false,message:''};}
  function uploadState(){const c=findComposer(),t=text(c),f=detectUploadFailure();const local=/上传失败|文件上传失败|Upload failed|Failed to upload|无法上传/i.test(t);const previews=[...c.querySelectorAll('img')].filter(img=>{const r=img.getBoundingClientRect();return isVisible(img)&&r.width>=32&&r.height>=32&&r.width<=240&&r.height<=240});const ready=previews.filter(i=>i.complete&&i.naturalWidth).length;const ind=['[role="progressbar"]','[aria-busy="true"]','[data-testid*="upload-progress"]','[data-testid*="attachment-loading"]','[data-state="loading"]','.animate-spin'].some(s=>[...c.querySelectorAll(s)].some(isVisible));return{failed:f.failed||local,retryable:f.failed?f.retryable:local,failureMessage:f.message||'',uploading:/上传中|正在上传|正在处理(?:文件|图片)?|Uploading|Processing (?:file|image)|Preparing upload/i.test(t)||ind||ready<previews.length,previewTotal:previews.length,previewReady:ready,count:countAttachments()};}
  async function waitUploads(expected,label,stableMs=4000){const timeout=Number(settings.uploadTimeout)||180000;let since=0,last=-1;const r=await waitUntil(()=>{const s=uploadState();if(s.failed){const m=`${label}上传失败${s.failureMessage?`：${s.failureMessage}`:''}`;if(s.retryable)throw new UploadRetryableError(m);throw new Error(m);}if(!s.uploading&&s.count>=expected){if(s.count!==last){last=s.count;since=Date.now()}if(!since)since=Date.now();if(Date.now()-since>=stableMs)return s.count;}else{since=0;last=s.count;}return null;},timeout,500);if(!r)throw new Error(`${label}未在 ${Math.round(timeout/1000)} 秒内稳定完成`);log(`${label}全部上传完成：${r} 张附件已稳定`,'success');return r;}
  async function uploadFiles(files,label){if(!files.length)return countAttachments();const before=countAttachments(),expected=before+files.length,input=await ensureFileInput(),dt=new DataTransfer();files.forEach(f=>dt.items.add(f));input.files=dt.files;input.dispatchEvent(new Event('input',{bubbles:true,composed:true}));input.dispatchEvent(new Event('change',{bubbles:true,composed:true}));log(`已提交上传${label}：${files.map(f=>f.name).join('、')}`);return waitUploads(expected,label);}

  function plainText(e){return String(e?.innerText||e?.textContent||'').trim().replace(/\s+/g,' ');}
  function insideMessage(e){return Boolean(e?.closest?.('[data-message-author-role],article'));}
  function smartClick(e){if(!e)return false;e.scrollIntoView?.({block:'nearest',inline:'nearest'});const r=e.getBoundingClientRect?.();if(!r||r.width<=0||r.height<=0)return false;const x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y),target=hit&&!hit.closest?.('#kagura-pod-panel')?hit:e;const o={bubbles:true,cancelable:true,composed:true,view:window,clientX:x,clientY:y,button:0,buttons:1,pointerId:1,pointerType:'mouse',isPrimary:true};for(const [t,C] of [['pointerover',PointerEvent],['mouseover',MouseEvent],['pointerdown',PointerEvent],['mousedown',MouseEvent],['pointerup',PointerEvent],['mouseup',MouseEvent]])try{target.dispatchEvent(new C(t,{...o,buttons:t.includes('up')?0:1}))}catch(_){}try{HTMLElement.prototype.click.call(target)}catch(_){try{HTMLElement.prototype.click.call(e)}catch(__){return false}}return true;}
  function findPlus(){const sels=['button[data-testid="composer-plus-btn"]','#composer-plus-btn','button[aria-label="添加文件等"]','[role="button"][aria-label="添加文件等"]','button[data-testid*="composer-plus"]','[role="button"][data-testid*="composer-plus"]','button[aria-label="Add"]','button[aria-label*="添加文件"]','button[aria-label*="Attach"]'];for(const s of sels){const a=[...document.querySelectorAll(s)].filter(isVisible).filter(e=>!e.closest('#kagura-pod-panel')).filter(e=>!e.disabled&&e.getAttribute('aria-disabled')!=='true');if(a.length)return a.at(-1)}const ed=findPromptEditor(),ar=ed?.getBoundingClientRect();if(!ar)return null;const c=[...document.querySelectorAll('button,[role="button"]')].filter(isVisible).filter(e=>!e.closest('#kagura-pod-panel')).map(e=>{const r=e.getBoundingClientRect(),tx=text(e),test=e.getAttribute('data-testid')||'',aria=e.getAttribute('aria-label')||'';let score=0;const look=/composer-plus/i.test(test)||/添加文件|添加照片|附件|Attach|Add/i.test(`${aria} ${tx}`)||/^\+$/.test(tx);if(/composer-plus-btn/i.test(test))score+=1000;if(aria==='添加文件等')score+=600;if(look)score+=250;if(r.width>=22&&r.width<=76&&r.height>=22&&r.height<=76)score+=120;if(Math.abs((r.top+r.height/2)-(ar.top+ar.height/2))<80)score+=100;return{e,score,look}}).filter(x=>x.look).sort((a,b)=>b.score-a.score);return c[0]?.e||null;}
  function visibleMenuRoots(){return [...document.querySelectorAll('[popover],[data-radix-popper-content-wrapper],[data-radix-menu-content],[data-headlessui-portal],[data-floating-ui-portal],[role="menu"],[role="dialog"],[role="listbox"],[data-state="open"]')].filter(e=>isVisible(e)&&!insideMessage(e)&&!e.closest('#kagura-pod-panel'));}
  function findCreateItem(){const re=/(创建图片|创作图片|生成图片|create\s*image|generate\s*image)/i;const cand=[];for(const e of document.querySelectorAll('button,[role="button"],[role="menuitem"],[role="option"],[data-radix-collection-item],div,span')){if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel'))continue;const tx=plainText(e);if(!re.test(`${tx} ${e.getAttribute('aria-label')||''}`)||tx.length>240)continue;const r=e.getBoundingClientRect();if(r.width<70||r.height<22||r.height>180)continue;let score=700;if(/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i.test(tx))score+=1800;if(/可视化/.test(tx))score+=1000;if(e.matches('button,[role="menuitem"],[role="option"],[role="button"]'))score+=420;if(e.closest('[role="menu"],[role="dialog"],[data-radix-popper-content-wrapper]'))score+=700;cand.push({e,score,tx,r});}cand.sort((a,b)=>b.score-a.score);return cand[0]||null;}
  function hasCreateChip(){const c=findComposer(),ed=findPromptEditor(),er=ed?.getBoundingClientRect(),re=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)$/i;for(const root of [c,document])for(const e of root.querySelectorAll('button,[role="button"],div,span')){if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel'))continue;if(!re.test(plainText(e)))continue;const r=e.getBoundingClientRect();if((c instanceof Element&&c.contains(e))||(er&&r.bottom>=er.top-140&&r.top<=er.bottom+80))return true;}return false;}
  async function activateCreate(){state.phase='activating_create_image';saveState();if(hasCreateChip()){log('已存在“创建图片”模式，无需重复添加','success');return;}let last;for(let a=1;a<=3;a++){try{const plus=await waitUntil(()=>findPlus(),7000,200);if(!plus)throw new Error('未找到输入框左侧“+”按钮');smartClick(plus);log(`已点击输入框左侧“+”按钮（${a}/3）`);await sleep(500);let item=await waitUntil(()=>findCreateItem()?.e,4500,150);if(!item){smartClick(findPlus()||plus);await sleep(450);item=await waitUntil(()=>findCreateItem()?.e,3500,150);}if(!item)throw new Error('加号菜单中未找到“创建图片”');const info=findCreateItem();log(`已定位“创建图片”菜单项：${info?.tx||'创建图片'}`);smartClick(item);if(!await waitUntil(()=>hasCreateChip(),5000,220))throw new Error('点击后未检测到“创建图片”标签');log('创建图片模式添加成功','success');return;}catch(e){last=e;log(`第 ${a} 次添加创建图片失败：${e.message}`,'warn');await sleep(700)}}throw new Error(`创建图片模式添加失败：${last?.message||last}`);}

  function setNativeValue(e,v){const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,d=Object.getOwnPropertyDescriptor(p,'value');d?.set?.call(e,v);e.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:v}));e.dispatchEvent(new Event('change',{bubbles:true,composed:true}));}
  function normalizePrompt(v){return String(v||'').replace(/[\u200B-\u200D\u2060\uFEFF]/g,'').replace(/\r\n?/g,'\n').replace(/[ \t]+/g,' ').replace(/ *\n */g,'\n').trim();}
  function readEditor(e=findPromptEditor()){if(!e)return'';if(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement)return normalizePrompt(e.value);let v='';try{const c=e.cloneNode(true);c.querySelectorAll('button,[role="button"],[role="menuitem"],[contenteditable="false"],[data-testid*="attachment"],[data-testid*="composer-chip"],[data-testid*="tool-chip"],img,svg').forEach(n=>n.remove());v=c.textContent||''}catch(_){v=e.innerText||e.textContent||''}return normalizePrompt(v.split(/\r?\n/).map(x=>x.trim()).filter(x=>x&&!/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)$/i.test(x)).join('\n'));}
  function promptMatches(e,expected){const a=readEditor(e),b=normalizePrompt(expected);if(!a||!b)return false;if(a===b||a.includes(b))return true;const aa=a.replace(/\s+/g,''),bb=b.replace(/\s+/g,'');if(aa===bb||aa.includes(bb))return true;return bb.length>=80&&aa.includes(bb.slice(0,40))&&aa.includes(bb.slice(-40));}
  function placeCaretEnd(e){try{e.focus({preventScroll:true})}catch(_){e.focus?.()}if(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement){try{e.setSelectionRange(e.value.length,e.value.length)}catch(_){}return}try{const s=getSelection(),r=document.createRange();r.selectNodeContents(e);r.collapse(false);s.removeAllRanges();s.addRange(r)}catch(_){}}
  async function setPromptValue(v){const expected=String(v||'').trim();if(!expected)throw new Error('提示词为空');if(!hasCreateChip())await activateCreate();let e=await waitUntil(()=>findPromptEditor(),30000,300);if(!e)throw new Error('未找到提示词输入框');const existing=readEditor(e);if(promptMatches(e,expected)){log(`提示词已存在并校验通过（${expected.length}字）`,'success');return;}if(existing)throw new Error(`输入框已有 ${existing.length} 字残留，为避免破坏创建图片模式不会自动清空`);if(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement)setNativeValue(e,expected);else{placeCaretEnd(e);let ok=false;try{ok=document.execCommand('insertText',false,expected)}catch(_){}if(!ok){const s=getSelection(),r=s?.rangeCount?s.getRangeAt(0):null;if(r){r.insertNode(document.createTextNode(expected));e.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:expected}))}}}await sleep(1000);e=findPromptEditor();if(!promptMatches(e,expected))throw new Error(`提示词写入后校验失败（当前识别${readEditor(e).length}字）`);if(!hasCreateChip()){log('提示词写入后“创建图片”标签消失，正在恢复','warn');await activateCreate();if(!promptMatches(findPromptEditor(),expected))throw new Error('恢复创建图片后提示词丢失');}log(`提示词已无损写入并校验通过（${expected.length}字）`,'success');}
  function findSend(){for(const s of ['button[data-testid="send-button"]','button[data-testid="composer-send-button"]','button[aria-label*="发送提示"]','button[aria-label="发送"]','button[aria-label*="Send prompt"]','button[aria-label="Send"]']){const a=[...document.querySelectorAll(s)].filter(isVisible).filter(b=>!b.closest('#kagura-pod-panel')).sort((a,b)=>b.getBoundingClientRect().bottom-a.getBoundingClientRect().bottom);if(a[0])return a[0]}return findClickable(['发送提示','^发送$','Send prompt','^Send$'],findComposer());}
  function stopVisible(){const b=document.querySelector('button[data-testid="stop-button"],button[aria-label*="停止生成"],button[aria-label*="Stop generating"],button[aria-label="Stop"]');return Boolean(b&&isVisible(b));}
  function countUserMessages(){return [...document.querySelectorAll('[data-message-author-role="user"]')].filter(n=>!n.closest('#kagura-pod-panel,form[data-type="unified-composer"],[data-composer-surface="true"]')).length;}
  function countUserContaining(prompt){const h=normalizePrompt(prompt).replace(/\s+/g,'').slice(0,50);return [...document.querySelectorAll('[data-message-author-role="user"],article')].filter(n=>{if(n.closest('#kagura-pod-panel,form[data-type="unified-composer"],[data-composer-surface="true"]'))return false;const role=n.getAttribute('data-message-author-role')||'';if(role&&role!=='user')return false;return normalizePrompt(n.innerText||n.textContent||'').replace(/\s+/g,'').includes(h)}).length;}
  async function waitReadyToSend(expectedCount,prompt){let since=0;const timeout=Number(settings.uploadTimeout)||180000;const b=await waitUntil(()=>{const s=uploadState(),e=findPromptEditor(),pr=Boolean(e&&promptMatches(e,prompt)),cr=hasCreateChip(),bt=findSend(),en=Boolean(bt&&!bt.disabled&&bt.getAttribute('aria-disabled')!=='true');if(s.failed){if(s.retryable)throw new UploadRetryableError('发送前检测到上传失败');throw new Error('发送前检测到不可重试上传失败')}if(!s.uploading&&s.count>=expectedCount&&pr&&cr&&en){if(!since)since=Date.now();if(Date.now()-since>=5000)return bt}else since=0;return null;},timeout,500);if(!b)throw new Error('发送前检查未通过');log('发送前检查通过：附件上传完成、提示词完整、“创建图片”模式存在，并稳定5秒','success');return b;}
  async function sendPrompt(expectedCount,prompt){let btn=await waitReadyToSend(expectedCount,prompt),beforeMatch=countUserContaining(prompt),beforeAny=countUserMessages();const observe=Math.max(Number(settings.uploadTimeout)||180000,240000);for(let click=1;click<=2;click++){if(!promptMatches(findPromptEditor(),prompt)){log('发送前发现提示词已经离开输入框，取消重复点击','success');return;}smartClick(btn);log(`已点击发送按钮（第${click}次），开始确认消息真正提交`);const start=Date.now();let lastLog=0;while(Date.now()-start<observe){if(!state.running)throw new PausedError();const s=uploadState(),still=promptMatches(findPromptEditor(),prompt),newMatch=countUserContaining(prompt)>beforeMatch,newAny=countUserMessages()>beforeAny,gen=stopVisible();if(s.failed){if(s.retryable)throw new UploadRetryableError('发送后检测到附件上传失败');throw new Error('发送后检测到不可重试上传失败')}if(!still&&(newMatch||newAny||gen||s.count<expectedCount)){log(`任务已确认发送成功（${gen?'检测到生成状态':newMatch?'检测到当前用户消息':'检测到消息已提交'}）`,'success');await sleep(1000);return;}if(Date.now()-lastLog>15000){log(`发送确认中：附件 ${s.count}/${expectedCount}，提示词${still?'仍在输入框':'已离开输入框'}，生成状态${gen?'已出现':'未出现'}；不会重复点击`);lastLog=Date.now();}await sleep(700);}if(!promptMatches(findPromptEditor(),prompt)){log('观察期结束时提示词已离开输入框，按已提交处理','warn');return;}if(click===1){log('完整观察期结束后提示词仍完整留在输入框，才允许第二次点击','warn');btn=await waitReadyToSend(expectedCount,prompt);continue;}throw new Error('连续两次点击后仍无法确认消息提交');}}

  function bestImgUrl(img){const arr=[];const add=(u,w=0,p=0)=>{u=String(u||'').trim();if(u&&!/^javascript:/i.test(u))arr.push({u,w:Number(w)||0,p})};add(img.currentSrc,img.naturalWidth,50);add(img.src,img.naturalWidth,40);String(img.getAttribute('srcset')||'').split(',').forEach(x=>{const m=x.trim().match(/^(\S+)\s+(\d+)(w|x)$/i);if(m)add(m[1],m[2],70)});const a=img.closest('a[href]');if(a&&/(blob:|data:image|oaiusercontent|openai|chatgpt|usercontent|\/image\/|\.(?:png|jpe?g|webp|avif))/i.test(a.href))add(a.href,99999,100);arr.sort((a,b)=>(b.p+b.w/100000)-(a.p+a.w/100000));return arr[0]?.u||'';}
  function canonical(u){if(/^(blob:|data:)/i.test(u))return u;try{const x=new URL(u,location.href);x.hash='';['w','h','width','height','q','quality','dpr','fit','crop','format','fm','auto','resize','size','thumb','thumbnail'].forEach(k=>x.searchParams.delete(k));return x.toString()}catch(_){return String(u||'').replace(/#.*$/,'')}}
  function latestUserAnchor(prompt=''){const h=normalizePrompt(prompt).replace(/\s+/g,'').slice(0,48);let best=null,score=-Infinity;for(const n of document.querySelectorAll('[data-message-author-role="user"],article')){if(n.closest('#kagura-pod-panel,form[data-type="unified-composer"],[data-composer-surface="true"]'))continue;const role=n.getAttribute('data-message-author-role')||'';if(role&&role!=='user')continue;const tx=normalizePrompt(n.innerText||n.textContent||'').replace(/\s+/g,'');if(h&&!tx.includes(h))continue;const r=n.getBoundingClientRect(),s=r.top+scrollY;if(r.width>1&&r.height>1&&s>score){best=n;score=s}}return best;}
  function afterAnchor(node,anchor){if(!anchor)return true;try{if(anchor.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)return true}catch(_){}return node.getBoundingClientRect().top+scrollY>anchor.getBoundingClientRect().bottom+scrollY-20;}
  function generatedImages(prompt=''){const anchor=latestUserAnchor(prompt),ab=anchor?(anchor.getBoundingClientRect().bottom+scrollY):-1,seen=new Set(),items=[];[...document.querySelectorAll('main img')].forEach((img,idx)=>{if(img.closest('#kagura-pod-panel,nav,aside,form[data-type="unified-composer"],[data-composer-surface="true"]'))return;const root=img.closest('[data-message-author-role],article'),role=root?.getAttribute('data-message-author-role')||'';if(role==='user'||!afterAnchor(img,anchor))return;const r=img.getBoundingClientRect(),top=r.top+scrollY,w=img.naturalWidth||r.width,h=img.naturalHeight||r.height,u=bestImgUrl(img),k=canonical(u);if(ab>=0&&top<=ab+10)return;if(!u||!k||seen.has(k)||w<128||h<128||r.width<20||r.height<20)return;if(/avatar|logo|icon|emoji|favicon|profile|用户头像/i.test(`${u} ${img.alt||''}`))return;seen.add(k);items.push({img,url:u,key:k,width:w,height:h,displayArea:r.width*r.height,domIndex:idx,absoluteTop:top,absoluteLeft:r.left+scrollX});});return items;}
  function normalizeGallery(items,expected=0){const u=[],s=new Set();for(const i of items){if(i.key&&!s.has(i.key)){s.add(i.key);u.push(i)}}u.sort((a,b)=>(a.absoluteTop-b.absoluteTop)||(a.absoluteLeft-b.absoluteLeft)||(a.domIndex-b.domIndex));if(!expected)return u;if(u.length<=expected)return u;const by=[...u].sort((a,b)=>b.displayArea-a.displayArea),main=by[0],second=by[1]?.displayArea||0,preview=main&&main.displayArea>=Math.max(120000,second*2.2);const thumbs=preview?u.filter(x=>x!==main):u;if(thumbs.length>=expected)return thumbs.slice(0,expected);return u.slice(0,expected);}
  function completionState(prompt=''){const a=latestUserAnchor(prompt);let finish=false,edit=false,down=false;for(const n of document.querySelectorAll('main button,main [role="button"],main span,main p,main div')){if(!isVisible(n)||n.closest('#kagura-pod-panel,form[data-type="unified-composer"],[data-composer-surface="true"]')||!afterAnchor(n,a))continue;const tx=text(n).replace(/\s+/g,' ').trim();if(!tx||tx.length>180)continue;if(/Worked for|Thought for|思考了|已思考|工作了|用时\s*\d|耗时\s*\d/i.test(tx)&&!/正在思考|Thinking/i.test(tx))finish=true;if(/编辑图片|^编辑$|Edit image|^Edit$/i.test(tx))edit=true;if(/下载图片|^下载$|Download image|^Download$/i.test(tx))down=true;}const stop=stopVisible();return{finish,edit,down,stop,complete:!stop&&(finish||edit||down)}}
  function galleryScrollables(prompt=''){const a=latestUserAnchor(prompt),arr=[];for(const n of document.querySelectorAll('main div,main section,main [role="list"],main [role="group"]')){if(!(n instanceof HTMLElement)||n.closest('#kagura-pod-panel,nav,aside,form[data-type="unified-composer"],[data-composer-surface="true"]')||!afterAnchor(n,a))continue;const r=n.getBoundingClientRect(),st=getComputedStyle(n);if(r.width<45||r.height<90||n.scrollHeight<=n.clientHeight+20||!/(auto|scroll)/i.test(`${st.overflowY} ${st.overflow}`))continue;if([...n.querySelectorAll('img')].some(i=>(i.naturalWidth||0)>=128))arr.push(n)}return arr.slice(0,4);}
  function scrollGallery(prompt='',round=0){const pos=[0,.18,.38,.58,.78,1,.5],ratio=pos[round%pos.length],a=galleryScrollables(prompt);for(const e of a){const max=e.scrollHeight-e.clientHeight;e.scrollTop=Math.round(max*ratio);e.dispatchEvent(new Event('scroll',{bubbles:true}))}return a.length;}
  async function waitGenerated(baseline,expected,prompt){const timeout=Number(settings.generationTimeout)||900000,stableNeed=Math.max(5000,Number(settings.stableSeconds||15)*1000),start=Date.now(),collected=new Map();let lastCount=-1,changed=Date.now(),lastLog=0,round=0,sawStop=false,completeSeen=0;while(Date.now()-start<timeout){if(!state.running)throw new PausedError();const stp=stopVisible();if(stp)sawStop=true;for(const i of generatedImages(prompt)){if(baseline.has(i.key)||!i.img.complete)continue;const old=collected.get(i.key);if(!old||i.width*i.height+i.displayArea>old.width*old.height+old.displayArea)collected.set(i.key,i)}const ready=normalizeGallery([...collected.values()],expected),comp=completionState(prompt);if(ready.length!==lastCount){lastCount=ready.length;changed=Date.now();state.detectedGeneratedCount=ready.length;state.expectedGeneratedCount=expected;state.generatedCountChangedAt=Date.now();saveState();log(`生成检测：已发现 ${ready.length}/${expected} 张当前任务图片`)}if(comp.complete&&!completeSeen)completeSeen=Date.now();const stable=Date.now()-changed;if(Date.now()-lastLog>15000){log(`生图进度：${ready.length}/${expected}；状态：${comp.complete?'已显示完成':stp?'生成中':'未生成'}；当前数量停留 ${Math.floor(stable/1000)}秒`);lastLog=Date.now();}if(ready.length>=expected&&!stp&&stable>=Math.min(stableNeed,10000)){log(`已收齐 ${expected}/${expected} 张且页面不再生成，开始下载`,'success');return ready.slice(0,expected)}if(comp.complete&&ready.length<expected){scrollGallery(prompt,round++);if(Date.now()-completeSeen>90000&&stable>20000){log(`页面已完成但最终仅检测 ${ready.length}/${expected} 张，按异常批次处理`,'warn');return ready}}else scrollGallery(prompt,round++);if(ready.length===0&&!stp&&Date.now()-start>360000&&!state.resumeContext?.refreshedOnce){state.resumeContext={kind:'generation-refresh',refreshedOnce:true,batchKeys:[...state.currentBatchKeys],batchPaths:[...state.currentBatchPaths],prompt,triggeredAt:new Date().toISOString()};state.phase='refreshing';saveState();log('已发送任务长时间0图且页面空闲，刷新页面同步服务器结果，不重新发送','warn');setTimeout(()=>location.reload(),300);return new Promise(()=>{});}await sleep(comp.complete&&ready.length<expected?900:1200)}const fallback=normalizeGallery([...collected.values()],expected);if(fallback.length)return fallback;throw new Error(`等待生图超时（${Math.round(timeout/60000)}分钟），未检测到当前任务图片`);}
  function fetchBlob(url,timeout=120000){if(/^(blob:|data:)/i.test(url))return fetch(url).then(r=>{if(!r.ok)throw new Error(`图片读取失败 HTTP ${r.status}`);return r.blob()});return new Promise((res,rej)=>GM_xmlhttpRequest({method:'GET',url,responseType:'blob',timeout,headers:{Referer:location.href,Accept:'image/*,*/*;q=0.8'},onload:r=>r.status>=200&&r.status<300&&r.response instanceof Blob&&r.response.size?res(r.response):rej(new Error(`生成图下载失败 HTTP ${r.status||'未知'}`)),onerror:()=>rej(new Error('生成图下载网络错误')),ontimeout:()=>rej(new Error('生成图下载超时'))}));}
  function extOf(blob,url){if(/png/i.test(blob.type))return'png';if(/webp/i.test(blob.type))return'webp';if(/jpe?g/i.test(blob.type))return'jpg';const m=String(url).match(/\.(png|webp|jpe?g)(?:[?#]|$)/i);return m?m[1].toLowerCase().replace('jpeg','jpg'):'png';}

  async function downloadNormal(items,tasks,output){const saved=[];for(let i=0;i<items.length;i++){if(!state.running)throw new PausedError();const blob=await fetchBlob(items[i].url),ext=extOf(blob,items[i].url),task=tasks[i],base=sanitizeName(task.id||stem(task.sourcePath)||`任务${i+1}`),name=`${base}_POD.${ext}`;await writeBlob(output,name,blob);task.status='done';task.outputFiles=[name];task.error='';task.updatedAt=new Date().toISOString();saved.push(name);log(`${name} 已保存`,'success')}return saved;}
  async function downloadAbnormal(items,batchNo,output){const saved=[];for(let i=0;i<items.length;i++){const blob=await fetchBlob(items[i].url),ext=extOf(blob,items[i].url),name=`待确认_批次${String(batchNo).padStart(3,'0')}_生成${String(i+1).padStart(2,'0')}_POD_${stamp()}.${ext}`;await writeBlob(output,name,blob);saved.push(name);log(`${name} 已作为待确认图片保存`,'warn')}return saved;}

  async function processBatch(){const handles=await validateHandles(false);let tasks=currentBatchTasks();let detectOnly=Boolean(state.resumeContext?.kind==='generation-refresh'&&state.currentBatchKeys.length);if(!tasks.length){tasks=pendingTasks().slice(0,Math.max(1,Math.min(10,Number(settings.batchSize)||3)));if(!tasks.length)return false;state.currentBatchKeys=tasks.map(t=>t.key);state.currentBatchPaths=tasks.map(t=>t.sourcePath);state.batchStartedAt=Date.now();state.generationStartedAt=0;state.detectedGeneratedCount=0;state.expectedGeneratedCount=tasks.length;state.generatedCountChangedAt=Date.now();state.phase='preparing';for(const t of tasks){t.status='running';t.attempts=Number(t.attempts||0)+1;t.error='';t.updatedAt=new Date().toISOString();}saveState();}
    const prompt=state.resumeContext?.prompt||buildBatchPrompt(tasks);let uploadRetries=0;let execution=0;
    while(true){execution++;let sent=detectOnly;try{log(`${detectOnly?'恢复检测':'开始处理'}第 ${state.batchNo} 批：${tasks.map(t=>t.id).join('–')}`,'success');let baseline=new Set();if(!detectOnly){if(settings.newChatEachBatch)await goNewChat();baseline=new Set(generatedImages().map(i=>i.key));const files=[];for(const t of tasks)files.push(await getFileByPath(handles.source,t.sourcePath));state.phase='uploading_source';saveState();await uploadFiles(files,'参考图');await activateCreate();let expected=countAttachments();if(settings.useTemplate){state.phase='uploading_template';saveState();expected=await uploadFiles([await handles.template.getFile()],'模板图');}state.phase='writing_prompt';saveState();await setPromptValue(prompt);state.phase='sending';saveState();await sendPrompt(expected,prompt);sent=true;state.generationStartedAt=Date.now();state.phase='generating';saveState();}else{baseline=new Set();state.phase='recovering';state.generationStartedAt=state.generationStartedAt||Date.now();saveState();log('当前批次此前已发送成功，本次只恢复检测，不会重新发送','warn');await sleep(8000);}
      const imgs=await waitGenerated(baseline,tasks.length,prompt);state.resumeContext=null;state.detectedGeneratedCount=imgs.length;state.phase='downloading';saveState();if(imgs.length!==tasks.length){const saved=await downloadAbnormal(imgs,state.batchNo,handles.output);for(const t of tasks){t.status='confirm';t.error=`生成数量不一致：计划${tasks.length}张，实际${imgs.length}张；已保存待确认文件 ${saved.join('、')}`;t.updatedAt=new Date().toISOString();}log(`第${state.batchNo}批进入待确认：输入${tasks.length}张，生成${imgs.length}张；不按顺序强行配图`,'warn');}else await downloadNormal(imgs,tasks,handles.output);
      finishBatchTimers();state.currentBatchKeys=[];state.currentBatchPaths=[];state.resumeContext=null;state.batchNo++;state.phase=pendingTasks().length?'ready':'done';saveState();return true;
    }catch(e){if(e instanceof PausedError)throw e;if(e instanceof UploadRetryableError&&uploadRetries<2&&!sent){uploadRetries++;log(`附件上传失败，整批清理/重试 ${uploadRetries}/2：${e.message}`,'warn');await clearComposer();detectOnly=false;await sleep(1200);continue;}if(sent){const partial=normalizeGallery(generatedImages(prompt),0);const saved=await downloadAbnormal(partial,state.batchNo,handles.output).catch(()=>[]);for(const t of tasks){t.status='confirm';t.error=`已发送后异常：${e.message}；为避免重复生成不自动重发${saved.length?`；临时图：${saved.join('、')}`:''}`;t.updatedAt=new Date().toISOString();}state.resumeContext=null;finishBatchTimers();state.currentBatchKeys=[];state.currentBatchPaths=[];state.batchNo++;state.phase='ready';saveState();log(`第${state.batchNo-1}批发送后异常，已转待确认，不自动重发`,'warn');return true;}for(const t of tasks){t.status='error';t.error=e.message||String(e);t.updatedAt=new Date().toISOString();}state.running=false;state.phase='error';saveState();throw e;}}
  }
  async function clearComposer(){const c=findComposer();for(let n=0;n<10&&countAttachments()>0;n++){const b=[...c.querySelectorAll('button[aria-label*="移除"],button[aria-label*="Remove"],button[aria-label*="删除附件"],button[aria-label*="Delete attachment"]')].filter(isVisible);if(!b.length)break;for(const x of b){smartClick(x);await sleep(150)}}const e=findPromptEditor();if(e){try{if(e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement)setNativeValue(e,'');else{e.focus();document.execCommand('selectAll',false);document.execCommand('delete',false)}}catch(_){}}await sleep(500);}
  async function betweenBatches(){const min=Math.max(0,Number(settings.intervalMin)||0),max=Math.max(min,Number(settings.intervalMax)||min),ms=Math.floor(min+Math.random()*(max-min+1)),end=Date.now()+ms;log(`本批完成，随机等待 ${Math.ceil(ms/1000)} 秒后进入下一批`);while(state.running&&Date.now()<end){state.phase='batch_wait';updatePanel();await sleep(Math.min(1000,end-Date.now()))}if(!state.running)return false;state.phase='ready';saveState();return true;}
  async function worker(){if(workerActive||!state.running)return;workerActive=true;try{while(state.running&&pendingTasks().length){const ok=await processBatch();if(!ok)break;if(state.running&&pendingTasks().length&&!await betweenBatches())break;}if(state.running&&!pendingTasks().length){stopRunClock();state.running=false;state.phase='done';saveState();log(`全部完成：${activeTasks().filter(t=>t.status==='done').length} 条已完成，${activeTasks().filter(t=>t.status==='confirm').length} 条待确认`,'success')}}catch(e){if(e instanceof PausedError)log('任务已暂停','warn');else{stopRunClock();state.running=false;state.phase='error';saveState();log(e.message||String(e),'error')}}finally{workerActive=false;updatePanel();}}
  async function start(){readUiSettings();if(settings.flow!=='batch_generation')throw new Error('当前流程尚未启用执行器，请切换到“批量生图”');await validateHandles(true);if(!state.imagePaths.length)await scanImages();if(!state.tasks.length){state.tasks=state.imagePaths.map((p,i)=>({key:`folder::${i+1}`,id:stem(p),imageName:basename(p),prompt:'',status:'pending',sourcePath:p,outputFiles:[],error:'',attempts:0,row:i+1,updatedAt:new Date().toISOString()}));saveState();log('未导入Excel：已按参考图文件生成临时POD任务队列','warn');}resolveAllTasks();refreshMissingPromptStates();saveState();renderTaskList(true);const p=pendingTasks();if(!p.length){const missing=activeTasks().filter(t=>t.status==='error'&&/^缺少提示词/.test(String(t.error||''))).length;if(missing)log(`当前范围没有可执行任务；其中 ${missing} 条同时缺少母提示词和Excel行提示词`,'warn');else log('当前范围没有待处理任务','warn');return;}state.running=true;state.phase='ready';startRunClock();saveState();log(`任务开始：待处理 ${p.length} 条，每批 ${settings.batchSize} 条`,'success');worker();}
  function pause(){stopRunClock();state.running=false;saveState();log('已请求暂停；当前页面操作结束后停止','warn');}
  function skipCurrent(){const tasks=currentBatchTasks();if(!tasks.length)return;for(const t of tasks){t.status='skipped';t.error='用户跳过当前批';t.updatedAt=new Date().toISOString();}finishBatchTimers();state.currentBatchKeys=[];state.currentBatchPaths=[];state.resumeContext=null;state.batchNo++;state.running=false;state.phase='ready';saveState();log(`已跳过当前批：${tasks.map(t=>t.id).join('、')}`,'warn');}
  function resetProgress(){if(!confirm('确定把任务状态全部重置为待处理吗？已保存图片不会删除。'))return;for(const t of state.tasks){t.status='pending';t.outputFiles=[];t.error='';t.attempts=0;}stopRunClock();state.running=false;state.phase='ready';state.batchNo=1;state.currentBatchKeys=[];state.currentBatchPaths=[];state.resumeContext=null;state.totalRunMs=0;state.startedAt=0;finishBatchTimers();saveState();log('任务状态和运行进度已重置','warn');}

  // ========================== 统一工作台 UI ==========================
  const FLOW_DEFS = {
    batch_generation: { label: '批量生图', enabled: true },
    style_reverse: { label: '风格反推', enabled: false },
    diecut_design: { label: '刀版设计', enabled: false },
  };

  function addStyle(){GM_addStyle(`
#kagura-pod-panel{position:fixed;z-index:2147483647;right:16px;top:72px;width:438px;color:#182230;background:rgba(255,255,255,.988);border:1px solid #d9e2e8;border-radius:14px;box-shadow:0 12px 36px rgba(15,23,42,.24);font:13px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;overflow:hidden}
#kagura-pod-panel *{box-sizing:border-box}.pod-head{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;color:#fff;background:linear-gradient(135deg,#10a37f,#087f66);font-weight:800;cursor:move;user-select:none}.pod-toggle{border:0;background:transparent;color:#fff;cursor:pointer;font-size:17px}.pod-body{padding:11px;max-height:calc(100vh - 108px);overflow:auto}.pod-flowbar{display:grid;grid-template-columns:72px 1fr;gap:8px;align-items:center;margin-bottom:10px;padding:9px;border:1px solid #cfe3dc;border-radius:10px;background:#f2faf7;position:sticky;top:0;z-index:8}.pod-flowbar b{color:#28584b}.pod-flowbar select{width:100%;padding:7px 8px;border:1px solid #bdd6ce;border-radius:7px;background:#fff;color:#173d33;font-weight:750}.pod-flow-note{grid-column:1/-1;font-size:10.5px;color:#64748b}.pod-section{border:1px solid #dfe7e4;border-radius:10px;padding:9px;margin-bottom:9px;background:#fbfdfc}.pod-section-title{display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:800;color:#173d33;margin-bottom:7px}.pod-section-sub{font-weight:500;font-size:10.5px;color:#7b8794}.pod-row{display:flex;gap:7px;align-items:center;margin-bottom:7px}.pod-label{width:82px;flex:0 0 82px;color:#667085}.pod-value{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:650}.pod-progress{color:#087f66;font-weight:800}.pod-status{padding:8px 10px;border-radius:8px;background:#eff8f5;color:#28584b;margin:7px 0}.pod-buttons{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}.pod-btn{border:0;border-radius:8px;padding:8px 5px;cursor:pointer;font-weight:700;background:#eef4f2;color:#24423a}.pod-btn:hover{filter:brightness(.975)}.pod-btn.primary{background:#10a37f;color:#fff}.pod-btn.success{background:#e7f8f2;color:#08785e}.pod-btn.danger{background:#ffeaea;color:#b42318}.pod-btn:disabled{opacity:.48;cursor:not-allowed}.pod-muted{opacity:.5}.pod-settings{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:8px 0}.pod-settings.two{grid-template-columns:1fr 1fr}.pod-settings label{font-size:10.5px;color:#667085}.pod-settings input,.pod-settings select{width:100%;margin-top:3px;padding:6px;border:1px solid #d7e1de;border-radius:6px;background:#fff}.pod-check{display:flex;gap:6px;align-items:center;margin:7px 0;color:#475467}.pod-file{display:block;width:100%;padding:7px;border:1px dashed #a9b9d4;border-radius:8px;background:#f7faff}.pod-textarea{width:100%;min-height:130px;resize:vertical;padding:8px;border:1px solid #d7e1de;border-radius:8px;font:12px/1.5 inherit}.pod-task-tools{display:grid;grid-template-columns:1fr 105px;gap:6px;margin-bottom:7px}.pod-task-tools input,.pod-task-tools select{width:100%;padding:6px;border:1px solid #d7e1de;border-radius:7px}.pod-task-list{max-height:230px;overflow:auto;border:1px solid #dfe6e3;border-radius:9px;background:#fff}.pod-task{display:grid;grid-template-columns:55px 1fr 62px;gap:5px;padding:7px;border-bottom:1px solid #edf1f0;font-size:11px}.pod-task:last-child{border-bottom:0}.pod-task-main{min-width:0}.pod-task-file,.pod-task-prompt{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.pod-task-prompt{color:#8994a5}.pod-badge{justify-self:end;border-radius:999px;padding:3px 6px;font-weight:800;font-size:10px}.s-pending{background:#f1f5f9;color:#64748b}.s-running{background:#dbeafe;color:#1d4ed8}.s-done{background:#dcfce7;color:#15803d}.s-error{background:#fee2e2;color:#b91c1c}.s-confirm{background:#fef3c7;color:#92400e}.s-skipped{background:#f3e8ff;color:#7e22ce}.pod-log{height:92px;overflow:auto;padding:7px;border:1px solid #d9e3df;border-radius:8px;background:#0f172a;color:#dbeafe;font:11px/1.45 Consolas,monospace}.pod-log .error{color:#fda4af}.pod-log .warn{color:#fde68a}.pod-log .success{color:#86efac}.pod-placeholder{padding:18px 12px;text-align:center;border:1px dashed #cfd8d5;border-radius:10px;background:#f8faf9;color:#64748b}.pod-placeholder b{display:block;color:#344054;font-size:14px;margin-bottom:5px}.pod-footer{display:flex;justify-content:space-between;align-items:center;margin-top:7px;font-size:10.5px;color:#758196}.pod-version{border:0;border-radius:999px;background:#0f172a;color:#fff;padding:6px 9px;cursor:pointer}
#kagura-pod-panel.collapsed{width:48px!important;height:48px!important;border-radius:50%;background:transparent}#kagura-pod-panel.collapsed .pod-body{display:none}#kagura-pod-panel.collapsed .pod-head{width:48px;height:48px;padding:0;justify-content:center;border-radius:50%}#kagura-pod-panel.collapsed .pod-title{display:none}#kagura-pod-panel.collapsed .pod-toggle{width:48px;height:48px;font-size:11px}

.kagura-pod-update-overlay{position:absolute;inset:0;z-index:30000;display:flex;align-items:center;justify-content:center;padding:12px;background:rgba(15,23,42,.52)}
.kagura-pod-update-card{width:min(370px,96%);max-height:88%;overflow:auto;background:#fff;color:#182230;border-radius:13px;padding:14px;box-shadow:0 18px 46px rgba(15,23,42,.34)}
.kagura-pod-update-title{text-align:center;font-size:17px;font-weight:800;margin-bottom:9px}
.kagura-pod-update-info{white-space:pre-wrap;background:#f8fafc;border:1px solid #e4e7ec;border-radius:9px;padding:10px;max-height:245px;overflow:auto;margin-bottom:10px}
.kagura-pod-update-actions{display:flex;gap:7px;justify-content:center;flex-wrap:wrap}.kagura-pod-update-actions button{border:0;border-radius:8px;padding:8px 11px;cursor:pointer;font-weight:750}
.kagura-pod-update-now{background:#10a37f;color:#fff}.kagura-pod-update-later{background:#eef2f6;color:#344054}.kagura-pod-update-suppress{background:#fff3e0;color:#9a5a00}

#kagura-pod-log-window{position:fixed;z-index:2147483647;left:7vw;top:7vh;width:min(820px,86vw);height:76vh;min-width:420px;min-height:260px;resize:both;overflow:hidden;display:none;flex-direction:column;background:#0f172a;color:#e5e7eb;border:1px solid #334155;border-radius:12px;box-shadow:0 18px 50px rgba(2,6,23,.45);font:12px/1.5 Consolas,"Microsoft YaHei",monospace}.plw-head{display:flex;gap:8px;align-items:center;padding:9px 10px;background:#111827;cursor:move}.plw-head b{flex:1}.plw-head [data-role="metrics"]{color:#a7f3d0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:55%}.plw-head button,.plw-foot button{border:0;border-radius:6px;padding:6px 9px;background:#334155;color:#fff;cursor:pointer}.plw-body{flex:1;overflow:auto;padding:9px;background:#020617}.plw-line{padding:2px 0;border-bottom:1px solid rgba(51,65,85,.2)}.plw-line.error{color:#fda4af}.plw-line.warn{color:#fde68a}.plw-line.success{color:#86efac}.plw-foot{display:flex;gap:7px;justify-content:flex-end;padding:8px 10px;background:#111827}
`)}

  function flowLabel(){ return FLOW_DEFS[settings.flow]?.label || '批量生图'; }

  function createPanel(){
    addStyle();
    panel=document.createElement('section');
    panel.id='kagura-pod-panel';
    panel.innerHTML=`
      <div class="pod-head"><span class="pod-title">服装POD统一工作台 V${APP_VERSION}</span><button class="pod-toggle" title="缩小为图标">−</button></div>
      <div class="pod-body">
        <div class="pod-flowbar">
          <b>当前流程</b>
          <select data-role="flow">
            <option value="batch_generation">批量生图</option>
            <option value="style_reverse" disabled>风格反推（预留）</option>
            <option value="diecut_design" disabled>刀版设计（预留）</option>
          </select>
          <div class="pod-flow-note">一个界面完成一个完整流程。公共的 ChatGPT 交互/检测核心只维护一份；以后新增流程时只增加该流程的任务规则与参数。</div>
        </div>
        <div data-role="workspace"></div>
        <div class="pod-footer"><span>独立运行 · 统一工作台架构</span><button class="pod-version">V${APP_VERSION}</button></div>
      </div>`;
    document.documentElement.appendChild(panel);
    makeDraggable(panel,panel.querySelector('.pod-head'));
    panel.querySelector('.pod-toggle').onclick=e=>{e.stopPropagation();if(panel.dataset.suppress==='1'){delete panel.dataset.suppress;return}panel.classList.toggle('collapsed');e.currentTarget.textContent=panel.classList.contains('collapsed')?'POD':'−'};
    const flow=panel.querySelector('[data-role="flow"]');
    flow.value=settings.flow;
    flow.addEventListener('change',e=>{
      if(state.running){e.target.value=settings.flow;alert('任务运行中不能切换流程，请先暂停。');return;}
      settings.flow=e.target.value;
      saveSettings();
      renderWorkspace();
    });
    panel.querySelector('.pod-version').onclick=()=>checkUpdate(true);
    renderWorkspace();
    updateFolderLabels();
  }

  function makeDraggable(target,handle){let pressed=false,drag=false,ox=0,oy=0,sx=0,sy=0;handle.addEventListener('mousedown',e=>{if(e.target.closest('button')&&!target.classList.contains('collapsed'))return;pressed=true;drag=false;sx=e.clientX;sy=e.clientY;const r=target.getBoundingClientRect();ox=e.clientX-r.left;oy=e.clientY-r.top;target.style.left=`${r.left}px`;target.style.top=`${r.top}px`;target.style.right='auto';e.preventDefault()});document.addEventListener('mousemove',e=>{if(!pressed)return;if(!drag&&Math.hypot(e.clientX-sx,e.clientY-sy)<5)return;drag=true;target.style.left=`${Math.max(0,Math.min(innerWidth-target.offsetWidth,e.clientX-ox))}px`;target.style.top=`${Math.max(0,Math.min(innerHeight-target.offsetHeight,e.clientY-oy))}px`});document.addEventListener('mouseup',()=>{if(!pressed)return;if(drag){target.dataset.suppress='1';setTimeout(()=>delete target.dataset.suppress,350)}pressed=drag=false})}

  function readUiSettings(){
    if(!panel)return;
    for(const k of ['batchSize','rangeStart','rangeEnd','stableSeconds']){const e=panel.querySelector(`[data-setting="${k}"]`);if(e)settings[k]=Number(e.value)||DEFAULT_SETTINGS[k]}
    const gm=panel.querySelector('[data-setting="generationMinutes"]');if(gm)settings.generationTimeout=Math.max(60000,(Number(gm.value)||15)*60000);
    for(const k of ['intervalMinSeconds','intervalMaxSeconds']){const e=panel.querySelector(`[data-setting="${k}"]`);if(e)settings[k==='intervalMinSeconds'?'intervalMin':'intervalMax']=Math.max(0,(Number(e.value)||0)*1000)}
    if(settings.intervalMax<settings.intervalMin)[settings.intervalMin,settings.intervalMax]=[settings.intervalMax,settings.intervalMin];
    const nc=panel.querySelector('[data-setting="newChatEachBatch"]');if(nc)settings.newChatEachBatch=nc.checked;
    const ut=panel.querySelector('[data-setting="useTemplate"]');if(ut)settings.useTemplate=ut.checked;
    saveSettings();
    updateFolderLabels().catch(()=>{});
    updatePanel();
  }

  function compactBatch(){const t=currentBatchTasks();if(!t.length)return'-';const ids=t.map(x=>x.id);if(ids.length>1&&ids.every(x=>/^\d+$/.test(x))&&ids.every((x,i)=>i===0||Number(x)===Number(ids[i-1])+1))return `${ids[0]}–${ids.at(-1)}`;return ids.join('、');}
  function statusLabel(s){return({pending:'待处理',running:'处理中',done:'已完成',error:'失败',confirm:'待确认',skipped:'已跳过'})[s]||s;}
  function filteredTasks(){const q=String(settings.search||'').trim().toLowerCase(),f=settings.filter||'all';return state.tasks.filter(t=>(f==='all'||t.status===f)&&(!q||`${t.id} ${t.imageName} ${t.sourcePath} ${t.prompt}`.toLowerCase().includes(q)));}
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function escapeAttr(v){return escapeHtml(v).replace(/`/g,'&#96;');}

  function renderWorkspace(){
    if(!panel)return;
    const workspace=panel.querySelector('[data-role="workspace"]');
    if(!workspace)return;
    if(settings.flow!=='batch_generation'){
      workspace.innerHTML=`<div class="pod-placeholder"><b>${escapeHtml(flowLabel())}</b>这个流程入口已经预留，但当前版本还没有启用执行逻辑。后续开发时会继续使用同一个工作台，不会再拆成第二套窗口。</div>`;
      return;
    }
    workspace.innerHTML=`
      <div class="pod-section">
        <div class="pod-section-title"><span>1. 任务与文件</span><span class="pod-section-sub" data-role="task-source-summary"></span></div>
        <input data-role="excel" type="file" accept=".xlsx,.xls,.xlsm,.csv" hidden>
        <div class="pod-buttons" style="grid-template-columns:1fr;margin:7px 0"><button class="pod-btn success" data-act="excel">选择 Excel 任务表</button></div>
        <div class="pod-import-info">
          <div class="pod-row"><span class="pod-label">任务表</span><span class="pod-value" data-role="excel-file">未导入</span></div>
          <div class="pod-row"><span class="pod-label">工作表</span><span class="pod-value" data-role="excel-sheet">-</span></div>
          <div class="pod-row"><span class="pod-label">编号列</span><span class="pod-value" data-role="excel-id-header">-</span></div>
          <div class="pod-row"><span class="pod-label">提示词列</span><span class="pod-value" data-role="excel-prompt-header">-</span></div>
          <div class="pod-row"><span class="pod-label">识别任务</span><span class="pod-value pod-progress" data-role="excel-task-count">0 条</span></div>
        </div>
        <div style="font-size:10.5px;color:#758196;margin:5px 0 8px">脚本会扫描所有工作表并按实际有效任务量选择主任务表；“完整中文生图提示词”优先级最高。导入成功后会在上方明确显示工作表、编号列、提示词列和识别条数。</div>
        <div class="pod-row"><span class="pod-label">参考图目录</span><span class="pod-value" data-role="source">未选择</span></div>
        <div class="pod-row ${settings.useTemplate?'':'pod-muted'}" data-role="template-row"><span class="pod-label">模板图</span><span class="pod-value" data-role="template">${settings.useTemplate?'未选择':'未启用'}</span></div>
        <div class="pod-row"><span class="pod-label">输出目录</span><span class="pod-value" data-role="output">未选择</span></div>
        <div class="pod-buttons">
          <button class="pod-btn success" data-act="source">选择参考图</button><button class="pod-btn success" data-act="template" ${settings.useTemplate?'':'disabled'}>选择模板图</button><button class="pod-btn success" data-act="output">选择输出</button>
          <button class="pod-btn" data-act="scan">扫描参考图</button><button class="pod-btn success" data-act="exportTasks">导出任务记录</button><button class="pod-btn danger" data-act="forget">清除授权</button>
        </div>
      </div>

      <div class="pod-section">
        <div class="pod-section-title"><span>2. 批量生图规则</span><span class="pod-section-sub">POD业务逻辑已经合并在本流程内</span></div>
        <div class="pod-settings" style="grid-template-columns:1fr">
          <label>生成模式<select data-role="mode"><option value="rebuild">图案复刻</option><option value="enhance">图案高清重建</option><option value="custom">自定义</option></select></label>
        </div>
        <label class="pod-check"><input data-setting="useTemplate" type="checkbox" ${settings.useTemplate?'checked':''}> 使用模板图（可选）</label>
        <div style="font-size:10.5px;color:#758196;margin:-2px 0 7px">开启后，每批参考图上传完成后会额外上传同一张固定模板图；关闭时模板图不会参与任务。</div>
        <textarea class="pod-textarea" data-role="basePrompt" placeholder="母提示词（可选）｜留空时仅使用 Excel 当前任务提示词"></textarea>
        <div style="font-size:10.5px;color:#758196;margin-top:5px">母提示词可以留空。Excel 会优先识别“完整中文提示词 / 完整提示词”等列；母提示词和当前行提示词至少有一个即可执行，两边都为空的任务会标记为“缺少提示词”并跳过发送。</div>
      </div>

      <div class="pod-section">
        <div class="pod-section-title"><span>3. 运行参数</span><span class="pod-section-sub">只影响当前“批量生图”流程</span></div>
        <div class="pod-settings">
          <label>每批数量<input data-setting="batchSize" type="number" min="1" max="10" value="${settings.batchSize}"></label>
          <label>范围起点<input data-setting="rangeStart" type="number" min="1" value="${settings.rangeStart}"></label>
          <label>范围终点<input data-setting="rangeEnd" type="number" min="1" value="${settings.rangeEnd}"></label>
        </div>
        <div class="pod-settings two">
          <label>稳定等待(秒)<input data-setting="stableSeconds" type="number" min="5" max="60" value="${settings.stableSeconds}"></label>
          <label>最长生图(分)<input data-setting="generationMinutes" type="number" min="1" max="60" value="${Math.round(settings.generationTimeout/60000)}"></label>
        </div>
        <div style="font-size:10.5px;color:#667085;margin:7px 0 2px">批次随机等待</div>
        <div class="pod-settings two" style="margin-top:4px">
          <label>最短(秒)<input data-setting="intervalMinSeconds" type="number" min="0" step=".5" value="${settings.intervalMin/1000}"></label>
          <label>最长(秒)<input data-setting="intervalMaxSeconds" type="number" min="0" step=".5" value="${settings.intervalMax/1000}"></label>
        </div>
        <label class="pod-check"><input data-setting="newChatEachBatch" type="checkbox" ${settings.newChatEachBatch?'checked':''}> 每批开始前新建对话</label>
      </div>

      <div class="pod-section">
        <div class="pod-section-title"><span>4. 运行状态与控制</span><span class="pod-section-sub" data-role="status-summary"></span></div>
        <div class="pod-row"><span class="pod-label">任务进度</span><span class="pod-value pod-progress" data-role="progress">0 / 0</span></div>
        <div class="pod-row"><span class="pod-label">当前批次</span><span class="pod-value" data-role="batch">-</span></div>
        <div class="pod-row"><span class="pod-label">当前阶段</span><span class="pod-value" data-role="phase">等待配置</span></div>
        <div class="pod-row"><span class="pod-label">生图进度</span><span class="pod-value pod-progress" data-role="generated">0 / 0</span></div>
        <div class="pod-row"><span class="pod-label">总运行</span><span class="pod-value" data-role="total-time">00:00:00</span></div>
        <div class="pod-row"><span class="pod-label">本批耗时</span><span class="pod-value" data-role="batch-time">00:00:00</span></div>
        <div class="pod-row"><span class="pod-label">生图耗时</span><span class="pod-value" data-role="generation-time">00:00:00</span></div>
        <div class="pod-status" data-role="status">等待配置</div>
        <div class="pod-buttons">
          <button class="pod-btn primary" data-act="start">开始/继续</button><button class="pod-btn" data-act="pause">暂停</button><button class="pod-btn" data-act="skip">跳过当前批</button>
          <button class="pod-btn success" data-act="logs">运行日志</button><button class="pod-btn success" data-act="exportLogs">导出日志</button><button class="pod-btn danger" data-act="reset">重置进度</button>
        </div>
      </div>

      <div class="pod-section">
        <div class="pod-section-title"><span>5. 任务记录</span><span class="pod-section-sub" data-role="task-stats"></span></div>
        <div class="pod-task-tools"><input data-role="taskSearch" placeholder="搜索编号/文件/提示词" value="${escapeAttr(settings.search||'')}"><select data-role="taskFilter"><option value="all">全部</option><option value="pending">待处理</option><option value="running">处理中</option><option value="done">已完成</option><option value="error">失败</option><option value="confirm">待确认</option><option value="skipped">已跳过</option></select></div>
        <div class="pod-task-list" data-role="task-list"></div>
        <div class="pod-buttons"><button class="pod-btn danger" data-act="resetTasks">任务状态全重置</button></div>
      </div>

      <div class="pod-section">
        <div class="pod-section-title"><span>最近日志</span><span class="pod-section-sub">完整记录请打开“运行日志”</span></div>
        <div class="pod-log" data-role="log"></div>
      </div>`;
    bindWorkspaceEvents(workspace);
    const mode=workspace.querySelector('[data-role="mode"]');if(mode)mode.value=settings.mode;
    const prompt=workspace.querySelector('[data-role="basePrompt"]');if(prompt)prompt.value=basePrompt();
    const filter=workspace.querySelector('[data-role="taskFilter"]');if(filter)filter.value=settings.filter||'all';
    lastTaskListSignature='';lastLogPreviewSignature='';
    renderTaskList(true);renderLogPreview(true);
    updatePanel();
    updateFolderLabels();
  }

  function bindWorkspaceEvents(v){
    const excel=v.querySelector('[data-role="excel"]');
    excel?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importExcel(f).then(()=>{lastTaskListSignature='';renderTaskList(true);updatePanel();}).catch(x=>{log(x.message||String(x),'error');alert(x.message||x)});e.target.value=''});
    v.querySelector('[data-role="mode"]')?.addEventListener('change',e=>{settings.mode=e.target.value;saveSettings();refreshMissingPromptStates();saveState(false);const p=v.querySelector('[data-role="basePrompt"]');if(p)p.value=basePrompt();lastTaskListSignature='';renderTaskList(true);updatePanel();});
    v.querySelector('[data-role="basePrompt"]')?.addEventListener('change',e=>{if(settings.mode==='enhance')settings.enhancePrompt=e.target.value;else if(settings.mode==='custom')settings.customPrompt=e.target.value;else settings.rebuildPrompt=e.target.value;saveSettings();refreshMissingPromptStates();saveState(false);lastTaskListSignature='';renderTaskList(true);updatePanel();});
    v.querySelector('[data-role="taskSearch"]')?.addEventListener('input',e=>{settings.search=e.target.value;saveSettings();renderTaskList();});
    v.querySelector('[data-role="taskFilter"]')?.addEventListener('change',e=>{settings.filter=e.target.value;saveSettings();renderTaskList();});
    v.querySelectorAll('[data-setting]').forEach(e=>e.addEventListener('change',()=>readUiSettings()));
    const actions={
      excel:()=>excel?.click(),source:chooseSource,template:chooseTemplate,output:chooseOutput,scan:scanImages,start,pause:()=>pause(),skip:()=>skipCurrent(),logs:openLogWindow,exportLogs:()=>exportLogs(),exportTasks,reset:()=>resetProgress(),
      forget:async()=>{if(confirm('清除参考图/模板图/输出目录授权？')){await clearHandles();await updateFolderLabels();log('文件授权已清除','warn');}},
      resetTasks:()=>{if(!confirm('全部任务状态重置为待处理？已保存图片不会删除。'))return;for(const t of state.tasks){t.status='pending';t.outputFiles=[];t.error='';t.attempts=0;t.updatedAt=new Date().toISOString();}saveState();renderTaskList();log('任务状态已全部重置','warn');},
    };
    v.querySelectorAll('[data-act]').forEach(b=>b.addEventListener('click',()=>Promise.resolve(actions[b.dataset.act]?.()).then(()=>{updatePanel();renderTaskList();}).catch(e=>{log(e.message||String(e),'error');if(e?.name!=='AbortError')alert(e.message||e)})));
  }

  function renderTaskList(force=false){
    if(!panel||settings.flow!=='batch_generation')return;
    const box=panel.querySelector('[data-role="task-list"]');if(!box)return;
    const tasks=filteredTasks();
    const signature=JSON.stringify(tasks.map(t=>[t.key,t.id,t.sourcePath,t.imageName,t.prompt,t.status,t.error,(t.outputFiles||[]).join('|')]));
    if(!force&&signature===lastTaskListSignature)return;
    lastTaskListSignature=signature;
    box.innerHTML=tasks.length?tasks.map(t=>`<div class="pod-task"><b>${escapeHtml(t.id)}</b><div class="pod-task-main"><div class="pod-task-file" title="${escapeAttr(t.sourcePath||t.imageName||'')}">${escapeHtml(t.sourcePath||t.imageName||'未匹配参考图')}</div><div class="pod-task-prompt" title="${escapeAttr(t.error||t.prompt||'')}">${escapeHtml(t.error||t.prompt||(basePrompt()?'使用母提示词':'缺少提示词'))}</div></div><span class="pod-badge s-${t.status}">${statusLabel(t.status)}</span></div>`).join(''):'<div style="padding:15px;text-align:center;color:#98a2b3">暂无任务</div>';
  }

  function exportTasks(){const payload={version:APP_VERSION,flow:settings.flow,exportedAt:new Date().toISOString(),file:state.importedFileName,sheet:state.importedSheetName,headers:state.importedHeaders,importStats:state.importedStats,settings:{...settings},tasks:state.tasks};downloadText(`POD任务记录_V${APP_VERSION}_${stamp()}.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8');log('POD任务记录已导出','success');}

  function renderLogPreview(force=false){const box=panel?.querySelector('[data-role="log"]');if(!box)return;const recent=logs.slice(-10),signature=recent.map(e=>`${e.time}|${e.type}|${e.message}`).join('||');if(!force&&signature===lastLogPreviewSignature)return;lastLogPreviewSignature=signature;box.innerHTML=recent.map(e=>`<div class="${e.type}">${escapeHtml(logLine(e))}</div>`).join('');box.scrollTop=box.scrollHeight;}

  function openLogWindow(){if(!logWindow){logWindow=document.createElement('section');logWindow.id='kagura-pod-log-window';logWindow.innerHTML=`<div class="plw-head"><b>POD运行日志 V${APP_VERSION}</b><span data-role="metrics"></span><button data-role="close">×</button></div><div class="plw-body" data-role="body"></div><div class="plw-foot"><button data-role="copy">复制</button><button data-role="txt">导出TXT</button><button data-role="clear">清空</button></div>`;document.documentElement.appendChild(logWindow);makeDraggable(logWindow,logWindow.querySelector('.plw-head'));logWindow.querySelector('[data-role="close"]').onclick=()=>logWindow.style.display='none';logWindow.querySelector('[data-role="txt"]').onclick=exportLogs;logWindow.querySelector('[data-role="copy"]').onclick=async()=>{try{await navigator.clipboard.writeText(logs.map(logLine).join('\n'));}catch(_){downloadText(`POD运行日志_复制替代_${stamp()}.txt`,logs.map(logLine).join('\r\n'));}log('日志已复制/导出','success')};logWindow.querySelector('[data-role="clear"]').onclick=()=>{if(confirm('清空运行日志？')){logs=[];GM_deleteValue(LOG_KEY);lastLogPreviewSignature='';lastLogWindowSignature='';renderLogPreview(true);renderLogWindow(true)}}}logWindow.style.display='flex';renderLogWindow(true);}

  function renderLogWindow(force=false){if(!logWindow)return;const b=logWindow.querySelector('[data-role="body"]');const last=logs.at(-1),signature=`${logs.length}|${last?.time||''}|${last?.type||''}|${last?.message||''}`;if(force||signature!==lastLogWindowSignature){lastLogWindowSignature=signature;b.innerHTML=logs.map(e=>`<div class="plw-line ${e.type}">${escapeHtml(logLine(e))}</div>`).join('');if(logAutoScroll)b.scrollTop=b.scrollHeight;}const m=logWindow.querySelector('[data-role="metrics"]');if(m)m.textContent=`${flowLabel()} ｜ 总运行 ${formatDuration(totalRunMs())} ｜ 第${state.batchNo}批 ｜ ${phaseLabel()} ｜ 生图 ${state.detectedGeneratedCount}/${state.expectedGeneratedCount}`;}

  async function updateFolderLabels(){if(!panel||settings.flow!=='batch_generation')return;const [s,t,o]=await Promise.all([getHandle(SOURCE_KEY),getHandle(TEMPLATE_KEY),getHandle(OUTPUT_KEY)]).catch(()=>[null,null,null]);const set=(role,val)=>panel.querySelectorAll(`[data-role="${role}"]`).forEach(n=>n.textContent=val);set('source',s?s.name:'未选择');set('template',settings.useTemplate?(t?t.name:'未选择'):'未启用');set('output',o?o.name:'未选择');const templateButton=panel.querySelector('[data-act="template"]');if(templateButton)templateButton.disabled=!settings.useTemplate;const templateRow=panel.querySelector('[data-role="template-row"]');if(templateRow)templateRow.classList.toggle('pod-muted',!settings.useTemplate);}

  function updatePanel(){
    if(!panel)return;
    panel.querySelector('[data-role="flow"]')?.setAttribute('data-current',settings.flow);
    if(settings.flow!=='batch_generation'){renderLogWindow();return;}
    const all=activeTasks();
    const done=all.filter(t=>t.status==='done').length,confirm=all.filter(t=>t.status==='confirm').length,error=all.filter(t=>t.status==='error').length,skipped=all.filter(t=>t.status==='skipped').length;
    const expected=Number(state.expectedGeneratedCount||0),det=Number(state.detectedGeneratedCount||0);
    const set=(role,val)=>{const el=panel.querySelector(`[data-role="${role}"]`);if(el)el.textContent=val;};
    set('task-source-summary',state.importedFileName?`已导入 · ${state.tasks.length}条`:(state.tasks.length?`${state.tasks.length}条临时任务`:'未建立任务'));
    set('excel-file',state.importedFileName||'未导入');
    set('excel-sheet',state.importedSheetName||'-');
    set('excel-id-header',state.importedHeaders?.id||'-');
    set('excel-prompt-header',state.importedHeaders?.prompt||'未检测到');
    set('excel-task-count',`${state.tasks.length||0} 条${state.importedStats?.promptCount?` · 有提示词${state.importedStats.promptCount}`:''}`);
    set('progress',`${done} / ${all.length}${confirm?` · 待确认${confirm}`:''}${error?` · 失败${error}`:''}${skipped?` · 跳过${skipped}`:''}`);
    set('batch',`第 ${state.batchNo} 批 · ${compactBatch()}`);
    set('phase',phaseLabel());
    set('generated',`${det} / ${expected||0}`);
    set('total-time',formatDuration(totalRunMs()));
    set('batch-time',formatDuration(batchElapsed()));
    set('generation-time',formatDuration(generationElapsed()));
    set('status-summary',`完成 ${done} · 待确认 ${confirm} · 失败 ${error}`);
    set('task-stats',`待处理 ${state.tasks.filter(t=>t.status==='pending').length} · 完成 ${state.tasks.filter(t=>t.status==='done').length} · 待确认 ${state.tasks.filter(t=>t.status==='confirm').length}`);
    const status=panel.querySelector('[data-role="status"]');
    if(status){if(!state.tasks.length&&!state.imagePaths.length)status.textContent='请选择参考图目录；Excel任务表可选';else if(state.running&&state.phase==='batch_wait')status.textContent='批次完成，正在等待下一批';else if(state.running&&state.phase==='generating')status.textContent=`正在生图：${det}/${expected||'?'} · 当前批次 ${compactBatch()}`;else if(state.running)status.textContent=`运行中：${phaseLabel()} · 当前 ${compactBatch()}`;else if(state.phase==='done')status.textContent=confirm?`全部可执行任务已结束；待确认 ${confirm} 条`:'全部完成';else if(state.phase==='error')status.textContent='发生错误，已暂停';else status.textContent='等待/已暂停';}
    const startBtn=panel.querySelector('[data-act="start"]');if(startBtn)startBtn.textContent=state.running?'运行中':'开始/继续';
    const useTemplate=panel.querySelector('[data-setting="useTemplate"]');if(useTemplate)useTemplate.checked=Boolean(settings.useTemplate);const templateButton=panel.querySelector('[data-act="template"]');if(templateButton)templateButton.disabled=!settings.useTemplate;const templateRow=panel.querySelector('[data-role="template-row"]');if(templateRow)templateRow.classList.toggle('pod-muted',!settings.useTemplate);
    renderTaskList();
    renderLogWindow(); // 只更新日志窗口顶部计时；正文仅在日志内容变化时重绘
  }

  function compareVersion(a,b){const aa=String(a||'').split('.').map(x=>Number(x)||0),bb=String(b||'').split('.').map(x=>Number(x)||0),n=Math.max(aa.length,bb.length);for(let i=0;i<n;i++){if((aa[i]||0)>(bb[i]||0))return 1;if((aa[i]||0)<(bb[i]||0))return-1;}return 0;}
  function fetchUpdateInfo(){return new Promise((res,rej)=>GM_xmlhttpRequest({method:'GET',url:`${UPDATE_MANIFEST}?_=${Date.now()}`,timeout:15000,headers:{'Cache-Control':'no-cache',Pragma:'no-cache'},onload:r=>{if(r.status>=200&&r.status<300){try{res(JSON.parse(String(r.responseText||'').trim()))}catch(e){rej(new Error(`版本信息解析失败：${e.message||e}`))}}else rej(new Error(`HTTP ${r.status}`))},onerror:()=>rej(new Error('网络失败')),ontimeout:()=>rej(new Error('超时'))}));}

  function closeUpdateDialog(){panel?.querySelector(':scope > .kagura-pod-update-overlay')?.remove();}
  function openManualUpdate(downloadUrl,infoBox){
    const url=String(downloadUrl||UPDATE_DOWNLOAD_FALLBACK).trim()||UPDATE_DOWNLOAD_FALLBACK;
    try{
      const win=window.open(url,'_blank','noopener');
      if(win){
        infoBox.textContent += '\n\n已打开新版脚本页面。Tampermonkey 会显示“更新/重新安装”确认页；只有你手动确认后才会覆盖当前版本。';
        return;
      }
    }catch(_){}
    infoBox.textContent += `\n\n浏览器拦截了更新页。请手动打开：${url}\n脚本不会自动替换当前版本。`;
  }

  function showUpdateDialog(info,{manual=false,error=null}={}){
    if(!panel)return;
    closeUpdateDialog();
    const overlay=document.createElement('div');
    overlay.className='kagura-pod-update-overlay';
    const latest=String(info?.version||APP_VERSION).trim()||APP_VERSION;
    const newer=!error&&compareVersion(latest,APP_VERSION)>0;
    const notes=Array.isArray(info?.changelog)?info.changelog.map(String):[];
    const downloadUrl=String(info?.install_url||info?.download_url||info?.downloadURL||UPDATE_DOWNLOAD_FALLBACK);
    let content='';
    if(error){
      content=`当前版本：V${APP_VERSION}\n\n检查更新失败：${error.message||error}\n不会影响当前脚本运行，也不会执行任何自动更新。`;
    }else if(newer){
      content=`发现新版本：V${latest}\n当前版本：V${APP_VERSION}`;
      if(notes.length)content+=`\n\n更新内容：\n${notes.map((x,i)=>`${i+1}. ${x}`).join('\n')}`;
      content+='\n\n更新规则：只提醒，不会自动下载、自动替换或自动执行。点击“立刻更新”后只会打开 Tampermonkey 的新版确认页，是否覆盖仍由你手动确认。';
    }else{
      content=`当前已经是最新版本：V${APP_VERSION}\n\n更新规则：脚本只负责手动检查和新版提醒，不会自动替换。`;
    }

    overlay.innerHTML=`<div class="kagura-pod-update-card">
      <div class="kagura-pod-update-title">${newer?'发现新版本':'手动检查更新'}</div>
      <div class="kagura-pod-update-info" data-role="info"></div>
      <div class="kagura-pod-update-actions">
        ${newer?'<button type="button" class="kagura-pod-update-now" data-role="now">立刻更新</button>':''}
        ${newer?'<button type="button" class="kagura-pod-update-suppress" data-role="suppress">本版本不再提醒</button>':''}
        <button type="button" class="kagura-pod-update-later" data-role="close">${newer?'稍后':'关闭'}</button>
      </div>
    </div>`;
    panel.appendChild(overlay);
    const infoBox=overlay.querySelector('[data-role="info"]');infoBox.textContent=content;
    overlay.querySelector('[data-role="close"]').onclick=closeUpdateDialog;
    overlay.querySelector('[data-role="now"]')?.addEventListener('click',()=>openManualUpdate(downloadUrl,infoBox));
    overlay.querySelector('[data-role="suppress"]')?.addEventListener('click',()=>{GM_setValue(UPDATE_SUPPRESS_KEY,latest);closeUpdateDialog();});
    overlay.addEventListener('click',e=>{if(e.target===overlay)closeUpdateDialog();});
  }

  async function checkUpdate(manual=false){
    try{
      const data=await fetchUpdateInfo();
      const latest=String(data.version||'').trim();
      if(!/^\d+(?:\.\d+){1,3}$/.test(latest))throw new Error('GitHub 返回的版本号无效');
      const newer=compareVersion(latest,APP_VERSION)>0;
      if(!manual){
        if(!newer)return false;
        if(String(GM_getValue(UPDATE_SUPPRESS_KEY,''))===latest)return false;
      }
      showUpdateDialog(data,{manual});
      return newer;
    }catch(e){
      if(manual)showUpdateDialog(null,{manual:true,error:e});
      else console.warn(`[${APP_NAME}] 启动检查更新失败：`,e);
      return false;
    }
  }


  try{
    if(typeof GM_registerMenuCommand==='function'){
      GM_registerMenuCommand(`检查更新｜POD工作台 V${APP_VERSION}`,()=>checkUpdate(true));
    }
  }catch(_){}

  async function boot(){createPanel();resolveAllTasks();saveState(false);saveSettings();GM_setValue(LOG_KEY,logs);await updateFolderLabels();setTimeout(()=>checkUpdate(false),1600);setInterval(()=>{try{updatePanel()}catch(_){}},1000);if(state.running&&state.resumeContext?.kind==='generation-refresh'){log(`检测到刷新恢复：第${state.batchNo}批只恢复检测，不重新发送`,'warn');setTimeout(()=>worker(),1500);}else if(state.running){stopRunClock();state.running=false;state.phase='ready';saveState();log('页面重新加载后已自动暂停；点击“开始/继续”可继续未完成任务','warn');}else{log(`POD统一工作台已启动 V${APP_VERSION}；当前流程：${flowLabel()}；不依赖任何旧洗图脚本`,'success');}}

  boot().catch(e=>{console.error(e);alert(`POD统一工作台启动失败：${e.message||e}`)});
})();
