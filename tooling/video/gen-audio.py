"""Generate one MP3 per narration segment using edge-tts (Microsoft cloud, no API key).
Reads segments.json, writes audio/seg01.mp3 ... audio/segNN.mp3.
"""
import asyncio
import json
import os
import sys

import edge_tts

VOICE = "en-US-AriaNeural"  # natural English US neural voice
RATE = "-8%"  # slightly slower for clarity

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
SEGMENTS = os.path.join(HERE, "segments.json")
OUTDIR = os.path.join(HERE, "audio")


def clean(text: str) -> str:
    return text.replace("**", "").replace("`", "").strip()


async def main():
    with open(SEGMENTS, "r", encoding="utf-8") as f:
        segs = json.load(f)
    os.makedirs(OUTDIR, exist_ok=True)
    for i, s in enumerate(segs, 1):
        name = "seg%02d.mp3" % i
        path = os.path.join(OUTDIR, name)
        text = clean(s.get("spoken", ""))
        if not text:
            print("skip empty", name)
            continue
        comm = edge_tts.Communicate(text, VOICE, rate=RATE)
        await comm.save(path)
        print("wrote", name, "-", s.get("title", ""), "(%d chars)" % len(text))
    print("Done: %d segments." % len(segs))


if __name__ == "__main__":
    asyncio.run(main())
