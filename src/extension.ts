import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { BridgeServer } from './bridgeServer';
import { WorkspaceTracker } from './workspaceTracker';
import { ActivityTracker } from './activityTracker';
import { AIAgent } from './aiAgent';
import { CodeActionsManager } from './codeActions';
import {
  ActiveEditorState,
  BirdSuggestion,
  CodeIssue,
  CompanionType,
  OverlayToExtensionMessage,
  RoamMode,
  SelectionActionType,
  SelectionState,
  StealthMode
} from './types';

let bridge: BridgeServer;
let workspaceTracker: WorkspaceTracker;
let activityTracker: ActivityTracker;
let aiAgent: AIAgent;
let codeActions: CodeActionsManager;
let overlayProcess: ChildProcess | null = null;
let statusBarItem: vscode.StatusBarItem;
let autoHealCount = 0;
let activeFileIssueCount = 0;
let runtimeStealthMode: StealthMode | null = null;

function isCodebirdEnabled(): boolean {
  return vscode.workspace.getConfiguration('codebird').get<boolean>('enabled', true);
}

function isCodebirdAutoStart(): boolean {
  return vscode.workspace.getConfiguration('codebird').get<boolean>('autoStart', true);
}

function getCompanion(): CompanionType {
  return vscode.workspace.getConfiguration('codebird').get<CompanionType>('companion', 'bird');
}

function isOverlayRunning(): boolean {
  return Boolean(overlayProcess && !overlayProcess.killed);
}

function getStealthMode(): StealthMode {
  if (runtimeStealthMode) {
    return runtimeStealthMode;
  }
  return vscode.workspace.getConfiguration('codebird').get<StealthMode>('stealthMode', 'off');
}

async function setStealthModeState(mode: StealthMode) {
  runtimeStealthMode = mode;
  await vscode.workspace
    .getConfiguration('codebird')
    .update('stealthMode', mode, vscode.ConfigurationTarget.Global);
  updateStatusBar();
}

function updateStatusBar() {
  if (!statusBarItem) {
    return;
  }
  const enabled = isCodebirdEnabled();
  const comp = getCompanion();
  const compName =
    comp === 'cat' ? 'Mochi' :
    comp === 'bot' ? 'Byte' :
    comp === 'fox' ? 'Rusty' :
    comp === 'frog' ? 'Kero' :
    comp === 'ghost' ? 'Boo' :
    'Pip';
  const compIcon =
    comp === 'cat' ? '🐱' :
    comp === 'bot' ? '🤖' :
    comp === 'fox' ? '🦊' :
    comp === 'frog' ? '🐸' :
    comp === 'ghost' ? '👻' :
    '🐦';

  const issueBadge =
    activeFileIssueCount > 0 ? ` • $(warning) ${activeFileIssueCount} Fix${activeFileIssueCount > 1 ? 'es' : ''}` : ' • ✨ Clean';

  if (!enabled) {
    statusBarItem.text = `$(circle-slash) ${compIcon} ${compName} (Off)`;
    statusBarItem.tooltip = `${compName} is currently Disabled everywhere. Click to Enable (Alt+S)`;
    return;
  }

  const running = isOverlayRunning();
  const stealth = getStealthMode();

  if (!running && stealth !== 'ghost') {
    statusBarItem.text = `$(moon) ${compIcon} ${compName} (Asleep)${issueBadge}`;
    statusBarItem.tooltip = `${compName} is asleep. Click to Wake / Summon (Alt+S)`;
    return;
  }

  if (stealth === 'ghost') {
    statusBarItem.text = `$(eye-closed) 👻 ${compName} Ghost${issueBadge}`;
    statusBarItem.tooltip = `${compName} Stealth Mode: Ghost in the Editor (Click to switch Stealth Mode or Fix All)`;
  } else if (stealth === 'peek') {
    statusBarItem.text = `$(eye) 🦎 ${compName} Peek${issueBadge}`;
    statusBarItem.tooltip = `${compName} Stealth Mode: Peek-on-Error Chameleon (Invisible until a bug appears)`;
  } else if (stealth === 'auto-heal') {
    statusBarItem.text = `$(zap) ⚡ ${compName} Auto-Heal (${autoHealCount} healed)${issueBadge}`;
    statusBarItem.tooltip = `${compName} Stealth Mode: Silent Auto-Healer (Automatically repairs bugs in the background)`;
  } else if (stealth === 'screen-shield') {
    statusBarItem.text = `$(shield) 🕵️ ${compName} Screen-Shield${issueBadge}`;
    statusBarItem.tooltip = `${compName} Stealth Mode: Screen-Share Invisible (Hidden from Zoom / Meet / OBS / Teams)`;
  } else {
    statusBarItem.text = `$(sparkle) ${compIcon} ${compName}${issueBadge}`;
    statusBarItem.tooltip = `Click to open ${compName} Stealth & Action Menu (Alt+S)`;
  }
}

