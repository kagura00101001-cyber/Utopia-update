from pathlib import Path
import json

ROOT = Path('.')
USER = ROOT / 'POD_ChatGPT.user.js'
META = ROOT / 'POD_ChatGPT.meta.js'
LATEST = ROOT / 'POD_ChatGPT.latest.json'
LATEST2 = ROOT / 'POD_ChatGPT_latest.json'
HISTORY = ROOT / 'POD_ChatGPT.history.json'
ARCHIVE = ROOT / 'versions' / 'POD_ChatGPT统一工作台_V1.5.17.txt'

user = USER.read_text(encoding='utf-8')
assert '// @version      1.5.16' in user
assert "const APP_VERSION = '1.5.16';" in user

# 1) Version metadata
user = user.replace('// @name:zh-CN   Kagura POD智能创意中心 V1.5.16', '// @name:zh-CN   Kagura POD智能创意中心 V1.5.17', 1)
user = user.replace('// @version      1.5.16', '// @version      1.5.17', 1)
old_desc = '// @description  AI驱动的POD商品视觉生产系统：V1.5.16 新增明确内容限制拒绝识别：当前批自动重试1次，第二次仍被拒绝则跳过当前批并继续；不改动上传/创建图片/发送核心。'
new_desc = '// @description  AI驱动的POD商品视觉生产系统：V1.5.17 新增批次输入框清场守卫与生图进度停滞刷新恢复；不改动附件上传、创建图片和发送核心。'
assert old_desc in user
user = user.replace(old_desc, new_desc, 1)
user = user.replace('Kagura POD Studio V1.5.16', 'Kagura POD Studio V1.5.17', 1)
user = user.replace("const APP_VERSION = '1.5.16';", "const APP_VERSION = '1.5.17';", 1)

# 2) Batch-entry composer guard. It only acts before uploading the next batch.
process_marker = '  async function processBatch(){\n'
assert user.count(process_marker) == 1
helper = r'''  function substantiveComposerText(){
    const e=findPromptEditor();
    return String(e?readEditor(e):'').replace(/[\u200B-\u200D\uFEFF]/g,'').trim();
  }
  async function ensureComposerEmptyBeforeBatch(){
    let residual=substantiveComposerText();
    if(!residual)return true;
    log(`下一批开始前检测到输入框残留 ${residual.length} 字，先清空并复检，避免串批`,'warn');
    for(let attempt=1;attempt<=3;attempt++){
      await clearComposer();
      await sleep(500);
      residual=substantiveComposerText();
      if(!residual){
        log('下一批输入框清场完成；确认为空后继续','success');
        return true;
      }
      log(`输入框残留清理第 ${attempt}/3 次后仍有 ${residual.length} 字，继续清理`,'warn');
    }
    throw new Error(`下一批启动前输入框残留内容自动清空失败（仍识别 ${residual.length} 字）；为避免串批已停止`);
  }

'''
user = user.replace(process_marker, helper + process_marker, 1)

entry_old = "          if(settings.newChatEachBatch)await goNewChat();\n          baseline=new Set(generatedImages().map(i=>i.key));state.phase='uploading_assets';saveState();"
entry_new = "          if(settings.newChatEachBatch)await goNewChat();\n          await ensureComposerEmptyBeforeBatch();\n          baseline=new Set(generatedImages().map(i=>i.key));state.phase='uploading_assets';saveState();"
assert user.count(entry_old) == 1
user = user.replace(entry_old, entry_new, 1)

# 3) Progress-stall watchdog. If 1..N images are already visible but count does not change for 4 minutes
# while ChatGPT still reports generation in progress, refresh once and resume detection only.
watch_anchor = "      if(ready.length===0&&!stp&&activeElapsed>360000&&!state.resumeContext?.refreshedOnce){\n        return requestGenerationRefresh(prompt,'已发送任务有效运行超过6分钟仍0图且页面空闲，刷新页面同步服务器结果，不重新发送',{refreshedOnce:true});\n      }"
assert user.count(watch_anchor) == 1
watch = r'''      if(ready.length>0&&stp&&stable>=240000&&!state.resumeContext?.progressStallRefreshed){
        return requestGenerationRefresh(prompt,`生图数量连续4分钟无变化：当前 ${ready.length}/${expected}，页面仍显示生成中；刷新页面同步当前已发送批次，不重新发送`,{progressStallRefreshed:true});
      }
'''
user = user.replace(watch_anchor, watch + watch_anchor, 1)

USER.write_text(user, encoding='utf-8')
ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
ARCHIVE.write_text(user, encoding='utf-8')

# Meta
meta = META.read_text(encoding='utf-8')
assert '// @version      1.5.16' in meta
meta = meta.replace('// @name:zh-CN   Kagura POD智能创意中心 V1.5.16', '// @name:zh-CN   Kagura POD智能创意中心 V1.5.17', 1)
meta = meta.replace('// @version      1.5.16', '// @version      1.5.17', 1)
meta = meta.replace(old_desc, new_desc, 1)
META.write_text(meta, encoding='utf-8')

notes = [
    '新增“下一批输入框清场守卫”：每次准备新批次、上传参考素材之前先读取Composer；若存在上一批残留提示词则自动清空并复检，确认空白后才允许继续。',
    '输入框残留最多自动清理3次；仍无法清空时立即停止当前执行，避免旧提示词与新批次串批或误判“提示词已存在”。',
    '新增“生图进度停滞刷新”：只要已发现1张或更多当前批图片，但图片数量连续4分钟无变化且页面仍显示生成中，就刷新页面一次并只恢复结果检测/下载，不重新上传、不重新发送。',
    '保留原有0图恢复、明确拒绝重试1次后跳过、at-most-once发送保护；附件上传、创建图片和发送核心保持不变。'
]
latest = {
    'version': '1.5.17',
    'install_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
    'download_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
    'published_at': '2026-09-08',
    'changelog': notes,
}
LATEST.write_text(json.dumps(latest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
LATEST2.write_text(json.dumps(latest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

hist = json.loads(HISTORY.read_text(encoding='utf-8'))
for v in hist.get('versions', []):
    if v.get('status') == 'current':
        v['status'] = 'stable'
entry = {
    'version': '1.5.17',
    'date': '2026-09-08',
    'status': 'current',
    'notes': notes,
    'archive_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/versions/POD_ChatGPT统一工作台_V1.5.17.txt',
    'install_url': 'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
}
hist['versions'] = [entry] + [v for v in hist.get('versions', []) if v.get('version') != '1.5.17']
HISTORY.write_text(json.dumps(hist, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

print('POD V1.5.17 patch applied')
