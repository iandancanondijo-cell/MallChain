type StoredItem = Record<string, any>;

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

const getStorageKey = (base: string, userId?: string) => userId ? `${base}_${userId}` : base;

const safeParse = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export const getCart = (userId?: string): StoredItem[] => {
  if (!isBrowser) return [];
  const key = getStorageKey('cart', userId);
  return safeParse<StoredItem[]>(window.localStorage.getItem(key)) || [];
};

export const setCart = (cart: StoredItem[], userId?: string): StoredItem[] => {
  if (!isBrowser) return cart;
  const key = getStorageKey('cart', userId);
  window.localStorage.setItem(key, JSON.stringify(cart));
  return cart;
};

export const addToCart = (item: StoredItem, userId?: string): StoredItem[] => {
  const cart = getCart(userId);
  const existing = cart.find((entry) => entry.id === item.id);

  if (existing) {
    existing.quantity = Math.max(1, (existing.quantity || 1) + (item.quantity || 1));
  } else {
    cart.push({ ...item, quantity: item.quantity || 1 });
  }

  setCart(cart, userId);
  return cart;
};

export const getWishlist = (userId?: string): StoredItem[] => {
  if (!isBrowser) return [];
  const key = getStorageKey('wishlist', userId);
  return safeParse<StoredItem[]>(window.localStorage.getItem(key)) || [];
};

export const setWishlist = (wishlist: StoredItem[], userId?: string): StoredItem[] => {
  if (!isBrowser) return wishlist;
  const key = getStorageKey('wishlist', userId);
  window.localStorage.setItem(key, JSON.stringify(wishlist));
  return wishlist;
};

export const addToWishlist = (item: StoredItem, userId?: string): StoredItem[] => {
  const wishlist = getWishlist(userId);
  const exists = wishlist.some((entry) => entry.id === item.id);

  if (!exists) {
    wishlist.push(item);
    setWishlist(wishlist, userId);
  }

  return wishlist;
};

export const removeFromWishlist = (itemId: string, userId?: string): StoredItem[] => {
  const wishlist = getWishlist(userId).filter((item) => item.id !== itemId);
  setWishlist(wishlist, userId);
  return wishlist;
};
