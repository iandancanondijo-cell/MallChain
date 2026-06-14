// Minimal hand-written protobuf encoder for MsgTransferMallcoin
// message MsgTransferMallcoin {
//   string creator = 1;
//   uint64 amount = 2;
//   string to = 3;
// }

function encodeVarint(value) {
  // support BigInt or Number
  let v = typeof value === 'bigint' ? value : BigInt(value)
  const bytes = []
  while (v > 0x7fn) {
    bytes.push(Number((v & 0x7fn) | 0x80n))
    v >>= 7n
  }
  bytes.push(Number(v))
  return Uint8Array.from(bytes)
}

function utf8ToBytes(str){
  return new TextEncoder().encode(str)
}

function concat(...arrays){
  let total = 0
  for(const a of arrays) total += a.length
  const out = new Uint8Array(total)
  let off = 0
  for(const a of arrays){ out.set(a, off); off += a.length }
  return out
}

function encodeStringField(fieldNumber, str){
  const tag = (fieldNumber << 3) | 2
  const tagVar = encodeVarint(tag)
  const bytes = utf8ToBytes(str)
  const len = encodeVarint(bytes.length)
  return concat(tagVar, len, bytes)
}

function encodeUint64Field(fieldNumber, value){
  const tag = (fieldNumber << 3) | 0
  const tagVar = encodeVarint(tag)
  const v = typeof value === 'string' ? BigInt(value) : BigInt(value)
  const valVar = encodeVarint(v)
  return concat(tagVar, valVar)
}

export function encode(msg){
  const parts = []
  if(msg.creator !== undefined && msg.creator !== null){
    parts.push(encodeStringField(1, msg.creator))
  }
  if(msg.amount !== undefined && msg.amount !== null){
    parts.push(encodeUint64Field(2, msg.amount))
  }
  if(msg.to !== undefined && msg.to !== null){
    parts.push(encodeStringField(3, msg.to))
  }
  return concat(...parts)
}
export const typeUrl = '/marketplace.mlcoin.v1.MsgTransferMallcoin'

export default { typeUrl, encode }
