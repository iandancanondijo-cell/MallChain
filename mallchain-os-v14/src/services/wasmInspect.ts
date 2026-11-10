/**
 * Local inspection of a compiled .wasm module.
 *
 * There is no Rust toolchain or compiler service in this deployment, so this
 * page must not pretend to compile. What it can honestly do is read the binary
 * the developer already built: check the WebAssembly header, walk every
 * section, list imports and exports, and decide whether the module actually
 * exports the entry points x/wasm calls. That catches the common failures —
 * a non-wasm file, a debug build with no CosmWasm interface, a truncated
 * download — before a store-code transaction pays gas to be rejected on chain.
 *
 * Everything here runs on the bytes in this tab. Nothing is uploaded until the
 * developer signs MsgStoreCode.
 */

export type IssueLevel = 'error' | 'warn' | 'info';

export interface WasmIssue { level: IssueLevel; text: string }

export interface WasmSection { id: number; name: string; bytes: number; count?: number }

export interface WasmExport { name: string; kind: 'function' | 'table' | 'memory' | 'global'; index: number }

export interface WasmInspection {
  /** False when the file is not a usable CosmWasm module. */
  ok: boolean;
  fileName: string;
  bytes: number;
  /** Lowercase hex, or null when WebCrypto is unavailable (non-secure origin). */
  sha256: string | null;
  version: number | null;
  sections: WasmSection[];
  exports: WasmExport[];
  /** Distinct import module names, e.g. ["env"]. */
  importModules: string[];
  functionCount: number;
  memoryPages: number | null;
  issues: WasmIssue[];
  /** The bytes, kept so the deploy step uploads exactly what was inspected. */
  data: Uint8Array;
}

const SECTION_NAMES: Record<number, string> = {
  0: 'custom', 1: 'type', 2: 'import', 3: 'function', 4: 'table', 5: 'memory',
  6: 'global', 7: 'export', 8: 'start', 9: 'element', 10: 'code', 11: 'data', 12: 'data count',
};

const EXPORT_KINDS = ['function', 'table', 'memory', 'global'] as const;

/** Entry points x/wasm's VM calls. A contract missing these cannot be instantiated. */
const REQUIRED_EXPORTS = ['allocate', 'deallocate', 'interface_version_8'];
const LEGACY_INTERFACE = ['interface_version_7', 'interface_version_6', 'interface_version_5'];
const HANDLER_EXPORTS = ['instantiate', 'execute', 'query', 'migrate', 'sudo', 'reply'];

/** 8 MiB is x/wasm's default max_contract_size; larger uploads are rejected. */
export const MAX_WASM_BYTES = 8 * 1024 * 1024;

class Cursor {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  get offset(): number { return this.pos; }
  get remaining(): number { return this.buf.length - this.pos; }

  byte(): number {
    if (this.pos >= this.buf.length) throw new Error('the file ends in the middle of a section');
    return this.buf[this.pos++];
  }

  /** Unsigned LEB128, capped at 5 bytes so a corrupt length cannot loop forever. */
  u32(): number {
    let result = 0;
    for (let i = 0; i < 5; i++) {
      const b = this.byte();
      result |= (b & 0x7f) << (7 * i);
      if ((b & 0x80) === 0) return result >>> 0;
    }
    throw new Error('a length field in this file is malformed');
  }

  take(n: number): Uint8Array {
    if (n < 0 || this.pos + n > this.buf.length) throw new Error('a section claims more bytes than the file contains');
    const out = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return out;
  }

  string(): string {
    return new TextDecoder('utf-8', { fatal: false }).decode(this.take(this.u32()));
  }
}

