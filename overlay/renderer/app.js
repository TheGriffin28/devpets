(function () {
  const bird = new window.CodeBirdAnimator();

  // DOM Elements
  const stageEl = document.getElementById('bird-stage');
  const bubbleEl = document.getElementById('speech-bubble');
  const radarDot = document.getElementById('radar-dot');
  const radarText = document.getElementById('radar-text');

  const sevPill = document.getElementById('bubble-severity-pill');
  const locationEl = document.getElementById('bubble-location');
  const selectionToolbar = document.getElementById('selection-toolbar');
  const selectionLabel = document.getElementById('selection-label');
  const headlineEl = document.getElementById('issue-headline');
  const whatsWrongLabel = document.getElementById('whats-wrong-label');
  const whatsWrongEl = document.getElementById('issue-whats-wrong');
  const whatToDoEl = document.getElementById('issue-what-to-do');

  const diffBox = document.getElementById('code-diff-box');
  const diffOrig = document.getElementById('diff-original');
  const diffFixed = document.getElementById('diff-fixed');

  const suggestionBtns = document.getElementById('suggestion-buttons');
  const btnApplyFix = document.getElementById('btn-apply-fix');
  const btnJumpLine = document.getElementById('btn-jump-line');
  const btnDismiss = document.getElementById('btn-dismiss');

  const btnRoamMode = document.getElementById('btn-roam-mode');
  const btnStealthMode = document.getElementById('btn-stealth-mode');
  const btnChatHistory = document.getElementById('btn-chat-history');
  const btnScanFile = document.getElementById('btn-scan-file');
  const btnScanProject = document.getElementById('btn-scan-project');
  const btnSettings = document.getElementById('btn-settings');
  const btnSleep = document.getElementById('btn-sleep');
  const btnMinimize = document.getElementById('btn-minimize');

  const issueViewContainer = document.getElementById('issue-view-container');
  const chatHistoryPanel = document.getElementById('chat-history-panel');
  const chatHistoryList = document.getElementById('chat-history-list');
  const btnClearChat = document.getElementById('btn-clear-chat');

  const settingsDrawer = document.getElementById('settings-drawer');
  const selectCompanion = document.getElementById('select-companion');
  const selectProvider = document.getElementById('select-provider');
  const inputApiKey = document.getElementById('input-api-key');
  const inputModel = document.getElementById('input-model');
  const btnSaveSettings = document.getElementById('btn-save-settings');
  const btnDisablePip = document.getElementById('btn-disable-pip');

  const askInput = document.getElementById('ask-input');
  const btnAskSend = document.getElementById('btn-ask-send');

  let currentCompanion = 'bird';
  let currentSuggestion = null;
  let hasActiveSelection = false;
  let currentStealthMode = 'off'; // 'off' | 'peek' | 'screen-shield' | 'auto-heal' | 'ghost'
  let peekHideTimer = null;
  let ws = null;
  let bubbleMinimized = false;

  function setActiveCompanion(compType, syncToExtension = true) {
    if (!compType) compType = 'bird';
    currentCompanion = compType;
    bird.setCompanion(compType);

    if (selectCompanion && selectCompanion.value !== compType) {
      selectCompanion.value = compType;
    }

    try {
      localStorage.setItem('codebird_companion', compType);
    } catch {
      // ignore
    }

    if (syncToExtension) {
      sendToExtension({
        type: 'change_companion',
        companion: compType
      });
    }
  }

  // Restore cached companion choice immediately
  try {
    const cachedComp = localStorage.getItem('codebird_companion');
    if (cachedComp) {
      setActiveCompanion(cachedComp, false);
    }
  } catch {
    // ignore
  }

  if (selectCompanion) {
    selectCompanion.addEventListener('change', () => {
      setActiveCompanion(selectCompanion.value, true);
    });
  }

  // 1. Setup Electron Click-Through Pass-Through & 60 FPS OS Mouse Tracking
  if (window.electronOverlay) {
    window.electronOverlay.onCursorMove((coords) => {
      bird.updateOSMouse(coords.x, coords.y, coords.screenWidth, coords.screenHeight);
    });

    stageEl.addEventListener('mouseenter', () => {
      if (stageEl.classList.contains('stealth-camo')) {
        return;
      }
      window.electronOverlay.setIgnoreMouseEvents(false);
    });

    stageEl.addEventListener('mouseleave', () => {
      // Keep interactive if user is actively typing in input
      if (document.activeElement === askInput || document.activeElement === inputApiKey || document.activeElement === inputModel) {
        return;
      }
      window.electronOverlay.setIgnoreMouseEvents(true);
    });

    askInput.addEventListener('blur', () => {
      window.electronOverlay.setIgnoreMouseEvents(true);
    });
  }

  // Clicking on Pip toggles the speech bubble visibility
  bird.onBirdClicked = () => {
    bubbleMinimized = !bubbleMinimized;
    if (bubbleMinimized) {
      bubbleEl.classList.add('hidden');
    } else {
      bubbleEl.classList.remove('hidden');
      bird.triggerTalk(900);
    }
  };

  // Right-clicking or dragging Pip immediately disables follow-mouse mode
  bird.onDisableFollow = () => {
    updateRoamModeButton('perch');
    sendToExtension({
      type: 'change_roam_mode',
      roamMode: 'perch'
    });
  };

  btnMinimize.addEventListener('click', () => {
    bubbleMinimized = true;
    bubbleEl.classList.add('hidden');
    if (window.electronOverlay) {
      window.electronOverlay.setIgnoreMouseEvents(true);
    }
  });

  // 2. Connect to VS Code Extension WebSocket Bridge
  const params = new URLSearchParams(window.location.search);
  const wsPort = params.get('wsPort') || '49821';

  function connectWebSocket() {
    ws = new WebSocket(`ws://127.0.0.1:${wsPort}`);

    ws.addEventListener('open', () => {
      radarDot.className = 'dot-online';
      radarText.textContent = 'Connected to VS Code';
      sendToExtension({ type: 'overlay_ready' });
    });

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleExtensionMessage(msg);
      } catch (err) {
        console.error('Failed to parse message from extension:', err);
      }
    });

    ws.addEventListener('close', () => {
      radarDot.className = 'dot-thinking';
      radarText.textContent = 'Reconnecting...';
      setTimeout(connectWebSocket, 2000);
    });
  }

  function sendToExtension(payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  function updateRoamModeButton(mode) {
    bird.roamMode = mode;
    if (mode === 'free-roam') {
      btnRoamMode.textContent = '🕊️ Free';
    } else if (mode === 'follow-mouse') {
      btnRoamMode.textContent = '🎯 Follow';
    } else {
      btnRoamMode.textContent = '🪺 Perch';
    }
  }

  function setStealthHidden(hidden) {
    if (hidden) {
      stageEl.classList.add('stealth-camo');
      if (window.electronOverlay) {
        window.electronOverlay.setIgnoreMouseEvents(true);
      }
    } else {
      stageEl.classList.remove('stealth-camo');
    }
  }

  function evaluateStealthCamo(forceShowBriefly = false) {
    if (peekHideTimer) {
      clearTimeout(peekHideTimer);
      peekHideTimer = null;
    }

    if (currentStealthMode === 'ghost' || currentStealthMode === 'auto-heal') {
      setStealthHidden(true);
      return;
    }

    if (currentStealthMode === 'peek') {
      if (currentSuggestion || hasActiveSelection || forceShowBriefly) {
        setStealthHidden(false);
        if (forceShowBriefly && !hasActiveSelection) {
          peekHideTimer = setTimeout(() => {
            if (!hasActiveSelection && currentStealthMode === 'peek') {
              currentSuggestion = null;
              setStealthHidden(true);
            }
          }, 3500);
        }
      } else {
        setStealthHidden(true);
      }
      return;
    }

    // 'off' or 'screen-shield' -> visible to the user
    setStealthHidden(false);
  }

  function updateStealthMode(mode) {
    const prevMode = currentStealthMode;
    currentStealthMode = mode || 'off';

    if (btnStealthMode) {
      btnStealthMode.classList.remove('stealth-shield-active');
      if (currentStealthMode === 'off') {
        btnStealthMode.textContent = '🐦 Vis';
      } else if (currentStealthMode === 'peek') {
        btnStealthMode.textContent = '🦎 Peek';
      } else if (currentStealthMode === 'screen-shield') {
        btnStealthMode.textContent = '🕵️ Shield';
        btnStealthMode.classList.add('stealth-shield-active');
      } else if (currentStealthMode === 'auto-heal') {
        btnStealthMode.textContent = '⚡ Heal';
      } else if (currentStealthMode === 'ghost') {
        btnStealthMode.textContent = '👻 Ghost';
      }
    }

    stageEl.classList.toggle('screen-shield-cloak', currentStealthMode === 'screen-shield');

    if (window.electronOverlay && window.electronOverlay.setContentProtection) {
      window.electronOverlay.setContentProtection(currentStealthMode === 'screen-shield');
    }

    // When switching into peek, auto-heal, or ghost mode, immediately hide the bird so the user sees it enter stealth!
    if (currentStealthMode === 'peek' && prevMode !== 'peek') {
      currentSuggestion = null;
      evaluateStealthCamo(false);
      return;
    }

    evaluateStealthCamo(false);
  }

  function showBubble() {
    bubbleMinimized = false;
    bubbleEl.classList.remove('hidden');
  }

  function toggleChatView(showChat) {
    if (!issueViewContainer || !chatHistoryPanel) return;
    if (showChat) {
      issueViewContainer.classList.add('hidden');
      chatHistoryPanel.classList.remove('hidden');
    } else {
      chatHistoryPanel.classList.add('hidden');
      issueViewContainer.classList.remove('hidden');
    }
  }

  function renderChatHistory(history) {
    if (!chatHistoryList) return;
    chatHistoryList.innerHTML = '';

    if (btnChatHistory) {
      btnChatHistory.textContent = history && history.length > 0 ? `💬 ${history.length}` : '💬';
    }

    if (!history || history.length === 0) {
      const emptyEl = document.createElement('div');
      emptyEl.className = 'chat-ai-msg';
      emptyEl.textContent = 'No messages yet! Ask Pip a question below (e.g., "create a login form in this project") to get a project-aware implementation plan.';
      chatHistoryList.appendChild(emptyEl);
      return;
    }

    history.forEach((turn) => {
      const card = document.createElement('div');
      card.className = 'chat-turn-card';

      const userEl = document.createElement('div');
      userEl.className = 'chat-user-msg';
      userEl.textContent = `You: ${turn.question}`;
      card.appendChild(userEl);

      const aiEl = document.createElement('div');
      aiEl.className = 'chat-ai-msg';
      aiEl.textContent = turn.answer;
      card.appendChild(aiEl);

      if (Array.isArray(turn.steps) && turn.steps.length > 0) {
        turn.steps.forEach((step, idx) => {
          const stepCard = document.createElement('div');
          stepCard.className = 'step-card';

          const header = document.createElement('div');
          header.className = 'step-card-header';

          const badge = document.createElement('span');
          const isCreate = step.actionType === 'create' || step.action === 'create';
          badge.className = `step-action-badge ${isCreate ? 'step-badge-create' : 'step-badge-update'}`;
          badge.textContent = isCreate ? `STEP ${idx + 1}: CREATE FILE` : `STEP ${idx + 1}: UPDATE FILE`;

          const fileSpan = document.createElement('span');
          fileSpan.className = 'step-target-file';
          fileSpan.textContent = step.targetFile;

          header.appendChild(badge);
          header.appendChild(fileSpan);
          stepCard.appendChild(header);

          if (step.title || step.description) {
            const desc = document.createElement('div');
            desc.className = 'step-desc';
            desc.textContent = step.title && step.description
              ? `${step.title} — ${step.description}`
              : (step.title || step.description);
            stepCard.appendChild(desc);
          }

          if (step.code) {
            const codeBox = document.createElement('div');
            codeBox.className = 'step-code-box';
            codeBox.textContent = step.code;
            stepCard.appendChild(codeBox);
          }

          const actionsRow = document.createElement('div');
          actionsRow.className = 'step-actions-row';

          const applyBtn = document.createElement('button');
          applyBtn.className = 'btn btn-primary';
          applyBtn.textContent = isCreate
            ? `✨ Create ${step.targetFile} & Open`
            : `📝 Add Code to ${step.targetFile}`;
          applyBtn.addEventListener('click', () => {
            applyBtn.textContent = '⏳ Applying...';
            sendToExtension({
              type: 'apply_chat_step',
              step
            });
            setTimeout(() => {
              applyBtn.textContent = `✅ Applied to ${step.targetFile}`;
            }, 400);
          });

          const copyBtn = document.createElement('button');
          copyBtn.className = 'btn btn-secondary';
          copyBtn.textContent = '📋 Copy Code';
          copyBtn.addEventListener('click', () => {
            if (navigator.clipboard && step.code) {
              navigator.clipboard.writeText(step.code);
              copyBtn.textContent = '✅ Copied!';
              setTimeout(() => {
                copyBtn.textContent = '📋 Copy Code';
              }, 1500);
            }
          });

          actionsRow.appendChild(applyBtn);
          actionsRow.appendChild(copyBtn);
          stepCard.appendChild(actionsRow);

          card.appendChild(stepCard);
        });
      }

      chatHistoryList.appendChild(card);
    });

    setTimeout(() => {
      chatHistoryList.scrollTop = chatHistoryList.scrollHeight;
    }, 30);
  }

  function handleExtensionMessage(msg) {
    switch (msg.type) {
      case 'init': {
        updateRoamModeButton(msg.roamMode || 'free-roam');
        updateStealthMode(msg.stealthMode || 'off');
        if (msg.savedConfig) {
          if (selectProvider && msg.savedConfig.provider) {
            selectProvider.value = msg.savedConfig.provider;
          }
          if (inputApiKey && msg.savedConfig.apiKey) {
            inputApiKey.value = msg.savedConfig.apiKey;
          }
          if (inputModel && msg.savedConfig.model) {
            inputModel.value = msg.savedConfig.model;
          }
          try {
            localStorage.setItem('codebird_saved_config', JSON.stringify(msg.savedConfig));
          } catch {
            // ignore
          }
        }
        if (Array.isArray(msg.chatHistory)) {
          renderChatHistory(msg.chatHistory);
        }
        if (msg.companion) {
          setActiveCompanion(msg.companion, false);
        }
        if (msg.activeEditor) {
          radarText.textContent = `${msg.activeEditor.fileName} : L${msg.activeEditor.cursorLine}`;
          locationEl.textContent = `${msg.activeEditor.fileName} • Line ${msg.activeEditor.cursorLine}`;
        } else if (msg.workspace) {
          radarText.textContent = `${msg.workspace.workspaceName} (${msg.workspace.totalFiles} files)`;
          locationEl.textContent = `${msg.workspace.workspaceName}`;
        }
        break;
      }

      case 'companion_change': {
        if (msg.companion) {
          setActiveCompanion(msg.companion, false);
        }
        break;
      }

      case 'stealth_mode_change': {
        updateStealthMode(msg.stealthMode);
        break;
      }

      case 'cursor_move': {
        const ed = msg.activeEditor;
        radarText.textContent = `${ed.fileName} : L${ed.cursorLine}`;
        if (!currentSuggestion) {
          locationEl.textContent = `${ed.fileName} • Line ${ed.cursorLine}`;
        }

        if (msg.lineHasError) {
          radarDot.className = 'dot-error';
          bird.flyToCodeLine(ed.estimatedViewportYRatio, ed.estimatedViewportXRatio);
          if (currentStealthMode === 'peek') {
            setStealthHidden(false);
          }
        } else {
          radarDot.className = 'dot-online';
          if (currentStealthMode === 'peek' && !hasActiveSelection) {
            currentSuggestion = null;
            evaluateStealthCamo(false);
          }
        }
        break;
      }

      case 'typing_activity': {
        const ed = msg.activeEditor;
        radarText.textContent = `✍️ ${ed.fileName} : L${ed.cursorLine}`;
        if (bird.roamMode === 'free-roam' && Math.random() < 0.35) {
          bird.flyToCodeLine(ed.estimatedViewportYRatio, ed.estimatedViewportXRatio);
        }
        break;
      }

      case 'selection_change': {
        const sel = msg.selection;
        if (!sel) {
          hasActiveSelection = false;
          if (selectionToolbar) selectionToolbar.classList.add('hidden');
          evaluateStealthCamo(false);
          break;
        }
        hasActiveSelection = true;
        evaluateStealthCamo(true);
        showBubble();
        bird.setMood('thinking');
        bird.flyToCodeLine(sel.estimatedViewportYRatio, sel.estimatedViewportXRatio);

        const spanText =
          sel.startLine === sel.endLine
            ? `LINE ${sel.startLine}`
            : `LINES ${sel.startLine}–${sel.endLine} (${sel.lineCount} LINES)`;
        radarText.textContent = `✂️ ${sel.fileName} : L${sel.startLine}–${sel.endLine}`;
        locationEl.textContent = `${sel.fileName} • Lines ${sel.startLine}–${sel.endLine}`;
        if (selectionLabel) {
          selectionLabel.textContent = `✂️ SELECTED ${spanText} — PICK AN ACTION:`;
        }
        if (selectionToolbar) {
          selectionToolbar.classList.remove('hidden');
        }
        break;
      }

      case 'bird_suggestion': {
        const sug = msg.suggestion;
        currentSuggestion = sug;
        toggleChatView(false);
        evaluateStealthCamo(true);
        bird.setMood(msg.mood || 'alert-error');

        if (typeof msg.estimatedViewportYRatio === 'number') {
          bird.flyToCodeLine(msg.estimatedViewportYRatio, msg.estimatedViewportXRatio || 0.55);
        }

        showBubble();
        bubbleEl.classList.remove('severity-error', 'severity-warning');

        if (sug.severity === 'error') {
          sevPill.className = 'sev-pill sev-error';
          sevPill.textContent = 'BUG / ERROR';
          bubbleEl.classList.add('severity-error');
          radarDot.className = 'dot-error';
        } else if (sug.severity === 'warning') {
          sevPill.className = 'sev-pill sev-warning';
          sevPill.textContent = 'WARNING';
          bubbleEl.classList.add('severity-warning');
          radarDot.className = 'dot-thinking';
        } else {
          sevPill.className = 'sev-pill sev-info';
          sevPill.textContent = 'SUGGESTION';
          radarDot.className = 'dot-online';
        }

        locationEl.textContent = `${sug.fileName} • Line ${sug.line}`;
        headlineEl.textContent = sug.title;
        if (whatsWrongLabel) whatsWrongLabel.classList.remove('hidden');
        whatsWrongEl.textContent = sug.whatsWrong;

        if (sug.whatToDo) {
          whatToDoEl.textContent = `💡 HOW TO FIX: ${sug.whatToDo}`;
          whatToDoEl.classList.remove('hidden');
        } else {
          whatToDoEl.classList.add('hidden');
        }

        if (sug.fixedCode && sug.originalCode) {
          diffOrig.textContent = sug.originalCode.trim();
          diffFixed.textContent = sug.fixedCode.trim();
          diffBox.classList.remove('hidden');
          btnApplyFix.classList.remove('hidden');
        } else {
          diffBox.classList.add('hidden');
          btnApplyFix.classList.add('hidden');
        }

        suggestionBtns.classList.remove('hidden');
        break;
      }

      case 'fix_applied': {
        currentSuggestion = null;
        bird.petBird();
        bubbleEl.classList.remove('severity-error', 'severity-warning');
        sevPill.className = 'sev-pill sev-success';
        sevPill.textContent = 'FIXED ✨';
        headlineEl.textContent = 'Code Repaired Successfully!';
        if (whatsWrongLabel) whatsWrongLabel.classList.add('hidden');
        whatsWrongEl.textContent = msg.message;
        whatToDoEl.classList.add('hidden');
        diffBox.classList.add('hidden');
        suggestionBtns.classList.add('hidden');
        radarDot.className = 'dot-online';
        evaluateStealthCamo(true);
        break;
      }

      case 'mood_change': {
        bird.setMood(msg.mood);
        if (msg.speechText) {
          showBubble();
          if (msg.mood === 'thinking') {
            sevPill.className = 'sev-pill sev-info';
            sevPill.textContent = 'ANALYZING...';
            radarDot.className = 'dot-thinking';
          } else if (msg.mood === 'happy') {
            sevPill.className = 'sev-pill sev-success';
            sevPill.textContent = 'ALL CLEAR';
            radarDot.className = 'dot-online';
          }
          headlineEl.textContent = msg.speechText;
          if (msg.subText) {
            whatsWrongEl.textContent = msg.subText;
          }
        }
        break;
      }

      case 'chat_reply': {
        bird.setMood('happy');
        showBubble();
        sevPill.className = 'sev-pill sev-info';
        sevPill.textContent = msg.providerUsed || 'PIP AI';
        headlineEl.textContent = `Q: "${msg.question}"`;
        whatsWrongEl.textContent = msg.answer;
        whatToDoEl.classList.add('hidden');
        diffBox.classList.add('hidden');
        suggestionBtns.classList.add('hidden');
        if (Array.isArray(msg.chatHistory)) {
          renderChatHistory(msg.chatHistory);
        }
        toggleChatView(true);
        break;
      }

      case 'roam_mode_change': {
        updateRoamModeButton(msg.roamMode);
        break;
      }
    }
  }

  // 3. Button Actions
  document.querySelectorAll('.sel-action-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-action');
      if (action) {
        sendToExtension({
          type: 'run_selection_action',
          action
        });
      }
    });
  });

  btnApplyFix.addEventListener('click', () => {
    if (!currentSuggestion) return;
    sendToExtension({
      type: 'apply_fix',
      suggestion: currentSuggestion
    });
  });

  btnJumpLine.addEventListener('click', () => {
    if (!currentSuggestion) return;
    sendToExtension({
      type: 'jump_to_line',
      fileUri: currentSuggestion.fileUri,
      line: currentSuggestion.line
    });
  });

  btnDismiss.addEventListener('click', () => {
    if (currentSuggestion) {
      sendToExtension({
        type: 'dismiss_issue',
        issueId: currentSuggestion.issueId
      });
      currentSuggestion = null;
    }
    bird.setMood('idle');
    bubbleEl.classList.remove('severity-error', 'severity-warning');
    sevPill.className = 'sev-pill sev-info';
    sevPill.textContent = 'WATCHING';
    headlineEl.textContent = 'Issue Dismissed 👍';
    whatsWrongEl.textContent = 'I am keeping an eye on your active line and workspace files.';
    whatToDoEl.classList.add('hidden');
    diffBox.classList.add('hidden');
    suggestionBtns.classList.add('hidden');
    evaluateStealthCamo(false);
  });

  btnRoamMode.addEventListener('click', () => {
    const modes = ['free-roam', 'follow-mouse', 'perch'];
    const next = modes[(modes.indexOf(bird.roamMode) + 1) % modes.length];
    updateRoamModeButton(next);
    sendToExtension({
      type: 'change_roam_mode',
      roamMode: next
    });
  });

  function cycleNextStealthMode() {
    const stealthModes = ['off', 'peek', 'screen-shield', 'auto-heal', 'ghost'];
    const next = stealthModes[(stealthModes.indexOf(currentStealthMode) + 1) % stealthModes.length];
    updateStealthMode(next);
    sendToExtension({
      type: 'change_stealth_mode',
      stealthMode: next
    });
  }

  if (btnStealthMode) {
    btnStealthMode.addEventListener('click', cycleNextStealthMode);
  }

  if (btnSleep) {
    btnSleep.addEventListener('click', () => {
      sendToExtension({ type: 'sleep_bird' });
    });
  }

  if (btnDisablePip) {
    btnDisablePip.addEventListener('click', () => {
      sendToExtension({ type: 'disable_bird' });
    });
  }

  if (btnChatHistory) {
    btnChatHistory.addEventListener('click', () => {
      if (!chatHistoryPanel) return;
      const isHidden = chatHistoryPanel.classList.contains('hidden');
      toggleChatView(isHidden);
    });
  }

  if (btnClearChat) {
    btnClearChat.addEventListener('click', () => {
      renderChatHistory([]);
      sendToExtension({ type: 'clear_chat_history' });
    });
  }

  btnScanFile.addEventListener('click', () => {
    toggleChatView(false);
    sendToExtension({ type: 'request_file_review' });
  });

  btnScanProject.addEventListener('click', () => {
    toggleChatView(false);
    sendToExtension({ type: 'request_project_scan' });
  });

  // Pre-fill settings from localStorage cache immediately on startup
  try {
    const cached = JSON.parse(localStorage.getItem('codebird_saved_config') || 'null');
    if (cached) {
      if (selectProvider && cached.provider) selectProvider.value = cached.provider;
      if (inputApiKey && cached.apiKey) inputApiKey.value = cached.apiKey;
      if (inputModel && cached.model) inputModel.value = cached.model;
    }
  } catch {
    // ignore
  }

  btnSettings.addEventListener('click', () => {
    settingsDrawer.classList.toggle('hidden');
  });

  btnSaveSettings.addEventListener('click', () => {
    if (selectCompanion && selectCompanion.value) {
      setActiveCompanion(selectCompanion.value, true);
    }
    const cfgObj = {
      provider: selectProvider.value,
      apiKey: inputApiKey.value.trim(),
      model: inputModel.value.trim()
    };
    try {
      localStorage.setItem('codebird_saved_config', JSON.stringify(cfgObj));
    } catch {
      // ignore
    }
    sendToExtension({
      type: 'save_ai_config',
      ...cfgObj
    });
    settingsDrawer.classList.add('hidden');
  });

  function submitQuestion() {
    const q = askInput.value.trim();
    if (!q) return;
    askInput.value = '';
    sendToExtension({
      type: 'ask_bird',
      question: q
    });
  }

  btnAskSend.addEventListener('click', submitQuestion);
  askInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      submitQuestion();
    }
  });

  connectWebSocket();
})();

