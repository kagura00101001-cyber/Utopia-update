from pathlib import Path
import json, re

ROOT = Path('.')
USER = ROOT / 'POD_ChatGPT.user.js'
META = ROOT / 'POD_ChatGPT.meta.js'
LATEST = ROOT / 'POD_ChatGPT.latest.json'
HISTORY = ROOT / 'POD_ChatGPT.history.json'

text = USER.read_text(encoding='utf-8')
if "// @version      1.6.2" not in text or "const APP_VERSION = '1.6.2';" not in text:
    raise SystemExit('baseline is not V1.6.2')

text = text.replace('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.2', '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.3', 1)
text = text.replace('// @version      1.6.2', '// @version      1.6.3', 1)
text = re.sub(r'^// @description  .*$', '// @description  服装POD统一工作台：V1.6.3 增加损坏附件快速检测与上传失败自动恢复，避免偶发坏图/卡死导致整夜任务暂停。', text, count=1, flags=re.M)
text = text.replace("  const APP_VERSION = '1.6.2';", "  const APP_VERSION = '1.6.3';", 1)
anchor = ' * - V1.6.2 创建图片入口修复：仅在当前 composer 的“+”按钮新打开菜单中匹配以“创建图片/创作图片/生成图片”开头的真实菜单项；排除侧边栏、历史与项目区域，并增加会话路径跳转保护，避免误点“替换人物生成图片”等聊天标题。\n'
if anchor in text and 'V1.6.3 上传恢复增强' not in text:
    text = text.replace(anchor, anchor + ' * - V1.6.3 上传恢复增强：附件缩略图 complete=true 且 naturalWidth=0 连续8秒即判定损坏；无进度的不完整附件连续25秒判定卡死；上传超时也进入可恢复错误。首次原页面清理重试，第二次失败刷新当前会话后恢复同批，刷新后仍失败才暂停。\n', 1)

new_upload = r'''  function uploadState(){
    const c=findComposer(),t=text(c),f=detectUploadFailure();
    const local=/上传失败|文件上传失败|Upload failed|Failed to upload|无法上传/i.test(t);
    const previews=[...c.querySelectorAll('img')].filter(img=>{const r=img.getBoundingClientRect();return isVisible(img)&&r.width>=32&&r.height>=32&&r.width<=240&&r.height<=240});
    const ready=previews.filter(i=>i.complete&&i.naturalWidth>0).length;
    const broken=previews.filter(i=>i.complete&&!(i.naturalWidth>0)).length;
    const ind=['[role="progressbar"]','[aria-busy="true"]','[data-testid*="upload-progress"]','[data-testid*="attachment-loading"]','[data-state="loading"]','.animate-spin'].some(s=>[...c.querySelectorAll(s)].some(isVisible));
    const textProgress=/上传中|正在上传|正在处理(?:文件|图片)?|Uploading|Processing (?:file|image)|Preparing upload/i.test(t);
    return{failed:f.failed||local,retryable:f.failed?f.retryable:local,failureMessage:f.message||'',uploading:textProgress||ind||ready<previews.length,progressActive:textProgress||ind,previewTotal:previews.length,previewReady:ready,brokenPreviewCount:broken,count:countAttachments()};
  }
  async function waitUploads(expected,label,stableMs=4000){
    const timeout=Number(settings.uploadTimeout)||180000;let since=0,last=-1,badSince=0,stalledSince=0;
    const r=await waitUntil(()=>{
      const s=uploadState();
      if(s.failed){const m=`${label}上传失败${s.failureMessage?`：${s.failureMessage}`:''}`;if(s.retryable)throw new UploadRetryableError(m);throw new Error(m);}
      if(s.brokenPreviewCount>0){
        if(!badSince)badSince=Date.now();
        if(Date.now()-badSince>=8000)throw new UploadRetryableError(`${label}检测到损坏附件预览：${s.brokenPreviewCount} 张图片已结束加载但 naturalWidth=0`);
      }else badSince=0;
      const incompleteAttached=s.count>=expected&&s.previewTotal>0&&s.previewReady<s.previewTotal&&s.brokenPreviewCount===0;
      if(incompleteAttached&&!s.progressActive){
        if(!stalledSince)stalledSince=Date.now();
        if(Date.now()-stalledSince>=25000)throw new UploadRetryableError(`${label}附件预览连续25秒无有效上传进展，判定上传卡死`);
      }else stalledSince=0;
      if(!s.uploading&&s.count>=expected){if(s.count!==last){last=s.count;since=Date.now()}if(!since)since=Date.now();if(Date.now()-since>=stableMs)return s.count;}else{since=0;last=s.count;}
      return null;
    },timeout,500);
    if(!r)throw new UploadRetryableError(`${label}未在 ${Math.round(timeout/1000)} 秒内稳定完成，按上传超时进入自动恢复`);
    log(`${label}全部上传完成：${r} 张附件已稳定`,'success');return r;
  }
  async function uploadFiles'''
