from pathlib import Path
import json, re

ROOT = Path('.')
USER = ROOT / 'POD_ChatGPT.user.js'
META = ROOT / 'POD_ChatGPT.meta.js'
LATEST = ROOT / 'POD_ChatGPT.latest.json'
LATEST2 = ROOT / 'POD_ChatGPT_latest.json'
HISTORY = ROOT / 'POD_ChatGPT.history.json'
ARCHIVE = ROOT / 'versions' / 'POD_ChatGPT统一工作台_V1.5.8.txt'

NEW_DESC = '服装POD统一工作台：V1.5.8 修复创建图片已成功却被后续误判的问题；加入本批短期成功凭证、多重创建图片检测，并在真正连续3次激活失败且尚未发送时仅刷新1次后自动重试。'
NOTES = [
    '修复“创建图片模式已经添加成功，但下一阶段再次检测时瞬时假阴性，导致脚本重复点击 + 并最终误报失败”的问题。',
    '新增本批创建图片成功凭证：同一批次、同一页面在刚刚明确确认创建图片成功后，短时间内即使DOM标签瞬时未命中，也不会立刻重复激活；发送前检查同时使用严格标签、composer局部宽松证据和近期成功凭证。',
    '新增composer局部创建图片证据检测，只在当前输入区域内兼容“创建图片 + 描述文字”等新版结构，不增加document全页高频扫描。',
    '只有创建图片真正连续3次激活失败、且发送按钮从未点击时，才允许刷新页面1次并自动重新准备当前批次：重新上传模板/Logo、重新激活创建图片、重新写入提示词；刷新后再连续3次失败才暂停。',
    '创建图片刷新恢复使用独立create-refresh状态，不会误进入已发送批次的generation-refresh；发送按钮一旦点击后仍完全沿用既有at-most-once规则，绝不因本机制重新发送。',
    '继续保留V1.5.5长提示词压平、V1.5.6后台计时断层保护和V1.5.7发送前检查诊断/安全恢复；不引入V1.6.x已撤回开发版逻辑。'
]

def must_replace(text, old, new, label, count=1):
    found = text.count(old)
    if found < count:
        raise SystemExit(f'{label}: expected at least {count}, found {found}')
    return text.replace(old, new, count)

def sub1(text, pattern, repl, label, flags=re.S):
    out, n = re.subn(pattern, lambda m: repl, text, count=1, flags=flags)
    if n != 1:
        raise SystemExit(f'{label}: expected 1 match, found {n}')
    return out

text = USER.read_text(encoding='utf-8')
if "const APP_VERSION = '1.5.7';" not in text:
    raise SystemExit('Expected V1.5.7 baseline')

text = must_replace(text, '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.7', '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.8', 'name zh')
text = must_replace(text, '// @version      1.5.7', '// @version      1.5.8', 'version')
text = sub1(text, r'^// @description  .*$', f'// @description  {NEW_DESC}', 'description', flags=re.M)
text = must_replace(text, ' * ChatGPT服装POD统一工作台 V1.5.7', ' * ChatGPT服装POD统一工作台 V1.5.8', 'comment title')
text = must_replace(text, "  const APP_VERSION = '1.5.7';", "  const APP_VERSION = '1.5.8';", 'app version')
anchor = " * - V1.5.7 发送前检查增强：180秒初检超时后输出附件/上传/提示词/创建图片/发送按钮/稳定时长诊断；在任何发送点击发生前最多执行2次安全原地恢复，每次恢复后再观察60秒，仍失败才暂停。"
text = must_replace(text, anchor, anchor + "\n * - V1.5.8 创建图片状态增强：已成功激活后记录同批短期成功凭证并加入composer局部宽松证据检测，避免瞬时假阴性导致重复点+；真正连续3次激活失败且尚未发送时只刷新1次后自动重新准备本批，刷新后仍失败才暂停。", 'changelog anchor')

