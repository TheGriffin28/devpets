<div align="center">

# 🐾 DevPets

### Free-Roaming AI Desktop Companions for Developers

[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg?style=for-the-badge)](https://github.com/TheGriffin28/devpets/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85+-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white)](https://code.visualstudio.com/)
[![Gemini AI](https://img.shields.io/badge/AI-Gemini%20%7C%20Groq%20%7C%20OpenAI%20%7C%20Ollama-8E75C4?style=for-the-badge&logo=google&logoColor=white)](https://ai.google.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

<p align="center">
  <b>DevPets</b> brings living, interactive AI companions right to your screen.<br />
  They freely wander around your workspace, track your mouse with real-time 60 FPS eye physics, watch your code, explain bugs, and stealthily repair issues while you code.
</p>

[Quickstart](#-quickstart) • [Meet the Pets](#-meet-the-pets) • [Stealth Modes](#-5-stealth-modes) • [AI Features](#-ai-superpowers) • [Architecture](#-architecture)

</div>

---

## ✨ Features at a Glance

- 🐾 **8 Distinct Companions:** Switch on the fly between Pip the Bird, Mochi the Cat, Byte the Bot, Rusty the Fox, Kero the Frog, Boo the Ghost, Chicky the Chicken, and Shelly the Tiny Crab.
- 👁️ **Real-Time 60 FPS Eye Tracking:** Companions smoothly follow your OS mouse cursor across all monitors.
- 🪺 **3 Movement Behaviors:** Free-roaming, cursor-following, or perching above your active code line.
- 🕵️ **5 Stealth Modes:** From normal visible companion to Screen-Share Invisible Shield and Silent Auto-Healer.
- 🧠 **Multi-Engine AI Brain:** Powered by Google Gemini (Flash & Pro), Groq Cloud (Llama 3.3), OpenAI (GPT-4o), Local Ollama, or a built-in zero-key heuristic engine.
- 📋 **Project-Aware Implementation Planner:** Ask a question like *"how do I create a login form?"* and receive a step-by-step multi-file plan with 1-click **Create File** and **Add Code** actions.
- ⚡ **Multi-IDE Compatibility:** Seamlessly works on **VS Code**, **Cursor**, **Google Antigravity**, and **Antigravity IDE**.

---

## 🐾 Meet the Pets

All DevPets are rendered as compact vector SVG rigs (~66px) that never cover editor tabs or code lines:

| Pet | Name | Character | Unique Behaviors & Animations |
| :---: | :--- | :--- | :--- |
| 🐦 | **Pip** | *The Bluebird* | Flapping wings, crest bounce, chattering beak, feather particles |
| 🐱 | **Mochi** | *The Cozy Desk Cat* | Swishing calico tail, twitching ears, front paws, paw & fish particles |
| 🤖 | **Byte** | *The Mini Bot* | Pulsing cyan beacon, bouncy antenna, flickering thruster flame, digital visor eyes |
| 🦊 | **Rusty** | *The Red Fox* | Swaying white-tipped tail, alert perked ears, autumn leaf particles |
| 🐸 | **Kero** | *The Zen Frog* | Tilting lotus leaf cap, gentle breathing belly, lily pad & dewdrop particles |
| 👻 | **Boo** | *The Lil Ghost* | Floating wavy arms, gentle marshmallow ripple, star & sparkle particles |
| 🐔 | **Chicky** | *The Chicken* | Wobbly red crown comb, flapping wings, swinging wattle, pecking beak bob, grain & egg particles |
| 🦀 | **Shelly** | *The Tiny Crab* | Snapping dual pincers, perked stalk eyes, 6-legged scuttling rhythm, sea bubble & shell particles |

> **Double-click any pet** to pet them and trigger their unique emoji shower!

---

## 🕵️ 5 Stealth Modes

Whether you're coding privately, live streaming, or presenting in meetings, DevPets adapts to your workflow:

```
[ 🐦 Normal ] ──> [ 🦎 Peek-on-Error ] ──> [ 🕵️ Screen-Share Shield ] ──> [ ⚡ Silent Auto-Healer ] ──> [ 👻 Ghost ]
```

1. **🐦 Normal Visible (`off`)**: The floating desktop pet is active, wandering around and perching beside code.
2. **🦎 Peek-on-Error Chameleon (`peek`)**: 100% invisible while coding normally. Peeks in **only** when a bug, lint error, or multi-line selection appears.
3. **🕵️ Screen-Share Invisible Shield (`screen-shield`)**: Uses native OS content protection (`SetWindowDisplayAffinity`). **Visible to your physical eyes, but 100% blacked out/invisible on Zoom, Google Meet, Teams, Discord, and OBS!**
4. **⚡ Silent Auto-Healer (`auto-heal`)**: Hides the floating window completely and automatically repairs syntax errors and bugs in the background as you pause typing.
5. **👻 Ghost in the Editor (`ghost`)**: Shuts down the overlay window. All intelligence is delivered via inline CodeLens, Hover tooltips, and the status bar.

---

## 🧠 AI Superpowers

### 1. Instant Bug Spotting & 1-Click Code Repair
As you type, DevPets analyzes your active line with zero lag:
- Shows a plain-English explanation of **What's Wrong**.
- Shows a concrete **What To Do** recommendation.
- Provides a side-by-side **Diff Preview** and a single **`✨ Apply Fix`** button.

### 2. Multi-File Project Implementation Plan
Ask your pet anything in the speech bubble:
> *"I want to create a JWT authentication system in this project"*

DevPets scans your project structure and returns:
- **Step 1: Create File** (e.g. `src/auth.ts`) + 1-click **`✨ Create & Open`**.
- **Step 2: Update File** (e.g. `src/routes.ts`) + 1-click **`📝 Add Code`**.

---

## 🚀 Quickstart

### Option A: Install Pre-Built `.vsix`
1. Download the latest `devpets-1.0.0.vsix` from [Releases](https://github.com/TheGriffin28/devpets/releases).
2. Install via command line:
   ```bash
   code --install-extension devpets-1.0.0.vsix --force
   ```
   *Or open VS Code → `Ctrl+Shift+X` → `···` → `Install from VSIX...`*.
3. Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> → **`Developer: Reload Window`**.

### Option B: Run from Source
```bash
# 1. Clone repository
git clone https://github.com/TheGriffin28/devpets.git
cd devpets

# 2. Install dependencies
npm install

# 3. Build & link into VS Code, Cursor, and Antigravity
npm run install-all
```

---

## ⌨️ Shortcuts & Commands

| Shortcut | Command | Description |
| :--- | :--- | :--- |
| <kbd>Alt</kbd> + <kbd>S</kbd> | `DevPets: Switch Stealth Mode` | Opens quick stealth picker & companion menu |
| <kbd>Alt</kbd> + <kbd>M</kbd> | `DevPets: Switch Roaming Mode` | Toggle between Free Roam, Follow Mouse, and Perch |
| <kbd>Alt</kbd> + <kbd>H</kbd> | `DevPets: Send Pet to Sleep` | Hides the floating overlay window |
| — | `DevPets: Choose Companion` | Choose between Pip, Mochi, Byte, Rusty, Kero, Boo, Chicky, Shelly |
| — | `DevPets: Fix All in File` | Auto-heals every detected error in the active document |
| — | `DevPets: Configure AI` | Interactive wizard for Gemini / Groq / OpenAI / Ollama |

---

## ⚙️ Configuration

Open your IDE Settings (<kbd>Ctrl</kbd> + <kbd>,</kbd>) and search for `devpets`:

| Setting | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `codebird.companion` | `string` | `"bird"` | Active pet: `bird`, `cat`, `bot`, `fox`, `frog`, `ghost`, `chicken`, `crab` |
| `codebird.stealthMode` | `string` | `"off"` | Active stealth mode: `off`, `peek`, `screen-shield`, `auto-heal`, `ghost` |
| `codebird.roamMode` | `string` | `"free-roam"` | Movement style: `free-roam`, `follow-mouse`, `perch` |
| `codebird.aiProvider` | `string` | `"auto"` | AI engine: `auto`, `gemini`, `groq`, `openai`, `ollama`, `local-smart` |
| `codebird.apiKey` | `string` | `""` | API key for cloud models (saved securely) |
| `codebird.model` | `string` | `""` | Custom model name (e.g. `gemini-2.5-flash`, `llama-3.3-70b-versatile`) |

---

## 🏗️ Architecture

```
┌────────────────────────────────────────────────────────┐
│                   VS Code Extension Host               │
│  - WorkspaceTracker (file scanner & AST insights)     │
│  - ActivityTracker (cursor, typing pauses, issues)     │
│  - AIAgent (Gemini / Groq / OpenAI / Ollama client)    │
│  - CodeActionsManager (CodeLens, Hover, QuickFixes)    │
└───────────────────────────┬────────────────────────────┘
                            │ WebSocket Bridge (port 49821)
┌───────────────────────────▼────────────────────────────┐
│              Transparent Electron Overlay               │
│  - Frameless, transparent, always-on-top desktop window│
│  - 60 FPS OS Mouse Cursor Polling & Eye Pupil Vector   │
│  - Click-through hit-testing (mouse pass-through)      │
│  - Native screen-capture protection (Screen Shield)    │
│  - SVG Companion Rigs & Spring-Damper Physics Loop     │
└────────────────────────────────────────────────────────┘
```

---

## 📄 License

DevPets is open-source software licensed under the [MIT License](LICENSE).
Made with 💖 for developers who want a friendly companion in their IDE.
