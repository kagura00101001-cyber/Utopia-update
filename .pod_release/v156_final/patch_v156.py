from pathlib import Path
import json, re

USER=Path('POD_ChatGPT.user.js')
META=Path('POD_ChatGPT.meta.js')
HISTORY=Path('POD_ChatGPT.history.json')
LATESTS=[Path('POD_ChatGPT.latest.json'),Path('POD_ChatGPT_latest.json')]
ARCHIVE=Path('versions/POD_ChatGPT统一工作台_V1.5.6.txt')

s=USER.read_text(encoding='utf-8')
if "// @version      1.5.5" not in s or "const APP_VERSION = '1.5.5';" not in s:
    raise SystemExit('expected V1.5.5 baseline not found')

def rep(old,new,count=1):
    global s
    n=s.count(old)
    if n < count:
        raise SystemExit(f'anchor missing: {old[:80]!r} count={n}')
    s=s.replace(old,new,count)

rep('// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.5','// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.6')
rep('// @version      1.5.5','// @version      1.5.6')
rep('// @description  服装POD统一工作台：V1.5.5 长提示词性能修复：批量生图发送前自动压平换行、发送确认改用轻量提示词守卫；版本信息新增历史版本查看与手动切换。','// @description  服装POD统一工作台：V1.5.6 优化后台断层恢复：计时断层先恢复检测、不再45秒立即刷新；同时修复版本历史界面并标识已撤回开发版。')
rep('ChatGPT服装POD统一工作台 V1.5.5\n   * ================================================================','ChatGPT服装POD统一工作台 V1.5.6\n   * ================================================================')
rep("  const APP_VERSION = '1.5.5';","  const APP_VERSION = '1.5.6';")
comment_anchor=' * - V1.5.5 长提示词性能修复：批量生图真正写入 ChatGPT 前自动把多段提示词压平为空格；严格全文 DOM 校验只保留在写入完成/可能二次发送等安全边界，轮询阶段改为轻量提示词守卫。版本信息新增历史版本查看、更新说明与手动版本切换。'
rep(comment_anchor,comment_anchor+'\n * - V1.5.6 后台断层恢复改为“先检测、后刷新”：超过45秒只排除断层时间并恢复扫描；仅页面前台可见、恢复检测30秒后仍0图/无生成/无完成状态时才允许刷新一次。版本历史界面同步修复对比度与操作层级，V1.6.x统一标识为“已撤回开发版”。')

old_gap="""    const throttleGap=45000;
    const collected=new Map();
    let activeElapsed=0,lastTick=Date.now(),lastCount=-1,changedActive=0,lastLog=0,round=0,sawStop=false,completeSeenActive=-1,lastThrottleLog=0;
    while(activeElapsed<timeout){
      if(!state.running)throw new PausedError();
      const now=Date.now(),gap=Math.max(0,now-lastTick);lastTick=now;
      if(gap>throttleGap){
        const ctx=state.resumeContext&&typeof state.resumeContext==='object'?state.resumeContext:{};
        const count=Math.max(0,Number(ctx.sleepRefreshCount)||0);
        if(count<1){
          log(`检测到浏览器休眠/后台节流断层 ${Math.round(gap/1000)} 秒；该时段不计入生图超时，刷新同步当前已发送批次`,'warn');
          return requestGenerationRefresh(prompt,'检测到浏览器休眠/后台节流，刷新页面恢复当前已发送批次，不重新发送',{sleepRefreshCount:count+1});
        }
        if(now-lastThrottleLog>600000){
          log(`检测到持续后台节流（本次间隔 ${Math.round(gap/1000)} 秒）；休眠时间继续排除在生图超时之外`,'warn');
          lastThrottleLog=now;
        }
      }else activeElapsed+=gap;

      const stp=stopVisible();if(stp)sawStop=true;
"""
new_gap="""    const throttleGap=45000;
    const gapRecoveryNeed=30000;
    const collected=new Map();
    let activeElapsed=0,lastTick=Date.now(),lastCount=-1,changedActive=0,lastLog=0,round=0,sawStop=false,completeSeenActive=-1,gapRecoveryActive=-1,lastGapLog=0;
    while(activeElapsed<timeout){
      if(!state.running)throw new PausedError();
      const now=Date.now(),gap=Math.max(0,now-lastTick);lastTick=now;
      if(gap>throttleGap){
        const vis=document.visibilityState==='hidden'?'后台':'前台可见';
        if(now-lastGapLog>15000){
          log(`检测到运行计时断层 ${Math.round(gap/1000)} 秒（${vis}）；该时段不计入生图超时，先恢复当前批次检测，不立即刷新`,'warn');
          lastGapLog=now;
        }
        if(gapRecoveryActive<0)gapRecoveryActive=activeElapsed;
      }else activeElapsed+=gap;

      const stp=stopVisible();if(stp)sawStop=true;
"""
if old_gap not in s: raise SystemExit('waitGenerated gap block anchor missing')
s=s.replace(old_gap,new_gap,1)

