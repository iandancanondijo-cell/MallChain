const Joi = require('joi');

// Common validation schemas
const addressSchema = Joi.string()
  .pattern(/^mall1[a-z0-9]{38,58}$/)
  .required()
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

const faucetRequestSchema = Joi.object({
  walletAddress: addressSchema,
});

const stakingSchema = Joi.object({
  validator: Joi.string()
    .pattern(/^mallvaloper1[a-z0-9]{38,58}$/)
    .required()
    .messages({
      'string.pattern.base': 'Invalid validator address format',
    }),
  amount: amountSchema,
});

const governanceSchema = Joi.object({
  proposalId: Joi.number().integer().positive().required(),
  option: Joi.string()
    .valid('VOTE_OPTION_YES', 'VOTE_OPTION_NO', 'VOTE_OPTION_ABSTAIN', 'VOTE_OPTION_NO_WITH_VETO')
    .required(),
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
    faucetRequest: faucetRequestSchema,
    staking: stakingSchema,
    governance: governanceSchema,
    address: addressSchema,
    amount: amountSchema,
    paymentId: paymentIdSchema,
    buyStatusParam: buyStatusParamSchema,
    sellStatusParam: sellStatusParamSchema,
    mpesaCallback: mpesaCallbackSchema,
    payoutCallback: payoutCallbackSchema,
  },
};
