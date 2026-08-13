from pathlib import Path
import re, json

V='3.1.2'
p=Path('Ozon_ChatGPT.user.js')
s=p.read_text(encoding='utf-8')
if '// @version      3.1.1' not in s:
    raise SystemExit('Expected V3.1.1 baseline')

s=s.replace('// @version      3.1.1', f'// @version      {V}', 1)
s=s.replace('// @description  稳定性修正版：当前批次原图区间显示；增强“+→创建图片”菜单展开确认、快速重试与诊断日志。','// @description  刷新恢复增强版：主动定位当前批次回复、强制懒加载图库、减少0/3与1/3误判待确认。',1)
s=s.replace("const CURRENT_VERSION = '3.1.1';", f"const CURRENT_VERSION = '{V}';")
s=s.replace("const APP_VERSION = '3.1.1';", f"const APP_VERSION = '{V}';",1)
s=s.replace("const KAGURA_MANUAL_VERSION = '3.1.1';", f"const KAGURA_MANUAL_VERSION = '{V}';")
s=s.replace('手动更新检查 V3.1.1', f'手动更新检查 V{V}')

pat=re.compile(r"    const MODULE_CHANGELOG = \[.*?\n    \]\.join\('\\n'\);",re.S)
rep="""    const MODULE_CHANGELOG = [
      `V${APP_VERSION} 更新内容：`,
      '1. 刷新恢复不再只被动等待：等待页面稳定后会主动定位当前批次用户消息和对应 assistant 回复，并把回复区域滚入视口触发重新挂载。',
      '2. 增强 Chrome 懒加载图库扫描：即使缩略图库当前只挂载 0～1 张图片，也会识别可滚动容器并遍历顶部、中部、底部。',
      '3. 页面已显示生成完成但仅识别 0/3、1/3、2/3 时，会周期性执行当前回复强制扫描，优先把已存在但未挂载的图片加载出来。',
      '4. 刷新同步观察期结束前增加最终深度恢复扫描；只有主动定位、滚动和懒加载扫描仍失败后才进入待确认。',
      '5. 保留一次提交原则：刷新恢复与深度扫描都不会重新发送已经成功提交的生图任务。',
      '6. 保留 V3.1.1 的当前原图区间显示、创建图片菜单快速重试，以及 V3.1.0 的详细日志和计时功能。'
    ].join('\\n');"""
s,n=pat.subn(lambda m:rep,s,count=1)
if n!=1: raise SystemExit('changelog patch failed')