export async function activate(context: vscode.ExtensionContext) {
  console.log('[ChirpAI CodeBird] Activating extension...');

  bridge = new BridgeServer();
  workspaceTracker = new WorkspaceTracker();
  aiAgent = new AIAgent();
  codeActions = new CodeActionsManager();
  codeActions.registerProviders(context);

  const wsPort = await bridge.start(49821);
  console.log(`[ChirpAI CodeBird] WebSocket Bridge listening on 127.0.0.1:${wsPort}`);

  // Status bar item (opens Stealth & Quick Action Menu on click)
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'codebird.switchStealthMode';
  updateStatusBar();
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Listen for configuration changes (e.g. user changing companion or stealth mode in VS Code Settings)
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('codebird.companion')) {
        const comp = getCompanion();
        updateStatusBar();
        bridge.broadcast({
          type: 'companion_change',
          companion: comp
        });
      }
      if (e.affectsConfiguration('codebird.enabled')) {
        updateStatusBar();
      }
      if (e.affectsConfiguration('codebird.stealthMode')) {
        updateStatusBar();
      }
    })
  );

  // Initialize Workspace Tracker
  await workspaceTracker.initialize((snapshot) => {
    bridge.broadcast({
      type: 'workspace_update',
      workspace: snapshot
    });
  });

  // Helper to populate all issues in the active file with instant local explanations + solutions,
  // and then upgrade the active issue with deep LLM analysis if configured
  const refreshAllFileSuggestions = (editor = vscode.window.activeTextEditor, primaryLine?: number) => {
    if (!editor || editor.document.uri.scheme !== 'file') {
      activeFileIssueCount = 0;
      updateStatusBar();
      return;
    }
    const allIssues = activityTracker
      .findIssuesInDocument(editor.document, editor.selection.active.line)
      .filter((iss) => !aiAgent.isDismissed(iss.id));

    const localSuggestions: BirdSuggestion[] = allIssues.map((iss) => aiAgent.analyzeLocally(iss));
    activeFileIssueCount = localSuggestions.length;
    updateStatusBar();

    codeActions.setFileSuggestions(
      editor.document.uri.toString(),
      localSuggestions,
      primaryLine ?? editor.selection.active.line + 1
    );
  };

  // Initialize Activity Tracker
  activityTracker = new ActivityTracker(
    // onCursorMove
    (state: ActiveEditorState, lineHasError: boolean, lineErrorText?: string) => {
      workspaceTracker.recordRecentFile(vscode.Uri.parse(state.fileUri));
      refreshAllFileSuggestions(vscode.window.activeTextEditor, state.cursorLine);

      bridge.broadcast({
        type: 'cursor_move',
        activeEditor: state,
        lineHasError,
        lineErrorText
      });

      // If the cursor lands directly on a line with a suggestion, immediately broadcast it to the floating bird!
      const sugOnCursor = codeActions.getSuggestionAt(state.fileUri, state.cursorLine);
      if (sugOnCursor) {
        const mood =
          sugOnCursor.severity === 'error'
            ? 'alert-error'
            : sugOnCursor.severity === 'warning'
              ? 'alert-warning'
              : 'suggesting';
        bridge.broadcast({
          type: 'bird_suggestion',
          suggestion: sugOnCursor,
          mood,
          estimatedViewportYRatio: state.estimatedViewportYRatio,
          estimatedViewportXRatio: state.estimatedViewportXRatio
        });
      }
    },
    // onTypingActivity
    (state: ActiveEditorState) => {
      bridge.broadcast({
        type: 'typing_activity',
        activeEditor: state
      });
    },
    // onIssueDetected
    async (issue: CodeIssue, state: ActiveEditorState | null) => {
      if (aiAgent.isDismissed(issue.id)) {
        return;
      }

      // Immediately render all inline solutions so the user sees What's Wrong + Solution with 0ms delay
      refreshAllFileSuggestions(vscode.window.activeTextEditor, issue.line);

      bridge.broadcast({
        type: 'mood_change',
        mood: 'thinking',
        speechText: `Inspecting line ${issue.line} in ${issue.fileName}...`
      });

      const projectContext = workspaceTracker.getProjectContextString(issue.relativePath);
      const suggestion = await aiAgent.analyzeIssue(issue, projectContext);

      // If Silent Auto-Healer Stealth Mode is enabled and we have a concrete code fix, apply it automatically!
      if (getStealthMode() === 'auto-heal' && suggestion.fixedCode) {
        const healed = await codeActions.applySuggestionFix(suggestion);
        if (healed) {
          autoHealCount++;
          refreshAllFileSuggestions(vscode.window.activeTextEditor);
          updateStatusBar();
          return;
        }
      }

      codeActions.highlightIssueLine(suggestion);

      const mood =
        suggestion.severity === 'error'
          ? 'alert-error'
          : suggestion.severity === 'warning'
            ? 'alert-warning'
            : 'suggesting';

      bridge.broadcast({
        type: 'bird_suggestion',
        suggestion,
        mood,
        estimatedViewportYRatio: state?.estimatedViewportYRatio,
        estimatedViewportXRatio: state?.estimatedViewportXRatio
      });
    },
    // onSelectionChange
    (selection: SelectionState | null) => {
      codeActions.setActiveSelection(selection);
      bridge.broadcast({
        type: 'selection_change',
        selection
      });
    }
  );
  activityTracker.start();

  const executeSelectionAction = async (action: SelectionActionType, autoApplyInEditor: boolean) => {
    const sel = activityTracker.getActiveSelectionState(vscode.window.activeTextEditor);
    if (!sel) {
      vscode.window.showInformationMessage('🐦 Pip: Select a block of code first to run Selection Actions!');
      return;
    }

    bridge.broadcast({
      type: 'mood_change',
      mood: 'thinking',
      speechText: `Running ${action} on Lines ${sel.startLine}–${sel.endLine}...`
    });

    const projectContext = workspaceTracker.getProjectContextString(sel.relativePath);
    const suggestion = await aiAgent.runSelectionAction(action, sel, projectContext);

    if (autoApplyInEditor && suggestion.fixedCode && action !== 'explain') {
      const applied = await codeActions.applySuggestionFix(suggestion);
      if (applied) {
        refreshAllFileSuggestions(vscode.window.activeTextEditor);
        bridge.broadcast({
          type: 'fix_applied',
          fileName: suggestion.fileName,
          line: suggestion.line,
          message: `${suggestion.title} — ${suggestion.whatsWrong}`
        });
        return;
      }
    }

    codeActions.highlightIssueLine(suggestion);
    bridge.broadcast({
      type: 'bird_suggestion',
      suggestion,
      mood: action === 'explain' ? 'happy' : 'suggesting',
      estimatedViewportYRatio: sel.estimatedViewportYRatio,
      estimatedViewportXRatio: sel.estimatedViewportXRatio
    });

    if (action === 'explain' && autoApplyInEditor) {
      vscode.window.showInformationMessage(
        `🐦 ${suggestion.title}\n\n${suggestion.whatsWrong}`,
        { modal: true }
      );
    }
  };

  // Immediately scan current editor on startup
  setTimeout(() => {
    refreshAllFileSuggestions(vscode.window.activeTextEditor);
    activityTracker.inspectEditorForIssues(vscode.window.activeTextEditor, true);
  }, 500);

  // Setup Bridge Message Handlers from Floating Bird Overlay
  bridge.onClientConnected(() => {
    sendInitState();
    setTimeout(() => {
      refreshAllFileSuggestions(vscode.window.activeTextEditor);
      activityTracker.inspectEditorForIssues(vscode.window.activeTextEditor, true);
    }, 600);
  });

  bridge.onMessage(async (msg: OverlayToExtensionMessage) => {
    switch (msg.type) {
      case 'overlay_ready': {
        sendInitState();
        setTimeout(() => {
          refreshAllFileSuggestions(vscode.window.activeTextEditor);
          activityTracker.inspectEditorForIssues(vscode.window.activeTextEditor, true);
        }, 600);
        break;
      }

      case 'apply_fix': {
        const applied = await codeActions.applySuggestionFix(msg.suggestion);
        if (applied) {
          refreshAllFileSuggestions(vscode.window.activeTextEditor);
          bridge.broadcast({
            type: 'fix_applied',
            fileName: msg.suggestion.fileName,
            line: msg.suggestion.line,
            message: `Fixed line ${msg.suggestion.line} in ${msg.suggestion.fileName}!`
          });
          // Automatically move to next remaining issue after 1.8s
          setTimeout(() => {
            activityTracker.inspectEditorForIssues(vscode.window.activeTextEditor, true);
          }, 1800);
        }
        break;
      }

      case 'run_selection_action': {
        await executeSelectionAction(msg.action, false);
        break;
      }

      case 'apply_chat_step': {
        const resultMsg = await codeActions.applyChatFileStep(msg.step);
        if (resultMsg) {
          await workspaceTracker.scanWorkspace();
          refreshAllFileSuggestions(vscode.window.activeTextEditor);
          bridge.broadcast({
            type: 'fix_applied',
            fileName: msg.step.targetFile,
            line: 1,
            message: resultMsg
          });
        }
        break;
      }

      case 'clear_chat_history': {
        aiAgent.clearChatHistory();
        break;
      }

      case 'jump_to_line': {
        await codeActions.jumpToLine(msg.fileUri, msg.line);
        break;
      }

      case 'ask_bird': {
        const editor = vscode.window.activeTextEditor;
        const activeFileName = editor ? path.basename(editor.document.uri.fsPath) : 'Workspace';
        const cursorLine = editor ? editor.selection.active.line + 1 : 1;
        const surroundingCode = editor
          ? activityTracker.getSurroundingCode(editor.document, editor.selection.active.line, 12)
          : 'No active editor open.';
        const relPath = editor ? vscode.workspace.asRelativePath(editor.document.uri, false) : undefined;

        bridge.broadcast({
          type: 'mood_change',
          mood: 'thinking',
          speechText: msg.image
            ? 'Analyzing attached image & generating implementation plan...'
            : 'Scanning project files & building your implementation plan...'
        });

        await workspaceTracker.scanWorkspace();
        const projectContext = workspaceTracker.getProjectContextString(relPath);

        const reply = await aiAgent.askBirdQuestion(
          msg.question,
          activeFileName,
          cursorLine,
          surroundingCode,
          projectContext,
          msg.image
        );

        bridge.broadcast({
          type: 'chat_reply',
          question: msg.question,
          image: msg.image,
          answer: reply.answer,
          steps: reply.steps,
          chatHistory: reply.chatHistory,
          providerUsed: reply.providerUsed
        });
        break;
      }

      case 'request_file_review': {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          bridge.broadcast({
            type: 'mood_change',
            mood: 'happy',
            speechText: 'Open any code file in VS Code and I will inspect it for you!'
          });
          break;
        }
        refreshAllFileSuggestions(editor);
        const issue = activityTracker.inspectEditorForIssues(editor, true);
        if (!issue) {
          bridge.broadcast({
            type: 'mood_change',
            mood: 'happy',
            speechText: `All clear! ${path.basename(editor.document.uri.fsPath)} looks clean right now! ✨`
          });
        }
        break;
      }

      case 'request_project_scan': {
        await workspaceTracker.scanWorkspace();
        const snap = workspaceTracker.getSnapshot();
        bridge.broadcast({
          type: 'workspace_update',
          workspace: snap
        });

        const fileWithErrors = snap.files.find((f) => f.errorCount > 0 || f.warningCount > 0 || f.todoCount > 0);
        if (fileWithErrors && snap.rootPath) {
          const fullUri = vscode.Uri.file(path.join(snap.rootPath, fileWithErrors.relativePath));
          const doc = await vscode.workspace.openTextDocument(fullUri);
          const issues = activityTracker.findIssuesInDocument(doc);
          if (issues.length > 0) {
            const projectContext = workspaceTracker.getProjectContextString(fileWithErrors.relativePath);
            const suggestion = await aiAgent.analyzeIssue(issues[0], projectContext);
            bridge.broadcast({
              type: 'bird_suggestion',
              suggestion,
              mood: suggestion.severity === 'error' ? 'alert-error' : 'suggesting'
            });
            break;
          }
        }

        bridge.broadcast({
          type: 'mood_change',
          mood: 'happy',
          speechText: `Scanned ${snap.totalFiles} project files: ${snap.totalErrors} errors, ${snap.totalWarnings} warnings!`
        });
        break;
      }

      case 'change_roam_mode': {
        await vscode.workspace
          .getConfiguration('codebird')
          .update('roamMode', msg.roamMode, vscode.ConfigurationTarget.Global);
        bridge.broadcast({
          type: 'roam_mode_change',
          roamMode: msg.roamMode
        });
        break;
      }

      case 'change_stealth_mode': {
        await setStealthModeState(msg.stealthMode);
        bridge.broadcast({
          type: 'stealth_mode_change',
          stealthMode: msg.stealthMode
        });
        if (msg.stealthMode === 'auto-heal') {
          await vscode.commands.executeCommand('codebird.fixAllInFile');
        }
        break;
      }

      case 'save_ai_config': {
        aiAgent.setRuntimeConfig(msg.provider, msg.apiKey, msg.model);
        const saved = aiAgent.getSavedConfig();
        const cfg = vscode.workspace.getConfiguration('codebird');
        await cfg.update('aiProvider', saved.provider, vscode.ConfigurationTarget.Global);
        if (saved.apiKey) {
          await cfg.update('apiKey', saved.apiKey, vscode.ConfigurationTarget.Global);
        }
        if (saved.model) {
          await cfg.update('model', saved.model, vscode.ConfigurationTarget.Global);
        }
        sendInitState();
        bridge.broadcast({
          type: 'mood_change',
          mood: 'happy',
          speechText: `AI Brain saved permanently: ${aiAgent.getResolvedProviderName()} (${saved.model})! 🧠✨`,
          subText: 'Saved to ~/.codebird-config.json & VS Code Global Settings — auto-loads every time you start!'
        });
        break;
      }

      case 'dismiss_issue': {
        aiAgent.dismissIssue(msg.issueId);
        refreshAllFileSuggestions(vscode.window.activeTextEditor);
        break;
      }

      case 'change_companion': {
        await vscode.workspace
          .getConfiguration('codebird')
          .update('companion', msg.companion, vscode.ConfigurationTarget.Global);
        updateStatusBar();
        bridge.broadcast({
          type: 'companion_change',
          companion: msg.companion
        });
        break;
      }

      case 'sleep_bird': {
        stopOverlayProcess();
        vscode.window.showInformationMessage('CodeBird: Pip is taking a nap 💤 Click the status bar or run "CodeBird: Summon" anytime!');
        break;
      }

      case 'disable_bird': {
        stopOverlayProcess();
        await vscode.workspace
          .getConfiguration('codebird')
          .update('enabled', false, vscode.ConfigurationTarget.Global);
        updateStatusBar();
        vscode.window.showInformationMessage('🛑 CodeBird: Pip is now Disabled everywhere. Click the status bar to turn back on anytime.');
        break;
      }
    }
  });

  // Register VS Code Commands (including inline CodeLens & Hover actions!)
  context.subscriptions.push(
    vscode.commands.registerCommand('codebird.runSelectionAction', async (action: SelectionActionType) => {
      if (!action) {
        return;
      }
      await executeSelectionAction(action, true);
    }),

    vscode.commands.registerCommand(
      'codebird.applyInlineFix',
      async (args: { fileUri: string; line: number }) => {
        if (!args) {
          return;
        }
        const sug = codeActions.getSuggestionAt(args.fileUri, args.line);
        if (!sug) {
          return;
        }
        const applied = await codeActions.applySuggestionFix(sug);
        if (applied) {
          refreshAllFileSuggestions(vscode.window.activeTextEditor);
          bridge.broadcast({
            type: 'fix_applied',
            fileName: sug.fileName,
            line: sug.line,
            message: `Fixed line ${sug.line} in ${sug.fileName}!`
          });
          setTimeout(() => {
            activityTracker.inspectEditorForIssues(vscode.window.activeTextEditor, true);
          }, 1500);
        }
      }
    ),

    vscode.commands.registerCommand(
      'codebird.dismissInlineIssue',
      (args: { fileUri: string; line: number; issueId: string }) => {
        if (!args) {
          return;
        }
        aiAgent.dismissIssue(args.issueId);
        codeActions.removeSuggestionAt(args.fileUri, args.line);
      }
    ),

    vscode.commands.registerCommand('codebird.showIssueDetails', async (sug: BirdSuggestion) => {
      if (!sug) {
        return;
      }
      const detailMsg = `🐦 Pip Analysis (${sug.fileName}:${sug.line})\n\n❌ What's Wrong:\n${sug.whatsWrong}\n\n💡 What To Do:\n${sug.whatToDo}${
        sug.fixedCode ? `\n\n✅ Solution:\n${sug.fixedCode.trim()}` : ''
      }`;

      if (sug.fixedCode) {
        const choice = await vscode.window.showInformationMessage(
          detailMsg,
          { modal: true },
          '✨ Apply Solution Now',
          'Dismiss Issue'
        );
        if (choice === '✨ Apply Solution Now') {
          await vscode.commands.executeCommand('codebird.applyInlineFix', {
            fileUri: sug.fileUri,
            line: sug.line
          });
        } else if (choice === 'Dismiss Issue') {
          aiAgent.dismissIssue(sug.issueId);
          codeActions.removeSuggestionAt(sug.fileUri, sug.line);
        }
      } else {
        await vscode.window.showInformationMessage(detailMsg, { modal: true });
      }
    }),

    vscode.commands.registerCommand('codebird.chooseCompanion', async () => {
      const current = getCompanion();
      const pick = await vscode.window.showQuickPick(
        [
          { label: `${current === 'bird' ? '$(check) ' : ''}🐦 Pip (CodeBird)`, description: 'Chirpy bluebird with flapping wings & head tuft', comp: 'bird' as CompanionType },
          { label: `${current === 'cat' ? '$(check) ' : ''}🐱 Mochi (Cozy Desk Cat)`, description: 'Purring calico cat with twitching ears & swishing tail', comp: 'cat' as CompanionType },
          { label: `${current === 'bot' ? '$(check) ' : ''}🤖 Byte (Mini Robot)`, description: 'Retro tech bot with glowing antenna & digital LED visor eyes', comp: 'bot' as CompanionType },
          { label: `${current === 'fox' ? '$(check) ' : ''}🦊 Rusty (Red Fox)`, description: 'Sharp bug hunter with perked ears & fluffy tail', comp: 'fox' as CompanionType },
          { label: `${current === 'frog' ? '$(check) ' : ''}🐸 Kero (Zen Frog)`, description: 'Calm frog with a tiny lotus leaf cap & puffing cheeks', comp: 'frog' as CompanionType },
          { label: `${current === 'ghost' ? '$(check) ' : ''}👻 Boo (Lil Ghost)`, description: 'Cute marshmallow floating ghost with soft ethereal glow', comp: 'ghost' as CompanionType }
        ],
        { placeHolder: `Current Companion: ${current.toUpperCase()} — Choose your floating buddy:` }
      );
      if (!pick) {
        return;
      }
      await vscode.workspace
        .getConfiguration('codebird')
        .update('companion', pick.comp, vscode.ConfigurationTarget.Global);
      updateStatusBar();
      bridge.broadcast({
        type: 'companion_change',
        companion: pick.comp
      });
      vscode.window.showInformationMessage(`Companion switched to: ${pick.label}! ✨`);
    }),

    vscode.commands.registerCommand('codebird.toggleEnable', async () => {
      const current = isCodebirdEnabled();
      const next = !current;
      await vscode.workspace
        .getConfiguration('codebird')
        .update('enabled', next, vscode.ConfigurationTarget.Global);
      updateStatusBar();
      if (!next) {
        stopOverlayProcess();
        vscode.window.showInformationMessage('🛑 ChirpAI: Pip is now Disabled everywhere. Click status bar or run "CodeBird: Enable / Disable" to turn back on.');
      } else {
        if (getStealthMode() !== 'ghost') {
          launchOverlayProcess(context.extensionPath, wsPort);
        }
        vscode.window.showInformationMessage('▶️ ChirpAI: Pip is now Enabled! 🐦✨');
      }
    }),

    vscode.commands.registerCommand('codebird.summon', async () => {
      if (!isCodebirdEnabled()) {
        await vscode.workspace
          .getConfiguration('codebird')
          .update('enabled', true, vscode.ConfigurationTarget.Global);
      }
      launchOverlayProcess(context.extensionPath, wsPort);
      updateStatusBar();
      refreshAllFileSuggestions(vscode.window.activeTextEditor);
      activityTracker.inspectEditorForIssues(vscode.window.activeTextEditor, true);
      bridge.broadcast({
        type: 'mood_change',
        mood: 'happy',
        speechText: 'Chirp! Pip is right here watching your workspace! 🐦✨'
      });
    }),

    vscode.commands.registerCommand('codebird.hide', () => {
      stopOverlayProcess();
      updateStatusBar();
      vscode.window.showInformationMessage('CodeBird: Pip is taking a nap 💤 Click the status bar or run "CodeBird: Summon" anytime!');
    }),

    vscode.commands.registerCommand('codebird.analyzeCurrentFile', () => {
      launchOverlayProcess(context.extensionPath, wsPort);
      refreshAllFileSuggestions(vscode.window.activeTextEditor);
      const issue = activityTracker.inspectEditorForIssues(vscode.window.activeTextEditor, true);
      if (!issue) {
        bridge.broadcast({
          type: 'mood_change',
          mood: 'happy',
          speechText: 'No bugs found in the current file! Everything looks clean! ✨'
        });
      }
    }),

    vscode.commands.registerCommand('codebird.analyzeProject', async () => {
      launchOverlayProcess(context.extensionPath, wsPort);
      await workspaceTracker.scanWorkspace();
      const snap = workspaceTracker.getSnapshot();
      bridge.broadcast({
        type: 'mood_change',
        mood: snap.totalErrors > 0 ? 'alert-error' : 'happy',
        speechText: `Project Scan: ${snap.totalFiles} files, ${snap.totalErrors} errors, ${snap.totalWarnings} warnings.`
      });
    }),

    vscode.commands.registerCommand('codebird.toggleMode', async () => {
      const cfg = vscode.workspace.getConfiguration('codebird');
      const current = cfg.get<RoamMode>('roamMode', 'free-roam');
      const modes: RoamMode[] = ['free-roam', 'follow-mouse', 'perch'];
      const next = modes[(modes.indexOf(current) + 1) % modes.length];
      await cfg.update('roamMode', next, vscode.ConfigurationTarget.Global);
      bridge.broadcast({
        type: 'roam_mode_change',
        roamMode: next
      });
      vscode.window.showInformationMessage(`CodeBird Roam Mode switched to: ${next}`);
    }),

    vscode.commands.registerCommand('codebird.fixAllInFile', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }
      const issues = activityTracker
        .findIssuesInDocument(editor.document)
        .filter((iss) => !aiAgent.isDismissed(iss.id));
      const suggestions = issues
        .map((iss) => aiAgent.analyzeLocally(iss))
        .filter((s) => Boolean(s.fixedCode));

      if (suggestions.length === 0) {
        vscode.window.showInformationMessage('🐦 Pip: No auto-fixable issues found in the current file!');
        return;
      }

      // Apply bottom-to-top so line numbers remain stable
      suggestions.sort((a, b) => b.line - a.line);
      let fixedCount = 0;
      for (const sug of suggestions) {
        const ok = await codeActions.applySuggestionFix(sug);
        if (ok) {
          fixedCount++;
          autoHealCount++;
        }
      }

      refreshAllFileSuggestions(editor);
      updateStatusBar();
      vscode.window.showInformationMessage(`✨🐦 Pip healed ${fixedCount} issue(s) in ${path.basename(editor.document.uri.fsPath)}!`);
    }),

    vscode.commands.registerCommand('codebird.switchStealthMode', async () => {
      const enabled = isCodebirdEnabled();
      const running = isOverlayRunning();
      const current = getStealthMode();
      const autoStart = isCodebirdAutoStart();

      const items: any[] = [];

      if (!enabled) {
        items.push({
          label: '▶️ Enable Pip (Turn Companion Back On)',
          description: 'Enable Pip overlay, intelligence, and status updates',
          action: 'enable'
        });
      } else {
        items.push({
          label: '🛑 Disable Pip Everywhere',
          description: 'Turn off the floating companion and status updates',
          action: 'disable'
        });

        if (running) {
          items.push({
            label: '💤 Send Pip to Sleep (Close Floating Overlay)',
            description: 'Temporarily hide Pip until summoned or clicked in status bar',
            action: 'sleep'
          });
        } else {
          items.push({
            label: '🕊️ Wake / Summon Pip (Launch Overlay)',
            description: 'Bring the floating companion back to your screen',
            action: 'summon'
          });
        }

        items.push({
          label: `⚙️ Auto-Start on IDE Launch: ${autoStart ? 'ENABLED' : 'DISABLED'}`,
          description: autoStart
            ? 'Click to disable: Pip will NOT pop up when VS Code/Cursor opens'
            : 'Click to enable: Pip will automatically pop up when VS Code/Cursor opens',
          action: 'toggle-autostart'
        });

        items.push({
          label: '✨ Fix All Detected Issues in Current File',
          description: `${activeFileIssueCount} issue(s) ready to heal`,
          action: 'fix-all'
        });

        const comp = getCompanion();
        const compLabels: Record<CompanionType, string> = {
          bird: '🐦 Pip (CodeBird)',
          cat: '🐱 Mochi (Desk Cat)',
          bot: '🤖 Byte (Mini Robot)',
          fox: '🦊 Rusty (Red Fox)',
          frog: '🐸 Kero (Zen Frog)',
          ghost: '👻 Boo (Lil Ghost)'
        };
        items.push({
          label: `🐾 Choose Companion: Current is ${compLabels[comp]}`,
          description: 'Switch between Pip 🐦, Mochi 🐱, Byte 🤖, Rusty 🦊, Kero 🐸, Boo 👻',
          action: 'choose-companion'
        });

        items.push(
          {
            label: `${current === 'off' ? '$(check) ' : ''}🐦 Normal Visible Mode (off)`,
            description: 'Floating bird companion + full inline editor intelligence',
            mode: 'off' as StealthMode
          },
          {
            label: `${current === 'peek' ? '$(check) ' : ''}🦎 Peek-on-Error Chameleon (peek)`,
            description: '100% invisible while coding normally; peeks in ONLY when a bug or selection appears',
            mode: 'peek' as StealthMode
          },
          {
            label: `${current === 'screen-shield' ? '$(check) ' : ''}🕵️ Screen-Share Invisible Shield (screen-shield)`,
            description: 'Visible to YOUR eyes, 100% invisible on Zoom, Google Meet, Teams, Discord & OBS!',
            mode: 'screen-shield' as StealthMode
          },
          {
            label: `${current === 'auto-heal' ? '$(check) ' : ''}⚡ Silent Auto-Healer (auto-heal)`,
            description: 'Hides floating bird & automatically heals bugs in the background as you pause typing',
            mode: 'auto-heal' as StealthMode
          },
          {
            label: `${current === 'ghost' ? '$(check) ' : ''}👻 Ghost in the Editor (ghost)`,
            description: 'Zero floating window; 100% inline solutions, CodeLens, Hover & Status Bar radar',
            mode: 'ghost' as StealthMode
          }
        );
      }

      const pick = await vscode.window.showQuickPick(items, {
        placeHolder: `Pip Status: ${!enabled ? 'DISABLED' : !running ? 'ASLEEP' : current.toUpperCase()} — Select an Option (Alt+S)`
      });

      if (!pick) {
        return;
      }

      if (pick.action === 'enable' || pick.action === 'disable') {
        await vscode.commands.executeCommand('codebird.toggleEnable');
        return;
      }
      if (pick.action === 'sleep') {
        await vscode.commands.executeCommand('codebird.hide');
        return;
      }
      if (pick.action === 'summon') {
        await vscode.commands.executeCommand('codebird.summon');
        return;
      }
      if (pick.action === 'toggle-autostart') {
        await vscode.workspace
          .getConfiguration('codebird')
          .update('autoStart', !autoStart, vscode.ConfigurationTarget.Global);
        updateStatusBar();
        vscode.window.showInformationMessage(`CodeBird: Auto-Start on launch is now ${!autoStart ? 'ENABLED' : 'DISABLED'}`);
        return;
      }
      if (pick.action === 'choose-companion') {
        await vscode.commands.executeCommand('codebird.chooseCompanion');
        return;
      }
      if (pick.action === 'fix-all') {
        await vscode.commands.executeCommand('codebird.fixAllInFile');
        return;
      }

      const selectedMode = pick.mode as StealthMode;
      if (!selectedMode) {
        return;
      }

      await setStealthModeState(selectedMode);
      if (selectedMode !== 'ghost') {
        launchOverlayProcess(context.extensionPath, wsPort);
      } else {
        stopOverlayProcess();
      }

      bridge.broadcast({
        type: 'stealth_mode_change',
        stealthMode: selectedMode
      });

      if (selectedMode === 'auto-heal') {
        await vscode.commands.executeCommand('codebird.fixAllInFile');
      }

      vscode.window.showInformationMessage(`🐦 Pip Stealth Mode switched to: ${selectedMode}`);
    }),

    vscode.commands.registerCommand('codebird.configureAI', async () => {
      const providerPick = await vscode.window.showQuickPick(
        [
          { label: 'gemini', description: '(Recommended) Google Gemini (supports AI Studio & Vertex AQ. keys)' },
          { label: 'auto', description: 'Auto-detect key (Gemini / Groq / OpenAI / Local Ollama / Smart Engine)' },
          { label: 'groq', description: 'Groq Cloud (e.g. llama-3.3-70b-versatile)' },
          { label: 'openai', description: 'OpenAI (e.g. gpt-4o-mini)' },
          { label: 'ollama', description: 'Local Ollama (100% Free & Offline on port 11434)' },
          { label: 'local-smart', description: 'Built-in Instant Heuristic Analyzer (Zero setup)' }
        ],
        { placeHolder: 'Step 1/3: Select AI Provider for Pip (CodeBird)' }
      );
      if (!providerPick) {
        return;
      }

      const cfg = vscode.workspace.getConfiguration('codebird');
      await cfg.update('aiProvider', providerPick.label, vscode.ConfigurationTarget.Global);

      if (['gemini', 'groq', 'openai', 'auto'].includes(providerPick.label)) {
        const keyInput = await vscode.window.showInputBox({
          prompt: `Step 2/3: Enter API Key for ${providerPick.label}`,
          password: true,
          value: cfg.get<string>('apiKey', '')
        });
        if (keyInput !== undefined) {
          await cfg.update('apiKey', keyInput.trim(), vscode.ConfigurationTarget.Global);
        }
      }

      const modelOptions =
        providerPick.label === 'gemini' || providerPick.label === 'auto'
          ? [
              { label: 'gemini-3.8-flash', description: '🚀 Latest Next-Gen Gemini 3.8 Flash' },
              { label: 'gemini-2.5-flash', description: '⭐ Fast & accurate real-time code analysis' },
              { label: 'gemini-2.5-pro', description: 'Deep reasoning for complex multi-file refactoring' },
              { label: 'gemini-2.0-flash', description: 'Ultra-low latency flash model' }
            ]
          : providerPick.label === 'groq'
            ? [
                { label: 'llama-3.3-70b-versatile', description: '⭐ Recommended for Groq' },
                { label: 'llama-3.1-8b-instant', description: 'Ultra fast' }
              ]
            : providerPick.label === 'openai'
              ? [
                  { label: 'gpt-4o-mini', description: '⭐ Recommended — Fast & affordable' },
                  { label: 'gpt-4o', description: 'Flagship OpenAI model' }
                ]
              : [{ label: 'qwen2.5-coder:7b', description: '⭐ Recommended local coding model for Ollama' }];

      const modelPick = await vscode.window.showQuickPick(modelOptions, {
        placeHolder: 'Step 3/3: Select Model to Use'
      });
      if (modelPick) {
        await cfg.update('model', modelPick.label, vscode.ConfigurationTarget.Global);
      }

      vscode.window.showInformationMessage(
        `🐦 Pip AI configured: ${aiAgent.getResolvedProviderName()} (${modelPick?.label || 'default'})`
      );
      sendInitState();
    })
  );

  // Launch Floating Bird Overlay on startup only if enabled and autoStart is active
  if (isCodebirdEnabled() && isCodebirdAutoStart() && getStealthMode() !== 'ghost') {
    launchOverlayProcess(context.extensionPath, wsPort);
  } else {
    updateStatusBar();
  }
}

