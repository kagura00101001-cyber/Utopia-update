from pathlib import Path
import json, re, subprocess

VERSION = "1.5.10"
CORE_VERSION = "1.5.8"
CORE_COMMIT = "56194dc106d34a31f2734aa33d4b628f756837f5"

root = Path(".")

def replace_once(text, old, new, label):
    if old not in text:
        raise RuntimeError(f"缺少稳定核心标记：{label}")
    if text.count(old) != 1:
        raise RuntimeError(f"稳定核心标记数量异常：{label} count={text.count(old)}")
    return text.replace(old, new, 1)

source = subprocess.check_output(
    ["git", "show", f"{CORE_COMMIT}:POD_ChatGPT.user.js"],
    text=True,
    encoding="utf-8",
)
if len(source) < 150000:
    raise RuntimeError(f"V{CORE_VERSION} 稳定核心长度异常：{len(source)}")

source = replace_once(source,
    "// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.8",
    "// @name:zh-CN   ChatGPT服装POD统一工作台 V1.5.10",
    "中文脚本名")
source = replace_once(source,
    "// @version      1.5.8",
    "// @version      1.5.10",
    "@version")
source = replace_once(source,
    "// @description  服装POD统一工作台：V1.5.8 修复创建图片已成功却被后续误判的问题；加入本批短期成功凭证、多重创建图片检测，并在真正连续3次激活失败且尚未发送时仅刷新1次后自动重试。",
    "// @description  服装POD统一工作台：V1.5.10 适配 ChatGPT 创建图片后的 Composer 重载；创建图片与写提示词前等待当前输入区稳定，再继续同一批次，降低输入框短暂消失导致的误判。",
    "@description")
source = replace_once(source,
    "   * ChatGPT服装POD统一工作台 V1.5.8",
    "   * ChatGPT服装POD统一工作台 V1.5.10",
    "核心标题")
source = replace_once(source,
    " * - V1.5.8 创建图片状态增强：已成功激活后记录同批短期成功凭证并加入composer局部宽松证据检测，避免瞬时假阴性导致重复点+；真正连续3次激活失败且尚未发送时只刷新1次后自动重新准备本批，刷新后仍失败才暂停。",
    " * - V1.5.8 创建图片状态增强：已成功激活后记录同批短期成功凭证并加入composer局部宽松证据检测，避免瞬时假阴性导致重复点+；真正连续3次激活失败且尚未发送时只刷新1次后自动重新准备本批，刷新后仍失败才暂停。\n * - V1.5.10 Composer稳定适配：创建图片模式确认后等待当前Composer与提示词编辑器完成重载并连续稳定，再进入提示词写入；写入前再次校验当前有效输入区，避免ChatGPT原生模式切换时输入框短暂消失造成误判。\n * - V1.5.10 创建图片入口沿用V1.5.9事件驱动局部检测思路，仅在有限恢复窗口监听新增菜单DOM并低频兜底；不恢复V1.6.x撤回版的常驻全页高频扫描。",
    "V1.5.8更新记录")
source = replace_once(source,
    "const APP_VERSION = '1.5.8';",
    "const APP_VERSION = '1.5.10';",
    "APP_VERSION")

