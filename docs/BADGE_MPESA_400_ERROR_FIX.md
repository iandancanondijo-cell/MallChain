# Badge MPESA Endpoint - HTTP 400 Error Diagnosis & Fix

## Problem

Frontend receives HTTP 400 "invalid request" error when calling:
```
POST /api/badge/mpesa
Body: { "quoteId": "...", "phone": "254712345678" }
```

## Root Cause Analysis

The error "invalid request" comes from the catch block in badge.js line ~197:
```javascript
catch (e) {
  res.status(e.status || 500).json({ error: (e.status === 400) ? 'invalid request' : 'internal error' });
}
```

This means **one of the following is throwing an error with `status: 400`**:

### Option 1: Validation Failed
- The `badgeMpesaInitiateSchema` validation rejected the request
- **But**: Validation errors return `{ error: 'validation_failed', details: [...] }`, not `{ error: 'invalid request' }`
- **Verdict**: NOT validation

### Option 2: Safaricom API Returned 400
- The `axios.post()` to Safaricom failed with HTTP 400
- This could happen if:
  - Invalid STK body format
  - Safaricom credentials are wrong
  - Phone number format incorrect in STK request
  - Business short code mismatch

### Option 3: Mongoose Query Failed
- `BadgePurchase.findOne({ quoteId })` threw an error
- **Unlikely**: Mongoose doesn't throw status 400 errors

## Solution

The error handling needs to be improved to show what's actually failing. Here's the fix:

### Step 1: Improve Error Logging in `/api/badge/mpesa`

**File**: `backend/src/routes/badge.js`

Replace the catch block:

```javascript
router.post('/mpesa', validate(schemas.badgeMpesaInitiate), async (req, res) => {
  try {
    const { quoteId, phone } = req.validatedBody;
    console.log('[BADGE MPESA] Initiating with:', { quoteId, phone });

    const purchase = await BadgePurchase.findOne({ quoteId });
    if (!purchase) {
      console.log('[BADGE MPESA] Quote not found:', quoteId);
      return res.status(404).json({ error: 'Quote not found' });
    }

    console.log('[BADGE MPESA] Found purchase, starting STK push');
    const response = await initiateMpesaRequest(purchase, phone);
    return res.json({ ...response, quoteId: purchase.quoteId, amountKes: purchase.fiatAmount });
  } catch (e) {
    // Handle Safaricom API errors
    if (e.response?.status) {
      console.error('[BADGE MPESA] Safaricom API error:', {
        status: e.response.status,
        data: e.response.data,
        config: { url: e.config?.url, method: e.config?.method }
      });
      return res.status(e.response.status).json({
        error: e.response.data?.errorMessage || e.response.data?.message || 'M-Pesa error',
        details: e.response.data
      });
    }
    
    // Handle custom errors with status
    if (e.status) {
      console.error('[BADGE MPESA] Custom error:', { status: e.status, message: e.message });
      return res.status(e.status).json({ error: e.message });
    }
    
    // Handle other errors
    console.error('[BADGE MPESA] Unexpected error:', { message: e.message, stack: e.stack });
    logger.error('badge', { route: req.originalUrl, error: e.message, stack: e.stack });
    res.status(500).json({ error: 'internal error', message: e.message });
  }
});
```

### Step 2: Add Logging to `initiateMpesaRequest`

```javascript
async function initiateMpesaRequest(purchase, phone) {
  if (!isStkConfigured()) {
    const err = new Error('Safaricom M-Pesa badge purchase is not configured yet');
    err.status = 503;
    throw err;
  }

  console.log('[BADGE STK] Config check passed');

  const token = await getSafaricomToken();
  if (!token) {
    const err = new Error('Safaricom token could not be generated');
    err.status = 503;
    throw err;
  }

  console.log('[BADGE STK] Token acquired');

  const stkBody = buildStkBody(purchase, phone);
  console.log('[BADGE STK] Built body, sending to Safaricom:', {
    amount: stkBody.Amount,
    partyA: stkBody.PartyA,
    businessShortCode: stkBody.BusinessShortCode,
    timestamp: stkBody.Timestamp
  });

  const stkRes = await axios.post(
    `${SAFARICOM_API.replace(/\/$/, '')}/mpesa/stkpush/v1/processrequest`,
    stkBody,
    { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
  );

  console.log('[BADGE STK] Safaricom response:', stkRes.data);

  const resp = stkRes.data || {};
  const checkoutId = resp.CheckoutRequestID || resp.checkoutRequestID || '';
  const paymentId = checkoutId || `BADGE${Date.now()}${crypto.randomBytes(4).toString('hex')}`;

  addPaymentIdToPurchase(purchase, paymentId);
  purchase.status = 'payment_initiated';
  purchase.reason = 'STK push sent. Complete the prompt on your phone.';
  await purchase.save();

  return { ok: true, paymentId, status: 'payment_initiated', providerMode: 'live' };
}
```

## How to Debug

1. **Apply the fixes above**
2. **Restart backend** and watch the console output
3. **Make the request** from frontend
4. **Check console logs** for `[BADGE MPESA]` and `[BADGE STK]` messages
5. **The logs will show** exactly where the failure occurs

The logs will identify:
- ✅ If validation passes
- ✅ If quote exists in DB
- ✅ If Safaricom config is set
- ✅ If token generation works
- ✅ What Safaricom API returns
- ❌ Where it fails

## Possible Causes Based on 400 Response

**Most Likely**: Safaricom sandbox API is rejecting the STK body

**Check**:
1. Is `SAFARICOM_API` set to `https://sandbox.safaricom.co.ke`? (not production)
2. Are `SAFARICOM_KEY` and `SAFARICOM_SECRET` valid sandbox credentials?
3. Is the phone number format correct in the STK request? (Should be `254xxxxxxxxx`)
4. Is `BUSINESS_SHORT_CODE` set correctly? (Should be `174379` for sandbox)

## Quick Fix (If Safaricom Credentials are Wrong)

If Safaricom credentials are invalid:

1. Get valid sandbox credentials from Safaricom developer portal
2. Update in `.env`:
   ```
   SAFARICOM_API=https://sandbox.safaricom.co.ke
   SAFARICOM_KEY=your_sandbox_consumer_key
   SAFARICOM_SECRET=your_sandbox_consumer_secret
   BUSINESS_SHORT_CODE=174379
   PASSKEY=your_sandbox_passkey
   ```
3. Restart backend
4. Test again

## Alternative: Disable STK for Testing

If you want to test the full flow without real Safaricom:

Modify `initiateMpesaRequest` to mock success:

```javascript
async function initiateMpesaRequest(purchase, phone) {
  // For testing without real Safaricom
  if (process.env.BADGE_MOCK_MPESA === 'true') {
    console.log('[BADGE] Mocking M-Pesa response');
    const paymentId = `BADGEMOCK${Date.now()}`;
    addPaymentIdToPurchase(purchase, paymentId);
    purchase.status = 'payment_initiated';
    purchase.reason = 'STK push sent (mocked).';
    await purchase.save();
    return { ok: true, paymentId, status: 'payment_initiated', providerMode: 'mock' };
  }

  // ... rest of real implementation
}
```

Then add to `.env`:
```
BADGE_MOCK_MPESA=true
```

This lets you test the callback and issuance flow without Safaricom integration.

## Status

The badge system itself is working. The `/badge/mpesa` endpoint issue is specifically related to the **Safaricom M-Pesa STK push integration**. With proper debugging logs, the exact cause will be visible in the console output.

**Next Step**: Apply the logging changes and test again to see the actual error from Safaricom.
