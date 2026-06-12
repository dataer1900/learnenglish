"""Generate audio for synonyms not in the 850 WORDS list."""
import asyncio, json, os, re, sys

BASE = os.path.dirname(os.path.abspath(__file__))
UK_DIR = os.path.join(BASE, 'audio', 'words', 'uk')
US_DIR = os.path.join(BASE, 'audio', 'words', 'us')
os.makedirs(UK_DIR, exist_ok=True)
os.makedirs(US_DIR, exist_ok=True)

VOICES = {'uk': 'en-GB-SoniaNeural', 'us': 'en-US-AriaNeural'}

def to_filename(word):
    return re.sub(r"['']", '', word.lower()).replace(' ', '-') + '.mp3'

def load_data():
    with open(os.path.join(BASE, 'data.js'), 'r', encoding='utf-8') as f:
        code = f.read()
    start = code.index('[')
    depth = 0
    for i in range(start, len(code)):
        if code[i] == '[': depth += 1
        elif code[i] == ']': depth -= 1
        if depth == 0:
            return json.loads(code[start:i+1])

async def gen_one(text, voice, out_path):
    import edge_tts
    comm = edge_tts.Communicate(text, voice)
    await comm.save(out_path)

async def main():
    words_data = load_data()
    word_set = set(w['w'].lower().strip() for w in words_data)

    # Collect all synonyms
    all_syns = set()
    for w in words_data:
        for s in (w.get('s') or []):
            all_syns.add(s.strip())

    # Filter: not in WORDS and no existing audio
    missing = []
    for syn in sorted(all_syns):
        key = syn.lower().strip()
        if key in word_set:
            continue
        fname = to_filename(syn)
        uk_path = os.path.join(UK_DIR, fname)
        if os.path.exists(uk_path) and os.path.getsize(uk_path) > 100:
            continue
        missing.append(syn)

    print(f'Total synonyms: {len(all_syns)}')
    print(f'Missing audio: {len(missing)}')
    print()

    sem = asyncio.Semaphore(3)
    ok = fail = 0

    for i, syn in enumerate(missing):
        fname = to_filename(syn)
        uk_path = os.path.join(UK_DIR, fname)
        us_path = os.path.join(US_DIR, fname)

        n = i + 1
        sys.stdout.write(f'\r[{n}/{len(missing)}] {syn}          ')

        async def _dl(text, voice, path, _sem=sem):
            async with _sem:
                await gen_one(text, voice, path)

        try:
            await asyncio.gather(
                _dl(syn, VOICES['uk'], uk_path),
                _dl(syn, VOICES['us'], us_path),
            )
            ok += 1
        except Exception as e:
            fail += 1
            print(f'\n  FAIL: {syn} — {e}')

        if n % 100 == 0:
            print(f'\n  ... {n}/{len(missing)} done')
            await asyncio.sleep(1)

    print(f'\n\nDone. OK: {ok}  Fail: {fail}  Total: {len(missing)}')

if __name__ == '__main__':
    asyncio.run(main())
