#!/usr/bin/env python3
"""
Script per riorganizzare automaticamente gli import nei file Python.
Sposta tutti gli import in cima al file e li organizza secondo le best practices PEP8.

Features:
- Identifica tutti gli import sparsi nel codice
- Li sposta in cima al file
- Li organizza per categorie (standard library, third-party, local)
- Mantiene commenti e docstring
- Backup automatico dei file modificati
- Dry-run mode per preview

Usage:
    python reorganize_imports.py [directory] [--dry-run] [--backup]
"""

import ast
import os
import sys
import argparse
import shutil
from pathlib import Path
from typing import List, Dict, Set, Tuple, Optional
from collections import defaultdict
import re

class ImportReorganizer:
    def __init__(self, target_path: str, dry_run: bool = False, backup: bool = True):
        self.target_path = Path(target_path).resolve()
        self.dry_run = dry_run
        self.backup = backup
        self.stats = {
            'files_processed': 0,
            'files_modified': 0,
            'imports_moved': 0,
            'imports_organized': 0
        }
        
        # Determina se è file o directory
        if self.target_path.is_file():
            self.is_single_file = True
            self.directory = self.target_path.parent
        else:
            self.is_single_file = False
            self.directory = self.target_path
        
        # Standard library modules (Python 3.11)
        self.stdlib_modules = {
            'os', 'sys', 'json', 'ast', 'pathlib', 'typing', 'collections',
            'datetime', 'time', 'logging', 'argparse', 'functools', 'itertools',
            'threading', 're', 'math', 'random', 'hashlib', 'uuid', 'base64',
            'urllib', 'http', 'asyncio', 'subprocess', 'shutil', 'tempfile',
            'copy', 'pickle', 'csv', 'sqlite3', 'configparser', 'io', 'socket',
            'ssl', 'email', 'mimetypes', 'zipfile', 'tarfile', 'gzip'
        }
        
    def reorganize_file(self, file_path: Path) -> bool:
        """Riorganizza gli import di un singolo file."""
        if self.is_single_file:
            print(f"📄 Analizzando: {file_path.name}")
        else:
            print(f"📄 Analizzando: {file_path.relative_to(self.directory)}")
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                original_content = f.read()
            
            # Parse AST
            try:
                tree = ast.parse(original_content)
            except SyntaxError as e:
                print(f"  ⚠️  Errore syntax: {e}")
                return False
                
            # Estrai informazioni
            imports_info = self._extract_imports(tree, original_content)
            if not imports_info['scattered_imports']:
                print(f"  ✅ Import già in cima")
                return False
                
            # Riorganizza contenuto  
            new_content = self._reorganize_content(original_content, imports_info)
            
            if new_content == original_content:
                print(f"  ✅ Nessuna modifica necessaria")
                return False
                
            # Statistiche
            moved_count = len(imports_info['scattered_imports'])
            total_imports = len(imports_info['all_imports'])
            
            print(f"  🔄 Import sparsi trovati: {moved_count}")
            print(f"  📦 Import totali: {total_imports}")
            
            if not self.dry_run:
                # Backup se richiesto
                if self.backup:
                    backup_path = file_path.with_suffix('.py.bak')
                    shutil.copy2(file_path, backup_path)
                    print(f"  💾 Backup: {backup_path.name}")
                
                # Scrivi nuovo contenuto
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                print(f"  ✅ File aggiornato")
            else:
                print(f"  👀 DRY-RUN: File SAREBBE stato modificato")
                
            self.stats['imports_moved'] += moved_count
            self.stats['imports_organized'] += total_imports
            return True
            
        except Exception as e:
            print(f"  ❌ Errore: {e}")
            return False
    
    def _extract_imports(self, tree: ast.AST, content: str) -> Dict:
        """Estrae informazioni sugli import dal file."""
        lines = content.split('\n')
        all_imports = []
        scattered_imports = []  # Import non all'inizio
        
        # Trova la prima riga di codice non-import
        first_code_line = self._find_first_code_line(tree)
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                import_line = node.lineno - 1  # AST è 1-based
                import_text = lines[import_line].strip()
                
                import_info = {
                    'line_number': import_line,
                    'text': import_text,
                    'node': node,
                    'category': self._categorize_import(node)
                }
                
                all_imports.append(import_info)
                
                # Se l'import è dopo il primo codice, è sparso
                if node.lineno > first_code_line:
                    scattered_imports.append(import_info)
        
        return {
            'all_imports': all_imports,
            'scattered_imports': scattered_imports,
            'first_code_line': first_code_line
        }
    
    def _find_first_code_line(self, tree: ast.AST) -> int:
        """Trova la prima riga di codice che non è import, docstring o commento."""
        first_code_line = float('inf')
        
        for node in ast.walk(tree):
            if isinstance(node, (ast.Import, ast.ImportFrom)):
                continue
            if isinstance(node, ast.Expr) and isinstance(node.value, ast.Constant):
                # Probabile docstring
                continue
            if hasattr(node, 'lineno') and node.lineno < first_code_line:
                first_code_line = node.lineno
                
        return first_code_line if first_code_line != float('inf') else 1
    
    def _categorize_import(self, node: ast.AST) -> str:
        """Categorizza un import (standard, third-party, local)."""
        if isinstance(node, ast.Import):
            module_name = node.names[0].name.split('.')[0]
        elif isinstance(node, ast.ImportFrom):
            if node.level > 0:  # import relativo
                return 'local'
            module_name = node.module.split('.')[0] if node.module else ''
        else:
            return 'unknown'
            
        if module_name in self.stdlib_modules:
            return 'standard'
        elif module_name.startswith('.') or not module_name:
            return 'local'
        else:
            return 'third_party'
    
    def _reorganize_content(self, content: str, imports_info: Dict) -> str:
        """Riorganizza il contenuto del file."""
        lines = content.split('\n')
        
        # Rimuovi import sparsi dalle loro posizioni originali
        lines_to_remove = set()
        for imp in imports_info['scattered_imports']:
            lines_to_remove.add(imp['line_number'])
        
        # Filtra le righe rimuovendo gli import sparsi
        filtered_lines = []
        for i, line in enumerate(lines):
            if i not in lines_to_remove:
                filtered_lines.append(line)
            else:
                # Sostituisci con riga vuota per mantenere numerazione
                filtered_lines.append('')
        
        # Organizza tutti gli import per categoria
        organized_imports = self._organize_imports(imports_info['all_imports'])
        
        # Trova dove inserire gli import organizzati
        insert_position = self._find_import_insert_position(filtered_lines)
        
        # Rimuovi gli import esistenti dall'inizio (li stiamo riorganizzando)
        clean_lines = self._remove_existing_imports(filtered_lines)
        
        # Inserisci import organizzati
        final_lines = []
        final_lines.extend(clean_lines[:insert_position])
        final_lines.extend(organized_imports)
        if clean_lines[insert_position:] and clean_lines[insert_position].strip():
            final_lines.append('')  # Spazio prima del codice
        final_lines.extend(clean_lines[insert_position:])
        
        # Pulizia righe vuote eccessive
        return self._clean_empty_lines('\n'.join(final_lines))
    
    def _organize_imports(self, all_imports: List[Dict]) -> List[str]:
        """Organizza gli import per categoria."""
        categories = {
            'standard': [],
            'third_party': [],
            'local': []
        }
        
        # Raggruppa per categoria
        for imp in all_imports:
            categories[imp['category']].append(imp['text'])
        
        # Ordina all'interno di ogni categoria
        for category in categories:
            categories[category] = sorted(set(categories[category]))
        
        # Componi lista finale
        organized = []
        
        if categories['standard']:
            organized.extend(categories['standard'])
            organized.append('')
        
        if categories['third_party']:
            organized.extend(categories['third_party'])
            organized.append('')
            
        if categories['local']:
            organized.extend(categories['local'])
            organized.append('')
        
        # Rimuovi ultima riga vuota se presente
        if organized and organized[-1] == '':
            organized.pop()
            
        return organized
    
    def _find_import_insert_position(self, lines: List[str]) -> int:
        """Trova la posizione dove inserire gli import."""
        # Dopo shebang/encoding
        position = 0
        
        # Salta shebang
        if lines and lines[0].startswith('#!'):
            position = 1
        
        # Salta encoding declaration
        for i in range(position, min(position + 2, len(lines))):
            if i < len(lines) and 'coding:' in lines[i] or 'coding=' in lines[i]:
                position = i + 1
                break
        
        # Salta docstring del modulo
        if position < len(lines):
            line = lines[position].strip()
            if line.startswith('"""') or line.startswith("'''"):
                # Trova fine docstring
                quote = '"""' if line.startswith('"""') else "'''"
                if line.count(quote) >= 2:
                    # Docstring su una riga
                    position += 1
                else:
                    # Docstring multi-riga
                    for i in range(position + 1, len(lines)):
                        if quote in lines[i]:
                            position = i + 1
                            break
        
        return position
    
    def _remove_existing_imports(self, lines: List[str]) -> List[str]:
        """Rimuove gli import esistenti dall'inizio del file."""
        clean_lines = []
        in_import_block = False
        
        for line in lines:
            stripped = line.strip()
            
            # Identifica righe di import
            is_import_line = (
                stripped.startswith('import ') or 
                stripped.startswith('from ') or
                (in_import_block and stripped.endswith(',')) or
                (in_import_block and stripped.startswith('    '))
            )
            
            if is_import_line:
                in_import_block = True
                continue  # Salta questa riga
            elif in_import_block and not stripped:
                continue  # Salta righe vuote nel blocco import
            else:
                in_import_block = False
                clean_lines.append(line)
        
        return clean_lines
    
    def _clean_empty_lines(self, content: str) -> str:
        """Pulisce righe vuote eccessive."""
        # Sostituisce 3+ righe vuote consecutive con 2
        content = re.sub(r'\n\n\n+', '\n\n', content)
        
        # Rimuove righe vuote alla fine
        content = content.rstrip() + '\n'
        
        return content
    
    def process_directory(self) -> None:
        """Processa tutti i file Python nella directory o il singolo file."""
        print(f"🔄 RIORGANIZZAZIONE IMPORT - {'DRY RUN' if self.dry_run else 'MODALITÀ ATTIVA'}")
        
        if self.is_single_file:
            print(f"📄 File: {self.target_path}")
        else:
            print(f"📂 Directory: {self.directory}")
            
        print(f"💾 Backup: {'Abilitato' if self.backup else 'Disabilitato'}")
        print()
        
        if self.is_single_file:
            # Processa singolo file
            if self.target_path.suffix == '.py':
                python_files = [self.target_path]
            else:
                print(f"❌ {self.target_path} non è un file Python")
                return
        else:
            # Processa directory
            python_files = list(self.directory.glob('**/*.py'))
        
        for file_path in python_files:
            # Salta __pycache__ e file di backup
            if '__pycache__' in str(file_path) or file_path.name.endswith('.bak'):
                continue
                
            self.stats['files_processed'] += 1
            
            if self.reorganize_file(file_path):
                self.stats['files_modified'] += 1
            
            print()
        
        self._print_statistics()
    
    def _print_statistics(self) -> None:
        """Stampa statistiche finali."""
        print("📊 STATISTICHE FINALI:")
        print(f"   • File processati: {self.stats['files_processed']}")
        print(f"   • File modificati: {self.stats['files_modified']}")
        print(f"   • Import spostati: {self.stats['imports_moved']}")
        print(f"   • Import organizzati: {self.stats['imports_organized']}")
        
        if self.dry_run:
            print()
            print("👀 MODALITÀ DRY-RUN ATTIVA")
            print("   Per applicare le modifiche, rimuovi --dry-run")

