// Protobuf encoders for on-chain buy/sell messages
// These encode MsgBuyMallcoin and MsgSellMallcoin to protobuf binary format

function encodeVarint(value) {
  if (value === 0) return [0];
  const result = [];
  while (value > 127) {
    result.push((value & 0x7f) | 0x80);
    value >>>= 7;
  }
  result.push(value & 0x7f);
  return result;
}

function utf8ToBytes(str) {
  const bytes = [];
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push((code >> 6) | 0xc0);
      bytes.push((code & 0x3f) | 0x80);
    } else if (code < 0x10000) {
      bytes.push((code >> 12) | 0xe0);
      bytes.push(((code >> 6) & 0x3f) | 0x80);
      bytes.push((code & 0x3f) | 0x80);
    } else {
      bytes.push((code >> 18) | 0xf0);
      bytes.push(((code >> 12) & 0x3f) | 0x80);
      bytes.push(((code >> 6) & 0x3f) | 0x80);
      bytes.push((code & 0x3f) | 0x80);
    }
  }
  return bytes;
}

function concat(...arrays) {
  const result = [];
  arrays.forEach(arr => result.push(...arr));
  return result;
}

function encodeStringField(fieldNumber, str) {
  const bytes = utf8ToBytes(str);
  const fieldHeader = encodeVarint((fieldNumber << 3) | 2);
  const length = encodeVarint(bytes.length);
  return concat(fieldHeader, length, bytes);
}

function encodeUint64Field(fieldNumber, value) {
  const num = typeof value === 'string' ? BigInt(value) : BigInt(value);
  // For uint64, we encode as varint
  const fieldHeader = encodeVarint((fieldNumber << 3) | 0);
  const result = [];
  
  let v = num;
  while (v > BigInt(127)) {
    result.push(Number((v & BigInt(0x7f)) | BigInt(0x80)));
    v >>= BigInt(7);
  }
  result.push(Number(v & BigInt(0x7f)));
  
  return concat(fieldHeader, result);
}

// Encode MsgBuyMallcoin
// message MsgBuyMallcoin {
//   string buyer = 1;
//   uint64 mlcn_amount = 2;
// }
export function encodeMsgBuyMallcoin(msg) {
  const { buyer, mlcnAmount } = msg;
  return concat(
    encodeStringField(1, buyer),
    encodeUint64Field(2, mlcnAmount)
  );
}

// Encode MsgSellMallcoin
// message MsgSellMallcoin {
//   string seller = 1;
//   uint64 mlcn_amount = 2;
// }
export function encodeMsgSellMallcoin(msg) {
  const { seller, mlcnAmount } = msg;
  return concat(
    encodeStringField(1, seller),
    encodeUint64Field(2, mlcnAmount)
  );
}

// Encode MsgTransferMallcoin
// message MsgTransferMallcoin {
//   string creator = 1;
//   uint64 amount = 2;
//   string to = 3;
// }
export function encodeMsgTransferMallcoin(msg) {
  const { creator, amount, to } = msg;
  return concat(
    encodeStringField(1, creator),
    encodeUint64Field(2, amount),
    encodeStringField(3, to)
  );
}

export const typeUrls = {
  BUY: '/marketplace.mlcoin.v1.MsgBuyMallcoin',
  SELL: '/marketplace.mlcoin.v1.MsgSellMallcoin',
  TRANSFER: '/marketplace.mlcoin.v1.MsgTransferMallcoin'
};
