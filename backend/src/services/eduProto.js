// Hand-rolled protobuf encoder for MsgRegisterDocument, since it isn't in
// @cosmjs/stargate's default registry — same reason/pattern as
// badgeProto.js's MsgIssueBadge encoder. Field numbers must match
// proto/marketplace/edu/v1/tx.proto exactly: creator = 1, uploader = 2,
// doc_id = 3, sha256_hash = 4, parent_record_id = 5.
const { Registry } = require('@cosmjs/proto-signing');
const { defaultRegistryTypes } = require('@cosmjs/stargate');

const MSG_REGISTER_DOCUMENT = '/marketplace.edu.v1.MsgRegisterDocument';

function encodeVarint(value) {
  let current = typeof value === 'bigint' ? value : BigInt(value);
  const bytes = [];
  while (current > 0x7fn) {
    bytes.push(Number((current & 0x7fn) | 0x80n));
    current >>= 7n;
  }
  bytes.push(Number(current));
  return Uint8Array.from(bytes);
}

function utf8ToBytes(str) {
  return new TextEncoder().encode(str);
}

function concatBytes(...arrays) {
  let total = 0;
  for (const array of arrays) {
    total += array.length;
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const array of arrays) {
    out.set(array, offset);
    offset += array.length;
  }
  return out;
}

function encodeStringField(fieldNumber, value) {
  const tag = encodeVarint((fieldNumber << 3) | 2);
  const bytes = utf8ToBytes(value);
  return concatBytes(tag, encodeVarint(bytes.length), bytes);
}

function encodeMsgRegisterDocument(msg) {
  const parts = [];
  if (msg.creator) parts.push(encodeStringField(1, msg.creator));
  if (msg.uploader) parts.push(encodeStringField(2, msg.uploader));
  if (msg.docId) parts.push(encodeStringField(3, msg.docId));
  if (msg.sha256Hash) parts.push(encodeStringField(4, msg.sha256Hash));
  if (msg.parentRecordId) parts.push(encodeStringField(5, msg.parentRecordId));
  return concatBytes(...parts);
}

const MsgRegisterDocumentType = {
  create(base = {}) {
    return {
      creator: base.creator || '',
      uploader: base.uploader || '',
      docId: base.docId || '',
      sha256Hash: base.sha256Hash || '',
      parentRecordId: base.parentRecordId || '',
    };
  },
  encode(message) {
    return {
      finish: () => encodeMsgRegisterDocument(message),
    };
  },
  fromPartial(object = {}) {
    return MsgRegisterDocumentType.create(object);
  },
  decode() {
    throw new Error('MsgRegisterDocument decode is not implemented in this client helper');
  },
};

function createEduRegistry() {
  return new Registry([...defaultRegistryTypes, [MSG_REGISTER_DOCUMENT, MsgRegisterDocumentType]]);
}

module.exports = {
  MSG_REGISTER_DOCUMENT,
  encodeMsgRegisterDocument,
  createEduRegistry,
};
