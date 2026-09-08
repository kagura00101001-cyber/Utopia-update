from pathlib import Path
import json

USER=Path('POD_ChatGPT.user.js')
META=Path('POD_ChatGPT.meta.js')
HISTORY=Path('POD_ChatGPT.history.json')
VERSION='1.5.16'
DATE='2026-09-08'

user=USER.read_text(encoding='utf-8')
if "// @version      1.5.16" in user:
    raise SystemExit('V1.5.16 already applied')
assert "// @version      1.5.15" in user
assert "const APP_VERSION = '1.5.15';" in user

user=user.replace('// @name:zh-CN   Kagura POD智能创意中心 V1.5.15','// @name:zh-CN   Kagura POD智能创意中心 V1.5.16',1)
user=user.replace('// @version      1.5.15','// @version      1.5.16',1)
user=user.replace(
    '// @description  AI驱动的POD商品视觉生产系统：V1.5.15 修复参考素材队列升级后旧UI事件仍引用chooseTemplate导致的启动失败；完整保留V1.5.8稳定生图核心。',
    '// @description  AI驱动的POD商品视觉生产系统：V1.5.16 新增明确内容限制拒绝识别：当前批自动重试1次，第二次仍被拒绝则跳过当前批并继续；不改动上传/创建图片/发送核心。',1)
user=user.replace('Kagura POD Studio V1.5.15\n   * ================================================================','Kagura POD Studio V1.5.16\n   * ================================================================',1)
marker=' * - V1.5.15 启动兼容修复：旧模板/Logo隐藏控件在createPanel阶段仍会绑定chooseTemplate/chooseLogo/clearLogo，现增加仅委托到参考素材队列的兼容桥，避免ReferenceError；不改动V1.5.8生图核心。\n'
assert marker in user
user=user.replace(marker,marker+' * - V1.5.16 明确拒绝恢复：仅在已发送且0图时识别第三方内容相似性/版权/受保护内容等明确拒绝文本；当前批原提示词自动重试1次，第二次仍被拒绝则标记跳过并继续下一批。\n',1)
user=user.replace("const APP_VERSION = '1.5.15';","const APP_VERSION = '1.5.16';",1)

class_marker="  class CreateModeRetryableError extends Error { constructor(m){ super(m || '创建图片模式激活失败'); this.name='CreateModeRetryableError'; } }"
assert user.count(class_marker)==1
user=user.replace(class_marker,class_marker+"\n  class GenerationRefusalError extends Error { constructor(m){ super(m || 'ChatGPT明确拒绝生成'); this.name='GenerationRefusalError'; } }",1)

anchor_marker="  function afterAnchor(node,anchor){if(!anchor)return true;try{if(anchor.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)return true}catch(_){}return node.getBoundingClientRect().top+scrollY>anchor.getBoundingClientRect().bottom+scrollY-20;}"
assert user.count(anchor_marker)==1
refusal_fn=r'''
  function detectGenerationRefusal(prompt=''){
    const anchor=latestUserAnchor(prompt),node=latestAssistantAfter(anchor),raw=assistantMessageText(node),tx=String(raw||'').replace(/\s+/g,' ').trim();
    if(!tx)return{detected:false,message:''};
    const exact=/(?:生成的图片可能违反了|图片可能违反).{0,100}(?:第三方内容相似性|第三方.{0,30}相似|防护限制)/i.test(tx);
    const zh=/(?:非常抱歉|抱歉|无法|不能).{0,100}(?:生成|创建|图片).{0,180}(?:第三方|相似性|防护限制|版权|著作权|商标|受保护内容)/i.test(tx);
    const en=/(?:sorry|unable|cannot|can't).{0,120}(?:generate|create|image).{0,220}(?:third[- ]party|similarity|copyright|trademark|protected content|policy)/i.test(tx);
    return{detected:Boolean(exact||zh||en),message:tx.slice(0,420)};
  }'''
user=user.replace(anchor_marker,anchor_marker+refusal_fn,1)

ready_marker="      const ready=normalizeGallery([...collected.values()],expected),comp=completionState(prompt);"
assert user.count(ready_marker)==1
user=user.replace(ready_marker,ready_marker+"\n      if(ready.length===0&&!stp){const refusal=detectGenerationRefusal(prompt);if(refusal.detected){log(`检测到ChatGPT明确拒绝生成：${refusal.message}`,'warn');throw new GenerationRefusalError(refusal.message);}}",1)

