import { describe, expect, test } from 'vitest';
import { MAX_WASM_BYTES, formatBytes, inspectWasm } from './wasmInspect';

/** Unsigned LEB128, the encoding every length in a wasm binary uses. */
function leb(n: number): number[] {
  const out: number[] = [];
  let v = n;
  do {
    let b = v & 0x7f;
    v >>>= 7;
    if (v !== 0) b |= 0x80;
    out.push(b);
  } while (v !== 0);
  return out;
}

const str = (s: string): number[] => [...leb(s.length), ...Array.from(new TextEncoder().encode(s))];
const section = (id: number, body: number[]): number[] => [id, ...leb(body.length), ...body];
const HEADER = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];

interface ModuleSpec {
  exports?: Array<[string, number, number]>;
  importModule?: string;
  memoryPages?: number;
  start?: boolean;
  version?: number;
  omit?: number[];
  extra?: number[];
}

/**
 * Builds a real, structurally valid module: one imported env function, six
 * defined functions, linear memory, and the exports x/wasm looks for. The code
 * bodies are `end` only, which is enough for the section walk this tests.
 */
function module(spec: ModuleSpec = {}): Uint8Array {
  const omit = new Set(spec.omit ?? []);
  const names = spec.exports ?? [
    ['memory', 2, 0],
    ['allocate', 0, 1], ['deallocate', 0, 2], ['interface_version_8', 0, 3],
    ['instantiate', 0, 4], ['execute', 0, 5], ['query', 0, 6],
  ];
  const defined = names.filter(([, kind]) => kind === 0).length;
  const parts: number[] = [...HEADER.slice(0, 4), spec.version ?? 1, 0, 0, 0];

  if (!omit.has(1)) parts.push(...section(1, [1, 0x60, 0, 0]));
  if (!omit.has(2)) {
    parts.push(...section(2, [1, ...str(spec.importModule ?? 'env'), ...str('db_read'), 0, 0]));
  }
  if (!omit.has(3)) parts.push(...section(3, [...leb(defined), ...Array.from({ length: defined }, () => 0)]));
  if (!omit.has(5)) parts.push(...section(5, [1, 0, ...leb(spec.memoryPages ?? 17)]));
  if (!omit.has(7)) {
    const body = [...leb(names.length)];
    for (const [name, kind, index] of names) body.push(...str(name), kind, ...leb(index));
    parts.push(...section(7, body));
  }
  // Section 8 sits between export (7) and element/code (9/10) in the real ordering.
  if (spec.start) parts.push(...section(8, [0]));
  if (!omit.has(10)) {
    const body = [...leb(defined)];
    for (let i = 0; i < defined; i++) body.push(2, 0, 0x0b);
    parts.push(...section(10, body));
  }
  if (spec.extra) parts.push(...spec.extra);
  return new Uint8Array(parts);
}

const file = (bytes: Uint8Array, name = 'contract.wasm') => new File([bytes], name, { type: 'application/wasm' });
const errors = (issues: Array<{ level: string; text: string }>) => issues.filter((i) => i.level === 'error').map((i) => i.text);
const warns = (issues: Array<{ level: string; text: string }>) => issues.filter((i) => i.level === 'warn').map((i) => i.text);

