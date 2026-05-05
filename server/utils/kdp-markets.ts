// [Fix17] Catálogo de los 8 mercados Amazon KDP soportados por el optimizador.

export interface KdpMarket {
  id: string;
  name: string;
  locale: string;
  langCode: string;
  currency: string;
  domain: string;
}

export const KDP_MARKETS: KdpMarket[] = [
  { id: "us", name: "Amazon.com (US)",      locale: "English (US)", langCode: "en", currency: "USD", domain: "amazon.com" },
  { id: "uk", name: "Amazon.co.uk (UK)",    locale: "English (UK)", langCode: "en", currency: "GBP", domain: "amazon.co.uk" },
  { id: "de", name: "Amazon.de (Germany)",  locale: "Deutsch",       langCode: "de", currency: "EUR", domain: "amazon.de" },
  { id: "es", name: "Amazon.es (Spain)",    locale: "Español",       langCode: "es", currency: "EUR", domain: "amazon.es" },
  { id: "fr", name: "Amazon.fr (France)",   locale: "Français",      langCode: "fr", currency: "EUR", domain: "amazon.fr" },
  { id: "it", name: "Amazon.it (Italy)",    locale: "Italiano",      langCode: "it", currency: "EUR", domain: "amazon.it" },
  { id: "br", name: "Amazon.com.br (Brazil)", locale: "Português",   langCode: "pt", currency: "BRL", domain: "amazon.com.br" },
  { id: "mx", name: "Amazon.com.mx (Mexico)", locale: "Español",     langCode: "es", currency: "MXN", domain: "amazon.com.mx" },
];

export function findMarket(id: string): KdpMarket | undefined {
  return KDP_MARKETS.find(m => m.id === id);
}

export function findMarketByDomain(domain: string): KdpMarket | undefined {
  return KDP_MARKETS.find(m => m.domain === domain.toLowerCase());
}