catch_marker="      }catch(e){\n        if(e instanceof PausedError)throw e;"
assert user.count(catch_marker)==1
refusal_catch=r'''      }catch(e){
        if(e instanceof PausedError)throw e;
        if(e instanceof GenerationRefusalError){
          const used=Math.max(0,...tasks.map(t=>Number(t.refusalRetries)||0)),reason=String(e.message||'ChatGPT明确拒绝生成');
          if(used<1){
            for(const t of tasks){t.refusalRetries=1;t.attempts=Number(t.attempts||0)+1;t.error=`检测到明确内容限制拒绝，正在自动重试1次：${reason}`;t.updatedAt=new Date().toISOString();}
            state.resumeContext=null;state.generationStartedAt=0;state.detectedGeneratedCount=0;state.expectedGeneratedCount=tasks.length;state.generatedCountChangedAt=Date.now();state.phase='preparing';detectOnly=false;confirmOnly=false;forgetCreateModeProof();saveState();
            log(`第${state.batchNo}批检测到明确内容限制拒绝；按原提示词自动重试 1/1，不修改提示词：${reason}`,'warn');
            await clearComposer();await sleep(1200);continue;
          }
          for(const t of tasks){t.status='skipped';t.outputFiles=[];t.error=`明确内容限制拒绝：已自动重试1次仍被拒绝，已跳过当前批；${reason}`;t.updatedAt=new Date().toISOString();}
          finishBatchTimers();state.currentBatchKeys=[];state.currentBatchPaths=[];state.resumeContext=null;state.attachmentManifest=null;state.batchNo++;state.phase=pendingTasks().length?'ready':'done';saveState();
          log(`第${state.batchNo-1}批明确拒绝重试 1/1 后仍失败，已跳过当前批并继续下一批：${tasks.map(t=>t.id).join('、')}`,'warn');return true;
        }'''
user=user.replace(catch_marker,refusal_catch,1)

# Both reset entry points must also clear the refusal retry counter.
user=user.replace("for(const t of state.tasks){t.status='pending';t.outputFiles=[];t.error='';t.attempts=0;}stopRunClock();", "for(const t of state.tasks){t.status='pending';t.outputFiles=[];t.error='';t.attempts=0;t.refusalRetries=0;}stopRunClock();",1)
user=user.replace("for(const t of state.tasks){t.status='pending';t.outputFiles=[];t.error='';t.attempts=0;t.updatedAt=new Date().toISOString();}", "for(const t of state.tasks){t.status='pending';t.outputFiles=[];t.error='';t.attempts=0;t.refusalRetries=0;t.updatedAt=new Date().toISOString();}",1)

USER.write_text(user,encoding='utf-8')

meta=META.read_text(encoding='utf-8')
assert '// @version      1.5.15' in meta
meta=meta.replace('Kagura POD智能创意中心 V1.5.15','Kagura POD智能创意中心 V1.5.16',1)
meta=meta.replace('// @version      1.5.15','// @version      1.5.16',1)
meta=meta.replace(
    '// @description  AI驱动的POD商品视觉生产系统：V1.5.15 修复参考素材队列升级后旧UI事件仍引用chooseTemplate导致的启动失败；完整保留V1.5.8稳定生图核心。',
    '// @description  AI驱动的POD商品视觉生产系统：V1.5.16 新增明确内容限制拒绝识别：当前批自动重试1次，第二次仍被拒绝则跳过当前批并继续；不改动上传/创建图片/发送核心。',1)
META.write_text(meta,encoding='utf-8')

notes=[
  '新增“明确内容限制拒绝”识别：仅在当前批已发送、0张生成图且ChatGPT回复明确包含第三方内容相似性、防护限制、版权/商标/受保护内容等拒绝语义时触发。',
  '第一次明确拒绝时不改提示词，自动重新准备并发送当前批1次；拒绝重试次数随任务持久化，页面意外刷新后也不会无限重试。',
  '同一批第二次仍被明确拒绝时，整批任务标记为“已跳过”，记录拒绝原因并自动继续下一批，不再等待6～15分钟的0图超时。',
  '附件上传、创建图片、提示词写入、发送确认、下载、风格反推等既有模块不做功能改造；本版只增加发送后的明确拒绝分流。'
]
latest={
  'version':VERSION,
  'install_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
  'download_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
  'published_at':DATE,
  'changelog':notes,
}
for p in ('POD_ChatGPT.latest.json','POD_ChatGPT_latest.json'):
    Path(p).write_text(json.dumps(latest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

hist=json.loads(HISTORY.read_text(encoding='utf-8'))
versions=[v for v in hist.get('versions',[]) if str(v.get('version'))!=VERSION]
for v in versions:
    if str(v.get('version'))=='1.5.15' and v.get('status')=='current':
        v['status']='stable'
versions.insert(0,{
  'version':VERSION,'date':DATE,'status':'current','notes':notes,
  'archive_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/versions/POD_ChatGPT统一工作台_V1.5.16.txt',
  'install_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js'
})
hist['versions']=versions
HISTORY.write_text(json.dumps(hist,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
Path('versions/POD_ChatGPT统一工作台_V1.5.16.txt').write_text(user,encoding='utf-8')
print('POD V1.5.16 patch applied')
