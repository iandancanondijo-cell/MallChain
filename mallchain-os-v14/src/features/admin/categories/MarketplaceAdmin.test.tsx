/**
 * The marketplace admin window's listings table.
 *
 * What this pins down, in the order it would hurt to get wrong:
 *
 *  1. Moderation reads through `/catalog/manage`, not the public catalog feed.
 *     The storefront route hard-filters to `status: 'active'`, so a window
 *     built on it could never show the paused and removed rows it exists to
 *     review — and would report "no listings" to an admin whose query was
 *     refused, which is the opposite of honest.
 *  2. Pause and Remove go through the seller's own PATCH/DELETE routes with
 *     moderator authority, so there is exactly one moderation surface to keep
 *     in sync with what a seller can do.
 *  3. Removal is a two-step action (row → modal → confirm). A single click
 *     that takes a seller's product off the storefront is not something this
 *     window should be able to do by accident.
 *  4. Prices are shown in MALL, the unit escrow settles in — never with a
 *     currency symbol in front of a token amount.
 *
 * Mounted through CategoryPage so a table that computes rows but fails to
 * render them still counts as a failure, the same way KycQueue.test.tsx does.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CategoryPage from './CategoryPage';
import { adminApi } from '../../../services/adminApi';
import { marketplaceCatalog, type ManagedListing } from '../../../services/marketplaceCatalog';
import { store } from '../../../store/store';

vi.mock('../../../services/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/adminApi')>();
  return {
    ...actual,
    adminApi: {
      ...actual.adminApi,
      getTreasuryLedger: vi.fn(),
      listMarketplaceEscrows: vi.fn(),
    },
  };
});

vi.mock('../../../services/marketplaceCatalog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../services/marketplaceCatalog')>();
  return {
    ...actual,
    marketplaceCatalog: {
      ...actual.marketplaceCatalog,
      manage: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  };
});

const ADDRESS = 'mall1nma8m9jl3e5mscr0rrn93hq43thw7ve6xfee4f';

function listing(over: Partial<ManagedListing> = {}): ManagedListing {
  return {
    id: '6520f0000000000000000001',
    name: 'Nairobi Roast Coffee — 500g',
    description: 'Single origin, whole bean.',
    seller: 'Safari Beans Co.',
    sellerAddress: ADDRESS,
    sellerUserId: 'user-1',
    price: 32.5,
    quantity: 12,
    img: '☕',
    cat: 'food',
    status: 'active',
    createdAt: '2026-11-01T08:00:00.000Z',
    updatedAt: '2026-11-02T08:00:00.000Z',
    ...over,
  };
}

const MANAGE_OK = {
  listings: [
    listing(),
    listing({ id: '6520f0000000000000000002', name: 'Maasai Beaded Bracelet', status: 'paused', img: '📿', cat: 'fashion' }),
    listing({ id: '6520f0000000000000000003', name: 'Counterfeit Sunglasses', status: 'removed', img: '🕶', cat: 'other' }),
  ],
  pagination: { page: 1, limit: 50, total: 12, pages: 1 },
  counts: { active: 9, paused: 2, removed: 1 },
  statuses: ['active', 'paused', 'removed'],
  categories: ['food', 'fashion'],
  currency: { denom: 'stake', display: 'MAL', decimals: 6 },
};

async function renderWindow() {
  vi.mocked(adminApi.getTreasuryLedger).mockResolvedValue({ ok: true, data: { entries: [] } } as never);
  vi.mocked(adminApi.listMarketplaceEscrows).mockResolvedValue({ ok: true, data: { escrows: [] } } as never);
  vi.mocked(marketplaceCatalog.manage).mockResolvedValue({ ok: true, data: MANAGE_OK } as never);

  render(<CategoryPage category="marketplace" />);
  await screen.findByText('Listings');
}

/** The row for one product, so an assertion cannot pass on the wrong seller's listing. */
function rowFor(name: string) {
  return within(screen.getByText(name).closest('tr') as HTMLElement);
}

beforeEach(() => {
  store.state.user.role = 'superadmin';
  store.state.user.adminCategory = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  store.state.user.role = 'user';
});