old_classes = "  class PausedError extends Error { constructor(){ super('任务已暂停'); this.name='PausedError'; } }\n  class UploadRetryableError extends Error { constructor(m){ super(m || '附件上传失败'); this.name='UploadRetryableError'; } }"
new_classes = """  class PausedError extends Error { constructor(){ super('任务已暂停'); this.name='PausedError'; } }
  class UploadRetryableError extends Error { constructor(m){ super(m || '附件上传失败'); this.name='UploadRetryableError'; } }
  class CreateModeRetryableError extends Error { constructor(m){ super(m || '创建图片模式激活失败'); this.name='CreateModeRetryableError'; } }

  let createModeProof={key:'',path:'',at:0};
  function createModeProofKey(){return `${Number(state.batchNo||0)}|${(state.currentBatchKeys||[]).join('|')}`;}
  function rememberCreateModeProof(){createModeProof={key:createModeProofKey(),path:location.pathname,at:Date.now()};}
  function forgetCreateModeProof(){createModeProof={key:'',path:'',at:0};}
  function recentCreateModeProof(maxAge=90000){return Boolean(createModeProof.at&&createModeProof.key===createModeProofKey()&&createModeProof.path===location.pathname&&Date.now()-createModeProof.at<=Math.max(5000,Number(maxAge)||90000));}"""
text = must_replace(text, old_classes, new_classes, 'classes/proof')

old_has = "  function hasCreateChip(){const c=findComposer(),ed=findPromptEditor(),er=ed?.getBoundingClientRect(),re=/^(创建图片|创作图片|生成图片|create\\s*image|generate\\s*image)$/i;for(const root of [c,document])for(const e of root.querySelectorAll('button,[role=\"button\"],div,span')){if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel'))continue;if(!re.test(plainText(e)))continue;const r=e.getBoundingClientRect();if((c instanceof Element&&c.contains(e))||(er&&r.bottom>=er.top-140&&r.top<=er.bottom+80))return true;}return false;}"
new_has = """  function hasCreateChip(){const c=findComposer(),ed=findPromptEditor(),er=ed?.getBoundingClientRect(),re=/^(创建图片|创作图片|生成图片|create\\s*image|generate\\s*image)$/i;for(const root of [c,document])for(const e of root.querySelectorAll('button,[role="button"],div,span')){if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel'))continue;if(!re.test(plainText(e)))continue;const r=e.getBoundingClientRect();if((c instanceof Element&&c.contains(e))||(er&&r.bottom>=er.top-140&&r.top<=er.bottom+80))return true;}return false;}
  function hasCreateChipLoose(){
    const c=findComposer();if(!(c instanceof Element))return false;
    const re=/^(创建图片|创作图片|生成图片|create\\s*image|generate\\s*image)(?:\\s|$)/i;
    const nodes=[...c.querySelectorAll('button,[role="button"],[data-testid*="tool"],[data-testid*="chip"],[aria-label],div,span')];
    for(const e of nodes){
      if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel'))continue;
      const tx=`${plainText(e)} ${e.getAttribute?.('aria-label')||''}`.replace(/\\s+/g,' ').trim();
      if(!tx||tx.length>180)continue;
      if(re.test(tx))return true;
    }
    return false;
  }
  function createModePresent(){return hasCreateChip()||hasCreateChipLoose();}"""
text = must_replace(text, old_has, new_has, 'create chip detection')