needle="    function cFindGeneratedGalleryScrollables(promptText = '') {\n"
helpers=r'''    function cFindCurrentAssistantReply(promptText = '') {
      const anchor = cFindLatestUserAnchor(promptText);
      if (!anchor) return null;
      const anchorRect = anchor.getBoundingClientRect?.();
      const anchorTop = anchorRect ? anchorRect.top + window.scrollY : -1;
      const candidates = [];
      const seen = new Set();
      const nodes = [...document.querySelectorAll('[data-message-author-role="assistant"]'), ...document.querySelectorAll('main article')];
      for (const node of nodes) {
        if (!(node instanceof Element) || seen.has(node)) continue;
        seen.add(node);
        if (node.closest('#kagura-gpt-panel, form[data-type="unified-composer"], [data-composer-surface="true"]')) continue;
        const role = node.getAttribute('data-message-author-role') || node.querySelector?.('[data-message-author-role]')?.getAttribute?.('data-message-author-role') || '';
        if (role && role !== 'assistant') continue;
        if (!cNodeIsAfterAnchor(node, anchor)) continue;
        const r = node.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        const top = r.top + window.scrollY;
        if (anchorTop >= 0 && top < anchorTop - 20) continue;
        candidates.push({ node, top });
      }
      candidates.sort((a, b) => a.top - b.top);
      return candidates[0]?.node || null;
    }

    function cScrollRecoveryNode(node, block = 'center') {
      if (!(node instanceof Element)) return false;
      try { node.scrollIntoView({ block, inline: 'nearest', behavior: 'instant' }); }
      catch (_) { try { node.scrollIntoView(); } catch (_) { return false; } }
      try { window.dispatchEvent(new Event('scroll')); } catch (_) {}
      return true;
    }

    async function cForceHydrateCurrentGeneratedReply(promptText = '', expectedCount = 0, pass = 0, quiet = false) {
      const anchor = cFindLatestUserAnchor(promptText);
      if (anchor) { cScrollRecoveryNode(anchor, 'center'); await cSleep(260); }
      let reply = cFindCurrentAssistantReply(promptText);
      if (!reply && anchor) {
        try { window.scrollBy({ top: 520, behavior: 'instant' }); } catch (_) { window.scrollBy(0, 520); }
        await cSleep(420);
        reply = cFindCurrentAssistantReply(promptText);
      }
      if (reply) {
        const blocks = ['start', 'center', 'end'];
        cScrollRecoveryNode(reply, blocks[pass % blocks.length]);
        await cSleep(300);
        const imgs = [...reply.querySelectorAll('img')].filter(img => img instanceof HTMLImageElement);
        if (imgs.length) {
          const pick = imgs[Math.min(imgs.length - 1, pass % Math.max(1, imgs.length))];
          try { pick.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); } catch (_) {}
          await cSleep(220);
        }
      }
      const galleryCount = cScrollGeneratedGallery(promptText, pass, true);
      await cSleep(420);
      const detected = cNormalizeGalleryImages(cGeneratedImages(promptText), expectedCount).length;
      if (!quiet) cLog(`主动恢复扫描：当前批次消息=${anchor ? '已定位' : '未定位'}，assistant回复=${reply ? '已定位' : '未定位'}，图库容器=${galleryCount}，当前检测 ${detected}/${expectedCount || '?'}`, detected >= expectedCount && expectedCount ? 'success' : 'info');
      return { anchor: Boolean(anchor), reply: Boolean(reply), galleryCount, detected };
    }

    async function cPrimeRefreshRecovery(promptText = '', expectedCount = 0) {
      cLog('刷新恢复：开始主动定位当前批次消息/回复并触发缩略图库懒加载，不重新发送任务', 'warn');
      for (let pass = 0; pass < 4; pass += 1) {
        if (!cState.running) throw new CPausedError();
        const result = await cForceHydrateCurrentGeneratedReply(promptText, expectedCount, pass, pass > 0);
        if (expectedCount > 0 && result.detected >= expectedCount) {
          cLog(`刷新恢复主动扫描已找到 ${result.detected}/${expectedCount} 张，转入正常完成检测`, 'success');
          return true;
        }
        await cSleep(850);
      }
      return false;
    }

    function cFindGeneratedGalleryScrollables(promptText = '') {
'''
if needle not in s: raise SystemExit('gallery function target missing')
s=s.replace(needle,helpers,1)

old="""        const imgs = [...node.querySelectorAll('img')].filter(img => {
          if (!(img instanceof HTMLImageElement)) return false;
          const r = img.getBoundingClientRect();
          const w = img.naturalWidth || r.width;
          const h = img.naturalHeight || r.height;
          return w >= 128 && h >= 128 && r.width >= 18 && r.height >= 18;
        });
        if (imgs.length < 2) continue;

        seen.add(node);
        let score = imgs.length * 100;
"""
new="""        const imgs = [...node.querySelectorAll('img')].filter(img => {
          if (!(img instanceof HTMLImageElement)) return false;
          const r = img.getBoundingClientRect();
          const w = img.naturalWidth || r.width;
          const h = img.naturalHeight || r.height;
          return w >= 128 && h >= 128 && r.width >= 18 && r.height >= 18;
        });
        const lazySlots = [...node.querySelectorAll('button,[role=\"button\"],[data-testid*=\"image\" i],[class*=\"thumb\" i],[class*=\"gallery\" i]')].filter(el => {
          if (!(el instanceof Element)) return false;
          const r = el.getBoundingClientRect();
          return r.width >= 24 && r.height >= 24 && r.width <= 260 && r.height <= 260;
        });
        if (imgs.length < 1 && lazySlots.length < 2) continue;

        seen.add(node);
        let score = imgs.length * 140 + Math.min(8, lazySlots.length) * 45;
"""
if old not in s: raise SystemExit('gallery candidate target missing')
s=s.replace(old,new,1)

