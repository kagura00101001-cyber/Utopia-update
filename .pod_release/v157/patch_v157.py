from pathlib import Path
import json, re

ROOT=Path('.')
USER=ROOT/'POD_ChatGPT.user.js'
META=ROOT/'POD_ChatGPT.meta.js'
LATEST=ROOT/'POD_ChatGPT.latest.json'
LATEST2=ROOT/'POD_ChatGPT_latest.json'
HISTORY=ROOT/'POD_ChatGPT.history.json'
ARCHIVE=ROOT/'versions'/'POD_ChatGPT统一工作台_V1.5.7.txt'

s=USER.read_text(encoding='utf-8')
assert "const APP_VERSION = '1.5.6';" in s, 'expected V1.5.6 baseline'
assert 'async function waitReadyToSend(expectedCount,prompt)' in s

s=s.replace('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.6','// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.7',1)
s=s.replace('// @version      1.5.6','// @version      1.5.7',1)
s=re.sub(r'^// @description  .*$', '// @description  服装POD统一工作台：V1.5.7 新增发送前检查详细诊断与最多2次安全原地恢复；保留长提示词性能修复、后台断层保护与发送后at-most-once规则。', s, count=1, flags=re.M)
s=s.replace('ChatGPT服装POD统一工作台 V1.5.6\n   * ================================================================','ChatGPT服装POD统一工作台 V1.5.7\n   * ================================================================',1)
s=s.replace("const APP_VERSION = '1.5.6';","const APP_VERSION = '1.5.7';",1)

anchor=' * - V1.5.6 后台断层恢复改为“先检测、后刷新”：超过45秒只排除断层时间并恢复扫描；仅页面前台可见、恢复检测30秒后仍0图/无生成/无完成状态时才允许刷新一次。版本历史界面同步修复对比度与操作层级，V1.6.x统一标识为“已撤回开发版”。\n'
assert anchor in s, 'V1.5.6 changelog anchor missing'
s=s.replace(anchor,anchor+' * - V1.5.7 发送前检查增强：180秒初检超时后输出附件/上传/提示词/创建图片/发送按钮/稳定时长诊断；在任何发送点击发生前最多执行2次安全原地恢复，每次恢复后再观察60秒，仍失败才暂停。\n',1)

new_block=r'''  function sendReadySnapshot(expectedCount,prompt,since=0){
    const s=uploadState(),e=findPromptEditor(),pr=Boolean(e&&promptLightMatches(e,prompt)),cr=hasCreateChip(),bt=findSend(),en=Boolean(bt&&!bt.disabled&&bt.getAttribute('aria-disabled')!=='true');
    return{s,e,pr,cr,bt,en,stableMs:since?Math.max(0,Date.now()-since):0,expectedCount:Math.max(0,Number(expectedCount)||0)};
  }
  function sendReadyDiagnostic(x,expectedCount){
    const s=x?.s||{},expected=Math.max(0,Number(expectedCount)||0),count=Math.max(0,Number(s.count)||0),mark=v=>v?'✓':'✗',stable=(Math.max(0,Number(x?.stableMs)||0)/1000).toFixed(1);
    return`附件 ${count}/${expected}${mark(count>=expected)}｜上传完成${mark(!s.uploading)}｜提示词${mark(Boolean(x?.pr))}｜创建图片${mark(Boolean(x?.cr))}｜发送按钮${mark(Boolean(x?.bt))}｜可点击${mark(Boolean(x?.en))}｜稳定 ${stable}/5秒`;
  }
  async function waitReadyWindow(expectedCount,prompt,timeout){
    let since=0,last=null;
    const b=await waitUntil(()=>{
      const x=sendReadySnapshot(expectedCount,prompt,since);last=x;const s=x.s;
      if(s.failed){if(s.retryable)throw new UploadRetryableError('发送前检测到上传失败');throw new Error('发送前检测到不可重试上传失败')}
      if(!s.uploading&&s.count>=expectedCount&&x.pr&&x.cr&&x.en){if(!since)since=Date.now();x.stableMs=Date.now()-since;if(x.stableMs>=5000)return x.bt}else since=0;
      return null;
    },timeout,700);
    return{button:b,snapshot:last||sendReadySnapshot(expectedCount,prompt,since)};
  }
  async function recoverReadyToSend(expectedCount,prompt,attempt,snapshot){
    let x=snapshot||sendReadySnapshot(expectedCount,prompt,0),s=x.s;
    log(`发送前安全恢复 ${attempt}/2：${sendReadyDiagnostic(x,expectedCount)}`,'warn');
    if(s.failed){if(s.retryable)throw new UploadRetryableError('发送前恢复检测到上传失败');throw new Error('发送前恢复检测到不可重试上传失败')}
    if(s.uploading||s.count<expectedCount)throw new UploadRetryableError(`发送前恢复发现附件未就绪：${Math.max(0,Number(s.count)||0)}/${expectedCount}${s.uploading?'，仍在上传':''}`);
    let e=findPromptEditor();
    if(!promptLightMatches(e,prompt)){
      if(!promptMatches(e,prompt))throw new Error('发送前恢复发现提示词已变化或不完整；为避免错误发送已暂停，未自动重写');
      log('发送前恢复：轻量提示词守卫未命中，但严格全文校验确认提示词仍完整','warn');
    }
    if(!hasCreateChip()){
      log('发送前恢复：检测到“创建图片”模式缺失，尝试重新激活','warn');
      await activateCreate();
      e=findPromptEditor();
      if(!promptLightMatches(e,prompt)&&!promptMatches(e,prompt))throw new Error('重新激活“创建图片”后提示词已变化；为避免错误发送已暂停');
    }
    e=findPromptEditor();
    try{e?.focus?.({preventScroll:true})}catch(_){try{e?.focus?.()}catch(__){}}
    await sleep(1500);
    x=sendReadySnapshot(expectedCount,prompt,0);
    log(`发送前安全恢复 ${attempt}/2 已执行：${sendReadyDiagnostic(x,expectedCount)}；继续观察60秒`,'warn');
  }
  async function waitReadyToSend(expectedCount,prompt){
    const initialTimeout=Number(settings.uploadTimeout)||180000;
    for(let attempt=0;attempt<=2;attempt++){
      const windowMs=attempt===0?initialTimeout:60000;
      const r=await waitReadyWindow(expectedCount,prompt,windowMs);
      if(r.button){
        log(`发送前检查通过：附件上传完成、轻量提示词守卫正常、“创建图片”模式存在，并稳定5秒${attempt?`；安全恢复 ${attempt}/2 后恢复正常`:''}`,'success');
        return r.button;
      }
      const diag=sendReadyDiagnostic(r.snapshot,expectedCount);
      if(attempt>=2)throw new Error(`发送前检查连续未通过：初检 + 2次安全恢复均失败；${diag}`);
      log(`发送前检查超时：${diag}`,'warn');
      await recoverReadyToSend(expectedCount,prompt,attempt+1,r.snapshot);
    }
    throw new Error('发送前检查连续未通过');
  }
  function setBatchResumeContext'''