CREATE_BLOCK = r'''  function visibleMenuRoots(){
    const selector='[popover],[data-radix-popper-content-wrapper],[data-radix-menu-content],[data-headlessui-portal],[data-floating-ui-portal],[role="menu"],[role="dialog"],[role="listbox"]';
    return [...document.querySelectorAll(selector)].filter(e=>isVisible(e)&&!insideMessage(e)&&!e.closest('#kagura-pod-panel'));
  }
  const KAGURA_CREATE_POPUP_SELECTOR='[popover],[data-radix-popper-content-wrapper],[data-radix-menu-content],[data-headlessui-portal],[data-floating-ui-portal],[role="menu"],[role="dialog"],[role="listbox"]';
  const KAGURA_CREATE_ITEM_SELECTOR='button,[role="button"],[role="menuitem"],[role="option"],[data-radix-collection-item],[data-testid*="menu"],[data-testid*="tool"],[aria-label]';
  const KAGURA_CREATE_ITEM_RE=/^(创建图片|创作图片|生成图片|create\s*image|generate\s*image)(?:\s|$)/i;
  const KAGURA_CREATE_MODE_RE=/^(创建图片|创作图片|生成图片|图像生成|create\s*image|generate\s*image)(?:\s|$)/i;
  function kaguraCreateRoots(plus){
    const out=[];
    const add=e=>{if(e instanceof Element&&isVisible(e)&&!insideMessage(e)&&!e.closest('#kagura-pod-panel')&&!out.includes(e))out.push(e);};
    for(const attr of ['aria-controls','aria-owns']){
      for(const id of String(plus?.getAttribute?.(attr)||'').split(/\s+/).filter(Boolean))add(document.getElementById(id));
    }
    visibleMenuRoots().forEach(add);
    return out;
  }
  function kaguraScoreCreateItem(e,plus){
    if(!(e instanceof Element)||!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel'))return null;
    const tx=(plainText(e)+' '+(e.getAttribute?.('aria-label')||'')).replace(/\s+/g,' ').trim();
    if(!tx||tx.length>240||!KAGURA_CREATE_ITEM_RE.test(tx))return null;
    const r=e.getBoundingClientRect();
    if(r.width<45||r.height<18||r.height>190)return null;
    let score=1000;
    if(/^创建图片(?:\s|$)/.test(tx))score+=900;
    if(/可视化/.test(tx))score+=320;
    if(e.matches('button,[role="menuitem"],[role="option"],[role="button"]'))score+=420;
    if(e.closest('[role="menu"],[role="dialog"],[data-radix-popper-content-wrapper],[data-radix-menu-content]'))score+=520;
    if(plus instanceof Element){
      const p=plus.getBoundingClientRect();
      const dx=Math.abs((r.left+r.width/2)-(p.left+p.width/2));
      const dy=Math.abs((r.top+r.height/2)-(p.top+p.height/2));
      if(dx>800||dy>800)return null;
      score+=Math.max(0,520-Math.round((dx+dy)/2));
    }
    return {e,score,tx,r};
  }
  function kaguraBestCreateItem(nodes,plus){
    const items=[];
    for(const e of nodes){const hit=kaguraScoreCreateItem(e,plus);if(hit)items.push(hit);}
    items.sort((a,b)=>b.score-a.score);
    return items[0]||null;
  }
  function kaguraScanCreateRoot(root,plus){
    if(!(root instanceof Element))return null;
    const nodes=[];
    if(root.matches?.(KAGURA_CREATE_ITEM_SELECTOR))nodes.push(root);
    nodes.push(...root.querySelectorAll(KAGURA_CREATE_ITEM_SELECTOR));
    return kaguraBestCreateItem(nodes,plus);
  }
  function findCreateItem(plus=findPlus()){
    const hits=[];
    for(const root of kaguraCreateRoots(plus)){const hit=kaguraScanCreateRoot(root,plus);if(hit)hits.push(hit);}
    hits.sort((a,b)=>b.score-a.score);
    return hits[0]||null;
  }
  function kaguraFindCreateByPoint(plus){
    if(!(plus instanceof Element))return null;
    const p=plus.getBoundingClientRect(),nodes=new Set();
    const xs=[-210,-105,0,105,210].map(d=>p.left+p.width/2+d).filter(x=>x>2&&x<innerWidth-2);
    const ys=[55,105,165,235,315,405].map(d=>p.top-d).filter(y=>y>2&&y<innerHeight-2);
    for(const x of xs)for(const y of ys){
      const hit=document.elementFromPoint(x,y);
      const item=hit?.closest?.(KAGURA_CREATE_ITEM_SELECTOR);
      if(item)nodes.add(item);
    }
    return kaguraBestCreateItem([...nodes],plus);
  }
  function kaguraScanAddedForCreate(node,plus){
    if(!(node instanceof Element))return null;
    const direct=kaguraScoreCreateItem(node,plus);
    if(direct)return direct;
    if(node.matches?.(KAGURA_CREATE_POPUP_SELECTOR)){
      const inPopup=kaguraScanCreateRoot(node,plus);
      if(inPopup)return inPopup;
    }
    const popup=node.closest?.(KAGURA_CREATE_POPUP_SELECTOR);
    if(popup){const inParent=kaguraScanCreateRoot(popup,plus);if(inParent)return inParent;}
    for(const child of node.querySelectorAll?.(KAGURA_CREATE_POPUP_SELECTOR)||[]){
      const inChild=kaguraScanCreateRoot(child,plus);
      if(inChild)return inChild;
    }
    return null;
  }
  function kaguraWaitCreateItem(plus,timeout=6500){
    const immediate=findCreateItem(plus)||kaguraFindCreateByPoint(plus);
    if(immediate)return Promise.resolve(immediate);
    return new Promise(resolve=>{
      let done=false,observer=null,timer=null,fallback=null;
      const finish=value=>{if(done)return;done=true;try{observer?.disconnect()}catch(_){}clearTimeout(timer);clearInterval(fallback);resolve(value||null);};
      const root=document.body||document.documentElement;
      if(root){
        observer=new MutationObserver(records=>{
          for(const record of records){
            for(const node of record.addedNodes){
              const hit=kaguraScanAddedForCreate(node,plus);
              if(hit){finish(hit);return;}
            }
          }
        });
        observer.observe(root,{childList:true,subtree:true});
      }
      fallback=setInterval(()=>{
        const livePlus=findPlus()||plus;
        const hit=findCreateItem(livePlus)||kaguraFindCreateByPoint(livePlus);
        if(hit)finish(hit);
      },1000);
      timer=setTimeout(()=>finish(findCreateItem(findPlus()||plus)||kaguraFindCreateByPoint(findPlus()||plus)),Math.max(1200,Number(timeout)||6500));
    });
  }
  function kaguraWaitPlus(timeout=8000){
    const immediate=findPlus();
    if(immediate)return Promise.resolve(immediate);
    return new Promise(resolve=>{
      let done=false,observer=null,timer=null,fallback=null,queued=false;
      const finish=value=>{if(done)return;done=true;try{observer?.disconnect()}catch(_){}clearTimeout(timer);clearInterval(fallback);resolve(value||null);};
      const check=()=>{queued=false;const hit=findPlus();if(hit)finish(hit);};
      const queue=()=>{if(done||queued)return;queued=true;requestAnimationFrame(check);};
      const root=document.body||document.documentElement;
      if(root){observer=new MutationObserver(queue);observer.observe(root,{childList:true,subtree:true});}
      fallback=setInterval(check,1000);
      timer=setTimeout(()=>finish(findPlus()),Math.max(1200,Number(timeout)||8000));
      queue();
    });
  }
  function hasCreateChip(){
    const c=findComposer();
    if(!(c instanceof Element))return false;
    const nodes=[...c.querySelectorAll('button,[role="button"],[data-testid*="tool"],[data-testid*="chip"],[aria-label],div,span')];
    for(const e of nodes){
      if(!isVisible(e)||insideMessage(e)||e.closest('#kagura-pod-panel'))continue;
      const tx=(plainText(e)+' '+(e.getAttribute?.('aria-label')||'')).replace(/\s+/g,' ').trim();
      if(tx.length<=180&&KAGURA_CREATE_MODE_RE.test(tx))return true;
    }
    return false;
  }
  function hasCreateChipLoose(){return hasCreateChip();}
  function createModePresent(){return hasCreateChip();}
  function kaguraComposerSnapshot(){
    const composer=findComposer();
    if(!(composer instanceof Element)||!composer.isConnected||!isVisible(composer))return null;
    const editor=findPromptEditor();
    if(!(editor instanceof Element)||!editor.isConnected||!isVisible(editor)||!composer.contains(editor))return null;
    return {composer,editor,plus:findPlus()};
  }
  function kaguraWaitComposerStable(timeout=15000,stableMs=900){
    const started=Date.now();
    let lastComposer=null,lastEditor=null,stableSince=0;
    const immediate=kaguraComposerSnapshot();
    if(immediate){lastComposer=immediate.composer;lastEditor=immediate.editor;stableSince=Date.now();}
    return new Promise(resolve=>{
      let done=false,observer=null,timer=null,fallback=null,queued=false;
      const finish=value=>{if(done)return;done=true;try{observer?.disconnect()}catch(_){}clearTimeout(timer);clearInterval(fallback);resolve(value||null);};
      const check=()=>{
        queued=false;
        const snap=kaguraComposerSnapshot();
        if(!snap){lastComposer=null;lastEditor=null;stableSince=0;return;}
        if(snap.composer!==lastComposer||snap.editor!==lastEditor){lastComposer=snap.composer;lastEditor=snap.editor;stableSince=Date.now();return;}
        if(!stableSince)stableSince=Date.now();
        if(Date.now()-stableSince>=Math.max(500,Number(stableMs)||900))finish(snap);
      };
      const queue=()=>{if(done||queued)return;queued=true;requestAnimationFrame(check);};
      const root=document.body||document.documentElement;
      if(root){observer=new MutationObserver(queue);observer.observe(root,{childList:true,subtree:true});}
      fallback=setInterval(check,300);
      timer=setTimeout(()=>finish(null),Math.max(1500,Number(timeout)||15000));
      queue();
    });
  }
  function kaguraWaitCreateMode(timeout=6500){
    if(createModePresent())return Promise.resolve(true);
    return new Promise(resolve=>{
      let done=false,observer=null,timer=null,fallback=null,queued=false;
      const finish=value=>{if(done)return;done=true;try{observer?.disconnect()}catch(_){}clearTimeout(timer);clearInterval(fallback);resolve(Boolean(value));};
      const check=()=>{queued=false;if(createModePresent())finish(true);};
      const queue=()=>{if(done||queued)return;queued=true;requestAnimationFrame(check);};
      const root=document.body||document.documentElement;
      if(root){observer=new MutationObserver(queue);observer.observe(root,{childList:true,subtree:true});}
      fallback=setInterval(check,1000);
      timer=setTimeout(()=>finish(createModePresent()),Math.max(1200,Number(timeout)||6500));
      queue();
    });
  }
  async function activateCreate(){
    state.phase='activating_create_image';saveState();
    if(createModePresent()){
      const stable=await kaguraWaitComposerStable(15000,900);
      if(!stable)throw new CreateModeRetryableError('“创建图片”已存在，但Composer未稳定恢复');
      rememberCreateModeProof();log('已存在“创建图片”模式，Composer稳定后继续','success');return true;
    }
    if(recentCreateModeProof()){
      const stable=await kaguraWaitComposerStable(15000,900);
      if(!stable)throw new CreateModeRetryableError('本批已有创建图片成功凭证，但Composer未稳定恢复');
      log('本批刚刚已确认“创建图片”模式成功；等待Composer稳定后继续，不重复点击“+”','warn');return true;
    }
    let last;
    for(let a=1;a<=3;a++){
      try{
        const plus=await kaguraWaitPlus(8000);
        if(!plus)throw new Error('未找到当前输入框左侧“+”按钮');
        smartClick(plus);
        log('已点击当前Composer左侧“+”按钮（'+a+'/3），等待新菜单节点');
        let info=await kaguraWaitCreateItem(plus,6500);
        if(!info){
          const rebound=findPlus();
          if(rebound&&rebound!==plus){
            log('检测到Composer/“+”节点已重建，切换到当前有效节点继续本批','warn');
            smartClick(rebound);
            info=await kaguraWaitCreateItem(rebound,5000);
          }
        }
        if(!info)throw new Error('当前Composer菜单中未检测到“创建图片”');
        log('事件监听定位到“创建图片”菜单项：'+(info.tx||'创建图片'));
        smartClick(info.e);
        if(!await kaguraWaitCreateMode(6500))throw new Error('点击后当前Composer未检测到“创建图片”模式标签');
        log('创建图片模式已确认，等待ChatGPT Composer重载稳定');
        const stable=await kaguraWaitComposerStable(15000,900);
        if(!stable)throw new Error('创建图片模式切换后Composer未在15秒内稳定恢复');
        rememberCreateModeProof();
        log('创建图片模式添加成功，Composer已稳定','success');
        return true;
      }catch(e){
        last=e;
        log('第 '+a+' 次添加创建图片失败：'+e.message,'warn');
        await sleep(700);
      }
    }
    throw new CreateModeRetryableError('创建图片模式连续3次激活失败：'+(last?.message||last));
  }

  function setNativeValue'''

