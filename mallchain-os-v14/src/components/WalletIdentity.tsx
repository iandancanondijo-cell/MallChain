import { useEffect, useReducer, useState } from 'react';
import { store } from '../store/store';
import { resolveAssetUrl } from '../services/assets';
import { formatAddressForDisplay } from '../services/wallet';
import { identityFor, requestIdentities, subscribeToIdentities, type WalletIdentity } from '../services/identityApi';
import './WalletIdentity.css';

/**
 * The one place that decides how a person's picture is shown.
 *
 * Three surfaces already needed this rule (the menu bar, the Profile card and
 * every transaction row), and each had written it slightly differently — so a
 * dead avatar path left a broken circle in one place and initials in another.
 * The rule is: a picture is shown when there are bytes to show, and initials
 * when there are not. `onError` is part of that contract, not decoration: a
 * stored path is a claim about a file, not proof that the file is there.
 */
export function AccountPicture({
  avatarUrl,
  name,
  initial,
  size = 32,
  className = '',
}: {
  avatarUrl?: string | null;
  name?: string | null;
  initial?: string | null;
  /** Rendered box size in px; the CSS class keeps the gradient and weight. */
  size?: number;
  className?: string;
}) {
  const asset = resolveAssetUrl(avatarUrl);
  const [broken, setBroken] = useState(false);
  // A new picture on the account invalidates the previous "it would not load".
  const [seenUrl, setSeenUrl] = useState(avatarUrl);
  if (seenUrl !== avatarUrl) {
    setSeenUrl(avatarUrl);
    setBroken(false);
  }

  if (asset && !broken) {
    return (
      <img
        className={`avatar avatar-img ${className}`.trim()}
        style={{ width: size, height: size }}
        src={asset.url}
        alt=""
        role="img"
        onError={() => setBroken(true)}
      />
    );
  }
  const letter = (initial || (name || '').trim().charAt(0) || '?').toUpperCase();
  return (
    <div className={`avatar ${className}`.trim()} style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }} aria-hidden="true">
      {letter}
    </div>
  );
}

/**
 * Ask for the accounts behind a set of addresses. Answers arrive asynchronously
 * and are cached module-wide, so a screen of twenty rows costs one request.
 */
export function useWalletIdentities(addresses: Array<string | null | undefined>): void {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  // Re-request only when the set actually changes; the rows themselves re-render
  // from the module cache as answers land.
  const key = addresses.map((a) => (a || '').trim()).filter(Boolean).sort().join('|');

  useEffect(() => {
    const unsubscribe = subscribeToIdentities(rerender);
    requestIdentities(key ? key.split('|') : []);
    return unsubscribe;
  }, [key]);
}

export interface AddressIdentityProps {
  /** The wallet address on the row — what the picture is looked up for. */
  address: string | null | undefined;
  /** Which end of the transfer this is, for the accessible name ("To" / "From"). */
  label?: string;
  size?: number;
  /** Render the shortened address beside the picture. Turn off where the row
   *  already prints it and only the face is wanted. */
  showAddress?: boolean;
}

/**
 * A wallet address, with the picture of the account it is registered to when
 * the account has one and has not hidden its profile.
 *
 * Deliberately quiet in the two cases where nothing is known: an address with
 * no answer yet, and an address the server refused to name, both render the
 * address alone. Nothing here invents a face, an initial, or a name for a
 * stranger — the picture is the account's own, uploaded under Profile &
 * Settings, and showing it on someone else's transaction list is exactly what
 * their privacy switch decides.
 */
export function AddressIdentity({ address, label, size = 20, showAddress = true }: AddressIdentityProps) {
  const clean = (address || '').trim();
  useWalletIdentities([clean]);

  if (!clean) return null;

  const ownAddress = (store.state.wallet.address || '').trim();
  const isOwn = !!ownAddress && clean === ownAddress;
  const identity: WalletIdentity | null | undefined = identityFor(clean);

  // Own address: the account's picture is already mirrored in the store from
  // /api/auth/me, so this row is right on first paint instead of a frame later.
  const displayName = isOwn
    ? (store.state.user.name || store.state.user.email || null)
    : (identity?.displayName ?? null);
  const avatarUrl = isOwn ? store.state.user.avatarUrl : (identity?.avatarUrl ?? null);

  const title = `${label ? `${label}: ` : ''}${clean}`;
  // An address nobody has claimed stays bare text. A placeholder circle would
  // read as "this is someone who chose not to show a face", which is a claim
  // about an account this lookup was told nothing about.
  const hasFace = !!avatarUrl || !!displayName;
  return (
    <span className="wi-chip" title={title}>
      {hasFace && (
        <AccountPicture avatarUrl={avatarUrl} name={displayName} initial={displayName?.charAt(0)} size={size} className="wi-avatar" />
      )}
      {displayName && <span className="wi-name">{displayName}</span>}
      {showAddress && <span className="wi-address mono">{formatAddressForDisplay(clean)}</span>}
    </span>
  );
}

export default AddressIdentity;