ready_anchor="""      const ready=normalizeGallery([...collected.values()],expected),comp=completionState(prompt);
      if(ready.length!==lastCount){
"""
ready_new="""      const ready=normalizeGallery([...collected.values()],expected),comp=completionState(prompt);
      if(gapRecoveryActive>=0){
        const recovered=ready.length>0||stp||comp.complete;
        if(recovered){
          log(`计时断层后已恢复页面状态：${ready.length?`已发现 ${ready.length}/${expected} 张`:stp?'仍在生成':'页面已显示完成'}；继续原批次，不刷新`,'success');
          gapRecoveryActive=-1;
        }else{
          const recoveryActive=Math.max(0,activeElapsed-gapRecoveryActive);
          if(document.visibilityState!=='hidden'&&recoveryActive>=gapRecoveryNeed){
            const ctx=state.resumeContext&&typeof state.resumeContext==='object'?state.resumeContext:{};
            const count=Math.max(0,Number(ctx.sleepRefreshCount)||0);
            if(count<1){
              return requestGenerationRefresh(prompt,'运行计时断层后已恢复检测30秒，但页面仍0图、无生成状态且无完成状态；仅刷新一次同步当前已发送批次，不重新发送',{sleepRefreshCount:count+1});
            }
            log('计时断层后恢复检测仍未看到页面状态，但本批已经执行过一次断层刷新；继续等待，不重复刷新','warn');
            gapRecoveryActive=-1;
          }
        }
      }
      if(ready.length!==lastCount){
"""
if ready_anchor not in s: raise SystemExit('ready anchor missing')
s=s.replace(ready_anchor,ready_new,1)

old_tag="const tag=ver===APP_VERSION?'（当前）':v.status==='withdrawn'?'（已回退历史版）':'';"
new_tag="const withdrawnDev=/^1\\.6\\./.test(ver);const tag=ver===APP_VERSION?'（当前）':withdrawnDev?'（已撤回开发版）':v.status==='withdrawn'?'（已撤回版本）':'';"
rep(old_tag,new_tag)
old_relation="const item=versions[Number(sel.value)||0]||versions[0],ver=String(item?.version||''),notes=Array.isArray(item?.notes)?item.notes.map(String):[],url=historyInstallUrl(item);const relation=ver===APP_VERSION?'当前正在使用':item?.status==='withdrawn'?'历史版本（此前已从正式线回退）':'历史版本';"
new_relation="const item=versions[Number(sel.value)||0]||versions[0],ver=String(item?.version||''),notes=Array.isArray(item?.notes)?item.notes.map(String):[],url=historyInstallUrl(item),withdrawnDev=/^1\\.6\\./.test(ver);const relation=ver===APP_VERSION?'当前正在使用':withdrawnDev?'已撤回开发版本（功能未完成，存在已知缺陷，不建议生产使用）':item?.status==='withdrawn'?'已撤回历史版本':'历史版本';"
rep(old_relation,new_relation)
rep("go.disabled=!url||ver===APP_VERSION;go.textContent=ver===APP_VERSION?'当前版本':`切换到 V${ver}`;go.dataset.url=url||'';go.dataset.version=ver;","go.disabled=!url||ver===APP_VERSION;go.textContent=ver===APP_VERSION?'当前版本，无需切换':`切换到 V${ver}`;go.style.opacity=ver===APP_VERSION?'.58':'1';go.style.cursor=ver===APP_VERSION?'default':'pointer';go.dataset.url=url||'';go.dataset.version=ver;")
rep("<div class=\"kagura-pod-update-title\">${newer?'发现新版本':'手动检查更新'}</div>","<div class=\"kagura-pod-update-title\">${newer?'发现新版本':'版本信息'}</div>")
old_card='''      <div style="margin-top:12px;padding:10px;border:1px solid rgba(148,163,184,.28);border-radius:8px;background:rgba(15,23,42,.35)">
        <div style="font-weight:700;margin-bottom:7px">历史版本 / 手动切换</div>
        <div style="display:flex;gap:7px;align-items:center"><select data-role="history-select" style="flex:1;min-width:0;padding:7px;border-radius:6px"></select><button type="button" data-role="history-go">切换版本</button></div>
        <div data-role="history-detail" style="white-space:pre-wrap;margin-top:8px;max-height:180px;overflow:auto;font-size:12px;line-height:1.55;color:#cbd5e1">点击版本信息时加载历史记录。</div>
      </div>'''
