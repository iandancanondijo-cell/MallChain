To: apisupport@safaricom.co.ke
Subject: STK Push ResultCode 2029 — PayBill 4364003 (M-PESA EXPRESS, go-live 2026-10-18) — pushes accepted but never reach customer handset

Dear Daraja API Support,

We went live on the Daraja PRODUCTION environment on 18 October 2026. Since go-live, every Lipa na M-Pesa (M-PESA EXPRESS / STK Push) request fails with ResultCode 2029 and the customer handset never receives the payment prompt. We request your help investigating whether the Express service is fully activated/routed for our short code.

Merchant details
- Organization: Mallchain (mallchain.network)
- Business Short Code (PayBill): 4364003
- Product: M-PESA EXPRESS — STK Push (mpesa/stkpush/v1/processrequest) + STK Push Query (mpesa/stkpushquery/v1/query)
- Production app created: 2026-10-18 07:10 EAT
- Go-live / product approval email received: 2026-10-18 19:36 EAT (lists M-PESA EXPRESS with STKPush/STKPushQuery)
- Contact: +254 708 199 147 / ianddancanondijo@gmail.com

Issue description
Every production STK Push request is ACCEPTED — HTTP 200, ResponseCode "0", a real CheckoutRequestID is returned — but terminates within 2–6 seconds with:

  ResultCode: 2029
  ResultDesc: "Failed due to an unresolved reason type."

The customer phone (254708199147) never receives an STK/USSD prompt. STK Push Query for these requests returns the final 2029 and no Amount/MSISDN — i.e. the request never progressed. We note that a genuine customer cancel or timeout typically takes 30–120 seconds; the consistent 2–6 second failure suggests the request is not being routed to the handset at all.

Evidence — failed CheckoutRequestIDs (all controlled KSh 1 tests, MSISDN 254708199147, all EAT):
1. ws_CO_18102026192025742708199147 — 2026-10-18 19:20:25
2. ws_CO_18102026201329228708199147 — 2026-10-18 20:13:29
3. ws_CO_18102026201622198708199147 — 2026-10-18 20:16:22
4. ws_CO_18102026210410190708199147 — 2026-10-18 21:04:10
5. ws_CO_18102026210425228708199147 — 2026-10-18 21:04:25
6. ws_CO_18102026215824234708199147 — 2026-10-18 21:58:24
7. ws_CO_19102026102036829708199147 — 2026-10-19 10:20:36

Example request/response (CheckoutRequestID #7):
- STK Push: HTTP 200, {"MerchantRequestID":"500f-4246-8de5-b1514415b1f41542535","CheckoutRequestID":"ws_CO_19102026102036829708199147","ResponseCode":"0","ResponseDescription":"Success. Request accepted for processing"}
- STK Push Query (t+6s): {"ResponseCode":"0","ResultCode":"2029","ResultDesc":"Failed due to an unresolved reason type."}
- Callback: your systems delivered the 2029 result callback to our HTTPS endpoint (https://api.mallchain.network) from 196.201.212.138, which we acknowledged with HTTP 200.

Merchant-side checks already completed (all passing):
- Production OAuth (GET /oauth/v1/generate) returns HTTP 200 with a valid access token.
- Requests go to https://api.safaricom.co.ke (production).
- Short code 4364003 and passkey verified character-by-character against the Daraja portal.
- TransactionType: CustomerPayBillOnline (BuyGoods variants are synchronously rejected with 400.002.02, confirming this is a PayBill line).
- Callback URL is a publicly reachable HTTPS endpoint; we receive and acknowledge (HTTP 200) your result callbacks.
- MSISDN format 2547XXXXXXXX, integer KES amounts.

Request
Please investigate why STK Push requests on short code 4364003 are accepted but immediately fail with 2029 without reaching the customer handset — in particular whether M-PESA EXPRESS routing/activation is complete for this short code, given the production app was created the same day as go-live. Happy to provide additional request IDs, headers, or logs if useful.

Thank you,
Ian Dancan
Mallchain — mallchain.network
+254 708 199 147
