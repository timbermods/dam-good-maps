"""Convert the capture-only mono output tap to WAV; retain frame gaps instead of hiding them."""
import argparse
import json
import struct
import wave
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('input', type=Path)
parser.add_argument('--output', type=Path)
args = parser.parse_args()
blocks = [json.loads(line) for line in args.input.read_text().splitlines() if line.strip()]
if not blocks:
    raise SystemExit('No PCM recorded: audio oracle unavailable')
rate = blocks[0]['rate']
cursor = blocks[0]['frame']
path = args.output or args.input.with_suffix('.wav')
gaps = []
with wave.open(str(path), 'wb') as output:
    output.setparams((1, 2, rate, 0, 'NONE', 'not compressed'))
    for b in blocks:
        if b['rate'] != rate:
            raise ValueError('Sample rate changed; split the contexts rather than resampling evidence')
        gap = b['frame'] - cursor
        if gap < 0:
            raise ValueError('Overlapping audio contexts/frames; review separately')
        if gap:
            gaps.append({'at': cursor, 'samples': gap})
            output.writeframes(b'\x00\x00' * gap)
        samples = [max(-32768, min(32767, round(x * 32767))) for x in b['pcm']]
        output.writeframes(struct.pack('<' + 'h' * len(samples), *samples))
        cursor = b['frame'] + len(samples)
path.with_suffix('.gaps.json').write_text(json.dumps({'rate': rate, 'gaps': gaps}, indent=2))
print(path, 'capture gaps:', len(gaps), '(a gap is evidence, not automatically a product dropout)')
