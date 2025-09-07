#!/usr/bin/env python3
"""
Script per analizzare gli import in una cartella Python e creare un albero delle dipendenze.
Identifica anche i file che non sono importati da nessun altro modulo.

Usage:
    python analyze_imports.py [cartella] [--format json|tree|both] [--show-external]
"""

import ast
import os
import sys
import json
import argparse
from pathlib import Path
from typing import Dict, Set, List, Tuple
from collections import defaultdict, deque

class ImportAnalyzer:
    def __init__(self, directory: str):
        self.directory = Path(directory).resolve()
        self.python_files: Set[Path] = set()
        self.imports: Dict[str, Set[str]] = defaultdict(set)  # file -> set of imports
        self.imported_by: Dict[str, Set[str]] = defaultdict(set)  # module -> set of files that import it
        self.external_imports: Dict[str, Set[str]] = defaultdict(set)  # file -> external imports
        self.module_to_file: Dict[str, str] = {}  # module name -> file path
        self.file_to_module: Dict[str, str] = {}  # file path -> module name
        
        # FIXED: Lista file critici che non dovrebbero mai essere rimossi automaticamente
        self.critical_files = {
            'main.py', 'admin.py', 'database.py', 'config.py',
            # Pattern per manager, engine, provider
            '*_manager.py', '*_engine.py', '*_provider.py', '*_routes.py',
            # Core dell'applicazione  
            'auth.py', 'chat.py', 'llm.py', '__init__.py'
        }
        
    def find_python_files(self) -> None:
        """Trova tutti i file Python nella directory."""
        for root, dirs, files in os.walk(self.directory):
            # Salta __pycache__
            dirs[:] = [d for d in dirs if d != '__pycache__']
            
            for file in files:
                if file.endswith('.py'):
                    file_path = Path(root) / file
                    self.python_files.add(file_path)
                    
                    # Mappa module name <-> file path
                    rel_path = file_path.relative_to(self.directory)
                    module_name = str(rel_path).replace('/', '.').replace('\\', '.').replace('.py', '')
                    self.module_to_file[module_name] = str(rel_path)
                    self.file_to_module[str(rel_path)] = module_name
    
    def parse_imports(self, file_path: Path) -> Tuple[Set[str], Set[str]]:
        """Estrae gli import da un file Python."""
        local_imports = set()
        external_imports = set()
        
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                tree = ast.parse(content)
                
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        module_name = alias.name
                        if self._is_local_import(module_name):
                            local_imports.add(module_name)
                        else:
                            external_imports.add(module_name)
                            
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        module_name = node.module
                        if self._is_local_import(module_name):
                            local_imports.add(module_name)
                        else:
                            external_imports.add(module_name)
                    
                    # Gestisci import relativi (from .module import ...)
                    if node.level > 0:  # import relativo
                        for alias in node.names:
                            # FIXED: Gestisci "from . import module_name" 
                            if node.module is None:
                                # Caso: from . import embedding_manager
                                relative_module = self._resolve_relative_import(file_path, node.level, alias.name, alias.name)
                            else:
                                # Caso: from .submodule import name
                                relative_module = self._resolve_relative_import(file_path, node.level, node.module, alias.name)
                                
                            if relative_module and self._is_local_import(relative_module):
                                local_imports.add(relative_module)
                                
        except (SyntaxError, UnicodeDecodeError, FileNotFoundError) as e:
            print(f"Errore parsing {file_path}: {e}", file=sys.stderr)
            
        return local_imports, external_imports
    
    def _is_local_import(self, module_name: str) -> bool:
        """Verifica se un import è locale al progetto."""
        # Controlla se il modulo esiste nei file locali
        return module_name in self.module_to_file or any(
            module_name.startswith(local_module + '.') for local_module in self.module_to_file
        )
    
    def _resolve_relative_import(self, file_path: Path, level: int, module: str, name: str) -> str:
        """Risolve import relativi come 'from .module import name'."""
        try:
            rel_path = file_path.relative_to(self.directory)
            current_module = str(rel_path).replace('/', '.').replace('\\', '.').replace('.py', '')
            
            # Calcola il modulo base andando indietro di 'level' livelli
            parts = current_module.split('.')
            if level > len(parts):
                return None
                
            base_parts = parts[:-level] if level > 0 else parts
            
            if module:
                target_module = '.'.join(base_parts + [module])
            else:
                target_module = '.'.join(base_parts)
                
            return target_module
        except:
            return None
    
    def analyze(self) -> None:
        """Esegue l'analisi completa."""
        self.find_python_files()
        
        for file_path in self.python_files:
            rel_path = str(file_path.relative_to(self.directory))
            local_imports, external_imports = self.parse_imports(file_path)
            
            self.imports[rel_path] = local_imports
            self.external_imports[rel_path] = external_imports
            
            # Costruisci il grafo inverso (chi importa cosa)
            for imported_module in local_imports:
                self.imported_by[imported_module].add(rel_path)
    
    def get_unused_files(self) -> Set[str]:
        """Trova i file che non sono importati da nessun altro."""
        unused = set()
        
        for file_path in self.python_files:
            rel_path = str(file_path.relative_to(self.directory))
            module_name = self.file_to_module.get(rel_path, '')
            
            # Un file è inutilizzato se:
            # 1. Non è importato da nessun altro file
            # 2. Non è un entry point (main.py, __init__.py, ecc.)
            is_imported = any(module_name in imports or 
                            any(module_name.startswith(imp + '.') for imp in imports)
                            for imports in self.imports.values())
            
            is_entry_point = (
                file_path.name in ['main.py', '__main__.py'] or
                file_path.name == '__init__.py'
            )
            
            if not is_imported and not is_entry_point:
                unused.add(rel_path)
                
        return unused
    
    def build_dependency_tree(self) -> Dict:
        """Costruisce l'albero delle dipendenze."""
        tree = {}
        
        for file_path in self.python_files:
            rel_path = str(file_path.relative_to(self.directory))
            module_name = self.file_to_module.get(rel_path, '')
            
            tree[rel_path] = {
                'module_name': module_name,
                'imports': list(self.imports.get(rel_path, [])),
                'imported_by': list(self.imported_by.get(module_name, [])),
                'external_imports': list(self.external_imports.get(rel_path, []))
            }
        
        return tree
    
    def print_tree_format(self, show_external: bool = False) -> None:
        """Stampa l'albero in formato testuale."""
        print("🌳 ALBERO DELLE DIPENDENZE")
        print("=" * 50)
        
        tree = self.build_dependency_tree()
        unused_files = self.get_unused_files()
        
        # Raggruppa per tipo
        entry_points = []
        imported_files = []
        unused_list = []
        
        for file_path, data in tree.items():
            if not data['imported_by'] and file_path not in unused_files:
                entry_points.append((file_path, data))
            elif file_path in unused_files:
                unused_list.append((file_path, data))
            else:
                imported_files.append((file_path, data))
        
        # Entry points
        if entry_points:
            print("\n📍 ENTRY POINTS (non importati, ma probabilmente entry point):")
            for file_path, data in sorted(entry_points):
                self._print_file_info(file_path, data, show_external, "🚀")
        
        # File importati
        if imported_files:
            print("\n📦 FILE IMPORTATI:")
            for file_path, data in sorted(imported_files):
                self._print_file_info(file_path, data, show_external, "📁")
        
        # File inutilizzati
        if unused_list:
            print("\n🗑️  FILE NON UTILIZZATI:")
            for file_path, data in sorted(unused_list):
                # FIXED: Controlla se è un file critico
                if self._is_critical_file(file_path):
                    print(f"\n⚠️  {file_path} (CRITICO - non rimuovere automaticamente)")
                    self._print_file_info(file_path, data, show_external, "⚠️ ")
                else:
                    self._print_file_info(file_path, data, show_external, "❌")
        
        # Statistiche
        print(f"\n📊 STATISTICHE:")
        print(f"   • Totale file: {len(tree)}")
        print(f"   • Entry points: {len(entry_points)}")
        print(f"   • File importati: {len(imported_files)}")
        print(f"   • File inutilizzati: {len(unused_list)}")
        critical_unused = sum(1 for file_path, _ in unused_list if self._is_critical_file(file_path))
        print(f"   • File critici inutilizzati: {critical_unused}")
        
    def _is_critical_file(self, file_path: str) -> bool:
        """Verifica se un file è critico e non dovrebbe essere rimosso automaticamente."""
        filename = Path(file_path).name
        
        # Controllo diretto
        if filename in self.critical_files:
            return True
            
        # Controllo pattern (es: *_manager.py)
        for pattern in self.critical_files:
            if '*' in pattern:
                if pattern.startswith('*') and filename.endswith(pattern[1:]):
                    return True
                elif pattern.endswith('*') and filename.startswith(pattern[:-1]):
                    return True
        
        return False
    
    def _print_file_info(self, file_path: str, data: Dict, show_external: bool, icon: str) -> None:
        """Stampa le informazioni di un singolo file."""
        print(f"\n{icon} {file_path}")
        if data['module_name']:
            print(f"    📛 Modulo: {data['module_name']}")
        
        if data['imports']:
            print(f"    📥 Importa: {', '.join(sorted(data['imports']))}")
        
        if data['imported_by']:
            print(f"    📤 Importato da: {', '.join(sorted(data['imported_by']))}")
        
        if show_external and data['external_imports']:
            ext_imports = sorted(data['external_imports'])[:5]  # Limita a 5 per leggibilità
            ext_str = ', '.join(ext_imports)
            if len(data['external_imports']) > 5:
                ext_str += f" ... (+{len(data['external_imports']) - 5} altri)"
            print(f"    🌐 Import esterni: {ext_str}")
    
    def export_json(self) -> Dict:
        """Esporta l'analisi in formato JSON."""
        tree = self.build_dependency_tree()
        unused_files = self.get_unused_files()
        
        return {
            'directory': str(self.directory),
            'analysis_date': sys.modules['datetime'].datetime.now().isoformat() if 'datetime' in sys.modules else 'unknown',
            'summary': {
                'total_files': len(tree),
                'unused_files_count': len(unused_files),
                'unused_files': sorted(list(unused_files))
            },
            'files': tree
        }