describe('Marketplace admin listings', () => {
  test('shows the paused and removed rows the storefront hides', async () => {
    await renderWindow();

    expect(screen.getByText('Nairobi Roast Coffee — 500g')).toBeTruthy();
    expect(screen.getByText('Maasai Beaded Bracelet')).toBeTruthy();
    expect(screen.getByText('Counterfeit Sunglasses')).toBeTruthy();
  });

  test('asks /catalog/manage for every status, not the active-only browse feed', async () => {
    await renderWindow();

    expect(marketplaceCatalog.manage).toHaveBeenCalledWith(expect.objectContaining({ status: 'all' }));
  });

  test('reports the whole-catalog census rather than a page count', async () => {
    await renderWindow();

    // Scoped to its own card: 9 is a count that appears elsewhere in a window
    // full of numbers, and a passing assertion there would prove nothing.
    // `parentElement`, not `closest('div')` — closest matches the label's own
    // div first, which is a sibling of the number, not its container.
    const card = within(screen.getByText('Listings in the catalog').parentElement as HTMLElement);
    expect(card.getByText('9')).toBeTruthy();
    expect(card.getByText('2 paused · 1 removed')).toBeTruthy();
  });

  test('prices a listing in MALL, the denom escrow holds', async () => {
    await renderWindow();

    expect(rowFor('Nairobi Roast Coffee — 500g').getByText('32.50 MALL')).toBeTruthy();
  });

  test('pauses through the seller route and restarts through the same one', async () => {
    await renderWindow();
    vi.mocked(marketplaceCatalog.update).mockResolvedValue({ ok: true, data: { listing: listing() } } as never);

    fireEvent.click(rowFor('Nairobi Roast Coffee — 500g').getByRole('button', { name: /Pause/i }));
    // The storefront's own partial-update route, with only the status key —
    // sending the whole listing would reset fields the moderator never touched.
    await waitFor(() =>
      expect(marketplaceCatalog.update).toHaveBeenCalledWith('6520f0000000000000000001', { status: 'paused' })
    );

    fireEvent.click(rowFor('Maasai Beaded Bracelet').getByRole('button', { name: /Restart/i }));
    await waitFor(() =>
      expect(marketplaceCatalog.update).toHaveBeenCalledWith('6520f0000000000000000002', { status: 'active' })
    );
  });

  test('removes only after a confirm, and never straight from the row', async () => {
    await renderWindow();
    vi.mocked(marketplaceCatalog.remove).mockResolvedValue({
      ok: true,
      data: { id: '6520f0000000000000000001', status: 'removed' },
    } as never);

    fireEvent.click(rowFor('Nairobi Roast Coffee — 500g').getByRole('button', { name: /Remove/i }));
    expect(marketplaceCatalog.remove).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /Confirm removal/i }));
    await waitFor(() => expect(marketplaceCatalog.remove).toHaveBeenCalledWith('6520f0000000000000000001'));
  });

  test("leaves a removed listing with nothing to click — restoring it is the seller's call", async () => {
    await renderWindow();

    const row = rowFor('Counterfeit Sunglasses');
    expect(row.queryByRole('button', { name: /Pause|Restart|Remove/i })).toBeNull();
  });

  test('says the query failed instead of "no listings" when moderation is refused', async () => {
    vi.mocked(marketplaceCatalog.manage).mockResolvedValue({
      ok: false,
      error: 'category access denied',
      code: 403,
    } as never);
    vi.mocked(adminApi.getTreasuryLedger).mockResolvedValue({ ok: true, data: { entries: [] } } as never);
    vi.mocked(adminApi.listMarketplaceEscrows).mockResolvedValue({ ok: true, data: { escrows: [] } } as never);

    render(<CategoryPage category="marketplace" />);

    expect(await screen.findByText('category access denied')).toBeTruthy();
    expect(screen.queryByText(/No listings match this filter/)).toBeNull();
  });

  test('re-queries with the chosen status when the filter changes', async () => {
    await renderWindow();

    fireEvent.change(screen.getByLabelText('Filter listings by status'), { target: { value: 'paused' } });
    await waitFor(() =>
      expect(marketplaceCatalog.manage).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'paused' }))
    );
  });
});
