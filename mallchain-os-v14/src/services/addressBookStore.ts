/**
 * Shared reader for the address book, persisted client-side only (there is
 * no backend endpoint for this — see pages/AddressBook.tsx, which owns
 * writes). Extracted so WalletSend's recipient-field autocomplete can read
 * the same entries without duplicating the storage key/shape or depending
 * on AddressBook.tsx's page component (which only default-exports the page,
 * not this data access).
 */
export interface AddressEntry {
  id: string;
  label: string;
  address: string;
  network: 'mainnet' | 'devnet' | 'testnet';
  createdAt: number;
}

export const ADDRESS_BOOK_STORAGE_KEY = 'mallchain_address_book';

export function loadAddressBook(): AddressEntry[] {
  try {
    const saved = localStorage.getItem(ADDRESS_BOOK_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}
