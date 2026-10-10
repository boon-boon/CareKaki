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

/** Normalize spreadsheet-friendly H:mm into the canonical HH:mm format. */
export function normalizeTime(value: unknown): string {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(String(value ?? '').trim());
  if (!match) return '';
  const hour = Number(match[1]);
  if (hour > 24 || (hour === 24 && match[2] !== '00')) return '';
  return String(hour).padStart(2, '0') + ':' + match[2];
}

function toProvider(row: Record<string, string>): Provider {
  return {
    provider_id: String(row.provider_id ?? ''),
    name: String(row.name ?? ''),
    location: String(row.location ?? ''),
    hourly_rate: Number(row.hourly_rate),
    rating: Number(row.rating),
    verified: String(row.verified).toLowerCase() === 'true',
    services: splitValues(row.services).map(s => s.toLowerCase()),
    languages: splitValues(row.languages),
    availability: [{
      date: normalizeDate(row.available_date),
      start: normalizeTime(row.available_from),
      end: normalizeTime(row.available_to),
    }],
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
    const from = normalizeTime(row.available_from);
    const to = normalizeTime(row.available_to);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ||
        !from || !to || from === '24:00' || from >= to) {
      throw new Error(`Invalid availability for ${row.provider_id}`);
    }
    if (!['true', 'false'].includes(String(row.verified).toLowerCase())) throw new Error(`Invalid verified flag for ${row.provider_id}`);
  }
  const grouped = new Map<string, Provider>();
  for (const row of rows.filter(row => row.provider_id)) {
    const incoming = toProvider(row);
    const existing = grouped.get(incoming.provider_id);
    if (!existing) {
      grouped.set(incoming.provider_id, incoming);
      continue;
    }
    if (existing.name !== incoming.name || existing.location !== incoming.location ||
        existing.hourly_rate !== incoming.hourly_rate || existing.rating !== incoming.rating ||
        existing.verified !== incoming.verified ||
        JSON.stringify(existing.services) !== JSON.stringify(incoming.services) ||
        JSON.stringify(existing.languages) !== JSON.stringify(incoming.languages)) {
      throw new Error(`Conflicting provider details for ${incoming.provider_id}`);
    }
    for (const slot of incoming.availability) {
      if (!existing.availability.some(x => x.date === slot.date && x.start === slot.start && x.end === slot.end)) {
        existing.availability.push(slot);
      }
    }
  }
  const providers = [...grouped.values()];
  if (!providers.length) throw new Error('Provider CSV has no provider records');

  for (const provider of providers) {
    provider.availability.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
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
