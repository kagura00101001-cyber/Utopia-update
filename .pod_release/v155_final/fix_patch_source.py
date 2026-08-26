from pathlib import Path
p=Path('.pod_release/v155_final/patch_v155.py')
s=p.read_text(encoding='utf-8')
old='hist_funcs=fetch_anchor+"""'
new='hist_funcs=fetch_anchor+r"""'
if old not in s:
    raise SystemExit('hist_funcs triple-string marker missing')
s=s.replace(old,new,1)
p.write_text(s,encoding='utf-8')
print('patched history JS template to raw string')
