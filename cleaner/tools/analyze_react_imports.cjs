#!/usr/bin/env node

/**
 * 🔍 Analizzatore Import React/TypeScript
 * 
 * Analizza le dipendenze tra file React/TypeScript in una cartella
 * e identifica file non utilizzati, import inutili e pattern problematici.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class ReactImportAnalyzer {
    constructor(directory = '.', options = {}) {
        this.directory = path.resolve(directory);
        this.options = {
            showExternal: options.showExternal || false,
            includeTestFiles: options.includeTestFiles || false,
            includeNodeModules: options.includeNodeModules || false,
            extensions: options.extensions || ['.tsx', '.ts', '.jsx', '.js'],
            ignorePatterns: options.ignorePatterns || [
                'node_modules',
                'dist',
                'build',
                '.git',
                'coverage'
            ]
        };
        
        this.files = new Map(); // filepath -> FileInfo
        this.dependencies = new Map(); // filepath -> Set<filepath>
        this.reverseDependencies = new Map(); // filepath -> Set<filepath>
        this.externalImports = new Map(); // filepath -> Set<packageName>
        this.errors = [];
        
        console.error(`🔍 Analizzando directory: ${this.directory}`);
    }

    /**
     * Scansiona ricorsivamente la directory per file React/TS
     */
    findFiles(dir = this.directory, relativePath = '') {
        const files = [];
        
        try {
            const entries = fs.readdirSync(dir);
            
            for (const entry of entries) {
                const fullPath = path.join(dir, entry);
                const relativeEntryPath = path.join(relativePath, entry);
                
                // Skip ignored patterns
                if (this.options.ignorePatterns.some(pattern => 
                    relativeEntryPath.includes(pattern) || entry.startsWith('.')
                )) {
                    continue;
                }
                
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    files.push(...this.findFiles(fullPath, relativeEntryPath));
                } else if (this.options.extensions.some(ext => entry.endsWith(ext))) {
                    // Skip test files if not included
                    if (!this.options.includeTestFiles && 
                        (entry.includes('.test.') || entry.includes('.spec.'))) {
                        continue;
                    }
                    
                    files.push({
                        fullPath,
                        relativePath: relativeEntryPath,
                        name: entry,
                        extension: path.extname(entry),
                        isTest: entry.includes('.test.') || entry.includes('.spec.')
                    });
                }
            }
        } catch (error) {
            this.errors.push(`Errore lettura directory ${dir}: ${error.message}`);
        }
        
        return files;
    }

    /**
     * Estrae import da un file TypeScript/React
     */
    extractImports(filePath, content) {
        const imports = new Set();
        const externalImports = new Set();
        
        // Regex per diversi tipi di import
        const importPatterns = [
            // import something from 'path'
            /import\s+[^'"]+from\s+['"]([^'"]+)['"]/g,
            // import('path')
            /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            // require('path')
            /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
            // import 'path'
            /import\s+['"]([^'"]+)['"]/g
        ];
        
        for (const pattern of importPatterns) {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const importPath = match[1];
                
                if (this.isExternalImport(importPath)) {
                    externalImports.add(this.getPackageName(importPath));
                } else {
                    const resolvedPath = this.resolveImportPath(filePath, importPath);
                    if (resolvedPath) {
                        imports.add(resolvedPath);
                    }
                }
            }
        }
        
        // Cerca anche dynamic imports in JSX
        const dynamicImportPattern = /React\.lazy\s*\(\s*\(\s*\)\s*=>\s*import\s*\(\s*['"]([^'"]+)['"]\s*\)\s*\)/g;
        let dynamicMatch;
        while ((dynamicMatch = dynamicImportPattern.exec(content)) !== null) {
            const importPath = dynamicMatch[1];
            if (!this.isExternalImport(importPath)) {
                const resolvedPath = this.resolveImportPath(filePath, importPath);
                if (resolvedPath) {
                    imports.add(resolvedPath);
                }
            }
        }
        
        return { imports, externalImports };
    }

    /**
     * Verifica se un import è esterno (npm package)
     */
    isExternalImport(importPath) {
        return !importPath.startsWith('.') && !importPath.startsWith('/');
    }

    /**
     * Estrae il nome del package da un import
     */
    getPackageName(importPath) {
        // @scope/package/subpath -> @scope/package
        if (importPath.startsWith('@')) {
            const parts = importPath.split('/');
            return parts.slice(0, 2).join('/');
        }
        
        // package/subpath -> package
        return importPath.split('/')[0];
    }

    /**
     * Risolve un percorso di import relativo
     */
    resolveImportPath(fromFile, importPath) {
        const fromDir = path.dirname(fromFile);
        let resolvedPath;
        
        if (importPath.startsWith('.')) {
            // Import relativo
            resolvedPath = path.resolve(fromDir, importPath);
        } else if (importPath.startsWith('/')) {
            // Import assoluto dal root del progetto
            resolvedPath = path.resolve(this.directory, importPath.substring(1));
        } else {
            // Import esterno, ignorato
            return null;
        }
        
        // Prova diverse estensioni se il file non esiste
        if (fs.existsSync(resolvedPath)) {
            return resolvedPath;
        }
        
        for (const ext of this.options.extensions) {
            const withExt = resolvedPath + ext;
            if (fs.existsSync(withExt)) {
                return withExt;
            }
        }
        
        // Prova con index file
        for (const ext of this.options.extensions) {
            const indexPath = path.join(resolvedPath, `index${ext}`);
            if (fs.existsSync(indexPath)) {
                return indexPath;
            }
        }
        
        return null;
    }

    /**
     * Analizza tutti i file
     */
    analyze() {
        console.error('📂 Scanning files...');
        const allFiles = this.findFiles();
        
        console.error(`📊 Found ${allFiles.length} files to analyze`);
        
        // Prima fase: leggi tutti i file e crea mappa
        for (const fileInfo of allFiles) {
            try {
                const content = fs.readFileSync(fileInfo.fullPath, 'utf-8');
                const { imports, externalImports } = this.extractImports(fileInfo.fullPath, content);
                
                this.files.set(fileInfo.fullPath, {
                    ...fileInfo,
                    content,
                    lineCount: content.split('\n').length,
                    size: Buffer.byteLength(content, 'utf8')
                });
                
                this.dependencies.set(fileInfo.fullPath, imports);
                this.externalImports.set(fileInfo.fullPath, externalImports);
                
            } catch (error) {
                this.errors.push(`Errore lettura ${fileInfo.relativePath}: ${error.message}`);
            }
        }
        
        // Seconda fase: costruisci reverse dependencies
        for (const [filePath, imports] of this.dependencies.entries()) {
            for (const importedFile of imports) {
                if (!this.reverseDependencies.has(importedFile)) {
                    this.reverseDependencies.set(importedFile, new Set());
                }
                this.reverseDependencies.get(importedFile).add(filePath);
            }
        }
        
        console.error('✅ Analysis complete!');
    }

    /**
     * Identifica file non utilizzati
     */
    getUnusedFiles() {
        const unused = [];
        const entryPoints = this.identifyEntryPoints();
        
        for (const [filePath] of this.files.entries()) {
            const isImported = this.reverseDependencies.has(filePath) && 
                             this.reverseDependencies.get(filePath).size > 0;
            const isEntryPoint = entryPoints.has(filePath);
            
            if (!isImported && !isEntryPoint) {
                const fileInfo = this.files.get(filePath);
                unused.push({
                    path: fileInfo.relativePath,
                    fullPath: filePath,
                    lines: fileInfo.lineCount,
                    size: fileInfo.size,
                    confidence: this.calculateUnusedConfidence(fileInfo)
                });
            }
        }
        
        return unused.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Identifica entry points (file che sono punti di ingresso)
     */
    identifyEntryPoints() {
        const entryPoints = new Set();
        
        // Pattern comuni per entry points
        const entryPatterns = [
            /main\.(tsx?|jsx?)$/,
            /index\.(tsx?|jsx?)$/,
            /App\.(tsx?|jsx?)$/,
            /router\.(tsx?|jsx?)$/i,
            /(.*\.)?config\.(tsx?|jsx?)$/,
            /vite\.config\.(tsx?|jsx?)$/
        ];
        
        for (const [filePath, fileInfo] of this.files.entries()) {
            const fileName = fileInfo.name;
            
            if (entryPatterns.some(pattern => pattern.test(fileName))) {
                entryPoints.add(filePath);
            }
            
            // Se è nella root del src, probabilmente è importante
            const relativePath = path.relative(this.directory, filePath);
            if (relativePath.split(path.sep).length <= 2) {
                entryPoints.add(filePath);
            }
        }
        
        return entryPoints;
    }

    /**
     * Calcola livello di confidenza per file inutilizzato
     */
    calculateUnusedConfidence(fileInfo) {
        let confidence = 100;
        
        // Riduci confidenza per file che potrebbero essere entry points
        if (fileInfo.name.toLowerCase().includes('main') || 
            fileInfo.name.toLowerCase().includes('app')) {
            confidence -= 30;
        }
        
        // Riduci confidenza per file con molte righe (potrebbero avere logica importante)
        if (fileInfo.lineCount > 100) {
            confidence -= 20;
        }
        
        // Riduci confidenza per file di configurazione
        if (fileInfo.name.includes('config') || 
            fileInfo.name.includes('setup') ||
            fileInfo.name.includes('.d.ts')) {
            confidence -= 40;
        }
        
        // Aumenta confidenza per file chiaramente di backup o test
        if (fileInfo.name.includes('backup') ||
            fileInfo.name.includes('old') ||
            fileInfo.name.includes('temp') ||
            fileInfo.name.includes('unused')) {
            confidence += 20;
        }
        
        return Math.max(0, Math.min(100, confidence));
    }

    /**
     * Genera albero dipendenze ASCII
     */
    generateDependencyTree() {
        let output = '🌳 ALBERO DELLE DIPENDENZE REACT\n';
        output += '==================================\n\n';
        
        const entryPoints = this.identifyEntryPoints();
        const visited = new Set();
        
        // Entry Points
        if (entryPoints.size > 0) {
            output += '📍 ENTRY POINTS:\n\n';
            for (const entryPath of entryPoints) {
                if (!visited.has(entryPath)) {
                    output += this.generateFileTree(entryPath, visited, '🚀 ');
                    output += '\n';
                }
            }
        }
        
        // File importati ma non entry points
        output += '📦 FILE IMPORTATI:\n\n';
        for (const [filePath] of this.files.entries()) {
            if (!visited.has(filePath) && this.reverseDependencies.has(filePath)) {
                output += this.generateFileTree(filePath, visited, '📁 ');
                output += '\n';
            }
        }
        
        // File non utilizzati
        const unusedFiles = this.getUnusedFiles();
        if (unusedFiles.length > 0) {
            output += '🗑️ FILE NON UTILIZZATI:\n\n';
            for (const unused of unusedFiles) {
                const fileInfo = this.files.get(unused.fullPath);
                output += `❌ ${unused.path}\n`;
                output += `    📛 Tipo: ${fileInfo.extension}\n`;
                output += `    📏 Righe: ${unused.lines}\n`;
                output += `    💾 Dimensione: ${unused.size} bytes\n`;
                output += `    🎯 Confidenza: ${unused.confidence}%\n`;
                
                if (this.options.showExternal) {
                    const externals = this.externalImports.get(unused.fullPath);
                    if (externals && externals.size > 0) {
                        output += `    🌐 Dipendenze: ${Array.from(externals).join(', ')}\n`;
                    }
                }
                output += '\n';
            }
        }
        
        return output;
    }

    /**
     * Genera albero per singolo file
     */
    generateFileTree(filePath, visited, prefix = '', indent = 0) {
        if (visited.has(filePath)) {
            return '';
        }
        visited.add(filePath);
        
        const fileInfo = this.files.get(filePath);
        if (!fileInfo) return '';
        
        const indentStr = '  '.repeat(indent);
        let output = `${indentStr}${prefix}${fileInfo.relativePath}\n`;
        
        // Info file
        output += `${indentStr}    📛 Tipo: ${fileInfo.extension}\n`;
        output += `${indentStr}    📏 ${fileInfo.lineCount} righe\n`;
        
        // Import interni
        const imports = this.dependencies.get(filePath) || new Set();
        if (imports.size > 0) {
            const importList = Array.from(imports)
                .map(imp => this.files.get(imp)?.relativePath || path.basename(imp))
                .filter(Boolean);
            
            if (importList.length > 0) {
                output += `${indentStr}    📥 Importa: ${importList.join(', ')}\n`;
            }
        }
        
        // Chi lo importa
        const importedBy = this.reverseDependencies.get(filePath) || new Set();
        if (importedBy.size > 0) {
            const importerList = Array.from(importedBy)
                .map(imp => this.files.get(imp)?.relativePath || path.basename(imp))
                .filter(Boolean);
            
            if (importerList.length > 0) {
                output += `${indentStr}    📤 Importato da: ${importerList.join(', ')}\n`;
            }
        }
        
        // Import esterni se richiesti
        if (this.options.showExternal) {
            const externals = this.externalImports.get(filePath) || new Set();
            if (externals.size > 0) {
                output += `${indentStr}    🌐 Dipendenze: ${Array.from(externals).join(', ')}\n`;
            }
        }
        
        return output;
    }

    /**
     * Genera statistiche
     */
    generateStatistics() {
        const unusedFiles = this.getUnusedFiles();
        const totalFiles = this.files.size;
        const totalLines = Array.from(this.files.values()).reduce((sum, file) => sum + file.lineCount, 0);
        const unusedLines = unusedFiles.reduce((sum, file) => sum + file.lines, 0);
        
        let output = '📊 STATISTICHE:\n';
        output += `   • File totali: ${totalFiles}\n`;
        output += `   • Righe totali: ${totalLines}\n`;
        output += `   • File inutilizzati: ${unusedFiles.length}\n`;
        output += `   • Righe inutilizzate: ${unusedLines}\n`;
        output += `   • Percentuale inutilizzata: ${((unusedFiles.length / totalFiles) * 100).toFixed(1)}%\n`;
        
        // Top dipendenze esterne
        const externalCounts = new Map();
        for (const externals of this.externalImports.values()) {
            for (const ext of externals) {
                externalCounts.set(ext, (externalCounts.get(ext) || 0) + 1);
            }
        }
        
        const topExternal = Array.from(externalCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        if (topExternal.length > 0) {
            output += `\n🌐 TOP DIPENDENZE ESTERNE:\n`;
            for (const [pkg, count] of topExternal) {
                output += `   • ${pkg}: ${count} utilizzi\n`;
            }
        }
        
        return output;
    }

    /**
     * Export JSON
     */
    exportJSON() {
        const unusedFiles = this.getUnusedFiles();
        
        return {
            directory: this.directory,
            analysis_date: new Date().toISOString(),
            summary: {
                total_files: this.files.size,
                unused_files_count: unusedFiles.length,
                unused_files: unusedFiles.map(f => f.path)
            },
            files: Object.fromEntries(
                Array.from(this.files.entries()).map(([fullPath, fileInfo]) => [
                    fileInfo.relativePath,
                    {
                        full_path: fullPath,
                        extension: fileInfo.extension,
                        lines: fileInfo.lineCount,
                        size: fileInfo.size,
                        imports: Array.from(this.dependencies.get(fullPath) || new Set())
                            .map(imp => this.files.get(imp)?.relativePath)
                            .filter(Boolean),
                        imported_by: Array.from(this.reverseDependencies.get(fullPath) || new Set())
                            .map(imp => this.files.get(imp)?.relativePath)
                            .filter(Boolean),
                        external_imports: Array.from(this.externalImports.get(fullPath) || new Set()),
                        is_unused: unusedFiles.some(u => u.fullPath === fullPath)
                    }
                ])
            ),
            unused_files: unusedFiles,
            errors: this.errors
        };
    }

    /**
     * Genera report completo
     */
    generateReport(format = 'tree') {
        if (format === 'json') {
            return JSON.stringify(this.exportJSON(), null, 2);
        }
        
        let output = '';
        
        if (format === 'tree' || format === 'both') {
            output += this.generateDependencyTree();
            output += '\n';
            output += this.generateStatistics();
        }
        
        if (format === 'both') {
            output += '\n\n' + '='.repeat(50) + '\n';
            output += 'JSON EXPORT:\n';
            output += '='.repeat(50) + '\n';
            output += JSON.stringify(this.exportJSON(), null, 2);
        }
        
        return output;
    }
}

// CLI Interface
function main() {
    const args = process.argv.slice(2);
    let directory = '.';
    let format = 'tree';
    let outputFile = null;
    let showExternal = false;
    
    // Parse arguments
    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        
        if (arg === '--format' && i + 1 < args.length) {
            format = args[++i];
        } else if (arg === '--output' && i + 1 < args.length) {
            outputFile = args[++i];
        } else if (arg === '--show-external') {
            showExternal = true;
        } else if (arg === '--help' || arg === '-h') {
            console.log(`
🔍 React Import Analyzer

Uso: node analyze_react_imports.js [directory] [opzioni]

Opzioni:
  --format <tree|json|both>  Formato output (default: tree)
  --show-external           Mostra dipendenze esterne npm
  --output <file>           Salva output in file
  --help                    Mostra questo aiuto

Esempi:
  node analyze_react_imports.js src/
  node analyze_react_imports.js --format json --output analysis.json
  node analyze_react_imports.js --show-external --format both
            `);
            process.exit(0);
        } else if (!arg.startsWith('--')) {
            directory = arg;
        }
    }
    
    // Validate format
    if (!['tree', 'json', 'both'].includes(format)) {
        console.error('❌ Formato non valido. Usa: tree, json, o both');
        process.exit(1);
    }
    
    try {
        const analyzer = new ReactImportAnalyzer(directory, { 
            showExternal,
            extensions: ['.tsx', '.ts', '.jsx', '.js']
        });
        
        analyzer.analyze();
        const report = analyzer.generateReport(format);
        
        if (outputFile) {
            fs.writeFileSync(outputFile, report);
            console.error(`📄 Report esportato in: ${outputFile}`);
            
            if (format === 'json') {
                const summary = analyzer.exportJSON().summary;
                console.error(`📊 File analizzati: ${summary.total_files}`);
                console.error(`🗑️  File inutilizzati: ${summary.unused_files_count}`);
            }
        } else {
            console.log(report);
        }
        
        if (analyzer.errors.length > 0) {
            console.error('\n⚠️  Errori durante l\'analisi:');
            analyzer.errors.forEach(error => console.error(`   ${error}`));
        }
        
    } catch (error) {
        console.error(`❌ Errore: ${error.message}`);
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = ReactImportAnalyzer;
