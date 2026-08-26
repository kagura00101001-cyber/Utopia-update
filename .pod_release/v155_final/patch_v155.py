from pathlib import Path
import json, re, subprocess

USER=Path('POD_ChatGPT.user.js')
META=Path('POD_ChatGPT.meta.js')
LATESTS=[Path('POD_ChatGPT.latest.json'),Path('POD_ChatGPT_latest.json')]
HISTORY=Path('POD_ChatGPT.history.json')
s=USER.read_text(encoding='utf-8')

def rep(old,new,count=1):
    global s
    c=s.count(old)
    if c < count:
        raise SystemExit(f'missing marker ({c}<{count}): {old[:160]!r}')
    s=s.replace(old,new,count)

# Hard baseline guard: only patch the clean V1.5.4 line.
for marker in [
    '// @name         ChatGPT服装POD统一工作台 V1.2.2',
    '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.4',
    '// @version      1.5.4',
    "const APP_VERSION = '1.5.4';",
    '  function buildBatchPrompt(tasks){',
    '  async function setPromptValue(v){',
    '  async function waitReadyToSend(expectedCount,prompt){',
    '  async function sendPrompt(expectedCount,prompt){',
    '  function showUpdateDialog(info,{manual=false,error=null}={}){',
]:
    if marker not in s: raise SystemExit(f'baseline marker missing: {marker}')
if 'findCreateNearPlusLocal' in s or 'findCreateNearPlusFallback' in s:
    raise SystemExit('V1.6.x create-menu code unexpectedly present in V1.5.4 baseline')

# Version metadata.
rep('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.4','// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.5')
rep('// @version      1.5.4','// @version      1.5.5')
rep('// @description  服装POD统一工作台：V1.5.4 增强长期挂机恢复，并修复版本弹窗无可见“检查更新”按钮的问题；仍保持手动确认更新。','// @description  服装POD统一工作台：V1.5.5 长提示词性能修复：批量生图发送前自动压平换行、发送确认改用轻量提示词守卫；版本信息新增历史版本查看与手动切换。')
rep('ChatGPT服装POD统一工作台 V1.5.4\n   * ================================================================','ChatGPT服装POD统一工作台 V1.5.5\n   * ================================================================')
rep("const APP_VERSION = '1.5.4';","const APP_VERSION = '1.5.5';")
anchor=' * - V1.5.4 更新模块小修：版本弹窗始终提供“检查更新/重新检查”按钮；有新版时继续保留“立刻更新”，不改变手动确认覆盖规则。'
note=' * - V1.5.5 长提示词性能修复：批量生图真正写入 ChatGPT 前自动把多段提示词压平为空格；严格全文 DOM 校验只保留在写入完成/可能二次发送等安全边界，轮询阶段改为轻量提示词守卫。版本信息新增历史版本查看、更新说明与手动版本切换。\n'
rep(anchor,note+anchor)

# Flatten only the batch-generation composer payload; source Excel/task text remains untouched in state/UI.
insert_before='  function buildBatchPrompt(tasks){'
flatten_fn="""  function flattenPromptForComposer(v){
    return String(v??'').replace(/\\r\\n?/g,'\\n').split('\\n').map(x=>x.trim()).filter(Boolean).join(' ').replace(/[ \\t]{2,}/g,' ').trim();
  }
"""
rep(insert_before,flatten_fn+insert_before)
old_return="    return lines.filter((x,i,a)=>!(x===''&&a[i-1]==='')).join('\\n').trim();"
new_return="    return flattenPromptForComposer(lines.filter((x,i,a)=>!(x===''&&a[i-1]==='')).join('\\n').trim());"
rep(old_return,new_return)
rep("    const prompt=state.resumeContext?.prompt||buildBatchPrompt(tasks);let uploadRetries=0;let execution=0;","    const prompt=flattenPromptForComposer(state.resumeContext?.prompt||buildBatchPrompt(tasks));let uploadRetries=0;let execution=0;")

