"""Generate English definition (en field) audio using edge-tts."""
import asyncio, json, os, re, sys

BASE = os.path.dirname(os.path.abspath(__file__))
UK_DIR = os.path.join(BASE, 'audio', 'en', 'uk')
US_DIR = os.path.join(BASE, 'audio', 'en', 'us')
os.makedirs(UK_DIR, exist_ok=True)
os.makedirs(US_DIR, exist_ok=True)

VOICES = {'uk': 'en-GB-SoniaNeural', 'us': 'en-US-AriaNeural'}

def to_filename(word):
    return re.sub(r"['']", '', word.lower()).replace(' ', '-') + '.mp3'

def load_words():
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
    words = load_words()
    sem = asyncio.Semaphore(3)
    ok = fail = skip = 0

    for i, w in enumerate(words):
        word = w['w']
        en_text = w.get('en', '')
        if not en_text:
            skip += 1
            continue
        fname = to_filename(word)
        uk_path = os.path.join(UK_DIR, fname)
        us_path = os.path.join(US_DIR, fname)

        n = i + 1
        sys.stdout.write(f'\r[{n}/{len(words)}] {word}: {en_text[:50]}          ')

        tasks = []
        async def _dl(text, voice, path, _sem=sem):
            async with _sem:
                await gen_one(text, voice, path)

        try:
            tasks.append(_dl(en_text, VOICES['uk'], uk_path))
            tasks.append(_dl(en_text, VOICES['us'], us_path))
            await asyncio.gather(*tasks)
            ok += 1
        except Exception as e:
            fail += 1
            print(f'\n  FAIL: {word} — {e}')

        if n % 100 == 0:
            print(f'\n  ... {n}/{len(words)} done')
            await asyncio.sleep(1)

    print(f'\n\nDone. OK: {ok}  Fail: {fail}  Skip: {skip}  Total: {len(words)}')

if __name__ == '__main__':
    asyncio.run(main())
