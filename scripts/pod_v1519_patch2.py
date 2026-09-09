from pathlib import Path

src = Path('scripts/pod_v1519_patch.py').read_text(encoding='utf-8')
line_before = "    'sendPrompt': grab(s, 'async function sendPrompt(', 'function currentBatchTasks('),\n"
line_after = "    'sendPrompt': grab(after, 'async function sendPrompt(', 'function currentBatchTasks('),\n"
if src.count(line_before) != 1 or src.count(line_after) != 1:
    raise SystemExit(f'Unexpected sendPrompt freeze lines: before={src.count(line_before)}, after={src.count(line_after)}')
src = src.replace(line_before, '', 1).replace(line_after, '', 1)
exec(compile(src, 'scripts/pod_v1519_patch.py', 'exec'))
