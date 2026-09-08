from pathlib import Path
import json

ROOT=Path('.')
user=ROOT/'POD_ChatGPT.user.js'
meta=ROOT/'POD_ChatGPT.meta.js'
latest=ROOT/'POD_ChatGPT.latest.json'
latest2=ROOT/'POD_ChatGPT_latest.json'
history=ROOT/'POD_ChatGPT.history.json'
archive=ROOT/'versions/POD_ChatGPT统一工作台_V1.5.18.txt'

text=user.read_text(encoding='utf-8')
assert "const APP_VERSION = '1.5.17';" in text
assert 'async function ensureComposerEmptyBeforeBatch()' in text
assert 'await ensureComposerEmptyBeforeBatch();' in text
assert 'ensureComposerAttachmentsEmptyBeforeBatch' not in text

text=text.replace('// @name:zh-CN   Kagura POD智能创意中心 V1.5.17','// @name:zh-CN   Kagura POD智能创意中心 V1.5.18',1)
text=text.replace('// @version      1.5.17','// @version      1.5.18',1)
text=text.replace('// @description  AI驱动的POD商品视觉生产系统：V1.5.17 新增批次输入框清场守卫与生图进度停滞刷新恢复；不改动附件上传、创建图片和发送核心。','// @description  AI驱动的POD商品视觉生产系统：V1.5.18 修复拒绝/异常后残留附件导致已上传却被误判超时：新批次上传前同时清理残留提示词与附件；上传核心保持不变。',1)
text=text.replace(' * Kagura POD Studio V1.5.17',' * Kagura POD Studio V1.5.18',1)
text=text.replace("const APP_VERSION = '1.5.17';","const APP_VERSION = '1.5.18';",1)

needle="""    throw new Error(`下一批启动前输入框残留内容自动清空失败（仍识别 ${residual.length} 字）；为避免串批已停止`);\n  }\n"""
assert needle in text
insert=needle+"""
  function composerAttachmentRemoveButtons(){
    const c=findComposer();
    return [...c.querySelectorAll('button[aria-label*="移除"],button[aria-label*="删除"],button[aria-label*="Remove"],button[aria-label*="Delete"],button[data-testid*="remove-attachment"],button[data-testid*="attachment-remove"]')].filter(isVisible);
  }
  async function ensureComposerAttachmentsEmptyBeforeBatch(){
    let residual=countAttachments();
    if(!residual)return true;
    log(`下一批开始前检测到 ${residual} 个残留附件，先移除并复检，避免上一批附件影响本批上传计数`,'warn');
    for(let attempt=1;attempt<=3;attempt++){
      const buttons=composerAttachmentRemoveButtons();
      if(buttons.length){
        for(const b of buttons){
          try{b.click()}catch(_){try{smartClick(b)}catch(__){}}
          await sleep(250);
        }
      }
      await sleep(700);
      residual=countAttachments();
      if(!residual){
        log('下一批残留附件清场完成；确认为0后继续上传本批参考素材','success');
        return true;
      }
      log(`残留附件清理第 ${attempt}/3 次后仍检测到 ${residual} 个附件，继续清理`,'warn');
    }
    throw new Error(`下一批启动前残留附件自动清理失败（仍检测到 ${residual} 个）；为避免上传数量误判已停止`);
  }
"""
text=text.replace(needle,insert,1)
old="""          if(settings.newChatEachBatch)await goNewChat();\n          await ensureComposerEmptyBeforeBatch();\n          baseline=new Set(generatedImages().map(i=>i.key));state.phase='uploading_assets';saveState();\n"""
new="""          if(settings.newChatEachBatch)await goNewChat();\n          await ensureComposerEmptyBeforeBatch();\n          await ensureComposerAttachmentsEmptyBeforeBatch();\n          baseline=new Set(generatedImages().map(i=>i.key));state.phase='uploading_assets';saveState();\n"""
assert old in text
text=text.replace(old,new,1)
user.write_text(text,encoding='utf-8')

m=meta.read_text(encoding='utf-8')
m=m.replace('// @name:zh-CN   Kagura POD智能创意中心 V1.5.17','// @name:zh-CN   Kagura POD智能创意中心 V1.5.18',1)
m=m.replace('// @version      1.5.17','// @version      1.5.18',1)
m=m.replace('// @description  AI驱动的POD商品视觉生产系统：V1.5.17 新增批次输入框清场守卫与生图进度停滞刷新恢复；不改动附件上传、创建图片和发送核心。','// @description  AI驱动的POD商品视觉生产系统：V1.5.18 修复拒绝/异常后残留附件导致已上传却被误判超时：新批次上传前同时清理残留提示词与附件；上传核心保持不变。',1)
meta.write_text(m,encoding='utf-8')

changes=[
  '修复“页面已经显示参考素材，但脚本等待180秒后仍判上传未完成”的问题：根因是上一批拒绝/异常后Composer可能同时残留提示词和附件，旧逻辑只清理文字，uploadFiles会把残留附件计入before，从而错误等待多1个附件。',
  '新增批次残留附件清场守卫：每次真正准备新批次、上传参考素材之前，在清空残留提示词后继续检测并移除Composer中的旧附件，确认附件数为0后才允许上传本批参考素材。',
  '残留附件最多自动清理3次；仍无法清空则停止当前执行，避免“实际1张已上传、脚本却等待2张”的假超时。',
  '不修改V1.5.8稳定上传/创建图片/发送核心；保留V1.5.17输入框清场、生图停滞刷新，以及V1.5.16明确拒绝重试1次后跳过规则。'
]
obj={
  'version':'1.5.18',
  'install_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
  'download_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js',
  'published_at':'2026-09-08',
  'changelog':changes
}
latest.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
latest2.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')

h=json.loads(history.read_text(encoding='utf-8'))
for v in h.get('versions',[]):
    if v.get('status')=='current': v['status']='stable'
entry={
  'version':'1.5.18','date':'2026-09-08','status':'current','notes':changes,
  'archive_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/versions/POD_ChatGPT统一工作台_V1.5.18.txt',
  'install_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js'
}
h['versions']=[entry]+[v for v in h.get('versions',[]) if v.get('version')!='1.5.18']
history.write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
archive.write_text(text,encoding='utf-8')
print('POD V1.5.18 patch applied')
