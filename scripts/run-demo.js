const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const PORT = 49825;
const demoFile = path.join(__dirname, '..', 'demo-workspace', 'buggyApp.ts');

const wss = new WebSocketServer({ host: '127.0.0.1', port: PORT });

function scanDemoFile() {
  if (!fs.existsSync(demoFile)) return null;
  const lines = fs.readFileSync(demoFile, 'utf8').split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\bconsol\.log\b/.test(line)) {
      return {
        issueId: `buggyApp.ts:${i + 1}:consol`,
        fileUri: demoFile,
        fileName: 'buggyApp.ts',
        relativePath: 'demo-workspace/buggyApp.ts',
        line: i + 1,
        severity: 'error',
        title: 'Typo in console.log()',
        whatsWrong: `Line ${i + 1} calls \`consol.log(...)\`, which will throw a ReferenceError at runtime because \`consol\` is not defined.`,
        whatToDo: 'Replace `consol.log` with `console.log`.',
        originalCode: line,
        fixedCode: line.replace(/\bconsol\.log\b/, 'console.log'),
        providerUsed: 'CodeBird Live Sensor'
      };
    }
    if (/\bfetch\s*\(/.test(line) && !/\bawait\b/.test(line)) {
      return {
        issueId: `buggyApp.ts:${i + 1}:fetch`,
        fileUri: demoFile,
        fileName: 'buggyApp.ts',
        relativePath: 'demo-workspace/buggyApp.ts',
        line: i + 1,
        severity: 'warning',
        title: 'Unawaited Async fetch() Call',
        whatsWrong: '`fetch()` returns a Promise. Without `await`, `response` holds an unresolved Promise instead of the HTTP response.',
        whatToDo: 'Add `await` before `fetch(...)`.',
        originalCode: line,
        fixedCode: line.replace(/\bfetch\s*\(/, 'await fetch('),
        providerUsed: 'CodeBird Live Sensor'
      };
    }
    if (/[^=!]==[^=]/.test(line) && !line.trim().startsWith('//')) {
      return {
        issueId: `buggyApp.ts:${i + 1}:eqeq`,
        fileUri: demoFile,
        fileName: 'buggyApp.ts',
        relativePath: 'demo-workspace/buggyApp.ts',
        line: i + 1,
        severity: 'warning',
        title: 'Loose Equality Operator (==)',
        whatsWrong: 'Using `==` performs implicit type coercion, which can cause subtle comparison bugs.',
        whatToDo: 'Use strict equality (`===`) instead.',
        originalCode: line,
        fixedCode: line.replace(/([^=!])==([^=])/, '$1===$2'),
        providerUsed: 'CodeBird Live Sensor'
      };
    }
    if (/if\s*\(\s*[A-Za-z0-9_$.]+\s*=\s*[^=]/.test(line)) {
      return {
        issueId: `buggyApp.ts:${i + 1}:assign`,
        fileUri: demoFile,
        fileName: 'buggyApp.ts',
        relativePath: 'demo-workspace/buggyApp.ts',
        line: i + 1,
        severity: 'error',
        title: 'Accidental Assignment in if(...)',
        whatsWrong: 'A single `=` inside `if (orderStatus = "approved")` overwrites `orderStatus` and always evaluates to truthy!',
        whatToDo: 'Replace `=` with `===` to compare the status safely.',
        originalCode: line,
        fixedCode: line.replace(/(if\s*\(\s*[A-Za-z0-9_$.]+\s*)=(\s*[^=])/, '$1===$2'),
        providerUsed: 'CodeBird Live Sensor'
      };
    }
  }
  return null;
}

wss.on('connection', (ws) => {
  const send = (obj) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(obj));
    }
  };

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'overlay_ready') {
      send({
        type: 'init',
        roamMode: 'free-roam',
        aiProvider: 'auto',
        workspace: {
          workspaceName: 'ChirpAI-Workspace',
          rootPath: path.join(__dirname, '..'),
          totalFiles: 8,
          totalErrors: 2,
          totalWarnings: 2,
          files: [],
          recentFiles: ['demo-workspace/buggyApp.ts']
        },
        activeEditor: {
          fileUri: demoFile,
          fileName: 'buggyApp.ts',
          relativePath: 'demo-workspace/buggyApp.ts',
          languageId: 'typescript',
          cursorLine: 7,
          cursorColumn: 3,
          lineText: '  consol.log("Processing order for user:", userId);',
          visibleStartLine: 1,
          visibleEndLine: 30,
          totalLines: 26,
          estimatedViewportYRatio: 0.28,
          estimatedViewportXRatio: 0.48
        }
      });

      setTimeout(() => {
        const sug = scanDemoFile();
        if (sug) {
          send({
            type: 'bird_suggestion',
            suggestion: sug,
            mood: sug.severity === 'error' ? 'alert-error' : 'alert-warning',
            estimatedViewportYRatio: 0.28 + (sug.line / 35) * 0.4,
            estimatedViewportXRatio: 0.52
          });
        }
      }, 1200);
    } else if (msg.type === 'apply_fix') {
      const sug = msg.suggestion;
      if (fs.existsSync(demoFile) && sug.fixedCode) {
        const lines = fs.readFileSync(demoFile, 'utf8').split(/\r?\n/);
        if (lines[sug.line - 1] !== undefined) {
          lines[sug.line - 1] = sug.fixedCode;
          fs.writeFileSync(demoFile, lines.join('\n'), 'utf8');
        }
      }
      send({
        type: 'fix_applied',
        fileName: sug.fileName,
        line: sug.line,
        message: `Fixed line ${sug.line} in ${sug.fileName}! Checking next lines...`
      });

      // Automatically scan for next bug in the file after 2.2s!
      setTimeout(() => {
        const nextSug = scanDemoFile();
        if (nextSug) {
          send({
            type: 'bird_suggestion',
            suggestion: nextSug,
            mood: nextSug.severity === 'error' ? 'alert-error' : 'alert-warning',
            estimatedViewportYRatio: 0.25 + (nextSug.line / 35) * 0.45,
            estimatedViewportXRatio: 0.52
          });
        } else {
          send({
            type: 'mood_change',
            mood: 'happy',
            speechText: 'All bugs in buggyApp.ts are fixed! Great job! 🎉🐦',
            subText: 'Edit buggyApp.ts or ask me any question below!'
          });
        }
      }, 2200);
    } else if (msg.type === 'request_file_review' || msg.type === 'request_project_scan') {
      const sug = scanDemoFile();
      if (sug) {
        send({
          type: 'bird_suggestion',
          suggestion: sug,
          mood: sug.severity === 'error' ? 'alert-error' : 'alert-warning',
          estimatedViewportYRatio: 0.32,
          estimatedViewportXRatio: 0.52
        });
      } else {
        send({
          type: 'mood_change',
          mood: 'happy',
          speechText: 'All clear! No issues found in buggyApp.ts! ✨'
        });
      }
    } else if (msg.type === 'ask_bird') {
      send({
        type: 'chat_reply',
        question: msg.question,
        answer: `Chirp! I'm watching buggyApp.ts and your workspace files. Click "✨ Fix It For Me" to repair detected bugs on the spot, or press F5 in VS Code to run the full Extension Host!`,
        providerUsed: 'Pip Smart Brain'
      });
    }
  });
});

console.log(`[ChirpAI Demo] Bridge running on ws://127.0.0.1:${PORT}. Launching Floating Bird...`);
const electronBin = require('electron');
const overlayMain = path.join(__dirname, '..', 'overlay', 'main.js');

const childEnv = { ...process.env };
delete childEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBin, [overlayMain, `--ws-port=${PORT}`], {
  cwd: path.join(__dirname, '..'),
  env: childEnv,
  stdio: 'inherit',
  shell: false
});

child.on('exit', () => {
  wss.close();
  process.exit(0);
});
