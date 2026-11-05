import * as vscode from 'vscode';
import * as path from 'path';
import { ActiveEditorState, CodeIssue, SelectionState } from './types';

export class ActivityTracker {
  private disposables: vscode.Disposable[] = [];
  private pauseTimer: NodeJS.Timeout | null = null;
  private diagnosticTimer: NodeJS.Timeout | null = null;
  private selectionTimer: NodeJS.Timeout | null = null;
  private lastAnalyzedSignature: string = '';

  constructor(
    private onCursorMove: (state: ActiveEditorState, lineHasError: boolean, lineErrorText?: string) => void,
    private onTypingActivity: (state: ActiveEditorState) => void,
    private onIssueDetected: (issue: CodeIssue, state: ActiveEditorState | null) => void,
    private onSelectionChange?: (selection: SelectionState | null) => void
  ) {}

  public start() {
    this.disposables.push(
      vscode.window.onDidChangeTextEditorSelection((e) => {
        if (e.textEditor !== vscode.window.activeTextEditor) {
          return;
        }
        const state = this.getActiveEditorState(e.textEditor);
        if (!state) {
          return;
        }
        const lineDiag = this.getDiagnosticOnLine(e.textEditor.document, state.cursorLine - 1);
        this.onCursorMove(state, Boolean(lineDiag), lineDiag?.message);

        // Handle multi-line / code block selection
        if (this.onSelectionChange) {
          if (this.selectionTimer) {
            clearTimeout(this.selectionTimer);
          }
          const selState = this.getActiveSelectionState(e.textEditor);
          if (!selState) {
            this.onSelectionChange(null);
          } else {
            this.selectionTimer = setTimeout(() => {
              if (this.onSelectionChange && vscode.window.activeTextEditor === e.textEditor) {
                this.onSelectionChange(this.getActiveSelectionState(e.textEditor));
              }
            }, 250);
          }
        }

        // If user moves cursor onto a line with an error or heuristic bug, schedule quick inspection
        this.schedulePauseCheck(e.textEditor, 900);
      }),

      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (!editor) {
          return;
        }
        const state = this.getActiveEditorState(editor);
        if (state) {
          const lineDiag = this.getDiagnosticOnLine(editor.document, state.cursorLine - 1);
          this.onCursorMove(state, Boolean(lineDiag), lineDiag?.message);
          this.schedulePauseCheck(editor, 1000);
        }
      }),

      vscode.workspace.onDidChangeTextDocument((e) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || e.document !== editor.document) {
          return;
        }
        const state = this.getActiveEditorState(editor);
        if (state) {
          this.onTypingActivity(state);
        }

