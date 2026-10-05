/**
 * SEO Utilities
 * Manages meta tags, structured data, and SEO compliance
 * 
 * Usage:
 * updateSEO({
 *   title: 'Buy Crypto on Mallchain',
 *   description: 'Secure marketplace for trading',
 *   keywords: 'crypto, marketplace, trading'
 * });
 */

export interface SEOConfig {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
  twitterCreator?: string;
  canonicalUrl?: string;
  robots?: string;
  structured?: Record<string, any>;
}

/**
 * Update page meta tags for SEO
 */
export function updateSEO(config: SEOConfig) {
  // Title
  if (config.title) {
    document.title = config.title;
    updateMetaTag('og:title', config.ogTitle || config.title);
    updateMetaTag('twitter:title', config.title);
  }

  // Description
  if (config.description) {
    updateMetaTag('description', config.description);
    updateMetaTag('og:description', config.ogDescription || config.description);
    updateMetaTag('twitter:description', config.description);
  }

  // Keywords
  if (config.keywords) {
    updateMetaTag('keywords', config.keywords);
  }

  // Open Graph
  if (config.ogImage) {
    updateMetaTag('og:image', config.ogImage);
    updateMetaTag('twitter:image', config.ogImage);
  }

  if (config.ogUrl) {
    updateMetaTag('og:url', config.ogUrl);
  }

  // Twitter Card
  if (config.twitterCard) {
    updateMetaTag('twitter:card', config.twitterCard);
  }

  if (config.twitterCreator) {
    updateMetaTag('twitter:creator', config.twitterCreator);
  }

  // Canonical URL
  if (config.canonicalUrl) {
    updateCanonicalTag(config.canonicalUrl);
  }

  // Robots
  if (config.robots) {
    updateMetaTag('robots', config.robots);
  }

  // Structured Data (JSON-LD)
  if (config.structured) {
    updateStructuredData(config.structured);
  }
}

/**
 * Update or create meta tag
 */
function updateMetaTag(property: string, content: string) {
  const isProperty = property.startsWith('og:') || property.startsWith('twitter:');
  const selector = isProperty
    ? `meta[property="${property}"]`
    : `meta[name="${property}"]`;

  let tag = document.querySelector(selector) as HTMLMetaElement | null;

  if (!tag) {
    tag = document.createElement('meta');
    if (isProperty) {
      tag.setAttribute('property', property);
    } else {
      tag.setAttribute('name', property);
    }
    document.head.appendChild(tag);
  }

  tag.content = content;
}

/**
 * Update canonical URL
 */
function updateCanonicalTag(url: string) {
  let tag = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;

  if (!tag) {
    tag = document.createElement('link');
    tag.rel = 'canonical';
    document.head.appendChild(tag);
  }

  tag.href = url;
}

/**
 * Update structured data (JSON-LD)
 */
function updateStructuredData(data: Record<string, any>) {
  // Remove existing structured data script
  const existing = document.querySelector('script[type="application/ld+json"]');
  if (existing) {
    existing.remove();
  }

  // Create new structured data script
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    ...data,
  });
  document.head.appendChild(script);
}

/**
 * SEO presets for common pages
 */
export const SEO_PRESETS = {
  landing: {
    title: 'Mallchain — Web3 Marketplace & Digital Asset Trading',
    description: 'Secure, decentralized marketplace for buying, selling, and trading digital assets on the Mallchain network.',
    keywords: 'mallchain, marketplace, crypto, trading, blockchain, web3',
    twitterCard: 'summary_large_image' as const,
    robots: 'index, follow',
    structured: {
      '@type': 'Organization',
      name: 'Mallchain',
      url: window.location.origin,
      description: 'Web3 marketplace and digital asset platform',
      sameAs: [
        'https://twitter.com/mallchain',
        'https://discord.gg/mallchain',
      ],
    },
  },

  dashboard: {
    title: 'Dashboard · Mallchain',
    description: 'Manage your portfolio, wallets, and assets on Mallchain.',
    robots: 'noindex, nofollow', // Private dashboard
  },

  marketplace: {
    title: 'Marketplace · Mallchain',
    description: 'Browse and trade digital assets securely on Mallchain\'s decentralized marketplace.',
    keywords: 'marketplace, buy, sell, trade, assets, crypto',
    structured: {
      '@type': 'CollectionPage',
      name: 'Mallchain Marketplace',
      description: 'Decentralized marketplace for digital assets',
    },
  },

  wallet: {
    title: 'Wallet · Mallchain',
    description: 'Secure wallet for managing your Mallchain assets and crypto.',
    keywords: 'wallet, crypto, assets, blockchain, secure',
    robots: 'noindex, nofollow', // Private wallet
  },

  staking: {
    title: 'Staking · Mallchain',
    description: 'Stake your assets and earn rewards on the Mallchain network.',
    keywords: 'staking, rewards, earn, validators, blockchain',
    structured: {
      '@type': 'WebPage',
      name: 'Staking',
      description: 'Stake assets and earn network rewards',
    },
  },

  help: {
    title: 'Help Center · Mallchain',
    description: 'Support, guides, and FAQs for Mallchain users.',
    keywords: 'help, support, faq, guides, documentation',
    structured: {
      '@type': 'FAQPage',
      mainEntity: [],
    },
  },
};

/**
 * Get SEO config for route
 */
export function getSEOForRoute(path: string): SEOConfig {
  const cleanPath = path.split('?')[0].split('#')[0];

  if (cleanPath === '/') return SEO_PRESETS.landing;
  if (cleanPath === '/dashboard' || cleanPath === '/activity') return SEO_PRESETS.dashboard;
  if (cleanPath.startsWith('/marketplace')) return SEO_PRESETS.marketplace;
  if (cleanPath.startsWith('/wallet')) return SEO_PRESETS.wallet;
  if (cleanPath.startsWith('/staking')) return SEO_PRESETS.staking;
  if (cleanPath.startsWith('/help') || cleanPath.startsWith('/edu')) return SEO_PRESETS.help;

  return {
    title: 'Mallchain',
    robots: 'index, follow',
  };
}

/**
 * Generate canonical URL
 */
export function generateCanonicalUrl(path: string): string {
  const base = window.location.origin;
  const cleanPath = path.split('?')[0];
  return `${base}/#${cleanPath}`;
}

/**
 * Schema for product listing
 */
export function createProductSchema(product: {
  name: string;
  description: string;
  price: number;
  currency: string;
  image?: string;
  seller?: string;
  rating?: number;
  reviewCount?: number;
}): Record<string, any> {
  return {
    '@type': 'Product',
    name: product.name,
    description: product.description,
    image: product.image,
    offers: {
      '@type': 'Offer',
      price: product.price,
      priceCurrency: product.currency,
      seller: {
        '@type': 'Person',
        name: product.seller || 'Seller',
      },
    },
    ...(product.rating && {
      aggregateRating: {
        '@type': 'AggregateRating',
        ratingValue: product.rating,
        reviewCount: product.reviewCount || 1,
      },
    }),
  };
}

/**
 * Schema for breadcrumb navigation
 */
export function createBreadcrumbSchema(items: Array<{ name: string; url: string }>): Record<string, any> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

/**
 * Open Graph defaults
 */
export const DEFAULT_OG_IMAGE = `${window.location.origin}/og-image.png`;

/**
 * Twitter Card defaults
 */
export const DEFAULT_TWITTER_CREATOR = '@mallchain';