def main():
    parser = argparse.ArgumentParser(description='Analizza gli import Python e crea un albero delle dipendenze')
    parser.add_argument('directory', nargs='?', default='.', help='Directory da analizzare (default: corrente)')
    parser.add_argument('--format', choices=['json', 'tree', 'both'], default='tree', help='Formato output')
    parser.add_argument('--show-external', action='store_true', help='Mostra anche gli import esterni')
    parser.add_argument('--output', '-o', help='File di output per JSON')
    
    args = parser.parse_args()
    
    if not os.path.isdir(args.directory):
        print(f"Errore: {args.directory} non è una directory valida", file=sys.stderr)
        sys.exit(1)
    
    analyzer = ImportAnalyzer(args.directory)
    analyzer.analyze()
    
    if args.format in ['tree', 'both']:
        analyzer.print_tree_format(args.show_external)
    
    if args.format in ['json', 'both']:
        result = analyzer.export_json()
        
        if args.output:
            with open(args.output, 'w', encoding='utf-8') as f:
                json.dump(result, f, indent=2, ensure_ascii=False)
            print(f"\n📄 JSON esportato in: {args.output}")
        else:
            if args.format == 'json':
                print(json.dumps(result, indent=2, ensure_ascii=False))
            else:
                print(f"\n📄 JSON DATA:")
                print(json.dumps(result, indent=2, ensure_ascii=False))

if __name__ == '__main__':
    import datetime  # Import qui per la data nell'export JSON
    main()
