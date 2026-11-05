export type BirdMood =
  | 'idle'
  | 'roaming'
  | 'curious'
  | 'investigating'
  | 'alert-error'
  | 'alert-warning'
  | 'suggesting'
  | 'happy'
  | 'thinking'
  | 'sleeping';

export type RoamMode = 'free-roam' | 'follow-mouse' | 'perch';

export type StealthMode = 'off' | 'ghost' | 'peek' | 'auto-heal' | 'screen-shield';

export type CompanionType = 'bird' | 'cat' | 'bot' | 'fox' | 'frog' | 'ghost' | 'chicken' | 'crab';

export type SelectionActionType = 'refactor' | 'try-catch' | 'add-comments' | 'explain';

export interface ChatFileStep {
  stepNumber: number;
  actionType: 'create' | 'update';
  targetFile: string; // relative path inside workspace (e.g. 'LoginForm.tsx' or 'demo-workspace/LoginForm.ts')
  title: string;
  description: string;
  code: string;
}

export interface ChatImageAttachment {
  dataUrl: string; // Base64 data URI (e.g. data:image/png;base64,...)
  mimeType: string;
  name?: string;
}

export interface ChatTurn {
  id: string;
  timestamp: number;
  question: string;
  image?: ChatImageAttachment;
  answer: string;
  steps?: ChatFileStep[];
  providerUsed: string;
}

export interface SelectionState {
  fileUri: string;
  fileName: string;
  relativePath: string;
  languageId: string;
  startLine: number; // 1-based inclusive
  endLine: number; // 1-based inclusive
  lineCount: number;
  selectedText: string;
  estimatedViewportYRatio: number;
  estimatedViewportXRatio: number;
}

export interface CodeIssue {
  id: string;
  fileUri: string;
  fileName: string;
  relativePath: string;
  line: number; // 1-based line number for display
  column: number; // 1-based column number
  endLine: number;
  endColumn: number;
  severity: 'error' | 'warning' | 'info' | 'next-step';
  source: string; // e.g. 'ts', 'eslint', 'python', 'CodeBird AI'
  rawMessage: string;
  lineContent: string;
  surroundingCode: string;
}

export interface BirdSuggestion {
  issueId: string;
  fileUri: string;
  fileName: string;
  relativePath: string;
  line: number;
  endLine?: number;
  severity: 'error' | 'warning' | 'info' | 'next-step';
  title: string;
  whatsWrong: string;
  whatToDo: string;
  originalCode?: string;
  fixedCode?: string;
  fixRange?: {
    startLine: number; // 0-based for VS Code API
    startCharacter: number;
    endLine: number;
    endCharacter: number;
  };
  providerUsed: string;
}

export interface FileSummary {
  relativePath: string;
  languageId: string;
  lineCount: number;
  exports: string[];
  imports: string[];
  errorCount: number;
  warningCount: number;
  todoCount: number;
  lastModified: number;
}

export interface WorkspaceSnapshot {
  workspaceName: string;
  rootPath: string;
  totalFiles: number;
  totalErrors: number;
  totalWarnings: number;
  files: FileSummary[];
  recentFiles: string[];
}

export interface ActiveEditorState {
  fileUri: string;
  fileName: string;
  relativePath: string;
  languageId: string;
  cursorLine: number; // 1-based
  cursorColumn: number; // 1-based
  lineText: string;
  visibleStartLine: number;
  visibleEndLine: number;
  totalLines: number;
  /** Normalized vertical ratio (0.0 to 1.0) of the active cursor line within the visible editor viewport */
  estimatedViewportYRatio: number;
  /** Normalized horizontal ratio (0.0 to 1.0) of the active cursor column */
  estimatedViewportXRatio: number;
}

/** Messages sent from VS Code Extension -> Bird Overlay */
export type ExtensionToOverlayMessage =
  | {
      type: 'init';
      workspace: WorkspaceSnapshot;
      roamMode: RoamMode;
      stealthMode: StealthMode;
      aiProvider: string;
      companion?: CompanionType;
      savedConfig?: {
        provider: string;
        apiKey: string;
        model: string;
      };
      activeEditor: ActiveEditorState | null;
      chatHistory?: ChatTurn[];
    }
  | {
      type: 'stealth_mode_change';
      stealthMode: StealthMode;
    }
  | {
      type: 'cursor_move';
      activeEditor: ActiveEditorState;
      lineHasError: boolean;
      lineErrorText?: string;
    }
  | {
      type: 'selection_change';
      selection: SelectionState | null;
    }
  | {
      type: 'typing_activity';
      activeEditor: ActiveEditorState;
    }
  | {
      type: 'bird_suggestion';
      suggestion: BirdSuggestion;
      mood: BirdMood;
      estimatedViewportYRatio?: number;
      estimatedViewportXRatio?: number;
    }
  | {
      type: 'workspace_update';
      workspace: WorkspaceSnapshot;
    }
  | {
      type: 'mood_change';
      mood: BirdMood;
      speechText?: string;
      subText?: string;
    }
  | {
      type: 'chat_reply';
      question: string;
      image?: ChatImageAttachment;
      answer: string;
      steps?: ChatFileStep[];
      chatHistory: ChatTurn[];
      suggestedFix?: BirdSuggestion;
      providerUsed: string;
    }
  | {
      type: 'roam_mode_change';
      roamMode: RoamMode;
    }
  | {
      type: 'companion_change';
      companion: CompanionType;
    }
  | {
      type: 'fix_applied';
      fileName: string;
      line: number;
      message: string;
    };

/** Messages sent from Bird Overlay -> VS Code Extension */
export type OverlayToExtensionMessage =
  | {
      type: 'overlay_ready';
    }
  | {
      type: 'apply_fix';
      suggestion: BirdSuggestion;
    }
  | {
      type: 'apply_chat_step';
      step: ChatFileStep;
    }
  | {
      type: 'clear_chat_history';
    }
  | {
      type: 'run_selection_action';
      action: SelectionActionType;
    }
  | {
      type: 'jump_to_line';
      fileUri: string;
      line: number;
    }
  | {
      type: 'ask_bird';
      question: string;
      image?: ChatImageAttachment;
    }
  | {
      type: 'request_file_review';
    }
  | {
      type: 'request_project_scan';
    }
  | {
      type: 'change_roam_mode';
      roamMode: RoamMode;
    }
  | {
      type: 'change_companion';
      companion: CompanionType;
    }
  | {
      type: 'change_stealth_mode';
      stealthMode: StealthMode;
    }
  | {
      type: 'save_ai_config';
      provider: string;
      apiKey: string;
      model?: string;
    }
  | {
      type: 'dismiss_issue';
      issueId: string;
    }
  | {
      type: 'sleep_bird';
    }
  | {
      type: 'disable_bird';
    };