async function sha256Hex(data: Uint8Array): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  try {
    const digest = await subtle.digest('SHA-256', data as unknown as ArrayBuffer);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** Walks the section list. Throws on a structurally broken file. */
function readSections(data: Uint8Array): { sections: WasmSection[]; exports: WasmExport[]; importModules: string[]; functionCount: number; memoryPages: number | null } {
  const c = new Cursor(data);
  c.take(8); // magic + version, already checked by the caller

  const sections: WasmSection[] = [];
  const exports: WasmExport[] = [];
  const importModules = new Set<string>();
  let functionCount = 0;
  let memoryPages: number | null = null;
  let lastId = 0;

  while (c.remaining > 0) {
    const id = c.byte();
    const size = c.u32();
    const body = c.take(size);
    const section: WasmSection = { id, name: SECTION_NAMES[id] ?? `unknown (${id})`, bytes: size };
    sections.push(section);

    // Custom sections may repeat anywhere; every other section is ordered and unique.
    if (id !== 0) {
      if (id < lastId) throw new Error(`section ${section.name} appears out of order — the file is not a valid module`);
      lastId = id;
    }

    const b = new Cursor(body);
    if (id === 2) {
      const n = b.u32();
      section.count = n;
      for (let i = 0; i < n; i++) {
        importModules.add(b.string());
        b.string(); // field name
        const kind = b.byte();
        if (kind === 0) b.u32();
        else if (kind === 1) { b.byte(); readLimits(b); }
        else if (kind === 2) readLimits(b);
        else if (kind === 3) { b.byte(); b.byte(); }
        else throw new Error(`unknown import kind ${kind}`);
      }
    } else if (id === 3) {
      functionCount = b.u32();
      section.count = functionCount;
    } else if (id === 5) {
      const n = b.u32();
      section.count = n;
      if (n > 0) {
        const limits = readLimits(b);
        memoryPages = limits.initial;
      }
    } else if (id === 7) {
      const n = b.u32();
      section.count = n;
      for (let i = 0; i < n; i++) {
        const name = b.string();
        const kind = b.byte();
        const index = b.u32();
        if (kind > 3) throw new Error(`unknown export kind ${kind}`);
        exports.push({ name, kind: EXPORT_KINDS[kind], index });
      }
    } else if (id === 10) {
      section.count = b.u32();
    }
  }

  return { sections, exports, importModules: [...importModules], functionCount, memoryPages };
}

function readLimits(c: Cursor): { initial: number; maximum: number | null } {
  const flags = c.byte();
  const initial = c.u32();
  const maximum = (flags & 1) !== 0 ? c.u32() : null;
  if (maximum !== null && maximum < initial) throw new Error('a memory limit declares a maximum below its initial size');
  return { initial, maximum };
}

/**
 * Reads a .wasm file and reports what is actually in it. Never throws for a bad
 * file — a rejected upload is a normal outcome and belongs in `issues`.
 */
export async function inspectWasm(file: File): Promise<WasmInspection> {
  const data = new Uint8Array(await file.arrayBuffer());
  const issues: WasmIssue[] = [];
  const base: WasmInspection = {
    ok: false, fileName: file.name, bytes: data.length, sha256: null, version: null,
    sections: [], exports: [], importModules: [], functionCount: 0, memoryPages: null,
    issues, data,
  };

  if (data.length === 0) {
    issues.push({ level: 'error', text: 'That file is empty.' });
    return base;
  }
  if (data.length > MAX_WASM_BYTES) {
    issues.push({ level: 'error', text: `${(data.length / 1048576).toFixed(2)} MiB exceeds the chain's 8 MiB contract limit. Build with --release and strip the module.` });
    return base;
  }
  if (data.length < 8) {
    issues.push({ level: 'error', text: 'Too short to be a WebAssembly module — a .wasm file starts with an 8-byte header.' });
    return base;
  }

  const magicOk = data[0] === 0x00 && data[1] === 0x61 && data[2] === 0x73 && data[3] === 0x6d;
  if (!magicOk) {
    const head = new TextDecoder('utf-8', { fatal: false }).decode(data.subarray(0, 24));
    issues.push({
      level: 'error',
      text: /[\x20-\x7e]{6,}/.test(head)
        ? `This is text, not bytecode (it starts “${head.slice(0, 16).trim()}”). Compile your contract first: cargo wasm, then upload the .wasm from target/wasm32-unknown-unknown/release/.`
        : 'Missing the \\0asm magic bytes — this is not a WebAssembly module.',
    });
    return base;
  }

  const version = data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24);
  base.version = version >>> 0;
  if (base.version !== 1) {
    issues.push({ level: 'error', text: `WebAssembly version ${base.version} is not supported — the chain runs the MVP (version 1).` });
    return base;
  }

  base.sha256 = await sha256Hex(data);

  let walked: ReturnType<typeof readSections>;
  try {
    walked = readSections(data);
  } catch (e) {
    issues.push({ level: 'error', text: `The module is structurally broken: ${(e as Error).message}.` });
    return base;
  }

  base.sections = walked.sections;
  base.exports = walked.exports;
  base.importModules = walked.importModules;
  base.functionCount = walked.functionCount;
  base.memoryPages = walked.memoryPages;

  const names = new Set(walked.exports.filter((e) => e.kind === 'function').map((e) => e.name));
  const hasSection = (id: number) => walked.sections.some((s) => s.id === id);

  if (!hasSection(1) || !hasSection(3) || !hasSection(10)) {
    issues.push({ level: 'error', text: 'No type/function/code sections — this module contains no executable code.' });
  }
  if (!hasSection(7)) {
    issues.push({ level: 'error', text: 'No export section, so x/wasm has no entry point to call. Build with the CosmWasm entry_point macros.' });
  }

  const missing = REQUIRED_EXPORTS.filter((n) => !names.has(n));
  const legacy = LEGACY_INTERFACE.find((n) => names.has(n));
  if (missing.length && legacy) {
    issues.push({ level: 'warn', text: `Exports ${legacy} instead of interface_version_8. The chain accepts v8 contracts; rebuild against cosmwasm-std 1.x or later if this is rejected.` });
  } else if (missing.length) {
    issues.push({ level: 'error', text: `Missing CosmWasm entry point${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}. This looks like a plain Rust wasm build, not a contract — use #[entry_point] and cargo wasm.` });
  }

  const handlers = HANDLER_EXPORTS.filter((n) => names.has(n));
  if (handlers.length === 0) {
    issues.push({ level: 'error', text: 'Exports none of instantiate, execute, query, migrate, sudo or reply — there is nothing for a transaction to call.' });
  } else {
    issues.push({ level: 'info', text: `Callable entry points: ${handlers.join(', ')}.` });
  }

  // `names` is the set of exported functions, and memory is exported as a
  // memory, so checking it there would warn on a contract that does export it.
  if (!walked.exports.some((e) => e.kind === 'memory')) {
    issues.push({ level: 'warn', text: 'No exported memory. CosmWasm contracts normally export it so the VM can read and write linear memory.' });
  }
  if (walked.importModules.length && !walked.importModules.includes('env')) {
    issues.push({ level: 'warn', text: `Imports ${walked.importModules.join(', ')} — x/wasm only provides the "env" module, so any other import will fail to link.` });
  }
  if (walked.sections.some((s) => s.id === 8)) {
    issues.push({ level: 'warn', text: 'Has a start section. x/wasm rejects modules that run code at instantiation outside its entry points.' });
  }
  if (walked.memoryPages !== null && walked.memoryPages > 512) {
    issues.push({ level: 'warn', text: `Declares ${walked.memoryPages} memory pages (${(walked.memoryPages * 64 / 1024).toFixed(1)} MiB). Contracts are usually limited to 32 MiB of linear memory.` });
  }
  if (data.length < 2048) {
    issues.push({ level: 'warn', text: 'Only ' + data.length + ' bytes — small enough to be a stub rather than a compiled contract.' });
  }
  if (walked.sections.some((s) => s.id === 0 && s.bytes > data.length * 0.5)) {
    issues.push({ level: 'info', text: 'Most of the file is custom sections (debug info / producers). Run wasm-opt or strip to cut upload gas.' });
  }

  base.ok = !issues.some((i) => i.level === 'error');
  return base;
}

export const formatBytes = (n: number): string =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(1)} KiB` : `${(n / 1048576).toFixed(2)} MiB`;