block_pattern = re.compile(r"  function visibleMenuRoots\(\)\{[\s\S]*?\n  function setNativeValue")
matches = block_pattern.findall(source)
if len(matches) != 1:
    raise RuntimeError(f"创建图片核心块匹配数量异常：{len(matches)}")
source = block_pattern.sub(lambda m: CREATE_BLOCK, source, count=1)

old_prompt_prefix = "  async function setPromptValue(v){const expected=flattenPromptForComposer(v);if(!expected)throw new Error('提示词为空');if(!createModePresent()){if(recentCreateModeProof())log('写入提示词前创建图片标签瞬时未命中，但本批已有近期成功凭证；不重复激活','warn');else await activateCreate();}let e=await waitUntil(()=>findPromptEditor(),30000,300);"
new_prompt_prefix = "  async function setPromptValue(v){const expected=flattenPromptForComposer(v);if(!expected)throw new Error('提示词为空');if(!createModePresent()){if(recentCreateModeProof())log('写入提示词前创建图片标签瞬时未命中，但本批已有近期成功凭证；不重复激活','warn');else await activateCreate();}const stableComposer=await kaguraWaitComposerStable(15000,900);if(!stableComposer)throw new Error('写入提示词前当前Composer未稳定恢复');let e=stableComposer.editor||await waitUntil(()=>findPromptEditor(),30000,300);"
source = replace_once(source, old_prompt_prefix, new_prompt_prefix, "setPromptValue稳定入口")