# Add a cheap prompt guard next to the strict clone-based promptMatches.
pm='  function promptMatches(e,expected){const a=readEditor(e),b=normalizePrompt(expected);if(!a||!b)return false;if(a===b||a.includes(b))return true;const aa=a.replace(/\\s+/g,\'\'),bb=b.replace(/\\s+/g,\'\');if(aa===bb||aa.includes(bb))return true;return bb.length>=80&&aa.includes(bb.slice(0,40))&&aa.includes(bb.slice(-40));}'
light="""  function promptMatches(e,expected){const a=readEditor(e),b=normalizePrompt(expected);if(!a||!b)return false;if(a===b||a.includes(b))return true;const aa=a.replace(/\\s+/g,''),bb=b.replace(/\\s+/g,'');if(aa===bb||aa.includes(bb))return true;return bb.length>=80&&aa.includes(bb.slice(0,40))&&aa.includes(bb.slice(-40));}
  function promptLightSignature(expected){const b=normalizePrompt(expected).replace(/\\s+/g,'');return{len:b.length,head:b.slice(0,56),tail:b.slice(-56)};}
  function promptLightMatches(e,expected){
    if(!e)return false;let raw='';
    try{raw=e instanceof HTMLTextAreaElement||e instanceof HTMLInputElement?e.value:(e.textContent||'');}catch(_){return false;}
    raw=String(raw||'').replace(/[\\u200B-\\u200D\\u2060\\uFEFF]/g,'').replace(/\\s+/g,'');
    const sig=promptLightSignature(expected);if(!raw||!sig.len)return false;
    if(sig.head&&!raw.includes(sig.head))return false;if(sig.tail&&!raw.includes(sig.tail))return false;
    return raw.length>=Math.max(20,Math.floor(sig.len*0.9));
  }"""
if pm not in s: raise SystemExit('promptMatches exact marker missing')
s=s.replace(pm,light,1)

# setPromptValue: always flatten batch payload and keep strict full verification after the write.
a=s.index('  async function setPromptValue(v){')
b=s.index('  function findSend(){',a)
block=s[a:b]
block=block.replace("const expected=String(v||'').trim();","const expected=flattenPromptForComposer(v);")
s=s[:a]+block+s[b:]

# Stable 5-second wait: no repeated cloneNode/readEditor. Use only light anchors/length plus attachment/create/send state.
a=s.index('  async function waitReadyToSend(expectedCount,prompt){')
b=s.index('  function setBatchResumeContext(',a)
s=s[:a]+"""  async function waitReadyToSend(expectedCount,prompt){
    let since=0;const timeout=Number(settings.uploadTimeout)||180000;
    const b=await waitUntil(()=>{
      const s=uploadState(),e=findPromptEditor(),pr=Boolean(e&&promptLightMatches(e,prompt)),cr=hasCreateChip(),bt=findSend(),en=Boolean(bt&&!bt.disabled&&bt.getAttribute('aria-disabled')!=='true');
      if(s.failed){if(s.retryable)throw new UploadRetryableError('发送前检测到上传失败');throw new Error('发送前检测到不可重试上传失败')}
      if(!s.uploading&&s.count>=expectedCount&&pr&&cr&&en){if(!since)since=Date.now();if(Date.now()-since>=5000)return bt}else since=0;
      return null;
    },timeout,700);
    if(!b)throw new Error('发送前检查未通过');
    log('发送前检查通过：附件上传完成、轻量提示词守卫正常、“创建图片”模式存在，并稳定5秒','success');return b;
  }
"""+s[b:]

# send/resume confirmation: use the light guard during polling. Strict clone-based full check only at a possible second-send boundary.
a=s.index('  async function sendPrompt(expectedCount,prompt){')
b=s.index('  // 风格反推使用普通文本对话',a)
block=s[a:b]
block=block.replace('promptMatches(findPromptEditor(),prompt)','promptLightMatches(findPromptEditor(),prompt)')
old="if(click===1){log('完整观察期结束后提示词仍完整留在输入框，才允许第二次点击','warn');btn=await waitReadyToSend(expectedCount,prompt);continue;}"
new="""if(click===1){
        if(!promptMatches(findPromptEditor(),prompt)){
          markBatchSent(prompt,{expectedCount,beforeMatch,beforeAny,reason:'strict-check-left-before-second-click'});
          log('完整观察期结束：严格全文校验确认提示词已不完整留在输入框，为避免重复生成按已提交处理','warn');return;
        }
        log('完整观察期结束且严格全文校验确认提示词仍完整，才允许第二次点击','warn');btn=await waitReadyToSend(expectedCount,prompt);continue;
      }"""
