const Joi = require('joi');
const bech32 = require('bech32');

// Common validation schemas
//
// Real bech32 decode + checksum validation, not a prefix/length regex — see
// utils/validationSchemas.js's addressSchema for the same fix and the full
// rationale (a regex here silently accepted a mistyped address; bech32's
// checksum exists specifically to catch that). This is a separate schema
// object from utils/validationSchemas.js, not a re-export of it — routes/
// send.js's primary /mallcoins and /payment routes go through this one.
const addressSchema = Joi.string()
  .required()
  .custom((value, helpers) => {
    let decoded;
    try {
      decoded = bech32.decode(value);
    } catch {
      return helpers.error('string.pattern.base');
    }
    if (decoded.prefix !== 'mall') return helpers.error('string.pattern.base');
    if (bech32.fromWords(decoded.words).length !== 20) return helpers.error('string.pattern.base');
    return value;
  }, 'bech32 address checksum validation')
  .messages({
    'string.pattern.base': 'Invalid Mallchain address format',
  });

const amountSchema = Joi.number()
  .positive()
  .max(1e15)
  .required()
  .messages({
    'number.positive': 'Amount must be positive',
    'number.max': 'Amount exceeds maximum allowed value',
  });

const paymentIdSchema = Joi.string()
  .pattern(/^PAY[A-F0-9]{32}$/)
  .required()
  .messages({
    'string.pattern.base': 'Invalid payment ID format',
  });

// Request validation schemas
const transferSchema = Joi.object({
  from: addressSchema,
  to: addressSchema,
  amount: amountSchema,
  memo: Joi.string().max(256).optional(),
  txBytes: Joi.string().optional(),
});

const paymentSchema = Joi.object({
  amount: amountSchema,
  phone: Joi.string()
    .pattern(/^254\d{9}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid phone number format (use 254XXXXXXXXX)',
    }),
  userId: Joi.string().optional(),
});

// send.js's POST /payment was previously validated against paymentSchema
// (amount/phone/userId, an M-Pesa shape) while sendController.processPayment
// actually destructures buyerAddress/sellerAddress/amountKES/txBytes/description
// — with stripUnknown: true, every field the handler reads was silently
// deleted before it saw the request, and phone/userId (which it never reads)
// were enforced instead. This matches each handler's real destructuring.
const mallcoinPaymentSchema = Joi.object({
  buyerAddress: addressSchema,
  sellerAddress: addressSchema,
  amountKES: amountSchema,
  txBytes: Joi.string().optional(),
  description: Joi.string().max(256).optional(),
});

// send.js's POST /mlcns/transfer was previously validated against
// transferSchema, which requires `amount` — but sendController.transferMlcns
// reads `amountMlcns` from the body. Every request shaped for the handler
// (from/to/amountMlcns) was rejected by Joi before the controller ever ran.
const mlcnsTransferSchema = Joi.object({
  from: addressSchema,
  to: addressSchema,
  amountMlcns: amountSchema,
  txBytes: Joi.string().optional(),
  privateKey: Joi.string().optional(),
  memo: Joi.string().max(256).optional(),
});

const faucetRequestSchema = Joi.object({
  walletAddress: addressSchema,
});

// buy.js's /reserve, /mpesa, and /credit routes were all validated against
// paymentSchema (amount/phone/userId only), which — combined with
// stripUnknown: true below — silently deleted every field those handlers
// actually read (fiat, currency, walletAddress, quoteId, description,
// idempotencyKey) before the handler ever saw them. These match each
// handler's real destructuring in routes/buy.js.
const buyReserveSchema = Joi.object({
  amount: amountSchema, // MLCNS amount requested
  fiat: Joi.alternatives().try(Joi.number(), Joi.string()).required(), // may include a currency symbol/prefix
  currency: Joi.string().max(8).optional(),
  walletAddress: addressSchema,
  phone: Joi.string()
    .pattern(/^254\d{9}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid phone number format (use 254XXXXXXXXX)',
    }),
});

const buyMpesaInitiateSchema = Joi.object({
  quoteId: Joi.string().required(),
  phone: Joi.string()
    .pattern(/^254\d{9}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid phone number format (use 254XXXXXXXXX)',
    }),
  amount: amountSchema,
  description: Joi.string().max(256).optional(),
});