describe('a real CosmWasm module', () => {
  test('is accepted, and every section, import and export is reported from the bytes', async () => {
    const bytes = module();
    const r = await inspectWasm(file(bytes));

    expect(r.ok).toBe(true);
    expect(errors(r.issues)).toEqual([]);
    expect(r.fileName).toBe('contract.wasm');
    expect(r.bytes).toBe(bytes.length);
    expect(r.version).toBe(1);
    expect(r.sections.map((s) => s.id)).toEqual([1, 2, 3, 5, 7, 10]);
    expect(r.sections.map((s) => s.name)).toEqual(['type', 'import', 'function', 'memory', 'export', 'code']);
    expect(r.importModules).toEqual(['env']);
    expect(r.functionCount).toBe(6);
    expect(r.memoryPages).toBe(17);
    expect(r.exports.find((e) => e.name === 'memory')).toEqual({ name: 'memory', kind: 'memory', index: 0 });
    expect(r.exports.find((e) => e.name === 'instantiate')).toEqual({ name: 'instantiate', kind: 'function', index: 4 });
    expect(r.issues.some((i) => i.level === 'info' && i.text.includes('instantiate, execute, query'))).toBe(true);
    expect(r.data).toEqual(bytes);
  });

  test('is hashed when WebCrypto is available, and says so when it is not', async () => {
    const r = await inspectWasm(file(module()));
    if (globalThis.crypto?.subtle) {
      expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
      const again = await inspectWasm(file(module()));
      expect(again.sha256).toBe(r.sha256);
      const changed = await inspectWasm(file(module({ memoryPages: 18 })));
      expect(changed.sha256).not.toBe(r.sha256);
    } else {
      expect(r.sha256).toBeNull();
    }
  });
});

describe('files that are not a module', () => {
  test('an empty file is refused', async () => {
    const r = await inspectWasm(file(new Uint8Array(0)));
    expect(r.ok).toBe(false);
    expect(errors(r.issues)[0]).toContain('empty');
  });

  test('a few bytes cannot be a module', async () => {
    const r = await inspectWasm(file(new Uint8Array([0, 97, 115])));
    expect(r.ok).toBe(false);
    expect(errors(r.issues)[0]).toContain('8-byte header');
  });

  test('uploaded Rust source is told to compile first', async () => {
    const source = new TextEncoder().encode('use cosmwasm_std::{entry_point, Response};\n');
    const r = await inspectWasm(file(source, 'lib.rs'));
    expect(r.ok).toBe(false);
    expect(errors(r.issues)[0]).toContain('text, not bytecode');
    expect(errors(r.issues)[0]).toContain('cargo wasm');
  });

  test('binary junk reports the missing magic', async () => {
    const r = await inspectWasm(file(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 1, 2])));
    expect(r.ok).toBe(false);
    expect(errors(r.issues)[0]).toContain('magic bytes');
  });

  test('a future wasm version is refused rather than half-read', async () => {
    const r = await inspectWasm(file(module({ version: 2 })));
    expect(r.ok).toBe(false);
    expect(r.version).toBe(2);
    expect(errors(r.issues)[0]).toContain('version 2 is not supported');
    expect(r.sections).toEqual([]);
  });

  test('a file over the chain limit is refused before any parsing', async () => {
    const r = await inspectWasm(file(new Uint8Array(MAX_WASM_BYTES + 1)));
    expect(r.ok).toBe(false);
    expect(errors(r.issues)[0]).toContain("8 MiB contract limit");
    expect(r.sections).toEqual([]);
  });
});

describe('structural damage', () => {
  test('a truncated download is reported, not thrown', async () => {
    const bytes = module();
    const r = await inspectWasm(file(bytes.subarray(0, bytes.length - 4)));
    expect(r.ok).toBe(false);
    expect(errors(r.issues).join(' ')).toContain('structurally broken');
  });

  test('a section claiming more bytes than exist is reported', async () => {
    const bytes = new Uint8Array([...HEADER, 1, 0x7f, 0x7f, 0x7f, 0x7f, 0x0f]);
    const r = await inspectWasm(file(bytes));
    expect(r.ok).toBe(false);
    expect(errors(r.issues).join(' ')).toMatch(/malformed|more bytes than/);
  });

  test('out-of-order sections are rejected', async () => {
    const bytes = new Uint8Array([...HEADER, ...section(7, [0]), ...section(3, [0])]);
    const r = await inspectWasm(file(bytes));
    expect(r.ok).toBe(false);
    expect(errors(r.issues).join(' ')).toContain('out of order');
  });

  test('repeating custom sections are legal', async () => {
    const bytes = module({ extra: [...section(0, str('producers')), ...section(0, str('name'))] });
    const r = await inspectWasm(file(bytes));
    expect(r.ok).toBe(true);
    expect(r.sections.filter((s) => s.id === 0)).toHaveLength(2);
  });
});