text = sub1(text, r"  async function activateCreate\(\)\{.*?\n\n  function setNativeValue", """  async function activateCreate(){
    state.phase='activating_create_image';saveState();
    if(createModePresent()){rememberCreateModeProof();log('已存在“创建图片”模式，无需重复添加','success');return true;}
    if(recentCreateModeProof()){log('本批刚刚已确认“创建图片”模式成功；当前DOM标签瞬时未命中，沿用已确认状态，不重复点击“+”','warn');return true;}
    let last;
    for(let a=1;a<=3;a++){
      try{
        const plus=await waitUntil(()=>findPlus(),7000,200);if(!plus)throw new Error('未找到输入框左侧“+”按钮');
        smartClick(plus);log(`已点击输入框左侧“+”按钮（${a}/3）`);await sleep(500);
        let item=await waitUntil(()=>findCreateItem()?.e,4500,150);
        if(!item){smartClick(findPlus()||plus);await sleep(450);item=await waitUntil(()=>findCreateItem()?.e,3500,150);}
        if(!item)throw new Error('加号菜单中未找到“创建图片”');
        const info=findCreateItem();log(`已定位“创建图片”菜单项：${info?.tx||'创建图片'}`);smartClick(item);
        if(!await waitUntil(()=>createModePresent(),5000,220))throw new Error('点击后未检测到“创建图片”标签');
        rememberCreateModeProof();log('创建图片模式添加成功','success');return true;
      }catch(e){last=e;log(`第 ${a} 次添加创建图片失败：${e.message}`,'warn');await sleep(700);}
    }
    throw new CreateModeRetryableError(`创建图片模式连续3次激活失败：${last?.message||last}`);
  }

  function setNativeValue""", 'activateCreate')

text = must_replace(text, "if(!hasCreateChip())await activateCreate();", "if(!createModePresent()){if(recentCreateModeProof())log('写入提示词前创建图片标签瞬时未命中，但本批已有近期成功凭证；不重复激活','warn');else await activateCreate();}", 'setPrompt precheck')
old_post = "if(!hasCreateChip()){log('提示词写入后“创建图片”标签消失，正在恢复','warn');await activateCreate();if(!promptMatches(findPromptEditor(),expected))throw new Error('恢复创建图片后提示词丢失');}"
new_post = "if(!createModePresent()){if(recentCreateModeProof()){log('提示词写入后创建图片标签瞬时未命中，但本批已有近期成功凭证；继续发送前校验','warn');}else{log('提示词写入后“创建图片”标签消失，正在恢复','warn');await activateCreate();if(!promptMatches(findPromptEditor(),expected))throw new Error('恢复创建图片后提示词丢失');}}"
text = must_replace(text, old_post, new_post, 'setPrompt postcheck')
text = must_replace(text, "cr=hasCreateChip(),bt=findSend()", "cr=(createModePresent()||recentCreateModeProof()),bt=findSend()", 'send ready create state')
old_recover = """    if(!hasCreateChip()){
      log('发送前恢复：检测到“创建图片”模式缺失，尝试重新激活','warn');
      await activateCreate();
      e=findPromptEditor();
      if(!promptLightMatches(e,prompt)&&!promptMatches(e,prompt))throw new Error('重新激活“创建图片”后提示词已变化；为避免错误发送已暂停');
    }
    e=findPromptEditor();"""
new_recover = """    if(!createModePresent()&&!recentCreateModeProof()){
      log('发送前恢复：多重检测均未发现“创建图片”模式，尝试重新激活','warn');
      await activateCreate();
      e=findPromptEditor();
      if(!promptLightMatches(e,prompt)&&!promptMatches(e,prompt))throw new Error('重新激活“创建图片”后提示词已变化；为避免错误发送已暂停');
    }else if(!createModePresent()&&recentCreateModeProof()){
      log('发送前恢复：DOM标签暂未命中，但同批近期成功凭证仍有效；不重复激活“创建图片”','warn');
    }
    e=findPromptEditor();"""
text = must_replace(text, old_recover, new_recover, 'send recovery create state')

text = must_replace(text, "async function goNewChat(){const d=", "async function goNewChat(){forgetCreateModeProof();const d=", 'new chat proof reset')
text = must_replace(text, "async function clearComposer(){const c=", "async function clearComposer(){forgetCreateModeProof();const c=", 'clear composer proof reset')

catch_anchor = """      }catch(e){
        if(e instanceof PausedError)throw e;
        if(e instanceof UploadRetryableError&&uploadRetries<2&&!sent&&!confirmOnly&&!['send-confirming','sent-waiting'].includes(state.resumeContext?.kind)){"""
