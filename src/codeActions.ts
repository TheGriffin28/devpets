import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BirdSuggestion, ChatFileStep, SelectionActionType, SelectionState } from './types';

export class CodeActionsManager implements vscode.CodeLensProvider, vscode.HoverProvider, vscode.CodeActionProvider {
  private activeIssueDecoration: vscode.TextEditorDecorationType;
  private secondaryIssueDecoration: vscode.TextEditorDecorationType;
  private fixedSuccessDecoration: vscode.TextEditorDecorationType;

  // Map of fileUri -> Map of 1-based line -> BirdSuggestion
  private suggestionsByFile: Map<string, Map<number, BirdSuggestion>> = new Map();
  private activeSelection: SelectionState | null = null;
  private onDidChangeCodeLensesEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this.onDidChangeCodeLensesEmitter.event;

  constructor() {
    this.activeIssueDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(245, 158, 11, 0.12)',
      borderWidth: '0 0 0 4px',
      borderStyle: 'solid',
      borderColor: '#f59e0b',
      after: {
        margin: '0 0 0 1.2rem',
        color: '#fbbf24',
        fontWeight: '600'
      }
    });

    this.secondaryIssueDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(239, 68, 68, 0.08)',
      borderWidth: '0 0 0 3px',
      borderStyle: 'solid',
      borderColor: '#ef4444',
      after: {
        margin: '0 0 0 1.2rem',
        color: '#fca5a5',
        fontStyle: 'italic'
      }
    });

    this.fixedSuccessDecoration = vscode.window.createTextEditorDecorationType({
      isWholeLine: true,
      backgroundColor: 'rgba(34, 197, 94, 0.16)',
      borderWidth: '0 0 0 4px',
      borderStyle: 'solid',
      borderColor: '#22c55e',
      after: {
        contentText: ' ✨🐦 Fixed by Pip!',
        margin: '0 0 0 1.5rem',
        color: '#4ade80',
        fontWeight: 'bold'
      }
    });
  }

  public registerProviders(context: vscode.ExtensionContext) {
    const selector: vscode.DocumentSelector = { scheme: 'file' };
    context.subscriptions.push(
      vscode.languages.registerCodeLensProvider(selector, this),
      vscode.languages.registerHoverProvider(selector, this),
      vscode.languages.registerCodeActionsProvider(selector, this, {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix]
      })
    );
  }

  public setActiveSelection(selection: SelectionState | null) {
    this.activeSelection = selection;
    this.onDidChangeCodeLensesEmitter.fire();
  }

  public setFileSuggestions(fileUri: string, suggestions: BirdSuggestion[], primaryLine?: number) {
    const lineMap = new Map<number, BirdSuggestion>();
    for (const s of suggestions) {
      lineMap.set(s.line, s);
    }
    this.suggestionsByFile.set(fileUri, lineMap);
    this.onDidChangeCodeLensesEmitter.fire();
    this.renderDecorations(fileUri, primaryLine);
  }

  public highlightIssueLine(suggestion: BirdSuggestion) {
    let lineMap = this.suggestionsByFile.get(suggestion.fileUri);
    if (!lineMap) {
      lineMap = new Map<number, BirdSuggestion>();
      this.suggestionsByFile.set(suggestion.fileUri, lineMap);
    }
    lineMap.set(suggestion.line, suggestion);
    this.onDidChangeCodeLensesEmitter.fire();
    this.renderDecorations(suggestion.fileUri, suggestion.line);
  }

  private renderDecorations(fileUri: string, primaryLine?: number) {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.toString() !== fileUri) {
      return;
    }

    const lineMap = this.suggestionsByFile.get(fileUri);
    if (!lineMap || lineMap.size === 0) {
      editor.setDecorations(this.activeIssueDecoration, []);
      editor.setDecorations(this.secondaryIssueDecoration, []);
      return;
    }

    const primaryDecos: vscode.DecorationOptions[] = [];
    const secondaryDecos: vscode.DecorationOptions[] = [];

    for (const [line1, sug] of lineMap.entries()) {
      const lineIndex = Math.max(0, Math.min(editor.document.lineCount - 1, line1 - 1));
      const lineRange = editor.document.lineAt(lineIndex).range;

      const solutionText = sug.fixedCode
        ? `✅ Solution: ${sug.fixedCode.trim()}`
        : `💡 How to fix: ${sug.whatToDo}`;

      const fullInlineText = ` 🐦 What's wrong: ${sug.whatsWrong}   ➔   ${solutionText}`;

      const hoverMd = this.buildHoverMarkdown(sug);

      const decoOption: vscode.DecorationOptions = {
        range: lineRange,
        hoverMessage: hoverMd,
        renderOptions: {
          after: {
            contentText: fullInlineText
          }
        }
      };

      if (primaryLine === line1 || (!primaryLine && primaryDecos.length === 0)) {
        primaryDecos.push(decoOption);
      } else {
        secondaryDecos.push(decoOption);
      }
    }

    editor.setDecorations(this.activeIssueDecoration, primaryDecos);
    editor.setDecorations(this.secondaryIssueDecoration, secondaryDecos);
  }

  private buildHoverMarkdown(sug: BirdSuggestion): vscode.MarkdownString {
    const md = new vscode.MarkdownString('', true);
    md.isTrusted = true;
    md.supportHtml = true;

    const icon = sug.severity === 'error' ? '🚨' : sug.severity === 'warning' ? '⚠️' : '💡';
    md.appendMarkdown(`### 🐦 Pip (CodeBird AI) — ${icon} ${sug.title}\n\n`);
    md.appendMarkdown(`**❌ What's Wrong:**\n${sug.whatsWrong}\n\n`);
    md.appendMarkdown(`**💡 What To Do:**\n${sug.whatToDo}\n\n`);

    if (sug.fixedCode && sug.originalCode) {
      md.appendMarkdown(`**✅ Solution (Code Fix):**\n`);
      md.appendCodeblock(`- ${sug.originalCode.trim()}\n+ ${sug.fixedCode.trim()}`, 'diff');
      const args = encodeURIComponent(JSON.stringify({ fileUri: sug.fileUri, line: sug.line }));
      md.appendMarkdown(`\n[✨ **Click Here to Apply Solution**](command:codebird.applyInlineFix?${args}) &nbsp;|&nbsp; `);
    }

    const dismissArgs = encodeURIComponent(JSON.stringify({ fileUri: sug.fileUri, line: sug.line, issueId: sug.issueId }));
    md.appendMarkdown(`[👍 Dismiss](command:codebird.dismissInlineIssue?${dismissArgs})`);

    return md;
  }

  // CodeLens Provider: shows clickable "What's Wrong", "Apply Solution", AND Multi-Line Selection Actions!
  public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];

    // 1. If the user has highlighted a multi-line code selection in this document, show Pip Selection Action buttons right above the selection!
    if (this.activeSelection && this.activeSelection.fileUri === document.uri.toString()) {
      const selStart0 = Math.max(0, Math.min(document.lineCount - 1, this.activeSelection.startLine - 1));
      const selRange = document.lineAt(selStart0).range;
      const lineSpanLabel =
        this.activeSelection.startLine === this.activeSelection.endLine
          ? `L${this.activeSelection.startLine}`
          : `L${this.activeSelection.startLine}–L${this.activeSelection.endLine}`;

      const actions: Array<{ action: SelectionActionType; label: string; tooltip: string }> = [
        {
          action: 'refactor',
          label: `🐦 ✨ Refactor (${lineSpanLabel})`,
          tooltip: 'Clean up code, fix bugs, and modernize syntax in the selected lines'
        },
        {
          action: 'try-catch',
          label: '🛡️ Add try/catch',
          tooltip: 'Wrap selected lines in a safe try/catch error-handling block'
        },
        {
          action: 'add-comments',
          label: '📝 Add Comments / JSDoc',
          tooltip: 'Generate JSDoc and explanatory inline comments for the selected block'
        },
        {
          action: 'explain',
          label: '🔍 Explain Selection',
          tooltip: 'Have Pip explain what this selected block does'
        }
      ];

      for (const item of actions) {
        lenses.push(
          new vscode.CodeLens(selRange, {
            title: item.label,
            tooltip: item.tooltip,
            command: 'codebird.runSelectionAction',
            arguments: [item.action]
          })
        );
      }
    }

    // 2. Per-line issue CodeLenses
    const lineMap = this.suggestionsByFile.get(document.uri.toString());
    if (!lineMap || lineMap.size === 0) {
      return lenses;
    }

    for (const [line1, sug] of lineMap.entries()) {
      const line0 = Math.max(0, Math.min(document.lineCount - 1, line1 - 1));
      const range = document.lineAt(line0).range;

      // Lens 1: Shows What's Wrong (clicking pops up a full explanation modal with Fix button)
      lenses.push(
        new vscode.CodeLens(range, {
          title: `🐦 ❌ What's wrong: ${sug.whatsWrong}`,
          tooltip: `${sug.whatsWrong}\n\nNext Step: ${sug.whatToDo}`,
          command: 'codebird.showIssueDetails',
          arguments: [sug]
        })
      );

      // Lens 2: 1-Click Solution button right in the editor!
      if (sug.fixedCode) {
        const isMultiLine = sug.fixedCode.includes('\n');
        const previewText = isMultiLine
          ? `Apply Multi-Line Solution (Lines ${sug.line}–${sug.endLine || sug.line})`
          : sug.fixedCode.trim();
        lenses.push(
          new vscode.CodeLens(range, {
            title: `✅ Apply Solution: ${previewText}`,
            tooltip: `Click to replace with:\n${sug.fixedCode.trim()}`,
            command: 'codebird.applyInlineFix',
            arguments: [{ fileUri: sug.fileUri, line: sug.line }]
          })
        );
      } else {
        lenses.push(
          new vscode.CodeLens(range, {
            title: `💡 Solution: ${sug.whatToDo}`,
            tooltip: sug.whatToDo,
            command: 'codebird.showIssueDetails',
            arguments: [sug]
          })
        );
      }
    }

    return lenses;
  }

  // Hover Provider
  public provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const lineMap = this.suggestionsByFile.get(document.uri.toString());
    if (!lineMap) {
      return null;
    }
    const sug = lineMap.get(position.line + 1);
    if (!sug) {
      return null;
    }
    return new vscode.Hover(this.buildHoverMarkdown(sug), document.lineAt(position.line).range);
  }

  // Quick Fix Lightbulb Provider (Ctrl+. / Cmd+.)
  public provideCodeActions(document: vscode.TextDocument, range: vscode.Range): vscode.CodeAction[] {
    const lineMap = this.suggestionsByFile.get(document.uri.toString());
    if (!lineMap) {
      return [];
    }
    const sug = lineMap.get(range.start.line + 1);
    if (!sug || !sug.fixedCode) {
      return [];
    }

    const action = new vscode.CodeAction(
      `🐦 Pip Fix: ${sug.title} ➔ ${sug.fixedCode.trim()}`,
      vscode.CodeActionKind.QuickFix
    );
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, document.lineAt(range.start.line).range, sug.fixedCode);
    action.isPreferred = true;
    return [action];
  }

  public getSuggestionAt(fileUri: string, line1Based: number): BirdSuggestion | undefined {
    return this.suggestionsByFile.get(fileUri)?.get(line1Based);
  }

  public removeSuggestionAt(fileUri: string, line1Based: number) {
    const lineMap = this.suggestionsByFile.get(fileUri);
    if (lineMap) {
      lineMap.delete(line1Based);
      this.onDidChangeCodeLensesEmitter.fire();
      this.renderDecorations(fileUri);
    }
  }

  public clearIssueHighlight() {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.setDecorations(this.activeIssueDecoration, []);
      editor.setDecorations(this.secondaryIssueDecoration, []);
    }
  }

  public async jumpToLine(fileUriStr: string, lineNumber1Based: number): Promise<void> {
    try {
      const uri = vscode.Uri.parse(fileUriStr);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });

      const targetLine = Math.max(0, Math.min(doc.lineCount - 1, lineNumber1Based - 1));
      const pos = new vscode.Position(targetLine, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    } catch (err) {
      console.error('[CodeBird CodeActions] Failed to jump to line:', err);
    }
  }

  public async applySuggestionFix(suggestion: BirdSuggestion): Promise<boolean> {
    if (!suggestion.fixedCode) {
      return false;
    }

    try {
      const uri = vscode.Uri.parse(suggestion.fileUri);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false });

      const startLineIndex = Math.max(0, Math.min(doc.lineCount - 1, suggestion.line - 1));
      const endLineIndex = suggestion.endLine
        ? Math.max(startLineIndex, Math.min(doc.lineCount - 1, suggestion.endLine - 1))
        : startLineIndex;

      const replaceRange = new vscode.Range(
        new vscode.Position(startLineIndex, 0),
        new vscode.Position(endLineIndex, doc.lineAt(endLineIndex).text.length)
      );

      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, replaceRange, suggestion.fixedCode);

      const applied = await vscode.workspace.applyEdit(edit);
      if (applied) {
        for (let l = suggestion.line; l <= (suggestion.endLine || suggestion.line); l++) {
          this.removeSuggestionAt(suggestion.fileUri, l);
        }
        const newEndLineIndex = Math.min(
          editor.document.lineCount - 1,
          startLineIndex + suggestion.fixedCode.split(/\r?\n/).length - 1
        );
        const updatedLineRange = new vscode.Range(
          new vscode.Position(startLineIndex, 0),
          new vscode.Position(newEndLineIndex, editor.document.lineAt(newEndLineIndex).text.length)
        );
        editor.setDecorations(this.fixedSuccessDecoration, [{ range: updatedLineRange }]);
        setTimeout(() => {
          editor.setDecorations(this.fixedSuccessDecoration, []);
        }, 2600);
      }

      return applied;
    } catch (err) {
      console.error('[CodeBird CodeActions] Failed to apply fix:', err);
      return false;
    }
  }

  public async applyChatFileStep(step: ChatFileStep): Promise<string | null> {
    try {
      const activeEditor = vscode.window.activeTextEditor;
      const rootFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const baseDir = rootFolder || (activeEditor ? path.dirname(activeEditor.document.uri.fsPath) : '');

      if (!baseDir) {
        return null;
      }

      const cleanedTarget = step.targetFile.replace(/^[/\\]+/, '');
      const fullPath = path.isAbsolute(cleanedTarget) ? cleanedTarget : path.join(baseDir, cleanedTarget);
      const fileUri = vscode.Uri.file(fullPath);

      if (step.actionType === 'create' || !fs.existsSync(fullPath)) {
        const parentDir = path.dirname(fullPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(fullPath, step.code, 'utf8');
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });

        const firstLineRange = editor.document.lineAt(0).range;
        editor.setDecorations(this.fixedSuccessDecoration, [{ range: firstLineRange }]);
        setTimeout(() => {
          editor.setDecorations(this.fixedSuccessDecoration, []);
        }, 3000);

        return `Created ${path.basename(fullPath)} and opened in editor!`;
      } else {
        // Update existing file
        const doc = await vscode.workspace.openTextDocument(fileUri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        const edit = new vscode.WorkspaceEdit();

        const trimmedCode = step.code.trim();
        let insertLine = 0;

        if (trimmedCode.startsWith('import ') && trimmedCode.split(/\r?\n/).length <= 5) {
          // Insert import at top of file
          insertLine = 0;
          edit.insert(fileUri, new vscode.Position(0, 0), `${trimmedCode}\n`);
        } else {
          // Append or insert at end of file
          insertLine = Math.max(0, doc.lineCount - 1);
          const lastLineLen = doc.lineAt(insertLine).text.length;
          edit.insert(fileUri, new vscode.Position(insertLine, lastLineLen), `\n\n${trimmedCode}\n`);
        }

        const applied = await vscode.workspace.applyEdit(edit);
        if (applied) {
          const targetDecoLine = Math.min(editor.document.lineCount - 1, insertLine + 1);
          const range = editor.document.lineAt(targetDecoLine).range;
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
          editor.setDecorations(this.fixedSuccessDecoration, [{ range }]);
          setTimeout(() => {
            editor.setDecorations(this.fixedSuccessDecoration, []);
          }, 3000);
        }

        return `Updated ${path.basename(fullPath)} with Step ${step.stepNumber}!`;
      }
    } catch (err) {
      console.error('[CodeBird CodeActions] Failed to apply chat file step:', err);
      return null;
    }
  }

  public dispose() {
    this.activeIssueDecoration.dispose();
    this.secondaryIssueDecoration.dispose();
    this.fixedSuccessDecoration.dispose();
    this.onDidChangeCodeLensesEmitter.dispose();
  }
}