function sendInitState() {
  const roamMode = vscode.workspace
    .getConfiguration('codebird')
    .get<RoamMode>('roamMode', 'free-roam');

  bridge.broadcast({
    type: 'init',
    workspace: workspaceTracker.getSnapshot(),
    roamMode,
    stealthMode: getStealthMode(),
    aiProvider: aiAgent.getResolvedProviderName(),
    companion: getCompanion(),
    savedConfig: aiAgent.getSavedConfig(),
    activeEditor: activityTracker.getActiveEditorState(),
    chatHistory: aiAgent.getChatHistory()
  });
}

function launchOverlayProcess(extensionPath: string, wsPort: number) {
  if (!isCodebirdEnabled()) {
    return;
  }
  if (overlayProcess && !overlayProcess.killed) {
    return;
  }

  // IMPORTANT: Inside VS Code's Extension Host, `require('electron')` returns an internal Electron object
  // rather than the path string to electron.exe. Always resolve the binary path directly on disk!
  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'electron.exe' : 'electron';
  const candidates = [
    path.join(extensionPath, 'node_modules', 'electron', 'dist', exeName),
    path.join('d:\\saurav\\etc\\New folder (11)', 'node_modules', 'electron', 'dist', exeName)
  ];
  const electronBin = candidates.find((p) => fs.existsSync(p));
  const overlayMain = path.join(extensionPath, 'overlay', 'main.js');

  if (!electronBin) {
    console.error('[ChirpAI CodeBird] electron binary not found in candidates:', candidates);
    return;
  }

  try {
    const childEnv = { ...process.env };
    delete childEnv.ELECTRON_RUN_AS_NODE;

    overlayProcess = spawn(electronBin, [overlayMain, `--ws-port=${wsPort}`], {
      cwd: extensionPath,
      env: childEnv,
      stdio: 'ignore',
      detached: false,
      shell: false
    });

    overlayProcess.on('exit', () => {
      overlayProcess = null;
      updateStatusBar();
    });
    updateStatusBar();
  } catch (err) {
    console.error('[ChirpAI CodeBird] Failed to launch Electron overlay:', err);
  }
}

function stopOverlayProcess() {
  if (overlayProcess && !overlayProcess.killed) {
    try {
      if (process.platform === 'win32' && overlayProcess.pid) {
        spawn('taskkill', ['/pid', String(overlayProcess.pid), '/f', '/t']);
      } else {
        overlayProcess.kill();
      }
    } catch {
      // ignore
    }
    overlayProcess = null;
    updateStatusBar();
  }
}

export function deactivate() {
  stopOverlayProcess();
  if (activityTracker) {
    activityTracker.dispose();
  }
  if (workspaceTracker) {
    workspaceTracker.dispose();
  }
  if (codeActions) {
    codeActions.dispose();
  }
  if (bridge) {
    bridge.stop();
  }
}
