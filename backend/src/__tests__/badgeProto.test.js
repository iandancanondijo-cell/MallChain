// Factory mock (not auto-mock) so Jest never has to load the real
// @cosmjs/proto-signing module tree — @cosmjs/crypto@0.39's argon2 support
// pulls in an ESM-only transitive dependency that Jest's default CJS
// resolution can't parse (same issue documented in dexTxBuilder.test.js /
// faucetService.test.js). The real encoding was verified manually against
// a live wallet + chain broadcast, matching how mallpointsConvert.test.js
// handles the same class of ADR-036/registry code.
const mockRegistry = jest.fn(function Registry(types) {
  this.types = types;
});
jest.mock('@cosmjs/proto-signing', () => ({
  Registry: mockRegistry,
}));
jest.mock('@cosmjs/stargate', () => ({
  defaultRegistryTypes: [['/cosmos.bank.v1beta1.MsgSend', {}]],
}));

const { MSG_ISSUE_BADGE, encodeMsgIssueBadge, createBadgeRegistry } = require('../services/badgeProto');

function decodeStringField(bytes, expectedFieldNumber) {
  // Minimal reverse of encodeStringField for test assertions: tag byte,
  // varint length, utf8 bytes.
  let offset = 0;
  const tag = bytes[offset++];
  const fieldNumber = tag >> 3;
  expect(fieldNumber).toBe(expectedFieldNumber);
  expect(tag & 0x7).toBe(2); // length-delimited wire type
  let length = 0;
  let shift = 0;
  let b;
  do {
    b = bytes[offset++];
    length |= (b & 0x7f) << shift;
    shift += 7;
  } while (b & 0x80);
  const value = Buffer.from(bytes.slice(offset, offset + length)).toString('utf8');
  return { value, next: offset + length };
}

describe('badgeProto', () => {
  test('MSG_ISSUE_BADGE matches the proto typeUrl', () => {
    expect(MSG_ISSUE_BADGE).toBe('/marketplace.badge.v1.MsgIssueBadge');
  });

  test('encodeMsgIssueBadge encodes creator, recipient, badge_type in field-number order (1, 2, 3)', () => {
    const bytes = encodeMsgIssueBadge({ creator: 'mall1creator', recipient: 'mall1recipient', badgeType: 'gold' });

    const field1 = decodeStringField(bytes, 1);
    expect(field1.value).toBe('mall1creator');

    const field2 = decodeStringField(bytes.slice(field1.next), 2);
    expect(field2.value).toBe('mall1recipient');

    const field3 = decodeStringField(bytes.slice(field1.next + field2.next), 3);
    expect(field3.value).toBe('gold');
  });

  test('encodeMsgIssueBadge omits unset fields rather than encoding empty strings', () => {
    const bytes = encodeMsgIssueBadge({ creator: 'mall1creator' });
    // Only one field encoded — decoding a second field would read garbage/throw.
    const field1 = decodeStringField(bytes, 1);
    expect(field1.next).toBe(bytes.length);
  });

  test('createBadgeRegistry merges MsgIssueBadge into the default registry types', () => {
    const registry = createBadgeRegistry();
    const typeUrls = registry.types.map(([typeUrl]) => typeUrl);
    expect(typeUrls).toContain('/cosmos.bank.v1beta1.MsgSend');
    expect(typeUrls).toContain(MSG_ISSUE_BADGE);
  });
});
