// DEPRECATO: Tutta la funzionalità è stata unificata in RagDocumentsPanel (multi-upload + vista avanzata)
// Manteniamo questo file come semplice wrapper per retrocompatibilità con import esistenti.
import React from 'react';
import RagDocumentsPanel from './RagDocumentsPanel';

export default function AdminRAGManagement() {
  return <RagDocumentsPanel />;
}