old="""      let stopGoneSince = 0;
      const postCompleteSweepMs = 45000;
      const refreshFlags = (cState.resumeContext && cState.resumeContext.flags) ? cState.resumeContext.flags : {};
"""
new="""      let stopGoneSince = 0;
      const refreshFlags = (cState.resumeContext && cState.resumeContext.flags) ? cState.resumeContext.flags : {};
      const inRefreshRecovery = Boolean(cState.resumeContext?.kind === 'generation-refresh');
      const postCompleteSweepMs = inRefreshRecovery ? 120000 : 60000;
      let lastActiveRecoveryAt = 0;
      let activeRecoveryPass = 0;
      let finalDeepRecoveryDone = false;
      let finalDeepRecoveryAt = 0;
"""
if old not in s: raise SystemExit('wait vars target missing')
s=s.replace(old,new,1)

needle="        const composerIdle = !stopVisible && !cIsSendButtonBusy();\n"
insert="""        const needActiveRecovery = missingExpected && (completion.complete || inRefreshRecovery || ready.length > 0);
        if (needActiveRecovery && Date.now() - lastActiveRecoveryAt >= 12000) {
          lastActiveRecoveryAt = Date.now();
          await cForceHydrateCurrentGeneratedReply(promptText, expectedCount, activeRecoveryPass++, true);
        }

        const composerIdle = !stopVisible && !cIsSendButtonBusy();
"""
if needle not in s: raise SystemExit('active recovery insert target missing')
s=s.replace(needle,insert,1)

old="""        // 刷新同步后仍然 0 图时，给页面 3 分钟重新挂载；仍无结果则交给待确认，绝不自动重发。
        if (ready.length === 0 && composerIdle && alreadySyncedAfterZero && elapsed >= 180000 && countStableFor >= 60000) {
          cLog('刷新同步后仍未检测到生成图。为避免重复生成，本批不再自动发送，将以0图异常进入待确认。', 'warn');
          return ready;
        }
"""
new="""        if (ready.length === 0 && composerIdle && alreadySyncedAfterZero && elapsed >= 180000 && countStableFor >= 60000) {
          if (!finalDeepRecoveryDone) {
            finalDeepRecoveryDone = true;
            finalDeepRecoveryAt = Date.now();
            cLog('刷新同步观察期结束但仍为0图，开始最终深度恢复扫描：重新定位当前批次回复并完整遍历懒加载图库', 'warn');
            for (let pass = 0; pass < 6; pass += 1) {
              await cForceHydrateCurrentGeneratedReply(promptText, expectedCount, activeRecoveryPass++, pass > 0);
              await cSleep(800);
            }
            lastCountChangeAt = Date.now();
            continue;
          }
          if (Date.now() - finalDeepRecoveryAt >= 30000) {
            cLog('刷新同步 + 最终深度扫描后仍未检测到生成图。为避免重复生成，本批不再自动发送，将以0图异常进入待确认。', 'warn');
            return ready;
          }
        }
"""
if old not in s: raise SystemExit('zero recovery target missing')
s=s.replace(old,new,1)

