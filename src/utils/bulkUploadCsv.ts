// Windows-1252 code points for bytes 0x80-0x9F that differ from Latin-1
// (where those bytes are unprintable C1 control codes). This is what
// Excel on Windows actually writes for "CSV (Comma delimited)" — e.g. an
// em dash (—) is byte 0x97 — since it saves in the system codepage, not
// UTF-8, unless the admin explicitly picks "CSV UTF-8".
const WINDOWS_1252_EXTRA: Record<number, number> = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026,
  0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160,
  0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019,
  0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
  0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153,
  0x9e: 0x017e, 0x9f: 0x0178,
};

const decodeWindows1252 = (buf: Buffer): string => {
  let out = "";
  for (const byte of buf) {
    out += String.fromCharCode(WINDOWS_1252_EXTRA[byte] ?? byte);
  }
  return out;
};

// Decodes a CSV file's raw bytes as UTF-8 when it genuinely is UTF-8
// (verified by round-tripping — a real UTF-8 buffer always re-encodes to
// the exact same bytes), and falls back to Windows-1252 otherwise. Without
// this, a CSV re-saved from Excel on Windows (which defaults to the system
// codepage, not UTF-8) turns every em dash / curly quote / accented
// character into "�" once naively decoded as UTF-8.
const decodeCsvBuffer = (buf: Buffer): string => {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }
  const utf8Decoded = buf.toString("utf8");
  if (Buffer.from(utf8Decoded, "utf8").equals(buf)) {
    return utf8Decoded;
  }
  return decodeWindows1252(buf);
};

// Minimal RFC4180-style CSV parser used by every bulk-upload route instead
// of SheetJS for .csv files. SheetJS's CSV reader auto-detects date/number
// -looking text and silently converts it (even a plain "1/1/2027" becomes
// an Excel serial number, parsed via the machine's local timezone), which
// corrupts values before route-specific parsing ever sees them. CSV cells
// are always plain text, so there's no serial-number ambiguity to justify
// that — every cell here stays exactly the string the admin typed.
export const parseCsvRows = (buffer: Buffer): Record<string, string>[] => {
  const text = decodeCsvBuffer(buffer);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      if (text[i + 1] !== "\n") {
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      }
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmptyRows = rows.filter((r) => r.some((cell) => cell.trim() !== ""));
  if (nonEmptyRows.length === 0) return [];

  const headers = nonEmptyRows[0];
  return nonEmptyRows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, idx) => {
      obj[header] = r[idx] ?? "";
    });
    return obj;
  });
};