        const delay = vscode.workspace
          .getConfiguration('codebird')
          .get<number>('pauseDelayMs', 1600);
        this.schedulePauseCheck(editor, delay);
      }),

      vscode.languages.onDidChangeDiagnostics(() => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          return;
        }
        if (this.diagnosticTimer) {
          clearTimeout(this.diagnosticTimer);
        }
        this.diagnosticTimer = setTimeout(() => {
          this.inspectEditorForIssues(editor, false);
        }, 700);
      })
    );
  }

  private schedulePauseCheck(editor: vscode.TextEditor, delayMs: number) {
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
    }
    this.pauseTimer = setTimeout(() => {
      const proactive = vscode.workspace
        .getConfiguration('codebird')
        .get<boolean>('proactiveSuggestions', true);
      if (proactive && vscode.window.activeTextEditor === editor) {
        this.inspectEditorForIssues(editor, false);
      }
    }, delayMs);
  }

  public getActiveSelectionState(editor = vscode.window.activeTextEditor): SelectionState | null {
    if (!editor || editor.document.uri.scheme !== 'file') {
      return null;
    }
    const sel = editor.selection;
    if (sel.isEmpty) {
      return null;
    }

    const doc = editor.document;
    const startLine0 = sel.start.line;
    const endLine0 = sel.end.character === 0 && sel.end.line > sel.start.line ? sel.end.line - 1 : sel.end.line;
    const lineCount = endLine0 - startLine0 + 1;

    // Extract full lines spanned by the selection so multi-line replacements preserve indentation cleanly
    const fullBlockRange = new vscode.Range(
      new vscode.Position(startLine0, 0),
      new vscode.Position(endLine0, doc.lineAt(endLine0).text.length)
    );
    const selectedText = doc.getText(fullBlockRange);

    if (lineCount < 2 && selectedText.trim().length < 10) {
      return null;
    }

    const visibleRange = editor.visibleRanges[0];
    const visibleStartLine = visibleRange ? visibleRange.start.line + 1 : 1;
    const visibleEndLine = visibleRange ? visibleRange.end.line + 1 : Math.max(1, doc.lineCount);
    const visibleSpan = Math.max(1, visibleEndLine - visibleStartLine);

    const rawYRatio = (startLine0 + 1 - visibleStartLine) / visibleSpan;
    const estimatedViewportYRatio = Math.max(0.08, Math.min(0.85, rawYRatio));

    return {
      fileUri: doc.uri.toString(),
      fileName: path.basename(doc.uri.fsPath),
      relativePath: vscode.workspace.asRelativePath(doc.uri, false),
      languageId: doc.languageId,
      startLine: startLine0 + 1,
      endLine: endLine0 + 1,
      lineCount,
      selectedText,
      estimatedViewportYRatio,
      estimatedViewportXRatio: 0.55
    };
  }

  public getActiveEditorState(editor = vscode.window.activeTextEditor): ActiveEditorState | null {
    if (!editor || editor.document.uri.scheme !== 'file') {
      return null;
    }

    const doc = editor.document;
    const pos = editor.selection.active;
    const cursorLine = pos.line + 1;
    const cursorColumn = pos.character + 1;
    const lineText = doc.lineAt(pos.line).text;

    const visibleRange = editor.visibleRanges[0];
    const visibleStartLine = visibleRange ? visibleRange.start.line + 1 : 1;
    const visibleEndLine = visibleRange ? visibleRange.end.line + 1 : Math.max(1, doc.lineCount);
    const visibleSpan = Math.max(1, visibleEndLine - visibleStartLine);

    const rawYRatio = (cursorLine - visibleStartLine) / visibleSpan;
    const estimatedViewportYRatio = Math.max(0.08, Math.min(0.88, rawYRatio));
    const estimatedViewportXRatio = Math.max(0.15, Math.min(0.85, cursorColumn / 90));

    return {
      fileUri: doc.uri.toString(),
      fileName: path.basename(doc.uri.fsPath),
      relativePath: vscode.workspace.asRelativePath(doc.uri, false),
      languageId: doc.languageId,
      cursorLine,
      cursorColumn,
      lineText,
      visibleStartLine,
      visibleEndLine,
      totalLines: doc.lineCount,
      estimatedViewportYRatio,
      estimatedViewportXRatio
    };
  }

  public inspectEditorForIssues(editor = vscode.window.activeTextEditor, forceEmit = false): CodeIssue | null {
    if (!editor || editor.document.uri.scheme !== 'file') {
      return null;
    }

    const doc = editor.document;
    const cursorLine0 = editor.selection.active.line;
    const issues = this.findIssuesInDocument(doc, cursorLine0);

    if (issues.length === 0) {
      return null;
    }

    // Prioritize issue on current cursor line first, then errors, then warnings/next-steps
    issues.sort((a, b) => {
      const aOnCursor = a.line === cursorLine0 + 1 ? 0 : 1;
      const bOnCursor = b.line === cursorLine0 + 1 ? 0 : 1;
      if (aOnCursor !== bOnCursor) {
        return aOnCursor - bOnCursor;
      }
      const sevRank = { error: 0, warning: 1, 'next-step': 2, info: 3 };
      return sevRank[a.severity] - sevRank[b.severity];
    });

    const topIssue = issues[0];
    const signature = `${topIssue.fileUri}:${topIssue.line}:${topIssue.rawMessage}:${topIssue.lineContent}`;

    if (!forceEmit && signature === this.lastAnalyzedSignature) {
      return topIssue;
    }

    this.lastAnalyzedSignature = signature;
    const state = this.getActiveEditorState(editor);
    if (state) {
      // Update state Y ratio to match the issue line so the bird flies to the issue line!
      const visibleSpan = Math.max(1, state.visibleEndLine - state.visibleStartLine);
      state.estimatedViewportYRatio = Math.max(
        0.1,
        Math.min(0.86, (topIssue.line - state.visibleStartLine) / visibleSpan)
      );
    }

    this.onIssueDetected(topIssue, state);
    return topIssue;
  }

  public findIssuesInDocument(doc: vscode.TextDocument, preferredLine0?: number): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const diagnostics = vscode.languages.getDiagnostics(doc.uri);
    const fileName = path.basename(doc.uri.fsPath);
    const relativePath = vscode.workspace.asRelativePath(doc.uri, false);

    // 1. Collect VS Code Language Server diagnostics (Errors & Warnings)
    for (const d of diagnostics) {
      if (
        d.severity !== vscode.DiagnosticSeverity.Error &&
        d.severity !== vscode.DiagnosticSeverity.Warning
      ) {
        continue;
      }
      const line0 = d.range.start.line;
      const lineContent = doc.lineAt(line0).text;
      const surroundingCode = this.getSurroundingCode(doc, line0, 5);
      const severity = d.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning';

      issues.push({
        id: `${relativePath}:${line0 + 1}:${d.message.slice(0, 40)}`,
        fileUri: doc.uri.toString(),
        fileName,
        relativePath,
        line: line0 + 1,
        column: d.range.start.character + 1,
        endLine: d.range.end.line + 1,
        endColumn: d.range.end.character + 1,
        severity,
        source: d.source || doc.languageId,
        rawMessage: d.message,
        lineContent,
        surroundingCode
      });
    }

    // 2. Proactive heuristic checks (catches issues in plain JS/Python/unsaved files immediately)
    const linesToScan: number[] = [];
    if (typeof preferredLine0 === 'number' && preferredLine0 >= 0 && preferredLine0 < doc.lineCount) {
      linesToScan.push(preferredLine0);
    }
    const maxLines = Math.min(doc.lineCount, 200);
    for (let i = 0; i < maxLines; i++) {
      if (i !== preferredLine0) {
        linesToScan.push(i);
      }
    }

    for (const line0 of linesToScan) {
      const text = doc.lineAt(line0).text;
      const trimmed = text.trim();
      if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) {
        // Check if it's a TODO/FIXME comment
        if (/\b(TODO|FIXME|BUG)\b/i.test(trimmed)) {
          issues.push(this.createHeuristicIssue(doc, line0, 'next-step', `Pending task comment: ${trimmed}`));
        }
        continue;
      }

      if (/\bconsol\.log\b|\bconsole\.lo[g]{2,}\b|\bconsole\.pritn\b/.test(text)) {
        issues.push(
          this.createHeuristicIssue(
            doc,
            line0,
            'error',
            `Typo in console logging call on line ${line0 + 1}: "${trimmed}"`
          )
        );
      } else if (/if\s*\(\s*[A-Za-z0-9_$.]+\s*=\s*[^=]/.test(text)) {
        issues.push(
          this.createHeuristicIssue(
            doc,
            line0,
            'error',
            `Suspicious assignment '=' inside 'if (...)' condition instead of comparison '==='.`
          )
        );
      } else if (/[^=!]==[^=]/.test(text) && ['javascript', 'typescript', 'javascriptreact', 'typescriptreact'].includes(doc.languageId)) {
        issues.push(
          this.createHeuristicIssue(
            doc,
            line0,
            'warning',
            `Loose equality '==' used instead of strict equality '==='.`
          )
        );
      } else if (/\bfetch\s*\(/.test(text) && !/\bawait\b/.test(text) && !/\.then\s*\(/.test(text)) {
        issues.push(
          this.createHeuristicIssue(
            doc,
            line0,
            'warning',
            `Async 'fetch()' call is not awaited or chained with '.then()'.`
          )
        );
      }
    }

    return issues;
  }

  private createHeuristicIssue(
    doc: vscode.TextDocument,
    line0: number,
    severity: 'error' | 'warning' | 'info' | 'next-step',
    message: string
  ): CodeIssue {
    const fileName = path.basename(doc.uri.fsPath);
    const relativePath = vscode.workspace.asRelativePath(doc.uri, false);
    const lineContent = doc.lineAt(line0).text;
    return {
      id: `${relativePath}:${line0 + 1}:${message.slice(0, 32)}`,
      fileUri: doc.uri.toString(),
      fileName,
      relativePath,
      line: line0 + 1,
      column: 1,
      endLine: line0 + 1,
      endColumn: lineContent.length + 1,
      severity,
      source: 'CodeBird Live Sensor',
      rawMessage: message,
      lineContent,
      surroundingCode: this.getSurroundingCode(doc, line0, 5)
    };
  }

  private getDiagnosticOnLine(doc: vscode.TextDocument, line0: number): vscode.Diagnostic | undefined {
    const diags = vscode.languages.getDiagnostics(doc.uri);
    return diags.find(
      (d) =>
        d.range.start.line <= line0 &&
        d.range.end.line >= line0 &&
        (d.severity === vscode.DiagnosticSeverity.Error || d.severity === vscode.DiagnosticSeverity.Warning)
    );
  }

  public getSurroundingCode(doc: vscode.TextDocument, centerLine0: number, radius = 5): string {
    const start = Math.max(0, centerLine0 - radius);
    const end = Math.min(doc.lineCount - 1, centerLine0 + radius);
    const lines: string[] = [];
    for (let i = start; i <= end; i++) {
      const prefix = i === centerLine0 ? '>> ' : '   ';
      lines.push(`${prefix}${i + 1}: ${doc.lineAt(i).text}`);
    }
    return lines.join('\n');
  }

  public dispose() {
    if (this.pauseTimer) {
      clearTimeout(this.pauseTimer);
    }
    if (this.diagnosticTimer) {
      clearTimeout(this.diagnosticTimer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}

