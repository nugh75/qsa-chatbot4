// Utility to sanitize and normalize markdown produced by LLM so tables render correctly
// Fixes issues: stray triple quotes, malformed table separators, embedded <br/> inside table rows, duplicated header separator rows.

export function sanitizeChatMarkdown(raw: string): string {
  if (!raw) return '';
  let txt = raw.trim();

  // 1. Remove wrapping triple quotes (""" ... """ or ``` ... ```)
  if (/^"""[\s\S]*"""$/.test(txt)) {
    txt = txt.replace(/^"""/, '').replace(/"""$/, '').trim();
  }
  if (/^```[a-zA-Z0-9]*[\s\S]*```$/.test(txt)) {
    txt = txt.replace(/^```[a-zA-Z0-9]*\n?/, '').replace(/```$/, '').trim();
  }

  // 2. Normalize Windows line endings
  txt = txt.replace(/\r\n?/g, '\n');

  // 3. Collapse multiple blank lines to max 2 (avoid huge gaps)
  txt = txt.replace(/\n{3,}/g, '\n\n');

  // 4. Attempt to repair tables.
  txt = fixTables(txt);

  return txt.trim();
}

function fixTables(input: string): string {
  const lines = input.split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    // Detect potential table start: line with at least two pipes and NOT just a separator
    if (/(\|.*\|.*)/.test(line) && !/^\s*\|?\s*-+\s*\|/.test(line)) {
      // Peek next line to see if header separator exists somewhere below; if not, try to reconstruct.
      const tableBlock: string[] = [line];
      let j = i + 1;
      while (j < lines.length && /\|/.test(lines[j]) && lines[j].trim() !== '') {
        tableBlock.push(lines[j]);
        j++;
      }
      const fixed = repairTableBlock(tableBlock);
      out.push(...fixed);
      i = j;
      continue;
    }
    out.push(line);
    i++;
  }
  return out.join('\n');
}

function repairTableBlock(block: string[]): string[] {
  if (block.length === 0) return block;
  // Remove any <br/> tags inside rows (they break GFM parsing in some cases)
  const cleaned = block.map(l => l.replace(/<br\s*\/?>/gi, ' '));

  // If second line is not a separator, construct one from header columns
  if (cleaned.length > 1 && !/^\s*\|?\s*-+\s*\|/.test(cleaned[1])) {
    const header = cleaned[0];
    const cols = header.split('|').length - 1; // number of pipes implies columns; tolerate leading/trailing pipe
    // Build separator with dashes
    let sep = header
      .split('|')
      .map((c, idx, arr) => {
        if (idx === 0 || idx === arr.length - 1) return c.trim() === '' ? '' : '---';
        return '---';
      })
      .join('|');
    if (!sep.includes('---')) {
      sep = Array(cols).fill('---').join(' | ');
    }
    // Ensure pipes at ends match style
    if (!/^\|/.test(header)) sep = '|' + sep;
    if (!/\|$/.test(header)) sep = sep + '|';
    cleaned.splice(1, 0, sep);
  }

  // Deduplicate multiple separator lines
  return cleaned.filter((l, idx, arr) => {
    if (!/^\s*\|?\s*-+\s*\|/.test(l)) return true;
    if (idx > 0 && /^\s*\|?\s*-+\s*\|/.test(arr[idx - 1])) return false;
    return true;
  });
}

export function quickPreviewFixedMarkdown(raw: string): string {
  return sanitizeChatMarkdown(raw)
    .split('\n')
    .slice(0, 40)
    .join('\n');
}