def main():
    parser = argparse.ArgumentParser(
        description='Riorganizza automaticamente gli import nei file Python'
    )
    parser.add_argument(
        'target',
        nargs='?',
        default='.',
        help='File o directory da processare (default: current directory)'
    )
    parser.add_argument(
        '--dry-run',
        action='store_true',
        help='Mostra solo cosa verrebbe modificato senza applicare cambiamenti'
    )
    parser.add_argument(
        '--no-backup',
        action='store_true',
        help='Non creare backup dei file modificati'
    )
    parser.add_argument(
        '--verbose',
        action='store_true',
        help='Output dettagliato'
    )
    
    args = parser.parse_args()
    
    # Validate target
    target_path = Path(args.target)
    if not target_path.exists():
        print(f"❌ File o directory non trovato: {args.target}")
        sys.exit(1)
    
    if target_path.is_file() and target_path.suffix != '.py':
        print(f"❌ {args.target} non è un file Python")
        sys.exit(1)
    
    # Run reorganizer
    reorganizer = ImportReorganizer(
        target_path=args.target,
        dry_run=args.dry_run,
        backup=not args.no_backup
    )
    
    try:
        reorganizer.process_directory()
    except KeyboardInterrupt:
        print("\n⚠️  Operazione interrotta dall'utente")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Errore: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()
