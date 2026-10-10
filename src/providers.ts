import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parseCsv } from './csv.js';
import type { Provider } from './types.js';

/** Project root (the directory holding package.json), for both src/ and dist/. */
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_CSV_PATH = path.join(PROJECT_ROOT, 'carekaki_providers_demo.csv');

export function resolveCsvPath(): string {
  const configured = process.env.CAREKAKI_PROVIDERS_CSV?.trim();
  if (!configured) return DEFAULT_CSV_PATH;
  return path.isAbsolute(configured) ? configured : path.resolve(PROJECT_ROOT, configured);
}

function splitValues(value: unknown): string[] {
  return String(value ?? '')
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Port of the n8n "Prepare Provider Records" node: convert UTC-ish timestamps
 * into Malaysia calendar dates.
 */
export function normalizeDate(value: unknown): string {
  if (!value) return '';

  const text = String(value);

  // Already in YYYY-MM-DD format.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return '';

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kuala_Lumpur',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const fields: Record<string, string> = {};
  for (const part of parts) fields[part.type] = part.value;

  return `${fields.year}-${fields.month}-${fields.day}`;
}

function toProvider(row: Record<string, string>): Provider {
  return {
    provider_id: String(row.provider_id ?? ''),
    name: String(row.name ?? ''),
    location: String(row.location ?? ''),
    hourly_rate: Number(row.hourly_rate),
    rating: Number(row.rating),
    verified: row.verified === 'true' || String(row.verified).toLowerCase() === 'true',
    services: splitValues(row.services).map(s => s.toLowerCase()),
    languages: splitValues(row.languages),
    // Each CSV row carries exactly one availability window.
    availability: [
      {
        date: normalizeDate(row.available_date),
        start: String(row.available_from ?? ''),
        end: String(row.available_to ?? ''),
      },
    ],
  };
}

/**
 * Load and normalize providers. Cached at module scope: the v2 HTTP handler
 * rebuilds the McpServer per request, so the file is read once per process.
 */
let cache: { path: string; providers: Provider[] } | null = null;

export function loadProviders(csvPath = resolveCsvPath()): Provider[] {
  if (cache && cache.path === csvPath) return cache.providers;

  const rows = parseCsv(readFileSync(csvPath, 'utf8'));
  const required = ['provider_id', 'name', 'location', 'hourly_rate', 'rating', 'verified', 'services', 'languages', 'available_date', 'available_from', 'available_to'];
  if (!rows.length || required.some(key => !Object.hasOwn(rows[0]!, key))) {
    throw new Error('Provider CSV must contain data and all eleven required columns');
  }
  for (const row of rows.filter(row => row.provider_id)) {
    if (!row.hourly_rate?.trim() || !row.rating?.trim()) throw new Error(`Missing rate or rating for ${row.provider_id}`);
    const date = normalizeDate(row.available_date);
    const parsed = new Date(`${date}T00:00:00Z`);
    const time = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ||
        !time.test(row.available_from ?? '') || !(time.test(row.available_to ?? '') || row.available_to === '24:00') || row.available_from! >= row.available_to!) {
      throw new Error(`Invalid availability for ${row.provider_id}`);
    }
    if (!['true', 'false'].includes(String(row.verified).toLowerCase())) throw new Error(`Invalid verified flag for ${row.provider_id}`);
  }
  const providers = rows.filter(row => row.provider_id).map(toProvider);
  if (!providers.length) throw new Error('Provider CSV has no provider records');

  const ids = new Set<string>();
  for (const provider of providers) {
    if (ids.has(provider.provider_id)) throw new Error(`Duplicate provider_id: ${provider.provider_id}`);
    ids.add(provider.provider_id);
    if (!provider.location || !Number.isFinite(provider.hourly_rate) || provider.hourly_rate < 0 ||
        !Number.isFinite(provider.rating) || provider.rating < 0 || provider.rating > 5) {
      throw new Error(`Invalid provider data for ${provider.provider_id}: check location, hourly_rate and rating`);
    }
  }
  cache = { path: csvPath, providers };
  return providers;
}

/** Distinct, sorted locations actually present in the dataset. */
export function listLocations(providers: Provider[] = loadProviders()): string[] {
  return [...new Set(providers.map(p => p.location))].sort((a, b) => a.localeCompare(b));
}

/** Distinct, sorted service codes actually present in the dataset. */
export function listServiceCodes(providers: Provider[] = loadProviders()): string[] {
  return [...new Set(providers.flatMap(p => p.services))].sort((a, b) => a.localeCompare(b));
}
