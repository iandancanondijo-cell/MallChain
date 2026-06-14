#!/usr/bin/env python3
"""Safely convert bech32 HRPs in genesis.json to use `mall` prefix.

Usage: python fix_genesis_hrp.py /path/to/genesis.json

This script scans all string values in the JSON file, attempts to decode bech32
strings, and if the HRP starts with `mp` or `marketplace` it will re-encode the
address replacing that leading segment with `mall` (preserving suffixes like
`valoper` or other postfixes).

Backups: the original file is copied to genesis.json.bak before modification.
"""
import sys
import json
import copy
from pathlib import Path

# Minimal bech32 implementation (BIP-173)
CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'
CHARSET_MAP = {c:i for i,c in enumerate(CHARSET)}

def bech32_polymod(values):
    GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
    chk = 1
    for v in values:
        b = (chk >> 25)
        chk = ((chk & 0x1ffffff) << 5) ^ v
        for i in range(5):
            if ((b >> i) & 1):
                chk ^= GEN[i]
    return chk

def hrp_expand(hrp):
    return [ord(x) >> 5 for x in hrp] + [0] + [ord(x) & 31 for x in hrp]

def bech32_verify_checksum(hrp, data):
    return bech32_polymod(hrp_expand(hrp) + data) == 1

def bech32_decode(bech):
    if any(ord(x) < 33 or ord(x) > 126 for x in bech):
        return (None, None)
    bech = bech.lower()
    pos = bech.rfind('1')
    if pos < 1 or pos + 7 > len(bech):
        return (None, None)
    hrp = bech[:pos]
    data = []
    for c in bech[pos+1:]:
        if c not in CHARSET_MAP:
            return (None, None)
        data.append(CHARSET_MAP[c])
    if not bech32_verify_checksum(hrp, data):
        return (None, None)
    return (hrp, data[:-6])

def bech32_create_checksum(hrp, data):
    values = hrp_expand(hrp) + data
    polymod = bech32_polymod(values + [0,0,0,0,0,0]) ^ 1
    return [(polymod >> 5 * (5 - i)) & 31 for i in range(6)]

def bech32_encode(hrp, data):
    combined = data + bech32_create_checksum(hrp, data)
    return hrp + '1' + ''.join([CHARSET[d] for d in combined])

def convert_hrp(hrp):
    # map leading mp -> mall, marketplace -> mall, preserve suffixes
    if hrp.startswith('mp'):
        return 'mall' + hrp[2:]
    if hrp.startswith('marketplace'):
        return 'mall' + hrp[len('marketplace'):]
    return None

def walk_and_fix(obj, changed):
    if isinstance(obj, dict):
        for k,v in obj.items():
            obj[k] = walk_and_fix(v, changed)
        return obj
    if isinstance(obj, list):
        return [walk_and_fix(v, changed) for v in obj]
    if isinstance(obj, str):
        hrp, data = bech32_decode(obj)
        if hrp and data is not None:
            new_hrp = convert_hrp(hrp)
            if new_hrp:
                try:
                    new_addr = bech32_encode(new_hrp, data)
                    changed.append((obj, new_addr))
                    return new_addr
                except Exception:
                    return obj
        return obj
    return obj

def main():
    if len(sys.argv) < 2:
        print('Usage: fix_genesis_hrp.py /path/to/genesis.json')
        sys.exit(1)
    path = Path(sys.argv[1])
    if not path.exists():
        print('File not found:', path)
        sys.exit(1)
    data = json.loads(path.read_text())
    backup = path.with_suffix(path.suffix + '.bak')
    path.rename(backup)
    changed = []
    newdata = walk_and_fix(data, changed)
    path.write_text(json.dumps(newdata, indent=2))
    print(f'Wrote {path}; made {len(changed)} replacements. Backup: {backup}')
    for old,new in changed[:20]:
        print(old, '=>', new)

if __name__ == '__main__':
    main()
