/** Small RFC4180-style reader: quotes, commas, escaped quotes, BOM, CRLF and embedded newlines. */
export function parseCsv(text: string): Record<string, string>[] {
  const clean = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let closedQuote = false;
  function finishRow() {
    row.push(field);
    if (row.some(value => value.trim() !== "")) rows.push(row);
    row = [];
    field = "";
    closedQuote = false;
  }
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closedQuote = true; }
      } else field += ch;
    } else if (closedQuote && ![",", "\r", "\n"].includes(ch)) {
      throw new Error("Unexpected characters after closing CSV quote");
    } else if (ch === '"') {
      if (field !== "") throw new Error("Unexpected quote in CSV field");
      quoted = true;
    } else if (ch === ",") {
      row.push(field); field = ""; closedQuote = false;
    } else if (ch === "\r" || ch === "\n") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      finishRow();
    } else field += ch;
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  if (row.length || field !== "") finishRow();
  if (!rows.length) return [];
  const header = rows[0]!.map(value => value.trim());
  if (new Set(header).size !== header.length || header.some(h => !h)) throw new Error("Invalid or duplicate CSV column headers");
  return rows.slice(1).map((values, index) => {
    if (values.length !== header.length) throw new Error(`CSV record ${index + 2} has ${values.length} fields; expected ${header.length}`);
    return Object.fromEntries(header.map((key, i) => [key, values[i]!.trim()]));
  });
}
