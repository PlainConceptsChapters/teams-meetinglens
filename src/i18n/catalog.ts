import { createRequire } from 'node:module';

type Catalog = Record<string, unknown>;

const require = createRequire(import.meta.url);
const cache = new Map<string, Catalog>();

const loadCatalog = (language: string): Catalog => {
  if (cache.has(language)) {
    return cache.get(language) ?? {};
  }
  let catalog: Catalog = {};
  try {
    catalog = require(`./${language}.json`) as Catalog;
  } catch {
    catalog = {};
  }
  cache.set(language, catalog);
  return catalog;
};

export const getI18nCatalog = (language: string): Catalog => {
  if (!language) {
    return loadCatalog('en');
  }
  return loadCatalog(language);
};
