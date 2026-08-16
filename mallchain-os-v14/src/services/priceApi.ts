/**
 * Real MALL market price — wraps backend/src/routes/market.js's
 * GET /api/market/price, which polls the live on-chain MLCoin market
 * module (buy/sell price) rather than fabricating a rate. Quoted in the
 * same unit as the app's USD_M stablecoin balance.
 *
 * There is no equivalent source for MLPTS or for KES/EUR/GBP fiat
 * cross-rates anywhere in the backend — callers should show native token
 * amounts for those rather than a fabricated conversion.
 */
import { api, type ApiResult } from './api';

export interface MallMarketPrice {
  buyPrice: number;
  sellPrice: number;
  /** Midpoint of buy/sell, in USD_M terms — the number to show as "MALL price". */
  mid: number;
}

interface MarketPriceResponse {
  market_price: { buy_price: number; sell_price: number; mid: number };
}

class PriceApi {
  async getMallPrice(): Promise<ApiResult<MallMarketPrice>> {
    const res = await api.get<MarketPriceResponse>('/api/market/price');
    if (!res.ok || !res.data?.market_price) {
      return { ok: false, error: res.error || 'Price data unavailable', code: res.code };
    }
    const mp = res.data.market_price;
    return { ok: true, data: { buyPrice: mp.buy_price, sellPrice: mp.sell_price, mid: mp.mid } };
  }
}

export const priceApi = new PriceApi();