pat = re.compile(r'  function uploadState\(\)\{.*?\n  async function waitUploads\(expected,label,stableMs=4000\)\{.*?\n  async function uploadFiles', re.S)
text, n = pat.subn(new_upload, text, count=1)
if n != 1:
    raise SystemExit(f'uploadState/waitUploads patch failed: {n}')

old = "    const resumeKind=state.resumeContext?.kind||'';\n    let detectOnly=Boolean(['generation-refresh','sent-waiting'].includes(resumeKind)&&state.currentBatchKeys.length);\n    let confirmOnly=Boolean(resumeKind==='send-confirming'&&state.currentBatchKeys.length);"
new = "    const resumeKind=state.resumeContext?.kind||'';\n    let detectOnly=Boolean(['generation-refresh','sent-waiting'].includes(resumeKind)&&state.currentBatchKeys.length);\n    let confirmOnly=Boolean(resumeKind==='send-confirming'&&state.currentBatchKeys.length);\n    let resumeUploadRefresh=Boolean(resumeKind==='upload-refresh'&&state.currentBatchKeys.length);"
if old not in text: raise SystemExit('processBatch resume header marker missing')
text = text.replace(old,new,1)

old = "    const prompt=state.resumeContext?.prompt||buildBatchPrompt(tasks);let uploadRetries=0;let execution=0;"
new = "    const prompt=state.resumeContext?.prompt||buildBatchPrompt(tasks);let uploadRetries=Math.max(0,Number(state.resumeContext?.uploadRetries)||0);let execution=0;"
if old not in text: raise SystemExit('uploadRetries marker missing')
text = text.replace(old,new,1)

old = "          if(settings.newChatEachBatch)await goNewChat();\n          baseline=new Set(generatedImages().map(i=>i.key));state.phase='uploading_assets';saveState();\n          const uploadList=[await handles.template.getFile()];let uploadLabel='公共模板图';if(handles.logo){uploadList.push(await handles.logo.getFile());uploadLabel='公共模板图、公共Logo图';}\n          const expected=await uploadFiles(uploadList,uploadLabel);await activateCreate();state.phase='writing_prompt';saveState();await setPromptValue(prompt);state.phase='sending';saveState();await sendPrompt(expected,prompt);"
new = "          if(settings.newChatEachBatch&&!resumeUploadRefresh)await goNewChat();\n          baseline=new Set(generatedImages().map(i=>i.key));state.phase='uploading_assets';saveState();\n          const uploadList=[await handles.template.getFile()];let uploadLabel='公共模板图';if(handles.logo){uploadList.push(await handles.logo.getFile());uploadLabel='公共模板图、公共Logo图';}\n          const expected=await uploadFiles(uploadList,uploadLabel);\n          if(resumeUploadRefresh){state.resumeContext=null;resumeUploadRefresh=false;saveState(false);log('刷新恢复后附件上传成功，继续当前批次；此前未发送提示词','success');}\n          await activateCreate();state.phase='writing_prompt';saveState();await setPromptValue(prompt);state.phase='sending';saveState();await sendPrompt(expected,prompt);"
if old not in text: raise SystemExit('normal upload branch marker missing')
text = text.replace(old,new,1)

