// Registry for custom Mallcoin message types
// This allows CosmJS to properly encode/decode custom messages

import { Registry } from '@cosmjs/proto-signing';

// Import custom message encoders
import { encodeMsgTransferMallcoin, typeUrls } from './proto-encoders.js';

// Create a custom registry with Mallcoin message types
export function createMallcoinRegistry() {
  const registry = new Registry();
  
  // Register custom message types
  // These are handled by our manual protobuf encoders
  registry.register(typeUrls.TRANSFER, {
    encode: (message) => {
      // Already encoded by our proto-encoders
      return message;
    },
    decode: (bytes) => {
      // For decoding, return as-is (not used for signing)
      return bytes;
    },
    fromJSON: (json) => encodeMsgTransferMallcoin(json),
    toJSON: (message) => message,
  });
  
  registry.register(typeUrls.BUY, {
    encode: (message) => message,
    decode: (bytes) => bytes,
    fromJSON: (json) => json,
    toJSON: (message) => message,
  });
  
  registry.register(typeUrls.SELL, {
    encode: (message) => message,
    decode: (bytes) => bytes,
    fromJSON: (json) => json,
    toJSON: (message) => message,
  });
  
  return registry;
}

export default createMallcoinRegistry;