if old not in block: raise SystemExit('second-click boundary marker missing')
block=block.replace(old,new,1)
old2="""    const s=uploadState(),still=promptLightMatches(findPromptEditor(),prompt);
    if(!still){
      markBatchSent(prompt,{expectedCount:expected||s.count,beforeMatch,beforeAny,reason:'resume-prompt-left'});
      log('恢复核验结束：提示词已离开输入框，为避免重复生成按“已发送”处理，只恢复检测','warn');
      return true;
    }
    if(expected&&s.count<expected)throw new Error(`暂停后无法安全恢复发送确认：提示词仍在输入框，但附件仅 ${s.count}/${expected}；未自动重发，请人工检查当前输入框`);"""
new2="""    const s=uploadState(),stillLight=promptLightMatches(findPromptEditor(),prompt);
    if(!stillLight){
      markBatchSent(prompt,{expectedCount:expected||s.count,beforeMatch,beforeAny,reason:'resume-prompt-left'});
      log('恢复核验结束：轻量守卫确认提示词已离开输入框，为避免重复生成按“已发送”处理，只恢复检测','warn');
      return true;
    }
    const still=promptMatches(findPromptEditor(),prompt);
    if(!still){
      markBatchSent(prompt,{expectedCount:expected||s.count,beforeMatch,beforeAny,reason:'resume-strict-prompt-left'});
      log('恢复核验结束：严格全文校验未确认原提示词完整，为避免重复生成按“已发送”处理，只恢复检测','warn');
      return true;
    }
    if(expected&&s.count<expected)throw new Error(`暂停后无法安全恢复发送确认：提示词仍在输入框，但附件仅 ${s.count}/${expected}；未自动重发，请人工检查当前输入框`);"""
if old2 not in block: raise SystemExit('resume strict boundary marker missing')
block=block.replace(old2,new2,1)
s=s[:a]+block+s[b:]