pattern=r"  async function waitReadyToSend\(expectedCount,prompt\)\{.*?\n  \}\n  function setBatchResumeContext"
s2,n=re.subn(pattern,new_block,s,count=1,flags=re.S)
assert n==1, f'waitReadyToSend replacement count={n}'
s=s2
USER.write_text(s,encoding='utf-8')

m=META.read_text(encoding='utf-8')
m=m.replace('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.6','// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.7',1)
m=m.replace('// @version      1.5.6','// @version      1.5.7',1)
m=re.sub(r'^// @description  .*$', '// @description  服装POD统一工作台：V1.5.7 新增发送前检查详细诊断与最多2次安全原地恢复；保留长提示词性能修复、后台断层保护与发送后at-most-once规则。', m, count=1, flags=re.M)
META.write_text(m,encoding='utf-8')

latest={
  'version':'1.5.7',
  'install_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
  'download_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
  'published_at':'2026-09-01',
  'changelog':[
    '发送前检查180秒初检超时后，不再立即停止：新增附件数量、上传状态、轻量提示词守卫、创建图片模式、发送按钮、可点击状态与稳定时长的详细诊断日志。',
    '在发送按钮尚未被点击的安全边界内，最多执行2次原地恢复；每次恢复后继续观察60秒，恢复成功后直接沿用当前批次发送，不重新上传、不新建重复批次。',
    '若创建图片模式临时丢失，仅重新激活该模式；若附件未就绪则转入既有上传可恢复流程；若提示词严格校验确认已损坏，则立即暂停，避免错误发送。',
    '初检 + 2次安全恢复仍失败才停止，并把最后一次诊断写入错误；发送按钮一旦点击后仍完全沿用既有at-most-once确认规则，不扩大重发范围。',
    '继续保留V1.5.5长提示词压平/轻量守卫与V1.5.6后台计时断层保护；不引入V1.6.x已撤回开发版逻辑。'
  ]
}
for p in (LATEST,LATEST2):
    p.write_text(json.dumps(latest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

h=json.loads(HISTORY.read_text(encoding='utf-8'))
for v in h.get('versions',[]):
    if v.get('status')=='current':
        v['status']='stable'
entry={
  'version':'1.5.7',
  'date':'2026-09-01',
  'status':'current',
  'notes':latest['changelog'],
  'archive_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/versions/POD_ChatGPT统一工作台_V1.5.7.txt'
}
h['versions']=[v for v in h.get('versions',[]) if v.get('version')!='1.5.7']
h['versions'].insert(0,entry)
HISTORY.write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

ARCHIVE.parent.mkdir(parents=True,exist_ok=True)
ARCHIVE.write_text(s,encoding='utf-8')
print('patched POD V1.5.7')
