# Reads a measure run by name: investigation/m9b/local/measures/<name>-<size>.jsonl, or the committed
# baseline investigation/m9b/baseline/<name>-<size>.jsonl.gz.
import gzip, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
SIZES = (96, 128, 256)


def rows(name, size):
    plain = os.path.join(HERE, 'local', 'measures', f'{name}-{size}.jsonl')
    packed = os.path.join(HERE, 'baseline', f'{name}-{size}.jsonl.gz')
    if os.path.exists(plain):
        with open(plain, encoding='utf-8') as f:
            return [json.loads(l) for l in f]
    with gzip.open(packed, 'rt', encoding='utf-8') as f:
        return [json.loads(l) for l in f]


def met(r):
    """The map passed every absolute and met all three outcomes."""
    return bool(r['ok'] and (r.get('outcomes') or {}).get('met'))