if "const APP_VERSION = '1.5.10';" not in source:
    raise RuntimeError("APP_VERSION未更新")
if "function kaguraWaitComposerStable" not in source:
    raise RuntimeError("Composer稳定等待未写入")
if "const stableComposer=await kaguraWaitComposerStable(15000,900)" not in source:
    raise RuntimeError("setPromptValue未接入稳定等待")
if "document.querySelectorAll('button,[role=\"button\"],[role=\"menuitem\"],[role=\"option\"],[data-radix-collection-item],div,span')" in source:
    raise RuntimeError("检测到撤回版全页创建图片div/span扫描")

(root / "POD_ChatGPT.user.js").write_text(source, encoding="utf-8")
header = source.split("// ==/UserScript==", 1)[0] + "// ==/UserScript==\n"
(root / "POD_ChatGPT.meta.js").write_text(header, encoding="utf-8")

changelog = [
    "适配ChatGPT原生“创建图片”模式切换时Composer会短暂卸载/重建：模式确认后等待当前Composer与提示词编辑器连续稳定约0.9秒，再继续同一批次。",
    "写入提示词前再次确认当前有效Composer，避免脚本绑定到刚刚被React替换的旧输入框节点。",
    "创建图片入口继续采用事件驱动新增菜单节点检测；局部elementFromPoint兜底由72个采样点压缩到30个，并把低频兜底调整为约1秒一次。",
    "保留V1.5.8同批创建图片成功凭证、真正连续3次失败后仅刷新1次、刷新后仍失败才暂停的规则。",
    "保留V1.5.5长提示词压平、V1.5.6后台计时断层保护、V1.5.7发送前诊断/安全恢复以及严格at-most-once发送规则。",
    "本版继续固定继承V1.5.8生产稳定核心，不引入V1.6.x已撤回开发版代码，不修改Ozon更新链。"
]
latest = {
    "version": VERSION,
    "install_url": "https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js",
    "download_url": "https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js",
    "published_at": "2026-09-07",
    "changelog": changelog,
}
latest_text = json.dumps(latest, ensure_ascii=False, indent=2) + "\n"
(root / "POD_ChatGPT.latest.json").write_text(latest_text, encoding="utf-8")
(root / "POD_ChatGPT_latest.json").write_text(latest_text, encoding="utf-8")

history_path = root / "POD_ChatGPT.history.json"
history = json.loads(history_path.read_text(encoding="utf-8"))
versions = history.setdefault("versions", [])
for item in versions:
    if item.get("status") == "current":
        item["status"] = "stable"
versions[:] = [v for v in versions if str(v.get("version")) != VERSION]
versions.insert(0, {
    "version": VERSION,
    "date": "2026-09-07",
    "status": "current",
    "notes": changelog,
    "archive_url": "https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/versions/POD_ChatGPT统一工作台_V1.5.10.txt",
    "install_url": "https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/POD_ChatGPT.user.js",
})
history_path.write_text(json.dumps(history, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

archive = root / "versions" / "POD_ChatGPT统一工作台_V1.5.10.txt"
archive.write_text(source, encoding="utf-8")

print("POD V1.5.10 patch complete")
