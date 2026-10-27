import type { Guest } from '../types';

// Reads a guest sheet (.csv or .xlsx) into guests. Columns: No, Name, Contact, Email,
// Address 1, Address 2, Pincode. Any of them may be blank; the planner fills gaps in the table.

export const TEMPLATE_HEADERS = ['No', 'Name', 'Contact', 'Email', 'Address 1 - Building Name or Flat Number', 'Address 2 - Street Name, Road Name, Locality', 'Pincode'];
export const MAX_GUEST_ENTRIES = 1500;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

type Field = 'no' | 'name' | 'contact' | 'email' | 'a1' | 'a2' | 'pin';
const FIELDS: Field[] = ['no', 'name', 'contact', 'email', 'a1', 'a2', 'pin'];

/** Which column a header cell belongs to, by its wording. */
function fieldFor(header: string): Field | null {
  const h = header.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!h) return null;
  if (/^(no|sr no|s no|sl no|serial|serial no|number|#)$/.test(h)) return 'no';
  if (/(^| )(address|addr) ?(line )?(1|one)\b/.test(h)) return 'a1';
  if (/(^| )(address|addr) ?(line )?(2|two)\b/.test(h)) return 'a2';
  if (/pin ?code|postal|zip/.test(h) || h === 'pin') return 'pin';
  if (/e ?mail/.test(h)) return 'email';
  if (/contact|phone|mobile|whatsapp|cell/.test(h)) return 'contact';
  if (/name/.test(h)) return 'name';
  return null;
}

const clean = (v: unknown) => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v); // keeps 411045 and 9876543210 as written
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\s+/g, ' ').trim().slice(0, 200);
};

/** RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      rows.push(row); row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Reads the first sheet of a .csv or .xlsx file as rows of cells. */
export async function readSheetRows(file: File): Promise<unknown[][]> {
  if (file.size > MAX_FILE_BYTES) throw new Error('That file is over 2 MB. Split it into smaller sheets.');
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') return parseCsv(await file.text());
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser');
    return (await readSheet(file)) as unknown[][];
  }
  throw new Error('Upload a .xlsx or .csv file. For an older .xls file, save it as .xlsx first.');
}

export interface ImportResult {
  /** New guests to append: rows with details first, then number-only placeholders. */
  guests: Guest[];
  /** Rows in the sheet that had something in them (details or just a number). */
  total: number;
  /** Rows already on the list (same name and contact), left out. */
  duplicates: number;
}

const dupKey = (g: { n: string; contact?: string; email?: string }) => `${g.n.toLowerCase()}|${(g.contact || g.email || '').toLowerCase()}`;

/** Turns sheet rows into guests. Half-filled rows are kept, number-only rows become blank entries at the end. */
export function rowsToGuests(rows: unknown[][], existing: Guest[]): ImportResult {
  const grid = rows.map((r) => r.map(clean));
  // The header row is the first one that mentions a name column. Without one, assume the template order.
  const headerAt = grid.findIndex((r) => r.some((c) => fieldFor(c) === 'name'));
  const col: Partial<Record<Field, number>> = {};
  if (headerAt >= 0) grid[headerAt].forEach((c, i) => { const f = fieldFor(c); if (f && col[f] === undefined) col[f] = i; });
  else FIELDS.forEach((f, i) => { col[f] = i; });
  const get = (r: string[], f: Field) => (col[f] === undefined ? '' : r[col[f]!] ?? '');

  const seen = new Set(existing.map((g) => dupKey({ n: g.n, contact: g.contact, email: g.email })));
  const withData: Guest[] = [];
  const blanks: Guest[] = [];
  let total = 0;
  let duplicates = 0;
  for (const r of grid.slice(headerAt + 1)) {
    const g: Guest = { n: get(r, 'name'), p: 1, r: 'Awaiting', d: '', g: '', contact: get(r, 'contact'), email: get(r, 'email'), a1: get(r, 'a1'), a2: get(r, 'a2'), pin: get(r, 'pin') };
    const hasData = !!(g.n || g.contact || g.email || g.a1 || g.a2 || g.pin);
    if (!hasData && !get(r, 'no')) continue; // an empty row with no number: nothing to add
    total++;
    if (!hasData) { blanks.push(g); continue; }
    const key = dupKey(g);
    if (seen.has(key)) { duplicates++; continue; }
    seen.add(key);
    withData.push(g);
  }
  return { guests: [...withData, ...blanks], total, duplicates };
}

/** CSV text for the downloadable template. */
export function templateCsv(): string {
  return TEMPLATE_HEADERS.map((h) => (h.includes(',') ? `"${h}"` : h)).join(',') + '\n';
}