catch_new = """      }catch(e){
        if(e instanceof PausedError)throw e;
        if(e instanceof CreateModeRetryableError&&!sent&&!confirmOnly&&!['send-confirming','sent-waiting','generation-refresh'].includes(state.resumeContext?.kind)){
          const used=Math.max(0,Number(state.resumeContext?.createRefreshCount)||0);
          if(used<1){
            forgetCreateModeProof();
            state.resumeContext={...(state.resumeContext&&typeof state.resumeContext==='object'?state.resumeContext:{}),kind:'create-refresh',batchKeys:[...state.currentBatchKeys],batchPaths:[...state.currentBatchPaths],prompt:String(prompt||''),createRefreshCount:used+1,refreshReason:String(e.message||e),updatedAt:new Date().toISOString()};
            state.phase='refreshing';saveState();
            log(`创建图片模式连续3次真实激活失败，当前批尚未发送；刷新页面后自动重新准备本批（刷新 1/1），不会重复发送：${e.message||e}`,'warn');
            setTimeout(()=>location.reload(),350);
            return await new Promise(()=>{});
          }
          log(`创建图片模式在刷新恢复后仍连续3次激活失败；已用完刷新 1/1，本批暂停：${e.message||e}`,'warn');
        }
        if(e instanceof UploadRetryableError&&uploadRetries<2&&!sent&&!confirmOnly&&!['send-confirming','sent-waiting'].includes(state.resumeContext?.kind)){"""
text = must_replace(text, catch_anchor, catch_new, 'process create refresh catch')

boot_old = "if(state.running&&state.resumeContext?.kind==='generation-refresh'){const rr=state.resumeContext?.refreshReason?`；原因：${state.resumeContext.refreshReason}`:'';log(`检测到刷新恢复：第${state.batchNo}批只恢复检测，不重新发送${rr}`,'warn');setTimeout(()=>worker(),1500);}else if(state.running){"
boot_new = "if(state.running&&state.resumeContext?.kind==='create-refresh'){const rr=state.resumeContext?.refreshReason?`；原因：${state.resumeContext.refreshReason}`:'';log(`检测到创建图片刷新恢复：第${state.batchNo}批尚未发送，自动重新准备当前批（刷新 ${Number(state.resumeContext?.createRefreshCount)||1}/1），会重新上传附件并重新激活创建图片，不会重复发送${rr}`,'warn');setTimeout(()=>worker(),1500);}else if(state.running&&state.resumeContext?.kind==='generation-refresh'){const rr=state.resumeContext?.refreshReason?`；原因：${state.resumeContext.refreshReason}`:'';log(`检测到刷新恢复：第${state.batchNo}批只恢复检测，不重新发送${rr}`,'warn');setTimeout(()=>worker(),1500);}else if(state.running){"
text = must_replace(text, boot_old, boot_new, 'boot create refresh')

USER.write_text(text, encoding='utf-8')

meta = META.read_text(encoding='utf-8')
meta = must_replace(meta, '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.7', '// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.8', 'meta name')
meta = must_replace(meta, '// @version      1.5.7', '// @version      1.5.8', 'meta version')
meta = sub1(meta, r'^// @description  .*$', f'// @description  {NEW_DESC}', 'meta description', flags=re.M)
META.write_text(meta, encoding='utf-8')

manifest = {
    'version': '1.5.8',
    'install_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
    'download_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
    'published_at': '2026-09-04',
    'changelog': NOTES,
}
for p in (LATEST, LATEST2):
    p.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

hist = json.loads(HISTORY.read_text(encoding='utf-8'))
versions = hist.get('versions') or []
for v in versions:
    if v.get('status') == 'current':
        v['status'] = 'stable'
versions = [v for v in versions if str(v.get('version')) != '1.5.8']
versions.insert(0, {
    'version': '1.5.8',
    'date': '2026-09-04',
    'status': 'current',
    'notes': NOTES,
    'archive_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/versions/POD_ChatGPT统一工作台_V1.5.8.txt',
    'commit': '__RELEASE_COMMIT__',
    'install_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/__RELEASE_COMMIT__/POD_ChatGPT.user.js',
})
hist['versions'] = versions
HISTORY.write_text(json.dumps(hist, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
ARCHIVE.write_text(text, encoding='utf-8')
print('V1.5.8 patch prepared successfully')
