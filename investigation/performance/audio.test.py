import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import wave

class AudioEvidence(unittest.TestCase):
    def convert(self, rows, extra=()):
        local = Path(__file__).resolve().parent / 'local'
        local.mkdir(exist_ok=True)
        temp = tempfile.TemporaryDirectory(dir=local)
        assert Path(temp.name).resolve().is_relative_to(local.resolve())
        self.addCleanup(temp.cleanup)
        path = Path(temp.name) / 'tap.jsonl'
        path.write_text('\n'.join(json.dumps(r) for r in rows))
        result = subprocess.run([sys.executable, str(Path(__file__).with_name('audio.py')), str(path), *extra], capture_output=True)
        return result, path.with_suffix('.wav')

    def block(self, frame, context=None):
        result = dict(frame=frame, rate=48000, pcm=[0.1, 0.2])
        if context is not None:
            result['contextId'] = context
        return result

    def test_gaps_remain_explicit(self):
        result, path = self.convert([self.block(0), self.block(4)])
        self.assertEqual(result.returncode, 0)
        with wave.open(str(path)) as wav:
            self.assertEqual(wav.getnframes(), 6)
        self.assertEqual(json.loads(path.with_suffix('.gaps.json').read_text())['gaps'], [{'at': 2, 'samples': 2}])

    def test_overlap_does_not_create_partial_wav(self):
        result, path = self.convert([self.block(0), self.block(1)])
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(path.exists())

    def test_contexts_require_explicit_selection(self):
        rows = [self.block(0, 'a'), self.block(0, 'b')]
        result, path = self.convert(rows)
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(path.exists())
        result, path = self.convert(rows, ['--context-id=a'])
        self.assertEqual(result.returncode, 0)

if __name__ == '__main__':
    unittest.main()
