import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  BirdSuggestion,
  ChatFileStep,
  ChatImageAttachment,
  ChatTurn,
  CodeIssue,
  SelectionActionType,
  SelectionState
} from './types';

interface LLMJsonOutput {
  title: string;
  whatsWrong: string;
  whatToDo: string;
  fixedCode?: string;
}

export class AIAgent {
  private dismissedIssueIds: Set<string> = new Set();
  private chatHistory: ChatTurn[] = [];
  private runtimeProvider: string = '';
  private runtimeApiKey: string = '';
  private runtimeModel: string = '';
  private configFilePath = path.join(os.homedir(), '.codebird-config.json');

  constructor() {
    this.loadSavedUserConfig();
  }

  public getChatHistory(): ChatTurn[] {
    return this.chatHistory;
  }

  public clearChatHistory() {
    this.chatHistory = [];
    this.persistConfigToDisk();
  }

  private loadSavedUserConfig() {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const raw = JSON.parse(fs.readFileSync(this.configFilePath, 'utf8'));
        if (raw.apiKey) this.runtimeApiKey = String(raw.apiKey).trim();
        if (raw.provider) this.runtimeProvider = String(raw.provider).trim();
        if (raw.model) this.runtimeModel = String(raw.model).trim();
        if (Array.isArray(raw.chatHistory)) {
          this.chatHistory = raw.chatHistory.slice(-25);
        }
        // Auto-infer provider from API key prefix if set to 'auto'
        if ((!this.runtimeProvider || this.runtimeProvider === 'auto') && this.runtimeApiKey) {
          this.runtimeProvider = this.resolveProvider('auto', this.runtimeApiKey);
        }
      }
    } catch {
      // ignore
    }
  }

  public persistConfigToDisk() {
    try {
      const effectiveProvider =
        (!this.runtimeProvider || this.runtimeProvider === 'auto') && this.runtimeApiKey
          ? this.resolveProvider('auto', this.runtimeApiKey)
          : this.runtimeProvider || 'gemini';
      fs.writeFileSync(
        this.configFilePath,
        JSON.stringify(
          {
            provider: effectiveProvider,
            apiKey: this.runtimeApiKey,
            model: this.runtimeModel || 'gemini-3.8-flash',
            chatHistory: this.chatHistory
          },
          null,
          2
        ),
        'utf8'
      );
    } catch {
      // ignore
    }
  }

  public getSavedConfig(): { provider: string; apiKey: string; model: string } {
    const { provider, apiKey, customModel } = this.getConfig();
    const resolvedProvider = this.resolveProvider(provider, apiKey);
    return {
      provider: resolvedProvider === 'auto' ? provider : resolvedProvider,
      apiKey,
      model: customModel || 'gemini-3.8-flash'
    };
  }

  public setRuntimeConfig(provider: string, apiKey: string, model?: string) {
    if (apiKey && apiKey.trim()) {
      this.runtimeApiKey = apiKey.trim();
    }
    const cleanProvider = provider.trim();
    if (cleanProvider && cleanProvider !== 'auto') {
      this.runtimeProvider = cleanProvider;
    } else if (this.runtimeApiKey) {
      this.runtimeProvider = this.resolveProvider('auto', this.runtimeApiKey);
    } else {
      this.runtimeProvider = cleanProvider || 'auto';
    }
    if (model && model.trim()) {
      this.runtimeModel = model.trim();
    }
    this.persistConfigToDisk();
  }

  public dismissIssue(issueId: string) {
    this.dismissedIssueIds.add(issueId);
  }

  public isDismissed(issueId: string): boolean {
    return this.dismissedIssueIds.has(issueId);
  }

  private getConfig() {
    const cfg = vscode.workspace.getConfiguration('codebird');
    const provider = this.runtimeProvider || cfg.get<string>('aiProvider', 'auto');
    const apiKey =
      this.runtimeApiKey ||
      cfg.get<string>('apiKey', '').trim() ||
      process.env.GEMINI_API_KEY ||
      process.env.OPENAI_API_KEY ||
      process.env.GROQ_API_KEY ||
      '';
    const customModel = this.runtimeModel || cfg.get<string>('model', '').trim() || 'gemini-3.8-flash';
    const ollamaUrl = cfg.get<string>('ollamaUrl', 'http://127.0.0.1:11434').trim();

    return { provider, apiKey, customModel, ollamaUrl };
  }

  public getResolvedProviderName(): string {
    const { provider, apiKey } = this.getConfig();
    if (provider !== 'auto') {
      return provider;
    }
    if (apiKey.startsWith('AIza') || apiKey.startsWith('AQ.')) {
      return 'gemini';
    }
    if (apiKey.startsWith('gsk_')) {
      return 'groq';
    }
    if (apiKey.startsWith('sk-')) {
      return 'openai';
    }
    return 'auto (Ollama / Smart Engine)';
  }

  /**
   * Analyzes a detected code issue (error, warning, or proactive code smell)
   * and produces a structured BirdSuggestion with an explanation and optional 1-click fix.
   */
  public async analyzeIssue(issue: CodeIssue, projectContext: string): Promise<BirdSuggestion> {
    const { provider, apiKey, customModel, ollamaUrl } = this.getConfig();

    const prompt = this.buildIssuePrompt(issue, projectContext);

    // Determine provider priority
    const effectiveProvider = this.resolveProvider(provider, apiKey);

    try {
      if (effectiveProvider === 'gemini' && apiKey) {
        const res = await this.callGemini(prompt, apiKey, customModel || 'gemini-2.5-flash');
        if (res) {
          return this.toBirdSuggestion(issue, res, 'Gemini AI');
        }
      } else if (effectiveProvider === 'groq' && apiKey) {
        const res = await this.callOpenAICompatible(
          'https://api.groq.com/openai/v1/chat/completions',
          prompt,
          apiKey,
          customModel || 'llama-3.3-70b-versatile'
        );
        if (res) {
          return this.toBirdSuggestion(issue, res, 'Groq AI');
        }
      } else if (effectiveProvider === 'openai' && apiKey) {
        const res = await this.callOpenAICompatible(
          'https://api.openai.com/v1/chat/completions',
          prompt,
          apiKey,
          customModel || 'gpt-4o-mini'
        );
        if (res) {
          return this.toBirdSuggestion(issue, res, 'OpenAI');
        }
      } else if (effectiveProvider === 'ollama' || effectiveProvider === 'auto') {
        const ollamaRes = await this.callOllama(prompt, ollamaUrl, customModel);
        if (ollamaRes) {
          return this.toBirdSuggestion(issue, ollamaRes, 'Local Ollama');
        }
      }
    } catch (err) {
      console.warn('[CodeBird AIAgent] Cloud/Ollama call failed, falling back to Smart Engine:', err);
    }

    // Instant fallback: Built-in Smart Code Analyzer
    return this.analyzeLocally(issue);
  }

  /**
   * Executes a Multi-Line Selection Action ('refactor' | 'try-catch' | 'add-comments' | 'explain')
   * on the user's highlighted code block and returns a BirdSuggestion with a multi-line replacement.
   */
  public async runSelectionAction(
    action: SelectionActionType,
    sel: SelectionState,
    projectContext: string
  ): Promise<BirdSuggestion> {
    const { provider, apiKey, customModel, ollamaUrl } = this.getConfig();
    const effectiveProvider = this.resolveProvider(provider, apiKey);

    const actionDescriptions: Record<SelectionActionType, string> = {
      refactor:
        'Refactor and clean up the selected code block. Fix any bugs, typos (e.g., consol.log), loose equality (==), missing awaits, or accidental assignments, while preserving exact behavior and indentation.',
      'try-catch':
        'Wrap the selected code block (or function body if a whole function is selected) in a clean try/catch error-handling block with appropriate logging, preserving exact base indentation.',
      'add-comments':
        'Add concise, helpful JSDoc / docstring and inline explanatory comments to the selected code block while keeping all executable code intact.',
      explain:
        'Explain clearly what this selected code block does step by step, including inputs, outputs, and any potential bugs or edge cases. Set fixedCode to empty string "".'
    };

    const prompt = `You are "Pip", an AI coding bird assistant in VS Code.
Perform the following action on Lines ${sel.startLine}–${sel.endLine} of "${sel.relativePath}" (${sel.languageId}):
Action: ${action.toUpperCase()} — ${actionDescriptions[action]}

Selected Code (Lines ${sel.startLine}–${sel.endLine}):
\`\`\`${sel.languageId}
${sel.selectedText}
\`\`\`

${projectContext}

Respond ONLY with a valid JSON object matching this exact schema:
{
  "title": "Short 3-6 word headline of the ${action} result",
  "whatsWrong": "Clear explanation of what was improved, wrapped, documented, or how the block works",
  "whatToDo": "1 sentence telling the user to review the diff and click Apply Solution",
  "fixedCode": "Complete multi-line replacement for the selected lines (preserve base indentation, or empty string if action is explain)"
}`;

    try {
      let llmRes: LLMJsonOutput | null = null;
      let providerLabel = 'CodeBird Smart Engine';

      if (effectiveProvider === 'gemini' && apiKey) {
        llmRes = await this.callGemini(prompt, apiKey, customModel || 'gemini-2.5-flash');
        providerLabel = 'Gemini AI';
      } else if (effectiveProvider === 'groq' && apiKey) {
        llmRes = await this.callOpenAICompatible(
          'https://api.groq.com/openai/v1/chat/completions',
          prompt,
          apiKey,
          customModel || 'llama-3.3-70b-versatile'
        );
        providerLabel = 'Groq AI';
      } else if (effectiveProvider === 'openai' && apiKey) {
        llmRes = await this.callOpenAICompatible(
          'https://api.openai.com/v1/chat/completions',
          prompt,
          apiKey,
          customModel || 'gpt-4o-mini'
        );
        providerLabel = 'OpenAI';
      } else if (effectiveProvider === 'ollama' || effectiveProvider === 'auto') {
        llmRes = await this.callOllama(prompt, ollamaUrl, customModel);
        providerLabel = 'Local Ollama';
      }

      if (llmRes) {
        const hasFix =
          action !== 'explain' &&
          Boolean(llmRes.fixedCode && llmRes.fixedCode.trim().length > 0 && llmRes.fixedCode !== sel.selectedText);
        return {
          issueId: `selection:${sel.relativePath}:${sel.startLine}-${sel.endLine}:${action}`,
          fileUri: sel.fileUri,
          fileName: sel.fileName,
          relativePath: sel.relativePath,
          line: sel.startLine,
          endLine: sel.endLine,
          severity: 'info',
          title: llmRes.title || `Selection ${action.toUpperCase()}`,
          whatsWrong: llmRes.whatsWrong,
          whatToDo: llmRes.whatToDo || 'Click "Apply Solution" to update the selected lines.',
          originalCode: sel.selectedText,
          fixedCode: hasFix ? llmRes.fixedCode : undefined,
          fixRange: hasFix
            ? {
                startLine: sel.startLine - 1,
                startCharacter: 0,
                endLine: sel.endLine - 1,
                endCharacter: 9999
              }
            : undefined,
          providerUsed: providerLabel
        };
      }
    } catch (err) {
      console.warn('[CodeBird AIAgent] Selection LLM call failed, using Smart Multi-Line Transformer:', err);
    }

    return this.runSelectionActionLocally(action, sel);
  }

  public runSelectionActionLocally(action: SelectionActionType, sel: SelectionState): BirdSuggestion {
    const rawLines = sel.selectedText.split(/\r?\n/);
    const firstNonEmpty = rawLines.find((l) => l.trim().length > 0) || '';
    const baseIndent = firstNonEmpty.match(/^\s*/)?.[0] || '';
    const isPython = sel.languageId === 'python';

    let title = '';
    let whatsWrong = '';
    let whatToDo = '';
    let fixedCode: string | undefined;

    if (action === 'refactor') {
      const changesMade: string[] = [];
      const refactoredLines = rawLines.map((line) => {
        let updated = line;
        if (/\bconsol\.log\b|\bconsole\.lo[g]{2,}\b|\bconsole\.pritn\b/.test(updated)) {
          updated = updated
            .replace(/\bconsol\.log\b/g, 'console.log')
            .replace(/\bconsole\.lo[g]{2,}\b/g, 'console.log')
            .replace(/\bconsole\.pritn\b/g, 'console.log');
          changesMade.push('Fixed `console.log` typo');
        }
        if (/\bfetch\s*\(/.test(updated) && !/\bawait\b/.test(updated) && !/\.then\s*\(/.test(updated)) {
          updated = updated.replace(/\bfetch\s*\(/, 'await fetch(');
          changesMade.push('Added missing `await` before `fetch()`');
        }
        if (/([^=!])==([^=])/.test(updated) && !updated.trim().startsWith('//')) {
          updated = updated.replace(/([^=!])==([^=])/g, '$1===$2');
          changesMade.push('Upgraded `==` to strict `===`');
        }
        if (/if\s*\(\s*[A-Za-z0-9_$.]+\s*=\s*[^=]/.test(updated)) {
          updated = updated.replace(/(if\s*\(\s*[A-Za-z0-9_$.]+\s*)=(\s*[^=])/, '$1===$2');
          changesMade.push('Fixed accidental `=` assignment inside `if (...)`');
        }
        if (/^\s*var\s+/.test(updated)) {
          updated = updated.replace(/^(\s*)var\s+/, '$1const ');
          changesMade.push('Modernized `var` to `const`');
        }
        return updated;
      });

      const candidate = refactoredLines.join('\n');
      if (changesMade.length > 0 && candidate !== sel.selectedText) {
        fixedCode = candidate;
        title = `✨ Refactored Lines ${sel.startLine}–${sel.endLine} (${changesMade.length} fixes)`;
        whatsWrong = `Found and cleaned up ${changesMade.length} issue(s) in your selection: ${Array.from(new Set(changesMade)).join(', ')}.`;
        whatToDo = 'Click "Fix It For Me / Apply Solution" to replace the selected block with the cleaned-up version.';
      } else {
        // Clean up redundant blank lines or trailing whitespace
        const cleaned = rawLines
          .filter((l, idx) => !(l.trim() === '' && rawLines[idx - 1]?.trim() === ''))
          .map((l) => l.trimEnd())
          .join('\n');
        fixedCode = cleaned !== sel.selectedText ? cleaned : undefined;
        title = `✨ Selection Reviewed (Lines ${sel.startLine}–${sel.endLine})`;
        whatsWrong = fixedCode
          ? 'Cleaned up formatting and redundant blank lines in the selected block.'
          : 'Your selected code block already looks clean with no syntax or lint smells!';
        whatToDo = fixedCode ? 'Click Apply to tidy up the block.' : 'Try "Add try/catch" or "Add Comments" if you want to enhance this block.';
      }
    } else if (action === 'try-catch') {
      title = `🛡️ Added try/catch Around Lines ${sel.startLine}–${sel.endLine}`;
      whatsWrong =
        'Unprotected network, I/O, or parsing statements can throw uncaught runtime exceptions that crash the caller.';
      whatToDo = 'Apply this `try / catch` wrapper so errors are caught and logged safely.';

      if (isPython) {
        const indentedBody = rawLines.map((l) => (l.trim() ? `    ${l}` : l)).join('\n');
        fixedCode = `${baseIndent}try:\n${indentedBody}\n${baseIndent}except Exception as error:\n${baseIndent}    print(f"Error in lines ${sel.startLine}-${sel.endLine}: {error}")\n${baseIndent}    raise`;
      } else {
        // Check if first line is a function header and last line is closing brace
        const firstTrim = rawLines[0]?.trim() || '';
        const lastTrim = rawLines[rawLines.length - 1]?.trim() || '';
        if (/^(export\s+)?(async\s+)?function\b/.test(firstTrim) && lastTrim === '}' && rawLines.length >= 3) {
          const header = rawLines[0];
          const footer = rawLines[rawLines.length - 1];
          const innerLines = rawLines.slice(1, -1);
          const innerIndent = `${baseIndent}  `;
          const indentedInner = innerLines.map((l) => (l.trim() ? `  ${l}` : l)).join('\n');
          fixedCode = [
            header,
            `${innerIndent}try {`,
            indentedInner,
            `${innerIndent}} catch (error) {`,
            `${innerIndent}  console.error("Error in function:", error);`,
            `${innerIndent}  throw error;`,
            `${innerIndent}}`,
            footer
          ].join('\n');
        } else {
          const indentedBody = rawLines.map((l) => (l.trim() ? `  ${l}` : l)).join('\n');
          fixedCode = [
            `${baseIndent}try {`,
            indentedBody,
            `${baseIndent}} catch (error) {`,
            `${baseIndent}  console.error("Error in lines ${sel.startLine}-${sel.endLine}:", error);`,
            `${baseIndent}}`
          ].join('\n');
        }
      }
    } else if (action === 'add-comments') {
      title = `📝 Added Documentation to Lines ${sel.startLine}–${sel.endLine}`;
      whatsWrong = 'Added clear JSDoc/inline documentation describing the purpose and flow of your selected code block.';
      whatToDo = 'Click "Fix It For Me / Apply Solution" to insert the documented code block.';

      const annotatedLines: string[] = [];
      const firstLineTrim = rawLines[0]?.trim() || '';
      const fnMatch = firstLineTrim.match(/(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(([^)]*)\)/);

      if (fnMatch) {
        const fnName = fnMatch[1];
        const params = fnMatch[2]
          .split(',')
          .map((p) => p.trim().split(/[:=]/)[0].trim())
          .filter(Boolean);
        annotatedLines.push(`${baseIndent}/**`);
        annotatedLines.push(`${baseIndent} * Executes \`${fnName}\` workflow.`);
        for (const p of params) {
          annotatedLines.push(`${baseIndent} * @param ${p} - Input parameter \`${p}\``);
        }
        annotatedLines.push(`${baseIndent} */`);
      } else {
        annotatedLines.push(
          isPython
            ? `${baseIndent}# --- Section: Lines ${sel.startLine}-${sel.endLine} ---`
            : `${baseIndent}// --- Section: Lines ${sel.startLine}-${sel.endLine} ---`
        );
      }

      for (const line of rawLines) {
        const t = line.trim();
        const lineIndent = line.match(/^\s*/)?.[0] || baseIndent;
        if (/\bfetch\s*\(/.test(t)) {
          annotatedLines.push(`${lineIndent}// Fetch remote data from API endpoint`);
        } else if (/^if\s*\(/.test(t)) {
          annotatedLines.push(`${lineIndent}// Validate condition before proceeding`);
        } else if (/^return\b/.test(t)) {
          annotatedLines.push(`${lineIndent}// Return computed result to caller`);
        }
        annotatedLines.push(line);
      }

      fixedCode = annotatedLines.join('\n');
    } else {
      // 'explain'
      title = `🔍 Explanation of Lines ${sel.startLine}–${sel.endLine} (${sel.lineCount} lines)`;
      const observations: string[] = [];
      if (/\basync\b|\bawait\b|\bfetch\b/.test(sel.selectedText)) {
        observations.push('Performs asynchronous/network operations (`async`/`fetch`).');
      }
      if (/\bif\s*\(|\bswitch\b/.test(sel.selectedText)) {
        observations.push('Contains conditional branching logic (`if` checks).');
      }
      if (/\breturn\b/.test(sel.selectedText)) {
        observations.push('Returns a structured output value to the caller.');
      }
      if (/\bconsol\.log\b|[^=!]==[^=]|if\s*\([^)]*=[^=]/.test(sel.selectedText)) {
        observations.push('⚠️ Note: Contains potential bugs that you can fix with 1 click using "✨ Refactor"!');
      }
      whatsWrong =
        observations.length > 0
          ? `Summary of Lines ${sel.startLine}–${sel.endLine} in ${sel.fileName}:\n• ${observations.join('\n• ')}`
          : `This ${sel.lineCount}-line block in ${sel.fileName} executes sequential statements from line ${sel.startLine} to ${sel.endLine}.`;
      whatToDo = 'Use "✨ Refactor", "🛡️ Add try/catch", or "📝 Add Comments" to transform this selection.';
    }

    const hasFix = Boolean(fixedCode && fixedCode !== sel.selectedText);
    return {
      issueId: `selection:${sel.relativePath}:${sel.startLine}-${sel.endLine}:${action}`,
      fileUri: sel.fileUri,
      fileName: sel.fileName,
      relativePath: sel.relativePath,
      line: sel.startLine,
      endLine: sel.endLine,
      severity: 'info',
      title,
      whatsWrong,
      whatToDo,
      originalCode: sel.selectedText,
      fixedCode: hasFix ? fixedCode : undefined,
      fixRange: hasFix
        ? {
            startLine: sel.startLine - 1,
            startCharacter: 0,
            endLine: sel.endLine - 1,
            endCharacter: 9999
          }
        : undefined,
      providerUsed: 'CodeBird Smart Engine'
    };
  }

  /**
   * Answers a free-form user question from the bird's interactive chat bubble,
   * using conversation history + active file + cursor line + full scanned project context,
   * and produces actionable multi-file implementation steps (create file / update file).
   */
  public async askBirdQuestion(
    question: string,
    activeFileName: string,
    cursorLine: number,
    surroundingCode: string,
    projectContext: string,
    image?: ChatImageAttachment
  ): Promise<{ answer: string; steps?: ChatFileStep[]; chatHistory: ChatTurn[]; providerUsed: string }> {
    const { provider, apiKey, customModel, ollamaUrl } = this.getConfig();
    const effectiveProvider = this.resolveProvider(provider, apiKey);

    const historyText =
      this.chatHistory.length > 0
        ? 'Previous Conversation History:\n' +
          this.chatHistory
            .slice(-6)
            .map(
              (turn, idx) =>
                `Turn ${idx + 1} User: ${turn.question}${turn.image ? ' [Attached Image]' : ''}\nTurn ${idx + 1} DevPets: ${turn.answer}${
                  turn.steps && turn.steps.length > 0
                    ? ` (Proposed steps for files: ${turn.steps.map((s) => s.targetFile).join(', ')})`
                    : ''
                }`
            )
            .join('\n\n')
        : 'No previous conversation turns yet.';

    const imageInstruction = image
      ? `The user has attached an image (${image.name || 'image/screenshot'}). Carefully examine the visual design, layout, UI elements, buttons, inputs, colors, architecture, or error text shown in the image. Explain how to build this exact UI or resolve the error in this project, and generate complete code in the steps!`
      : '';

    const prompt = [
      `You are "DevPets", a smart, project-aware AI desktop companion in VS Code.`,
      `The user is asking a question or requesting how to build/add something in their project.`,
      imageInstruction,
      `Scan the Project Context and Active File below carefully. If the user asks how to create/build/add a feature (e.g., "create login form", "show how in this project", "add api route", "build what is shown in this image", etc.) or asks a follow-up referring to the previous conversation:`,
      `1. Explain clearly in "answer" how it fits into their existing project files.`,
      `2. Populate "steps" with concrete step-by-step file actions:`,
      `   - Step 1 ("create"): Which new file to create (e.g., "LoginForm.tsx" or "loginForm.ts" matching the project's file types) and the complete ready-to-use code for it.`,
      `   - Step 2 ("update"): Which existing file in their project (e.g., "${activeFileName}") should be updated to import/use the new file, and the exact code to add/update!`,
      `If the user is only asking a simple conceptual question that doesn't involve creating/updating files, set "steps" to [].`,
      ``,
      historyText,
      ``,
      `Active File: ${activeFileName} (Cursor at Line ${cursorLine})`,
      `Surrounding Code in ${activeFileName}:\n\`\`\`\n${surroundingCode}\n\`\`\``,
      `Scanned Project Context:\n${projectContext}`,
      ``,
      `Current User Question: "${question}"`,
      ``,
      `Respond ONLY with a valid JSON object matching this exact schema:`,
      `{`,
      `  "answer": "Clear, helpful overview explaining how to do this in the project",`,
      `  "steps": [`,
      `    {`,
      `      "stepNumber": 1,`,
      `      "actionType": "create",`,
      `      "targetFile": "Relative file path to create or update (e.g. LoginForm.tsx or loginForm.ts)",`,
      `      "title": "Step 1: Create LoginForm component",`,
      `      "description": "What this file does and why",`,
      `      "code": "Full code to write into this file"`,
      `    },`,
      `    {`,
      `      "stepNumber": 2,`,
      `      "actionType": "update",`,
      `      "targetFile": "${activeFileName}",`,
      `      "title": "Step 2: Import and use in ${activeFileName}",`,
      `      "description": "Add this import and call in ${activeFileName}",`,
      `      "code": "Code snippet to add or update in ${activeFileName}"`,
      `    }`,
      `  ]`,
      `}`
    ].filter(Boolean).join('\n');

    let finalAnswer = '';
    let finalSteps: ChatFileStep[] = [];
    let providerUsed = 'DevPets Smart Engine';

    try {
      let rawResponse: string | null = null;

      if (effectiveProvider === 'gemini' && apiKey) {
        rawResponse = await this.callGeminiChatJson(prompt, apiKey, customModel || 'gemini-3.8-flash', image);
        providerUsed = 'Gemini AI Vision';
      } else if (effectiveProvider === 'groq' && apiKey) {
        rawResponse = await this.callOpenAICompatibleText(
          'https://api.groq.com/openai/v1/chat/completions',
          'You are DevPets, a project-aware coding assistant that outputs valid JSON with "answer" and "steps".',
          prompt,
          apiKey,
          customModel || 'llama-3.3-70b-versatile',
          image
        );
        providerUsed = 'Groq AI';
      } else if (effectiveProvider === 'openai' && apiKey) {
        rawResponse = await this.callOpenAICompatibleText(
          'https://api.openai.com/v1/chat/completions',
          'You are DevPets, a project-aware coding assistant that outputs valid JSON with "answer" and "steps".',
          prompt,
          apiKey,
          customModel || 'gpt-4o-mini',
          image
        );
        providerUsed = 'OpenAI Vision';
      } else if (effectiveProvider === 'ollama' || effectiveProvider === 'auto') {
        rawResponse = await this.callOllamaText(prompt, ollamaUrl, customModel);
        providerUsed = 'Local Ollama';
      }

      if (rawResponse) {
        const parsed = this.parseChatPlanJson(rawResponse);
        if (parsed) {
          finalAnswer = parsed.answer;
          finalSteps = parsed.steps || [];
        } else {
          finalAnswer = rawResponse;
        }
      }
    } catch {
      // Fall back to local response
    }

    if (!finalAnswer) {
      const localPlan = this.buildLocalProjectPlan(question, activeFileName, cursorLine, surroundingCode, projectContext);
      finalAnswer = localPlan.answer;
      finalSteps = localPlan.steps;
      providerUsed = 'DevPets Smart Engine';
    }

    const turn: ChatTurn = {
      id: `turn-${Date.now()}`,
      timestamp: Date.now(),
      question,
      image,
      answer: finalAnswer,
      steps: finalSteps.length > 0 ? finalSteps : undefined,
      providerUsed
    };
    this.chatHistory.push(turn);
    if (this.chatHistory.length > 25) {
      this.chatHistory = this.chatHistory.slice(-25);
    }
    this.persistConfigToDisk();

    return {
      answer: finalAnswer,
      steps: finalSteps.length > 0 ? finalSteps : undefined,
      chatHistory: this.chatHistory,
      providerUsed
    };
  }

  private parseChatPlanJson(rawText: string): { answer: string; steps: ChatFileStep[] } | null {
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      const obj = JSON.parse(cleaned);
      if (obj && typeof obj.answer === 'string') {
        const steps = Array.isArray(obj.steps)
          ? obj.steps
              .filter((s: any) => s && s.targetFile && s.code)
              .map((s: any, idx: number) => ({
                stepNumber: Number(s.stepNumber) || idx + 1,
                actionType: (s.actionType === 'update' ? 'update' : 'create') as 'create' | 'update',
                targetFile: String(s.targetFile),
                title: String(s.title || `Step ${idx + 1}: ${s.actionType === 'update' ? 'Update' : 'Create'} ${s.targetFile}`),
                description: String(s.description || ''),
                code: String(s.code)
              }))
          : [];
        return { answer: obj.answer, steps };
      }
    } catch {
      // Not strict JSON
    }
    return null;
  }

  private async callGeminiChatJson(
    prompt: string,
    apiKey: string,
    model: string,
    image?: ChatImageAttachment
  ): Promise<string | null> {
    const endpoints = this.buildGeminiEndpoints(apiKey, model);

    const parts: any[] = [{ text: prompt }];
    if (image && image.dataUrl) {
      const match = image.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        parts.push({
          inlineData: {
            mimeType: match[1] || image.mimeType || 'image/png',
            data: match[2]
          }
        });
      }
    }

    for (const url of endpoints) {
      try {
        const is38 = url.includes('gemini-3.8-flash');
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts }],
            generationConfig: {
              temperature: 0.25,
              responseMimeType: 'application/json'
            }
          }),
          signal: AbortSignal.timeout(is38 ? 6000 : 30000)
        });
        if (response.ok) {
          const data = (await response.json()) as any;
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            return text;
          }
        }
      } catch {
        // try next endpoint
      }
    }
    return null;
  }

  private resolveProvider(provider: string, apiKey: string): string {
    if (provider !== 'auto') {
      return provider;
    }
    if (apiKey.startsWith('AIza') || apiKey.startsWith('AQ.')) {
      return 'gemini';
    }
    if (apiKey.startsWith('gsk_')) {
      return 'groq';
    }
    if (apiKey.startsWith('sk-')) {
      return 'openai';
    }
    return 'auto';
  }

  private buildIssuePrompt(issue: CodeIssue, projectContext: string): string {
    return `You are "Pip", a proactive AI coding bird watching the user's code in VS Code.
Analyze the following issue on Line ${issue.line} of "${issue.relativePath}":

Diagnostic / Trigger (${issue.severity.toUpperCase()} from ${issue.source}):
"${issue.rawMessage}"

Target Line ${issue.line}:
\`\`\`
${issue.lineContent}
\`\`\`

Surrounding Code Context:
\`\`\`
${issue.surroundingCode}
\`\`\`

${projectContext}

Respond ONLY with a valid JSON object matching this exact schema (no markdown fences around the JSON):
{
  "title": "Short 3-6 word headline of the issue",
  "whatsWrong": "1-2 clear, friendly sentences explaining what is wrong and why",
  "whatToDo": "1-2 actionable sentences telling the developer how to fix it or what to do next",
  "fixedCode": "Exact replacement for Target Line ${issue.line} ONLY (preserve leading indentation, or empty string if no single-line replacement applies)"
}`;
  }

  private toBirdSuggestion(issue: CodeIssue, llm: LLMJsonOutput, providerUsed: string): BirdSuggestion {
    const hasFix = Boolean(llm.fixedCode && llm.fixedCode.trim().length > 0 && llm.fixedCode !== issue.lineContent);
    return {
      issueId: issue.id,
      fileUri: issue.fileUri,
      fileName: issue.fileName,
      relativePath: issue.relativePath,
      line: issue.line,
      endLine: issue.endLine,
      severity: issue.severity,
      title: llm.title || 'Code Issue Detected',
      whatsWrong: llm.whatsWrong || issue.rawMessage,
      whatToDo: llm.whatToDo || 'Review the highlighted line and update the expression.',
      originalCode: issue.lineContent,
      fixedCode: hasFix ? llm.fixedCode : undefined,
      fixRange: hasFix
        ? {
            startLine: issue.line - 1,
            startCharacter: 0,
            endLine: issue.line - 1,
            endCharacter: issue.lineContent.length
          }
        : undefined,
      providerUsed
    };
  }

  private buildGeminiEndpoints(apiKey: string, model: string): string[] {
    // Try user's chosen model first, plus high-availability Gemini 3.5/3.6 Flash models
    const modelsToTry = Array.from(
      new Set([model || 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'])
    );
    const urls: string[] = [];
    for (const m of modelsToTry) {
      urls.push(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${encodeURIComponent(apiKey)}`
      );
    }
    return urls;
  }

  private async callGemini(prompt: string, apiKey: string, model: string): Promise<LLMJsonOutput | null> {
    const endpoints = this.buildGeminiEndpoints(apiKey, model);

    for (const url of endpoints) {
      try {
        const is38 = url.includes('gemini-3.8-flash');
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              responseMimeType: 'application/json'
            }
          }),
          // Fast failover (4.5s) if gemini-3.8-flash is having a 503 spike, 22s for full generation
          signal: AbortSignal.timeout(is38 ? 4500 : 22000)
        });

        if (response.ok) {
          const data = (await response.json()) as any;
          const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          const parsed = this.parseJsonSafe(rawText);
          if (parsed) {
            return parsed;
          }
        }
      } catch {
        // try next endpoint
      }
    }
    return null;
  }

  private async callGeminiText(prompt: string, apiKey: string, model: string): Promise<string | null> {
    const endpoints = this.buildGeminiEndpoints(apiKey, model);

    for (const url of endpoints) {
      try {
        const is38 = url.includes('gemini-3.8-flash');
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3 }
          }),
          // Fast failover (4.5s) if gemini-3.8-flash is having a 503 spike, 25s for full code/chat generation
          signal: AbortSignal.timeout(is38 ? 4500 : 25000)
        });
        if (response.ok) {
          const data = (await response.json()) as any;
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (text) {
            return text;
          }
        }
      } catch {
        // try next endpoint
      }
    }
    return null;
  }

  private async callOpenAICompatible(
    endpoint: string,
    prompt: string,
    apiKey: string,
    model: string
  ): Promise<LLMJsonOutput | null> {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a helpful coding assistant that always outputs valid JSON.' },
          { role: 'user', content: prompt }
        ]
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as any;
    const rawText = data?.choices?.[0]?.message?.content;
    return this.parseJsonSafe(rawText);
  }

  private async callOpenAICompatibleText(
    endpoint: string,
    systemPrompt: string,
    userQuestion: string,
    apiKey: string,
    model: string,
    image?: ChatImageAttachment
  ): Promise<string | null> {
    let userContent: any = userQuestion;
    if (image && image.dataUrl) {
      userContent = [
        { type: 'text', text: userQuestion },
        { type: 'image_url', image_url: { url: image.dataUrl } }
      ];
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.3,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ]
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as any;
    return data?.choices?.[0]?.message?.content || null;
  }

  private async callOllama(prompt: string, ollamaUrl: string, customModel: string): Promise<LLMJsonOutput | null> {
    const modelToUse = customModel || (await this.detectOllamaModel(ollamaUrl));
    if (!modelToUse) {
      return null;
    }

    const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelToUse,
        stream: false,
        format: 'json',
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as any;
    return this.parseJsonSafe(data?.message?.content);
  }

  private async callOllamaText(prompt: string, ollamaUrl: string, customModel: string): Promise<string | null> {
    const modelToUse = customModel || (await this.detectOllamaModel(ollamaUrl));
    if (!modelToUse) {
      return null;
    }

    const response = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelToUse,
        stream: false,
        messages: [{ role: 'user', content: prompt }]
      }),
      signal: AbortSignal.timeout(6000)
    });

    if (!response.ok) {
      return null;
    }
    const data = (await response.json()) as any;
    return data?.message?.content || null;
  }

  private async detectOllamaModel(ollamaUrl: string): Promise<string | null> {
    try {
      const res = await fetch(`${ollamaUrl.replace(/\/$/, '')}/api/tags`, {
        signal: AbortSignal.timeout(1200)
      });
      if (!res.ok) {
        return null;
      }
      const data = (await res.json()) as any;
      const models: any[] = data?.models || [];
      if (models.length === 0) {
        return null;
      }
      const preferred = models.find((m) => /coder|llama3|qwen|deepseek|mistral|gemma/i.test(m.name));
      return preferred ? preferred.name : models[0].name;
    } catch {
      return null;
    }
  }

  private parseJsonSafe(rawText: string | undefined): LLMJsonOutput | null {
    if (!rawText) {
      return null;
    }
    try {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      return JSON.parse(cleaned) as LLMJsonOutput;
    } catch {
      return null;
    }
  }

  /**
   * Built-in instant heuristic engine so the bird gives smart, actionable explanations
   * and 1-click fixes out of the box even without an API key!
   */
  public analyzeLocally(issue: CodeIssue): BirdSuggestion {
    const line = issue.lineContent;
    const indent = line.match(/^\s*/)?.[0] || '';
    const msg = issue.rawMessage;

    let title = issue.severity === 'error' ? 'Syntax or Type Error Spotted!' : 'Code Improvement Suggested';
    let whatsWrong = msg;
    let whatToDo = 'Check the highlighted line for typos, missing imports, or mismatched types.';
    let fixedCode: string | undefined;

    // 1. Loose equality (== or !=)
    if (/[^=!]==[^=]/.test(line) && !line.trim().startsWith('//')) {
      title = 'Loose Equality Operator (==)';
      whatsWrong = 'Using `==` performs unexpected type coercion in JavaScript/TypeScript (e.g., `"0" == 0` is true).';
      whatToDo = 'Use strict equality (`===`) so both value and type are checked safely.';
      fixedCode = line.replace(/([^=!])==([^=])/, '$1===$2');
    }
    // 2. Typo in console method (e.g. console.logg, consol.log)
    else if (/\bconsol\.log\b|\bconsole\.lo[g]{2,}\b|\bconsole\.pritn\b/.test(line)) {
      title = 'Typo in console.log()';
      whatsWrong = `There's a typo in your console statement on line ${issue.line}: \`${line.trim()}\`.`;
      whatToDo = 'Replace the misspelled call with `console.log(...)`.';
      fixedCode = line
        .replace(/\bconsol\.log\b/g, 'console.log')
        .replace(/\bconsole\.lo[g]{2,}\b/g, 'console.log')
        .replace(/\bconsole\.pritn\b/g, 'console.log');
    }
    // 3. TypeScript/JS: Type 'string' is not assignable to type 'number'
    else if (/Type ['"]string['"] is not assignable to type ['"]number['"]/i.test(msg)) {
      title = 'Type Mismatch: String vs Number';
      whatsWrong = `You are assigning a string value to a variable or parameter that expects a \`number\`.`;
      whatToDo = 'Convert the string to a number using `Number(...)` or remove the quotes around the numeric literal.';
      const quotedNum = line.match(/=\s*['"](\d+(?:\.\d+)?)['"]/);
      if (quotedNum) {
        fixedCode = line.replace(/=\s*['"](\d+(?:\.\d+)?)['"]/, `= ${quotedNum[1]}`);
      }
    }
    // 4. Type 'number' is not assignable to type 'string'
    else if (/Type ['"]number['"] is not assignable to type ['"]string['"]/i.test(msg)) {
      title = 'Type Mismatch: Number vs String';
      whatsWrong = 'You are assigning a numeric value to a variable typed as `string`.';
      whatToDo = 'Wrap the value in quotes or convert it with `String(...)`.';
      const numAssign = line.match(/=\s*(\d+(?:\.\d+)?)\s*(;|$)/);
      if (numAssign) {
        fixedCode = line.replace(/=\s*(\d+(?:\.\d+)?)(\s*(?:;|$))/, `= "${numAssign[1]}"$2`);
      }
    }
    // 5. Missing await on fetch() or async call
    else if (/\bfetch\s*\(/.test(line) && !/\bawait\b/.test(line) && !/\.then\s*\(/.test(line)) {
      title = 'Unawaited Async fetch() Call';
      whatsWrong = '`fetch()` returns a Promise, not the response data directly. Without `await`, your variable only holds a pending Promise.';
      whatToDo = 'Add `await` before `fetch(...)` (and ensure the enclosing function is marked `async`).';
      fixedCode = line.replace(/\bfetch\s*\(/, 'await fetch(');
    }
    // 6. Assignment inside if condition: if (x = 5)
    else if (/if\s*\(\s*[A-Za-z0-9_$.]+\s*=\s*[^=]/.test(line)) {
      title = 'Accidental Assignment in if(...)';
      whatsWrong = 'You used a single `=` inside an `if (...)` condition, which overwrites the variable instead of comparing it!';
      whatToDo = 'Change `=` to `===` to compare values instead of assigning.';
      fixedCode = line.replace(/(if\s*\(\s*[A-Za-z0-9_$.]+\s*)=(\s*[^=])/, '$1===$2');
    }
    // 7. Constant reassignment: Cannot assign to 'x' because it is a constant
    else if (/Cannot assign to ['"]([^'"]+)['"] because it is a constant/i.test(msg)) {
      const varName = msg.match(/Cannot assign to ['"]([^'"]+)['"]/)?.[1] || 'variable';
      title = `Reassigning Constant '${varName}'`;
      whatsWrong = `\`${varName}\` was declared with \`const\`, so its value cannot be reassigned on line ${issue.line}.`;
      whatToDo = `Change the declaration of \`${varName}\` from \`const\` to \`let\`, or create a new variable name here.`;
    }
    // 8. Cannot find name / ReferenceError
    else if (/Cannot find name ['"]([^'"]+)['"]/i.test(msg)) {
      const missingName = msg.match(/Cannot find name ['"]([^'"]+)['"]/)?.[1] || 'identifier';
      title = `Undeclared Identifier '${missingName}'`;
      whatsWrong = `\`${missingName}\` is used on line ${issue.line}, but it hasn't been declared or imported in this file.`;
      whatToDo = `Check for a spelling typo in \`${missingName}\`, declare it with \`const ${missingName} = ...\`, or import it at the top of the file.`;
    }
    // 9. Property does not exist on type
    else if (/Property ['"]([^'"]+)['"] does not exist on type ['"]([^'"]+)['"]/i.test(msg)) {
      const m = msg.match(/Property ['"]([^'"]+)['"] does not exist on type ['"]([^'"]+)['"]/i);
      const prop = m?.[1] || 'property';
      const typeName = m?.[2] || 'object';
      title = `Missing Property '.${prop}'`;
      whatsWrong = `You tried to access \`.${prop}\` on \`${typeName}\`, which doesn't have that property defined.`;
      if (/Promise/i.test(typeName)) {
        whatToDo = `Because \`${typeName}\` is a Promise, you forgot to \`await\` it before accessing \`.${prop}\`!`;
        fixedCode = line.replace(/([A-Za-z0-9_$]+)\.${prop}/, `(await $1).${prop}`);
      } else {
        whatToDo = `Check the interface/type definition for \`${typeName}\` or use optional chaining if the property is dynamic.`;
      }
    }
    // 10. Division by zero risk
    else if (/\/\s*0\b/.test(line) && !line.trim().startsWith('//')) {
      title = 'Division by Zero Risk';
      whatsWrong = 'Dividing directly by `0` produces `Infinity` or `NaN` in JavaScript/TypeScript and crashes in Python.';
      whatToDo = 'Guard the denominator with a fallback check before dividing.';
    }
    // 11. TODO / FIXME marker
    else if (/\b(TODO|FIXME|BUG)\b/i.test(line)) {
      title = 'Pending TODO / FIXME Task';
      whatsWrong = `You left a reminder on line ${issue.line}: "${line.trim()}".`;
      whatToDo = 'Would you like me to help implement this step or clean up the placeholder?';
    }
    // 12. Generic syntax error: missing closing parenthesis or semicolon
    else if (/['")]['"] expected/i.test(msg)) {
      const expectedToken = msg.match(/['"]([^'"]+)['"] expected/i)?.[1] || ')';
      title = `Missing '${expectedToken}' on Line ${issue.line}`;
      whatsWrong = `The parser expected \`${expectedToken}\` before the end of this statement.`;
      whatToDo = `Add the missing \`${expectedToken}\` to complete the expression.`;
      if (expectedToken === ')' || expectedToken === ';' || expectedToken === '}') {
        fixedCode = `${line.trimEnd()}${expectedToken}`;
      }
    }

    const hasValidFix = Boolean(fixedCode && fixedCode !== line);

    return {
      issueId: issue.id,
      fileUri: issue.fileUri,
      fileName: issue.fileName,
      relativePath: issue.relativePath,
      line: issue.line,
      endLine: issue.endLine,
      severity: issue.severity,
      title,
      whatsWrong,
      whatToDo,
      originalCode: line,
      fixedCode: hasValidFix ? fixedCode || `${indent}${line.trim()}` : undefined,
      fixRange: hasValidFix
        ? {
            startLine: issue.line - 1,
            startCharacter: 0,
            endLine: issue.line - 1,
            endCharacter: line.length
          }
        : undefined,
      providerUsed: 'CodeBird Smart Engine'
    };
  }

  private buildLocalProjectPlan(
    question: string,
    activeFileName: string,
    cursorLine: number,
    surroundingCode: string,
    projectContext: string
  ): { answer: string; steps: ChatFileStep[] } {
    const q = question.toLowerCase();
    const lastQuestion = this.chatHistory.length > 0 ? this.chatHistory[this.chatHistory.length - 1].question.toLowerCase() : '';
    const combinedQ = `${lastQuestion} ${q}`;

    if (combinedQ.includes('login') || combinedQ.includes('auth') || combinedQ.includes('form')) {
      const isTs = activeFileName.endsWith('.ts') || activeFileName.endsWith('.tsx');
      const newFileName = activeFileName.endsWith('.tsx')
        ? 'LoginForm.tsx'
        : activeFileName.endsWith('.jsx')
          ? 'LoginForm.jsx'
          : isTs
            ? 'loginForm.ts'
            : 'loginForm.js';

      return {
        answer: `Here is how to add a Login module to your project and connect it to \`${activeFileName}\` in 2 steps:`,
        steps: [
          {
            stepNumber: 1,
            actionType: 'create',
            targetFile: newFileName,
            title: `Step 1: Create ${newFileName}`,
            description: `Create \`${newFileName}\` to validate credentials and authenticate the user.`,
            code: isTs
              ? `export interface LoginCredentials {\n  email: string;\n  password: string;\n}\n\nexport async function authenticateUser(creds: LoginCredentials): Promise<{ userId: string; token: string }> {\n  if (!creds.email.includes('@') || creds.password.length < 6) {\n    throw new Error('Invalid email or password');\n  }\n  return { userId: 'user_101', token: 'jwt_sample_token' };\n}\n`
              : `export async function authenticateUser({ email, password }) {\n  if (!email.includes('@') || password.length < 6) {\n    throw new Error('Invalid email or password');\n  }\n  return { userId: 'user_101', token: 'jwt_sample_token' };\n}\n`
          },
          {
            stepNumber: 2,
            actionType: 'update',
            targetFile: activeFileName,
            title: `Step 2: Import & Call in ${activeFileName}`,
            description: `Import \`authenticateUser\` in \`${activeFileName}\` and invoke it before processing user actions.`,
            code: `import { authenticateUser } from './${newFileName.replace(/\.[tj]sx?$/, '')}';\n`
          }
        ]
      };
    }

    return {
      answer: this.answerQuestionLocally(question, activeFileName, cursorLine, surroundingCode, projectContext),
      steps: []
    };
  }

  private answerQuestionLocally(
    question: string,
    activeFileName: string,
    cursorLine: number,
    surroundingCode: string,
    projectContext: string
  ): string {
    const q = question.toLowerCase();
    if (q.includes('wrong') || q.includes('error') || q.includes('bug') || q.includes('fix')) {
      return `Chirp! Looking at ${activeFileName} around line ${cursorLine}, check the red/amber diagnostics in the bubble or click "Scan File" so I can inspect every line and give you a 1-click fix! (Tip: Add a Gemini/OpenAI/Groq key or run Ollama for deep project Q&A.)`;
    }
    if (q.includes('project') || q.includes('file') || q.includes('structure')) {
      return `Chirp! Here is what I see in your workspace right now:\n${projectContext.split('\n').slice(0, 6).join('\n')}`;
    }
    return `Chirp! I'm watching ${activeFileName} at line ${cursorLine}.\nCode around your cursor:\n${surroundingCode.split('\n').slice(0, 3).join('\n')}\nTip: Click the ⚙️ gear icon on my bubble to add a Gemini, OpenAI, Groq, or local Ollama model for full conversational AI!`;
  }
}