// quoteId is required (not just one-of with walletAddress/amount): it's what
// ties a credit to a real, server-confirmed M-Pesa payment
// (MallcoinPurchase.status === 'confirmed', see buy.js's handleReservedCredit).
// Without it, amount/walletAddress alone were previously enough to mint MLCNS
// with no payment reference and no auth — confirmed live as a real
// unauthenticated free-mint exploit before this schema change.
const buyCreditSchema = Joi.object({
  quoteId: Joi.string().required(),
  walletAddress: addressSchema.optional(),
  idempotencyKey: Joi.string().optional(),
});

// Badge purchase (KSh 17, see routes/badge.js) — unlike buyReserveSchema,
// there's no user-chosen amount/fiat: the price is fixed server-side
// (config.badge.purchasePriceKes), so the client only supplies who/where.
const badgeReserveSchema = Joi.object({
  walletAddress: addressSchema,
  phone: Joi.string()
    .pattern(/^254\d{9}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid phone number format (use 254XXXXXXXXX)',
    }),
});

const badgeMpesaInitiateSchema = Joi.object({
  quoteId: Joi.string().required(),
  phone: Joi.string()
    .pattern(/^254\d{9}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid phone number format (use 254XXXXXXXXX)',
    }),
});

const badgeIssueSchema = Joi.object({
  quoteId: Joi.string().required(),
  walletAddress: addressSchema.optional(),
});

const badgeStatusParamSchema = Joi.object({
  quoteId: Joi.string().required(),
});

// buy.js's POST /sell was previously validated against schemas.transfer
// (from/to/amount/memo/txBytes) while the handler destructures
// sellerAddress/amount/txBytes/phone from req.validatedBody — stripUnknown
// deleted sellerAddress/phone and required a from/to pair the handler never
// reads, so the cash-out flow could never actually run.
const sellSchema = Joi.object({
  sellerAddress: addressSchema,
  amount: amountSchema,
  txBytes: Joi.string().required().messages({
    'any.required': 'Signed transaction bytes (txBytes) are required',
  }),
  phone: Joi.string().optional(),
});

const buyStatusParamSchema = Joi.object({
  paymentId: Joi.string().required(),
});

const sellStatusParamSchema = Joi.object({
  saleId: Joi.string().required(),
});

const mpesaCallbackSchema = Joi.object({
  Body: Joi.object({
    stkCallback: Joi.object({
      MerchantRequestID: Joi.string().optional(),
      CheckoutRequestID: Joi.string().optional(),
      ResultCode: Joi.number().optional(),
      ResultDesc: Joi.string().optional(),
      CallbackMetadata: Joi.object({
        Item: Joi.array().items(Joi.object({
          Name: Joi.string().required(),
          Value: Joi.any().required(),
        })).optional(),
      }).optional(),
    }).optional(),
  }).optional(),
});

const payoutCallbackSchema = Joi.object({
  Result: Joi.object({
    ConversationID: Joi.string().optional(),
    OriginatorConversationID: Joi.string().optional(),
    ResponseCode: Joi.string().optional(),
    ResponseDescription: Joi.string().optional(),
  }).optional(),
});

/**
 * Validation middleware factory
 */
function validate(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true,
    });

    if (error) {
      return res.status(400).json({
        error: 'validation_failed',
        details: error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        })),
      });
    }

    req.validatedBody = value;
    next();
  };
}

module.exports = {
  validate,
  schemas: {
    transfer: transferSchema,
    payment: paymentSchema,
    mallcoinPayment: mallcoinPaymentSchema,
    mlcnsTransfer: mlcnsTransferSchema,
    buyReserve: buyReserveSchema,
    buyMpesaInitiate: buyMpesaInitiateSchema,
    buyCredit: buyCreditSchema,
    badgeReserve: badgeReserveSchema,
    badgeMpesaInitiate: badgeMpesaInitiateSchema,
    badgeIssue: badgeIssueSchema,
    badgeStatusParam: badgeStatusParamSchema,
    sell: sellSchema,
    faucetRequest: faucetRequestSchema,
    address: addressSchema,
    amount: amountSchema,
    paymentId: paymentIdSchema,
    buyStatusParam: buyStatusParamSchema,
    sellStatusParam: sellStatusParamSchema,
    mpesaCallback: mpesaCallbackSchema,
    payoutCallback: payoutCallbackSchema,
  },
};