# Version history manager: fetched only when the version dialog is opened.
fetch_anchor="  function fetchUpdateInfo(){return new Promise((res,rej)=>GM_xmlhttpRequest({method:'GET',url:`${UPDATE_MANIFEST}?_=${Date.now()}`,timeout:15000,headers:{'Cache-Control':'no-cache',Pragma:'no-cache'},onload:r=>{if(r.status>=200&&r.status<300){try{res(JSON.parse(String(r.responseText||'').trim()))}catch(e){rej(new Error(`版本信息解析失败：${e.message||e}`))}}else rej(new Error(`HTTP ${r.status}`))},onerror:()=>rej(new Error('网络失败')),ontimeout:()=>rej(new Error('超时'))}));}"
if fetch_anchor not in s: raise SystemExit('fetchUpdateInfo anchor missing')
hist_funcs=fetch_anchor+"""
  function fetchVersionHistory(){const url=`https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.history.json?_=${Date.now()}`;return new Promise((res,rej)=>GM_xmlhttpRequest({method:'GET',url,timeout:15000,headers:{'Cache-Control':'no-cache',Pragma:'no-cache'},onload:r=>{if(r.status>=200&&r.status<300){try{res(JSON.parse(String(r.responseText||'').trim()))}catch(e){rej(new Error(`历史版本解析失败：${e.message||e}`))}}else rej(new Error(`历史版本 HTTP ${r.status}`))},onerror:()=>rej(new Error('历史版本网络失败')),ontimeout:()=>rej(new Error('历史版本读取超时'))}));}
  function historyInstallUrl(item){const direct=String(item?.install_url||'').trim();if(direct)return direct;const sha=String(item?.commit||'').trim();return sha?`https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/${sha}/POD_ChatGPT.user.js`:'';}
  async function loadVersionHistory(overlay){
    const sel=overlay?.querySelector('[data-role="history-select"]'),detail=overlay?.querySelector('[data-role="history-detail"]'),go=overlay?.querySelector('[data-role="history-go"]');if(!sel||!detail||!go)return;
    detail.textContent='正在读取历史版本…';go.disabled=true;
    try{
      const data=await fetchVersionHistory(),versions=Array.isArray(data?.versions)?data.versions:[];if(!versions.length)throw new Error('历史版本列表为空');
      sel.innerHTML=versions.map((v,i)=>{const ver=String(v.version||'');const tag=ver===APP_VERSION?'（当前）':v.status==='withdrawn'?'（已回退历史版）':'';return `<option value="${i}">V${escapeHtml(ver)} ${tag}</option>`}).join('');
      const render=()=>{
        const item=versions[Number(sel.value)||0]||versions[0],ver=String(item?.version||''),notes=Array.isArray(item?.notes)?item.notes.map(String):[],url=historyInstallUrl(item);const relation=ver===APP_VERSION?'当前正在使用':item?.status==='withdrawn'?'历史版本（此前已从正式线回退）':'历史版本';
        detail.textContent=`V${ver}｜${relation}${item?.date?`｜${item.date}`:''}${notes.length?`\n${notes.map((x,i)=>`${i+1}. ${x}`).join('\n')}`:''}\n\n版本切换规则：只打开对应版本的 Tampermonkey 手动安装/覆盖页面，不会静默安装，也不会主动清除现有脚本数据。`;
        go.disabled=!url||ver===APP_VERSION;go.textContent=ver===APP_VERSION?'当前版本':`切换到 V${ver}`;go.dataset.url=url||'';go.dataset.version=ver;
      };
      sel.onchange=render;go.onclick=()=>{const url=go.dataset.url,ver=go.dataset.version;if(!url)return;if(!confirm(`确定打开 V${ver} 的手动切换页面？\n\nTampermonkey 仍会要求你确认覆盖；旧版本可能不支持后续新增功能。`))return;openManualUpdate(url,detail);};render();
    }catch(e){detail.textContent=`历史版本读取失败：${e.message||e}`;go.disabled=true;}
  }"""
s=s.replace(fetch_anchor,hist_funcs,1)

# Inject history selector into the existing version-info dialog.
old_html='''      <div class="kagura-pod-update-info" data-role="info"></div>\n      <div class="kagura-pod-update-actions">'''
new_html='''      <div class="kagura-pod-update-info" data-role="info"></div>\n      <div style="margin-top:12px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:8px;background:rgba(15,23,42,.35)">\n        <div style="font-weight:700;margin-bottom:7px">历史版本 / 手动切换</div>\n        <div style="display:flex;gap:7px;align-items:center"><select data-role="history-select" style="flex:1;min-width:0;padding:7px;border-radius:6px"></select><button type="button" data-role="history-go">切换版本</button></div>\n        <div data-role="history-detail" style="white-space:pre-wrap;margin-top:8px;max-height:180px;overflow:auto;font-size:12px;line-height:1.55;color:#cbd5e1">点击版本信息时加载历史记录。</div>\n      </div>\n      <div class="kagura-pod-update-actions">'''
if old_html not in s: raise SystemExit('update dialog html anchor missing')
s=s.replace(old_html,new_html,1)
rep("    const infoBox=overlay.querySelector('[data-role=\"info\"]');infoBox.textContent=content;","    const infoBox=overlay.querySelector('[data-role=\"info\"]');infoBox.textContent=content;loadVersionHistory(overlay);")

# Scope regression guards.
if s.count("const APP_VERSION = '1.5.5';")!=1: raise SystemExit('APP_VERSION patch invalid')
if 'function flattenPromptForComposer' not in s or 'function promptLightMatches' not in s: raise SystemExit('performance helpers missing')
if 'loadVersionHistory(overlay);' not in s or 'history-select' not in s: raise SystemExit('version history UI missing')
if 'findCreateNearPlusLocal' in s or 'findCreateNearPlusFallback' in s: raise SystemExit('V1.6 create menu code introduced')
USER.write_text(s,encoding='utf-8')

# Meta is the userscript header only.
header_end=s.index('// ==/UserScript==')+len('// ==/UserScript==')
META.write_text(s[:header_end]+'\n',encoding='utf-8')

