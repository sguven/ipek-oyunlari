#!/usr/bin/env python3
"""Record Turkish lines for a game with the same natural female voice as the other games.

Usage:
    pip install edge-tts          (ffmpeg must be installed too)
    python3 tools/ses-uret.py <game-folder> lines.txt     # one sentence per line
    python3 tools/ses-uret.py <game-folder> "Aferin İpek!" "Harika!"

Each sentence becomes <game>/audio/kadin/<sha1(text)[:12]>.mp3 and is added to
<game>/audio/manifest.json ({"voices": ["kadin"], "clips": {text: id}}).
Sentences that already have a clip are skipped. The games look a sentence up by its
exact text, so the text must match the string in index.html character for character.

Voice: Microsoft Edge neural voice tr-TR-EmelNeural (natural, accent-free Turkish).
A line can pick another voice and/or speed with a prefix, e.g.
"@tr-TR-AhmetNeural|Ben Yılmaz!" or "@-30%|ba" (slower, for letters and syllables);
the prefix is not part of the text. Audio is trimmed, loudness normalised to
-16 LUFS and saved as 24 kHz mono MP3, like the existing clips.
"""
import asyncio, hashlib, json, os, subprocess, sys, tempfile

VOICE = 'tr-TR-EmelNeural'


def clip_id(text):
    return hashlib.sha1(text.encode('utf-8')).hexdigest()[:12]


async def synth(text, voice, out_mp3, rate='+0%'):
    import edge_tts
    proxy = os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    with tempfile.TemporaryDirectory() as td:
        raw = os.path.join(td, 'raw.mp3')
        for attempt in range(4):
            try:
                await edge_tts.Communicate(text, voice, rate=rate, proxy=proxy).save(raw)
                if os.path.getsize(raw) > 0:
                    break
            except Exception as e:  # network hiccup: retry
                if attempt == 3:
                    raise
                await asyncio.sleep(2 * (attempt + 1))
        af = ('silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
              'silenceremove=start_periods=1:start_threshold=-50dB,areverse,'
              'adelay=40,apad=pad_dur=0.08,loudnorm=I=-16:TP=-1.5:LRA=11')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', raw,
                        '-af', af, '-ar', '24000', '-ac', '1', '-b:a', '64k', out_mp3], check=True)


async def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    game = sys.argv[1].rstrip('/')
    args = sys.argv[2:]
    if len(args) == 1 and os.path.isfile(args[0]):
        lines = [l.strip() for l in open(args[0], encoding='utf-8')]
    else:
        lines = args
    lines = [l for l in lines if l and not l.startswith('#')]
    audio = os.path.join(game, 'audio')
    os.makedirs(os.path.join(audio, 'kadin'), exist_ok=True)
    mpath = os.path.join(audio, 'manifest.json')
    man = {'voices': ['kadin'], 'clips': {}}
    if os.path.exists(mpath):
        man = json.load(open(mpath, encoding='utf-8'))
    made = 0
    for line in lines:
        voice, rate = VOICE, '+0%'
        if line.startswith('@') and '|' in line:
            opts, line = line[1:].split('|', 1)
            for o in opts.split(','):
                if o.endswith('%'):
                    rate = o if o[0] in '+-' else '+' + o
                elif o:
                    voice = o
        cid = clip_id(line)
        out = os.path.join(audio, 'kadin', cid + '.mp3')
        if man['clips'].get(line) == cid and os.path.exists(out):
            continue
        await synth(line, voice, out, rate)
        man['clips'][line] = cid
        made += 1
        print('  +', line)
    with open(mpath, 'w', encoding='utf-8') as f:
        json.dump(man, f, ensure_ascii=False, indent=1)
    print(f'{game}: {made} new clip(s), {len(man["clips"])} in total')


asyncio.run(main())
