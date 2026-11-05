import * as vscode from 'vscode';
import * as path from 'path';
import { FileSummary, WorkspaceSnapshot } from './types';

export class WorkspaceTracker {
  private fileMap: Map<string, FileSummary> = new Map();
  private recentFiles: string[] = [];
  private disposables: vscode.Disposable[] = [];
  private onUpdateCallback?: (snapshot: WorkspaceSnapshot) => void;

  public async initialize(onUpdate?: (snapshot: WorkspaceSnapshot) => void): Promise<WorkspaceSnapshot> {
    this.onUpdateCallback = onUpdate;
    await this.scanWorkspace();

    // Watch for file saves, creations, deletions
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        this.indexDocument(doc);
        this.recordRecentFile(doc.uri);
        this.emitUpdate();
      }),
      vscode.workspace.onDidCreateFiles(() => {
        this.scanWorkspace().then(() => this.emitUpdate());
      }),
      vscode.workspace.onDidDeleteFiles(() => {
        this.scanWorkspace().then(() => this.emitUpdate());
      }),
      vscode.languages.onDidChangeDiagnostics(() => {
        this.refreshDiagnosticsCounts();
        this.emitUpdate();
      })
    );

    return this.getSnapshot();
  }

  public recordRecentFile(uri: vscode.Uri) {
    if (uri.scheme !== 'file') {
      return;
    }
    const rel = vscode.workspace.asRelativePath(uri, false);
    this.recentFiles = [rel, ...this.recentFiles.filter((f) => f !== rel)].slice(0, 10);
  }

  public async scanWorkspace(): Promise<void> {
    const excludePattern = '{**/node_modules/**,**/.git/**,**/out/**,**/dist/**,**/build/**,**/.next/**,**/*.min.js,**/package-lock.json}';
    const includePattern = '**/*.{ts,tsx,js,jsx,py,java,c,cpp,cs,go,rs,rb,php,html,css,json,md}';

    try {
      const uris = await vscode.workspace.findFiles(includePattern, excludePattern, 150);
      this.fileMap.clear();

      for (const uri of uris) {
        try {
          const doc = await vscode.workspace.openTextDocument(uri);
          this.indexDocument(doc);
        } catch {
          // Ignore unreadable binary or locked files
        }
      }
    } catch (err) {
      console.error('[CodeBird WorkspaceTracker] Error scanning workspace:', err);
    }
  }

  public indexDocument(doc: vscode.TextDocument) {
    if (doc.uri.scheme !== 'file') {
      return;
    }
    const relativePath = vscode.workspace.asRelativePath(doc.uri, false);
    if (
      relativePath.includes('node_modules') ||
      relativePath.startsWith('.git') ||
      relativePath.startsWith('out/') ||
      relativePath.startsWith('out\\')
    ) {
      return;
    }

    const text = doc.getText();
    const exportsList = this.extractExports(text);
    const importsList = this.extractImports(text);
    const todoMatches = text.match(/\b(TODO|FIXME|BUG|HACK)\b/gi);
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);

    const errorCount = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length;
    const warningCount = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning).length;

    this.fileMap.set(relativePath, {
      relativePath,
      languageId: doc.languageId,
      lineCount: doc.lineCount,
      exports: exportsList.slice(0, 15),
      imports: importsList.slice(0, 15),
      errorCount,
      warningCount,
      todoCount: todoMatches ? todoMatches.length : 0,
      lastModified: Date.now()
    });
  }

  private refreshDiagnosticsCounts() {
    for (const [relPath, summary] of this.fileMap.entries()) {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        continue;
      }
      const fullUri = vscode.Uri.file(path.join(root, relPath));
      const diagnostics = vscode.languages.getDiagnostics(fullUri);
      summary.errorCount = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length;
      summary.warningCount = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Warning).length;
    }
  }

  private extractExports(text: string): string[] {
    const results = new Set<string>();
    const patterns = [
      /export\s+(?:async\s+)?(?:function|class|interface|type|const|let|enum)\s+([A-Za-z0-9_$]+)/g,
      /def\s+([A-Za-z0-9_]+)\s*\(/g,
      /class\s+([A-Za-z0-9_]+)/g
    ];
    for (const regex of patterns) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        if (match[1]) {
          results.add(match[1]);
        }
      }
    }
    return Array.from(results);
  }

  private extractImports(text: string): string[] {
    const results = new Set<string>();
    const patterns = [
      /from\s+['"]([^'"]+)['"]/g,
      /require\(\s*['"]([^'"]+)['"]\s*\)/g,
      /import\s+([A-Za-z0-9_.]+)/g
    ];
    for (const regex of patterns) {
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        if (match[1]) {
          results.add(match[1]);
        }
      }
    }
    return Array.from(results);
  }

  public getSnapshot(): WorkspaceSnapshot {
    const folder = vscode.workspace.workspaceFolders?.[0];
    const files = Array.from(this.fileMap.values());
    const totalErrors = files.reduce((acc, f) => acc + f.errorCount, 0);
    const totalWarnings = files.reduce((acc, f) => acc + f.warningCount, 0);

    return {
      workspaceName: folder ? folder.name : 'Untitled Workspace',
      rootPath: folder ? folder.uri.fsPath : '',
      totalFiles: files.length,
      totalErrors,
      totalWarnings,
      files: files.slice(0, 60),
      recentFiles: this.recentFiles
    };
  }

  public getProjectContextString(activeRelativePath?: string): string {
    const snapshot = this.getSnapshot();
    const extCounts: Record<string, number> = {};
    for (const f of snapshot.files) {
      const ext = path.extname(f.relativePath) || f.languageId;
      extCounts[ext] = (extCounts[ext] || 0) + 1;
    }
    const stackSummary = Object.entries(extCounts)
      .map(([ext, count]) => `${ext}(${count})`)
      .join(', ');

    const lines: string[] = [
      `Workspace: ${snapshot.workspaceName} (${snapshot.totalFiles} files, ${snapshot.totalErrors} errors, ${snapshot.totalWarnings} warnings)`,
      `Detected File Types / Stack: ${stackSummary || 'TypeScript / JavaScript'}`
    ];

    if (snapshot.files.length > 0) {
      lines.push('Project Files, Exports & Imports:');
      for (const f of snapshot.files.slice(0, 25)) {
        const marker = f.relativePath === activeRelativePath ? ' [ACTIVE FILE]' : '';
        const exportsStr = f.exports.length > 0 ? ` exports:[${f.exports.slice(0, 8).join(', ')}]` : '';
        const importsStr = f.imports.length > 0 ? ` imports:[${f.imports.slice(0, 5).join(', ')}]` : '';
        const issuesStr =
          f.errorCount > 0 || f.warningCount > 0
            ? ` (${f.errorCount} errors, ${f.warningCount} warnings)`
            : '';
        lines.push(`- ${f.relativePath} (${f.languageId}, ${f.lineCount}L)${exportsStr}${importsStr}${issuesStr}${marker}`);
      }
    }

    return lines.join('\n');
  }

  private emitUpdate() {
    if (this.onUpdateCallback) {
      this.onUpdateCallback(this.getSnapshot());
    }
  }

  public dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

