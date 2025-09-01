import React from 'react';

/** Evidenzia tutte le occorrenze di un termine (case-insensitive) nel testo */
export function highlightTerm(text: string, term: string) {
  if (!term) return text;
  try {
    const escaped = term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const re = new RegExp(`(${escaped})`, 'gi');
    const parts = text.split(re);
    return parts.map((p, i) => re.test(p) ? <mark key={i} style={{ background:'#fff59d', padding:0 }}>{p}</mark> : p);
  } catch {
    return text;
  }
}
