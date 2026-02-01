import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

type Catalog = Record<string, unknown>;

const require = createRequire(import.meta.url);
const cache = new Map<string, Catalog>();

const readCatalogFromDisk = (language: string): Catalog => {
  const root = path.resolve(process.cwd(), 'src', 'i18n');
  const filePath = path.join(root, `${language}.json`);
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as Catalog;
  } catch {
    return {};
  }
};

const loadCatalog = (language: string): Catalog => {
  if (cache.has(language)) {
    return cache.get(language) ?? {};
  }
  let catalog: Catalog = {};
  try {
    catalog = require(`./${language}.json`) as Catalog;
  } catch {
    catalog = readCatalogFromDisk(language);
  }
  cache.set(language, catalog);
  return catalog;
};

export const getI18nCatalog = (language: string): Catalog => {
  if (!language) {
    return loadCatalog('en');
  }
  const normalized = language.toLowerCase();
  const catalog = loadCatalog(normalized);
  if (Object.keys(catalog).length) {
    return catalog;
  }
  if (normalized.includes('-')) {
    const base = normalized.split('-')[0] ?? 'en';
    const fallback = loadCatalog(base);
    if (Object.keys(fallback).length) {
      return fallback;
    }
  }
  return loadCatalog('en');
};