new_card='''      <div style="margin-top:12px;padding:12px;border:1px solid #d7dee8;border-radius:10px;background:#f8fafc;color:#1f2937">
        <div style="font-weight:700;margin-bottom:8px;color:#111827">历史版本 / 手动切换</div>
        <select data-role="history-select" style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a"></select>
        <div data-role="history-detail" style="white-space:pre-wrap;margin-top:8px;max-height:155px;overflow:auto;padding:9px 10px;box-sizing:border-box;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#334155;font-size:12px;line-height:1.55">点击版本信息时加载历史记录。</div>
        <button type="button" data-role="history-go" style="width:100%;min-height:36px;margin-top:8px;border-radius:8px">切换到所选版本</button>
        <div style="margin-top:6px;color:#64748b;font-size:11px;line-height:1.45">版本切换只会打开 Tampermonkey 手动确认页，不会静默安装或自动覆盖。</div>
      </div>'''
if old_card not in s: raise SystemExit('history card html anchor missing')
s=s.replace(old_card,new_card,1)

# Safety guards: keep V1.5.5 performance work and do not reintroduce V1.6.x create scanners.
if 'function flattenPromptForComposer' not in s or 'function promptLightMatches' not in s:
    raise SystemExit('V1.5.5 performance helpers missing')
if 'findCreateNearPlusLocal' in s or 'findCreateNearPlusFallback' in s or 'function createWatcher(' in s:
    raise SystemExit('V1.6 create-menu code unexpectedly present')
if '浏览器休眠/后台节流断层' in s:
    raise SystemExit('old immediate-refresh wording still present')
if '运行计时断层' not in s or 'gapRecoveryNeed=30000' not in s:
    raise SystemExit('new gap recovery logic missing')
if '已撤回开发版' not in s:
    raise SystemExit('withdrawn development label missing')

USER.write_text(s,encoding='utf-8')
header_end=s.index('// ==/UserScript==')+len('// ==/UserScript==')
META.write_text(s[:header_end]+'\n',encoding='utf-8')
ARCHIVE.parent.mkdir(exist_ok=True)
ARCHIVE.write_text(s,encoding='utf-8')

hist=json.loads(HISTORY.read_text(encoding='utf-8'))
versions=[v for v in hist.get('versions',[]) if str(v.get('version'))!='1.5.6']
for v in versions:
    ver=str(v.get('version',''))
    if v.get('status')=='current': v['status']='stable'
    if ver.startswith('1.6.'):
        v['status']='withdrawn'
        notes=[str(x) for x in v.get('notes',[])]
        warning='【已撤回开发版】功能未完成，存在已知缺陷，不建议生产使用。'
        if not notes or notes[0]!=warning: notes=[warning]+[x for x in notes if x!=warning]
        v['notes']=notes
current={
  'version':'1.5.6','date':'2026-08-26','status':'current',
  'notes':[
    '后台/休眠保护改为“先恢复检测、后刷新”：检测循环超过45秒只记录运行计时断层并排除该时段，不再立即刷新页面。',
    '计时断层后先继续扫描当前已发送批次；只在页面前台可见、恢复检测30秒后仍0图、无生成状态、无完成状态时，才允许刷新一次同步，且绝不重新发送。',
    '日志不再把所有时间断层直接判定为浏览器休眠；会区分当前页面处于后台还是前台可见，方便继续定位主线程卡顿。',
    '修复版本信息界面低对比、按钮层级和布局问题；V1.6.x统一显示为“已撤回开发版”，并明确标注功能未完成、存在已知缺陷、不建议生产使用。',
    '继续保留V1.5.5长提示词自动压平与轻量提示词守卫，不带回V1.6.x创建图片扫描逻辑。'
  ],
  'archive_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/versions/POD_ChatGPT统一工作台_V1.5.6.txt'
}
hist['versions']=[current]+versions
HISTORY.write_text(json.dumps(hist,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

changelog=[
 '后台/休眠检测改为先恢复检测、后刷新：超过45秒的运行计时断层只排除超时计时，不再立即刷新。',
 '仅当前页面前台可见、断层后恢复检测30秒仍0图/无生成/无完成状态时才允许刷新一次；已发送批次继续遵守at-most-once，不重新发送。',
 '版本信息界面改为高对比浅色卡片、全宽版本选择和独立切换按钮，修复当前版本按钮与说明区显示问题。',
 'V1.6.x统一标记为“已撤回开发版”：功能未完成，存在已知缺陷，不建议生产使用。',
 '保留V1.5.5长提示词性能修复，不引入V1.6.x创建图片扫描逻辑。'
]
latest={
 'version':'1.5.6',
 'install_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
 'download_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
 'published_at':'2026-08-26','changelog':changelog
}
for p in LATESTS:
    p.write_text(json.dumps(latest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

print('patched POD V1.5.6')