describe('a wasm build that is not a contract', () => {
  test('missing CosmWasm entry points is an error naming them', async () => {
    const r = await inspectWasm(file(module({ exports: [['memory', 2, 0], ['_start', 0, 1]] })));
    expect(r.ok).toBe(false);
    const text = errors(r.issues).join(' ');
    expect(text).toContain('Missing CosmWasm entry points');
    expect(text).toContain('allocate');
    expect(text).toContain('interface_version_8');
    expect(text).toContain('#[entry_point]');
  });

  test('a legacy interface is a warning, not a rejection', async () => {
    const r = await inspectWasm(file(module({
      exports: [['memory', 2, 0], ['allocate', 0, 1], ['deallocate', 0, 2], ['interface_version_7', 0, 3], ['instantiate', 0, 4], ['execute', 0, 5], ['query', 0, 6]],
    })));
    expect(r.ok).toBe(true);
    expect(warns(r.issues).join(' ')).toContain('interface_version_7');
  });

  test('no callable handler at all is an error', async () => {
    const r = await inspectWasm(file(module({
      exports: [['memory', 2, 0], ['allocate', 0, 1], ['deallocate', 0, 2], ['interface_version_8', 0, 3]],
    })));
    expect(r.ok).toBe(false);
    expect(errors(r.issues).join(' ')).toContain('nothing for a transaction to call');
  });

  test('no export section is an error', async () => {
    const r = await inspectWasm(file(module({ omit: [7] })));
    expect(r.ok).toBe(false);
    expect(errors(r.issues).join(' ')).toContain('No export section');
  });

  test('no executable sections is an error', async () => {
    const r = await inspectWasm(file(module({ omit: [1, 3, 10] })));
    expect(r.ok).toBe(false);
    expect(errors(r.issues).join(' ')).toContain('no executable code');
  });
});

describe('warnings that would cost gas or fail to link', () => {
  test('a non-env import will not link', async () => {
    const r = await inspectWasm(file(module({ importModule: 'wasi_snapshot_preview1' })));
    expect(r.ok).toBe(true);
    expect(warns(r.issues).join(' ')).toContain('only provides the "env" module');
  });

  test('a start section is flagged', async () => {
    const r = await inspectWasm(file(module({ start: true })));
    expect(warns(r.issues).join(' ')).toContain('start section');
  });

  test('an oversized linear memory is flagged', async () => {
    const r = await inspectWasm(file(module({ memoryPages: 600 })));
    expect(r.memoryPages).toBe(600);
    expect(warns(r.issues).join(' ')).toContain('600 memory pages');
  });

  test('no exported memory is flagged', async () => {
    const r = await inspectWasm(file(module({
      exports: [['allocate', 0, 1], ['deallocate', 0, 2], ['interface_version_8', 0, 3], ['instantiate', 0, 4], ['execute', 0, 5], ['query', 0, 6]],
    })));
    expect(r.ok).toBe(true);
    expect(warns(r.issues).join(' ')).toContain('No exported memory');
  });

  test('a module that does export memory is not warned about it', async () => {
    // The export is kind 2 (memory), not a function — the checker has to look
    // at the export table, not at the list of callable names.
    const r = await inspectWasm(file(module()));
    expect(r.exports.some((e) => e.kind === 'memory' && e.name === 'memory')).toBe(true);
    expect(warns(r.issues).join(' ')).not.toContain('No exported memory');
  });

  test('a tiny module is called out as a possible stub', async () => {
    const r = await inspectWasm(file(module()));
    expect(warns(r.issues).join(' ')).toContain('small enough to be a stub');
  });
});

describe('formatBytes', () => {
  test('scales the unit it prints', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KiB');
    expect(formatBytes(3 * 1048576)).toBe('3.00 MiB');
  });
});