old="""        if (missingExpected && completionFirstSeenAt
          && Date.now() - completionFirstSeenAt >= postCompleteSweepMs
          && stableFor >= 12000) {
          cLog(`完成后已额外遍历图库 ${Math.round(postCompleteSweepMs / 1000)} 秒，仍只识别 ${ready.length}/${expectedCount} 张。按异常批次保存现有结果并进入待确认。`, 'warn');
          return ready;
        }
"""
new="""        if (missingExpected && completionFirstSeenAt
          && Date.now() - completionFirstSeenAt >= postCompleteSweepMs
          && (ready.length === 0 || stableFor >= 12000)) {
          if (!finalDeepRecoveryDone) {
            finalDeepRecoveryDone = true;
            finalDeepRecoveryAt = Date.now();
            cLog(`完成后已主动遍历图库 ${Math.round(postCompleteSweepMs / 1000)} 秒，目前 ${ready.length}/${expectedCount}；进入最后一次深度扫描，避免把已生成但未挂载的图片误判为缺图。`, 'warn');
            for (let pass = 0; pass < 5; pass += 1) {
              await cForceHydrateCurrentGeneratedReply(promptText, expectedCount, activeRecoveryPass++, pass > 0);
              await cSleep(750);
            }
            lastCountChangeAt = Date.now();
            continue;
          }
          if (Date.now() - finalDeepRecoveryAt >= 20000) {
            cLog(`最终深度扫描后仍只识别 ${ready.length}/${expectedCount} 张。按异常批次保存现有结果并进入待确认。`, 'warn');
            return ready;
          }
        }
"""
if old not in s: raise SystemExit('shortage recovery target missing')
s=s.replace(old,new,1)

old="""            if (cState.resumeContext?.kind === 'generation-refresh') {
              cLog(`已按刷新恢复机制回到第 ${cState.batchNo} 批，等待 10 秒后继续检测当前对话中的生成结果`, 'warn');
              await cSleep(10000);
            } else {
"""
new="""            if (cState.resumeContext?.kind === 'generation-refresh') {
              cLog(`已按刷新恢复机制回到第 ${cState.batchNo} 批，等待 10 秒让对话主体稳定，随后主动定位当前批次回复并扫描图库`, 'warn');
              await cSleep(10000);
              await cPrimeRefreshRecovery(cSettings.prompt, batchPaths.length);
            } else {
"""
if old not in s: raise SystemExit('refresh wait target missing')
s=s.replace(old,new,1)

p.write_text(s,encoding='utf-8')
header=s.split('// ==/UserScript==',1)[0]+'// ==/UserScript==\n'
Path('Ozon_ChatGPT.meta.js').write_text(header,encoding='utf-8')
notes=[
 '刷新恢复改为主动定位当前批次用户消息和对应 assistant 回复，滚入视口触发长对话虚拟化重新挂载。',
 '增强 Chrome 懒加载图库扫描：图库当前只有0～1张真实图片时也会识别滚动容器并遍历占位缩略图。',
 '生成完成但只识别0/3、1/3、2/3时周期性执行当前回复强制扫描，减少已生成图片被误判缺失。',
 '进入待确认前增加最终深度恢复扫描和短暂观察期，只有主动定位与懒加载扫描仍失败才判异常。',
 '继续保持已提交任务一次提交原则，刷新恢复和深度扫描都不会重新发送提示词。'
]
Path('latest.json').write_text(json.dumps({'version':V,'install_url':'https://raw.githubusercontent.com/kagura00101001-cyber/Utopia-update/main/Ozon_ChatGPT.user.js','published_at':'2026-08-13','changelog':notes},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
hp=Path('history.json'); h=json.loads(hp.read_text(encoding='utf-8'))
vs=[x for x in h.setdefault('versions',[]) if str(x.get('version'))!=V]
vs.insert(0,{'version':V,'date':'2026-08-13','notes':notes}); h['versions']=vs
hp.write_text(json.dumps(h,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
vd=Path('versions'); vd.mkdir(exist_ok=True)
(vd/f'Ozon_ChatGPT批量生图下载器_V{V}.txt').write_text(s,encoding='utf-8')
print(f'Patched V{V}')