old = "        if(e instanceof UploadRetryableError&&uploadRetries<2&&!sent&&!confirmOnly&&!['send-confirming','sent-waiting'].includes(state.resumeContext?.kind)){uploadRetries++;log(`模板/Logo图上传失败，整批清理/重试 ${uploadRetries}/2：${e.message}`,'warn');await clearComposer();detectOnly=false;confirmOnly=false;state.resumeContext=null;await sleep(1200);continue;}"
new = "        if(e instanceof UploadRetryableError&&!sent&&!confirmOnly&&!['send-confirming','sent-waiting','generation-refresh'].includes(state.resumeContext?.kind)){\n          uploadRetries++;\n          if(uploadRetries===1){\n            log(`检测到上传失败/坏图/卡死，原页面清理附件后重试 1/2：${e.message}`,'warn');\n            await clearComposer();detectOnly=false;confirmOnly=false;resumeUploadRefresh=false;state.resumeContext=null;await sleep(1200);continue;\n          }\n          if(uploadRetries===2){\n            state.resumeContext={kind:'upload-refresh',batchKeys:[...state.currentBatchKeys],batchPaths:[...state.currentBatchPaths],prompt:String(prompt||''),uploadRetries,refreshReason:String(e.message||e),updatedAt:new Date().toISOString()};\n            state.phase='refreshing';saveState();\n            log(`第二次上传仍失败，刷新当前页面后恢复同一批次重新上传；当前批尚未发送：${e.message}`,'warn');\n            setTimeout(()=>location.reload(),300);return new Promise(()=>{});\n          }\n          log(`刷新恢复后上传仍失败，停止自动恢复并暂停当前批：${e.message}`,'error');\n        }"
if old not in text: raise SystemExit('upload retry catch marker missing')
text = text.replace(old,new,1)

old = "    if(state.running&&state.resumeContext?.kind==='generation-refresh'){const rr=state.resumeContext?.refreshReason?`；原因：${state.resumeContext.refreshReason}`:'';log(`检测到刷新恢复：第${state.batchNo}批只恢复检测，不重新发送${rr}`,'warn');setTimeout(()=>worker(),1500);}\n    else if(state.running){stopRunClock();state.running=false;state.phase='ready';saveState();log('页面重新加载后已自动暂停；点击“开始/继续”可继续未完成任务','warn');}"
new = "    if(state.running&&['generation-refresh','upload-refresh'].includes(state.resumeContext?.kind)){const rr=state.resumeContext?.refreshReason?`；原因：${state.resumeContext.refreshReason}`:'';if(state.resumeContext?.kind==='upload-refresh')log(`检测到上传刷新恢复：第${state.batchNo}批重新上传附件；此前未发送提示词${rr}`,'warn');else log(`检测到刷新恢复：第${state.batchNo}批只恢复检测，不重新发送${rr}`,'warn');setTimeout(()=>worker(),1500);}\n    else if(state.running){stopRunClock();state.running=false;state.phase='ready';saveState();log('页面重新加载后已自动暂停；点击“开始/继续”可继续未完成任务','warn');}"
if old not in text: raise SystemExit('boot refresh marker missing')
text = text.replace(old,new,1)

USER.write_text(text,encoding='utf-8')

# meta: keep the exact userscript header as the update metadata file
header_end = text.index('// ==/UserScript==') + len('// ==/UserScript==')
META.write_text(text[:header_end] + '\n', encoding='utf-8')

latest = json.loads(LATEST.read_text(encoding='utf-8'))
latest.update({
    'version':'1.6.3',
    'published_at':'2026-08-26',
    'changelog':[
        '新增坏附件快速检测：图片预览 complete=true 且 naturalWidth=0 连续8秒，直接判定附件损坏，不再傻等180秒。',
        '新增上传卡死检测：附件已出现但预览不完整、且连续25秒没有真实上传进度时，按可恢复上传失败处理。',
        '原180秒上传超时也改为可恢复错误：首次清理附件原页面重试；第二次失败刷新当前会话后恢复同批重新上传；刷新后仍失败才暂停。',
        '上传刷新恢复只允许发生在提示词发送前；已发送阶段继续遵守at-most-once规则，不会因上传恢复重复发送或重复生图。',
        '创建图片、提示词写入、发送确认、生图检测、下载隔离和夜间休眠恢复逻辑保持不变。'
    ]
})
LATEST.write_text(json.dumps(latest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

history = json.loads(HISTORY.read_text(encoding='utf-8'))
versions = history.setdefault('versions',[])
versions = [v for v in versions if str(v.get('version'))!='1.6.3']
versions.insert(0,{
    'version':'1.6.3','date':'2026-08-26','notes':latest['changelog']
})
history['versions']=versions
HISTORY.write_text(json.dumps(history,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

# release assertions
final = USER.read_text(encoding='utf-8')
checks = [
    '// @name         ChatGPT服装POD统一工作台 V1.2.2',
    '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.6.3',
    '// @version      1.6.3',
    "const APP_VERSION = '1.6.3';",
    'brokenPreviewCount:broken',
    'naturalWidth=0',
    "kind:'upload-refresh'",
    "['generation-refresh','upload-refresh']",
    '刷新恢复后附件上传成功',
]
missing=[x for x in checks if x not in final]
if missing: raise SystemExit('release assertions missing: '+repr(missing))
print('patched V1.6.3 successfully')