# Rehydrate the complete historical list from the last pre-rollback release so V1.6.x remains selectable history.
try:
    old_hist=json.loads(subprocess.check_output(['git','show','07c8f0e4d064d2e78e9c6c7e88279780e2322525:POD_ChatGPT.history.json'],text=True,encoding='utf-8'))
except Exception:
    old_hist=json.loads(HISTORY.read_text(encoding='utf-8'))
versions=old_hist.get('versions',[])
# Drop any duplicate 1.5.5 and mark V1.6.x as withdrawn historical builds after rollback to 1.5.4 baseline.
versions=[v for v in versions if str(v.get('version'))!='1.5.5']
for v in versions:
    if str(v.get('version','')).startswith('1.6.'):
        v['status']='withdrawn'
current={
    'version':'1.5.5','date':'2026-08-26','status':'current',
    'notes':[
        '基于实机A/B测试修复长提示词卡顿：批量生图真正写入ChatGPT前自动把多段换行压平为空格，Excel原始任务内容与任务记录不删减。',
        '写入完成后保留一次严格全文校验；发送前稳定等待、发送确认与恢复轮询改用轻量提示词守卫，避免每500~700ms cloneNode整个长文本编辑器。',
        '只有在可能进行第二次发送、暂停恢复等安全边界才重新执行严格全文校验，继续遵守at-most-once发送规则。',
        '版本信息新增历史版本列表、版本说明和手动版本切换；切换只打开对应Tampermonkey确认页，不自动安装、不静默覆盖。',
    ]
}
old_hist['versions']=[current]+versions
HISTORY.write_text(json.dumps(old_hist,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

changelog=[
    '基于父亲节500条Excel实机A/B测试修复长提示词卡顿：发送给ChatGPT前自动压平多段换行，保留全部文字内容。',
    '严格全文DOM校验从高频轮询中移除；发送前稳定等待/发送确认使用轻量提示词守卫，仅在二次发送与恢复安全边界做严格全文校验。',
    '版本信息新增历史版本查看、更新说明和版本选择；切换历史版本仍由Tampermonkey手动确认覆盖，不执行静默升级或降级。',
    '以纯V1.5.4为代码基线，不带回V1.6.x创建图片探测、全页扫描或生产文件设计相关性能改动。'
]
latest={'version':'1.5.5','install_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js','download_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js','published_at':'2026-08-26','changelog':changelog}
for p in LATESTS:p.write_text(json.dumps(latest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# Build stable TXT archives and commit-pinned install links for every history entry we can recover from Git.
Path('versions').mkdir(exist_ok=True)
# Current working tree archive.
Path('versions/POD_ChatGPT统一工作台_V1.5.5.txt').write_text(s,encoding='utf-8')
# Map prior versions to the newest commit whose userscript header actually reports that version.
version_commit={}
for sha in subprocess.check_output(['git','rev-list','--all','--','POD_ChatGPT.user.js'],text=True).splitlines():
    try: txt=subprocess.check_output(['git','show',f'{sha}:POD_ChatGPT.user.js'],text=True,encoding='utf-8',stderr=subprocess.DEVNULL)
    except Exception: continue
    m=re.search(r'^// @version\s+(\d+(?:\.\d+){2,3})\s*$',txt,re.M)
    if not m: continue
    ver=m.group(1)
    if ver not in version_commit: version_commit[ver]=(sha,txt)
h=json.loads(HISTORY.read_text(encoding='utf-8'))
for item in h.get('versions',[]):
    ver=str(item.get('version',''))
    if ver=='1.5.5':
        item['archive_url']='https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/versions/POD_ChatGPT统一工作台_V1.5.5.txt'
        continue
    pair=version_commit.get(ver)
    if not pair: continue
    sha,txt=pair
    item['commit']=sha
    item['install_url']=f'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/{sha}/POD_ChatGPT.user.js'
    archive=Path(f'versions/POD_ChatGPT统一工作台_V{ver}.txt')
    if not archive.exists(): archive.write_text(txt,encoding='utf-8')
    item['archive_url']=f'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/versions/POD_ChatGPT统一工作台_V{ver}.txt'
HISTORY.write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
