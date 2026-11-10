/**
 * Showing who owns a wallet address — and refusing to guess.
 *
 *  - A row for a stranger never grows an invented name or initial. The picture
 *    belongs to the account that uploaded it under Profile & Settings, and the
 *    server withholds it when that account hides its profile.
 *  - The account's own address renders from the store on first paint, because a
 *    person should not watch their own avatar pop in a frame late.
 *  - A stored avatar path is a claim about a file. When the file is gone the
 *    chip falls back to initials instead of leaving a broken image.
 *  - Twenty rows on a screen are one request, not twenty.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AddressIdentity, AccountPicture } from './WalletIdentity';
import { store } from '../store/store';
import { clearIdentityCache } from '../services/identityApi';

const post = vi.hoisted(() => vi.fn());
vi.mock('../services/api', () => ({ api: { post } }));

const MINE = 'mall1ownownownownownownownownownownownown0000';
const THEIRS = 'mall1counterpartycounterpartycounterparty00';
const UNKNOWN = 'mall1nobodynobodynobodynobodynobodynobody0';

function resolvePost(map: Record<string, unknown>) {
  post.mockImplementation((_path: string, body: { addresses: string[] }) =>
    Promise.resolve({
      ok: true,
      // The route's envelope: api.ts hands the parsed body straight back, so
      // the answers sit one level below it.
      data: {
        ok: true,
        data: Object.fromEntries(body.addresses.map((a) => [a, map[a] ?? null])),
      },
    }));
}

beforeEach(() => {
  post.mockReset();
  resolvePost({});
  clearIdentityCache();
  store.state.user.authed = true;
  store.state.user.id = 'u-owner';
  store.state.user.name = 'Ada Lovelace';
  store.state.user.avatarUrl = '/uploads/avatars/ada.png';
  store.state.wallet.address = MINE;
});

afterEach(() => {
  cleanup();
  clearIdentityCache();
  store.state.user.authed = false;
  store.state.user.id = '';
  store.state.user.name = '';
  store.state.user.avatarUrl = null;
  store.state.wallet.address = '';
});

describe('AddressIdentity', () => {
  it('renders the address alone before the lookup answers', () => {
    const { container } = render(<AddressIdentity address={THEIRS} label="To" />);

    expect(container.querySelector('.wi-name')).toBeNull();
    expect(screen.getByText('mall1c...arty00')).toBeInTheDocument();
    // Not even a placeholder circle: an invented face for a stranger is a
    // fabricated fact, and a grey one implies a privacy choice nobody made.
    expect(container.querySelector('.avatar')).toBeNull();
  });

  it('shows nothing at all without an address', () => {
    const { container } = render(<AddressIdentity address="" label="To" />);
    expect(container.firstChild).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('shows the name and picture the server reported', async () => {
    resolvePost({ [THEIRS]: { displayName: 'Grace H.', avatarUrl: '/uploads/avatars/grace.png' } });

    const { container } = render(<AddressIdentity address={THEIRS} label="To" />);
    await waitFor(() => expect(screen.getByText('Grace H.')).toBeInTheDocument());

    const img = container.querySelector('img.avatar') as HTMLImageElement;
    expect(img.src).toContain('/api/uploads/avatars/grace.png');
    // The address stays beside the face — a name must not replace it.
    expect(screen.getByText('mall1c...arty00')).toBeInTheDocument();
  });

  it('keeps the address alone when the account is not publicly named', async () => {
    resolvePost({ [THEIRS]: null });
    const { container } = render(<AddressIdentity address={THEIRS} label="To" />);

    await waitFor(() => expect(post).toHaveBeenCalled());

    expect(container.querySelector('.wi-name')).toBeNull();
    expect(container.querySelector('img.avatar')).toBeNull();
    expect(container.querySelector('.avatar')).toBeNull();
    expect(post).toHaveBeenCalledWith('/api/identity/resolve', { addresses: [THEIRS] });
  });

  it('names the signed-in account from the store without waiting', () => {
    const { container } = render(<AddressIdentity address={MINE} label="From" />);

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect((container.querySelector('img.avatar') as HTMLImageElement).src).toContain('/api/uploads/avatars/ada.png');
  });

  it('asks for every address on the screen in one call', async () => {
    render(
      <div>
        <AddressIdentity address={THEIRS} label="To" />
        <AddressIdentity address={UNKNOWN} label="From" />
        <AddressIdentity address={THEIRS} label="To" />
      </div>,
    );

    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(post.mock.calls[0][1].addresses).toEqual([THEIRS, UNKNOWN]);
  });

  it('hides the address text where the row already prints it', async () => {
    resolvePost({ [THEIRS]: { displayName: 'Grace H.', avatarUrl: null } });
    const { container } = render(<AddressIdentity address={THEIRS} label="To" showAddress={false} />);
    await waitFor(() => expect(screen.getByText('Grace H.')).toBeInTheDocument());
    expect(container.querySelector('.wi-address')).toBeNull();
  });

  it('names the chip with its side of the transfer and the full address', () => {
    render(<AddressIdentity address={THEIRS} label="To" />);
    expect(screen.getByTitle(`To: ${THEIRS}`)).toBeInTheDocument();
  });
});

describe('AccountPicture', () => {
  it('falls back to an initial when the stored picture is gone', () => {
    const { container } = render(<AccountPicture avatarUrl="/uploads/avatars/ada.png" name="Ada Lovelace" size={24} />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img).toBeInTheDocument();

    fireEvent.error(img);

    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('A');
  });

  it('takes the caller-supplied initial over one derived from the name', () => {
    const { container } = render(<AccountPicture name="Ada" initial="GL" />);
    expect(container.textContent).toBe('GL');
  });

  it('shows initials, not an empty circle, for a path that was never usable', () => {
    const { container } = render(<AccountPicture avatarUrl="javascript:alert(1)" name="Ada" />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('A');
  });

  it('is a question mark when there is nothing to show', () => {
    const { container } = render(<AccountPicture />);
    expect(container.textContent).toBe('?');
  });
});
