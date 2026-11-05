class CodeBirdAnimator {
  constructor() {
    this.stageEl = document.getElementById('bird-stage');
    this.charEl = document.getElementById('bird-character');

    // 8 Companion Rigs
    this.rigBird = document.getElementById('rig-bird');
    this.rigCat = document.getElementById('rig-cat');
    this.rigBot = document.getElementById('rig-bot');
    this.foxRig = document.getElementById('rig-fox');
    this.frogRig = document.getElementById('rig-frog');
    this.ghostRig = document.getElementById('rig-ghost');
    this.chickenRig = document.getElementById('rig-chicken');
    this.crabRig = document.getElementById('rig-crab');

    this.rigs = {
      bird: this.rigBird,
      cat: this.rigCat,
      bot: this.rigBot,
      fox: this.foxRig,
      frog: this.frogRig,
      ghost: this.ghostRig,
      chicken: this.chickenRig,
      crab: this.crabRig
    };

    this.companion = 'bird';

    // 1. Bird Rig Parts
    this.wingLeft = document.getElementById('wing-left');
    this.wingRight = document.getElementById('wing-right');
    this.pupilLeft = document.getElementById('pupil-left');
    this.pupilRight = document.getElementById('pupil-right');
    this.eyesOpen = document.getElementById('eyes-open');
    this.eyesHappy = document.getElementById('eyes-happy');
    this.eyebrowsAlert = document.getElementById('eyebrows-alert');
    this.smartGlasses = document.getElementById('smart-glasses');
    this.beakLower = document.getElementById('beak-lower');
    this.headCrest = document.getElementById('head-crest');

    // 2. Cat Rig Parts
    this.catTail = document.getElementById('cat-tail');
    this.catEarLeft = document.getElementById('cat-ear-left');
    this.catEarRight = document.getElementById('cat-ear-right');
    this.catPupilLeft = document.getElementById('cat-pupil-left');
    this.catPupilRight = document.getElementById('cat-pupil-right');
    this.catEyesOpen = document.getElementById('cat-eyes-open');
    this.catEyesHappy = document.getElementById('cat-eyes-happy');

    // 3. Bot Rig Parts
    this.botAntenna = document.getElementById('bot-antenna');
    this.botBeacon = document.getElementById('bot-beacon');
    this.botFlame = document.getElementById('bot-flame');
    this.botPupilLeft = document.getElementById('bot-pupil-left');
    this.botPupilRight = document.getElementById('bot-pupil-right');
    this.botEyesOpen = document.getElementById('bot-eyes-open');
    this.botEyesHappy = document.getElementById('bot-eyes-happy');

    // 4. Fox Rig Parts
    this.foxTail = document.getElementById('fox-tail');
    this.foxEarLeft = document.getElementById('fox-ear-left');
    this.foxEarRight = document.getElementById('fox-ear-right');
    this.foxPupilLeft = document.getElementById('fox-pupil-left');
    this.foxPupilRight = document.getElementById('fox-pupil-right');
    this.foxEyesOpen = document.getElementById('fox-eyes-open');
    this.foxEyesHappy = document.getElementById('fox-eyes-happy');

    // 5. Frog Rig Parts
    this.frogLeaf = document.getElementById('frog-leaf');
    this.frogBelly = document.getElementById('frog-belly');
    this.frogPupilLeft = document.getElementById('frog-pupil-left');
    this.frogPupilRight = document.getElementById('frog-pupil-right');
    this.frogEyesOpen = document.getElementById('frog-eyes-open');
    this.frogEyesHappy = document.getElementById('frog-eyes-happy');

    // 6. Ghost Rig Parts
    this.ghostArmLeft = document.getElementById('ghost-arm-left');
    this.ghostArmRight = document.getElementById('ghost-arm-right');
    this.ghostBody = document.getElementById('ghost-body');
    this.ghostPupilLeft = document.getElementById('ghost-pupil-left');
    this.ghostPupilRight = document.getElementById('ghost-pupil-right');
    this.ghostEyesOpen = document.getElementById('ghost-eyes-open');
    this.ghostEyesHappy = document.getElementById('ghost-eyes-happy');

    // 7. Chicken Rig Parts
    this.chickenComb = document.getElementById('chicken-comb');
    this.chickenWattle = document.getElementById('chicken-wattle');
    this.chickenWingLeft = document.getElementById('chicken-wing-left');
    this.chickenWingRight = document.getElementById('chicken-wing-right');
    this.chickenBeak = document.getElementById('chicken-beak');
    this.chickenPupilLeft = document.getElementById('chicken-pupil-left');
    this.chickenPupilRight = document.getElementById('chicken-pupil-right');
    this.chickenEyesOpen = document.getElementById('chicken-eyes-open');
    this.chickenEyesHappy = document.getElementById('chicken-eyes-happy');

    // 8. Crab Rig Parts
    this.crabClawLeft = document.getElementById('crab-claw-left');
    this.crabClawRight = document.getElementById('crab-claw-right');
    this.crabPincerLeft = document.getElementById('crab-pincer-left');
    this.crabPincerRight = document.getElementById('crab-pincer-right');
    this.crabLegs = document.getElementById('crab-legs');
    this.crabPupilLeft = document.getElementById('crab-pupil-left');
    this.crabPupilRight = document.getElementById('crab-pupil-right');
    this.crabEyesOpen = document.getElementById('crab-eyes-open');
    this.crabEyesHappy = document.getElementById('crab-eyes-happy');

    // Shared UI
    this.badgeEl = document.getElementById('bird-badge');
    this.bubbleEl = document.getElementById('speech-bubble');
    this.particleLayer = document.getElementById('particle-layer');

    // Screen dimensions
    this.screenW = window.innerWidth || 1440;
    this.screenH = window.innerHeight || 900;

    // Position & Physics state
    this.x = Math.round(this.screenW * 0.72);
    this.y = Math.round(this.screenH * 0.22);
    this.vx = 0;
    this.vy = 0;
    this.targetX = this.x;
    this.targetY = this.y;

    // Mouse coordinates
    this.mouseX = this.screenW * 0.5;
    this.mouseY = this.screenH * 0.5;
    this.lastMouseMoveTime = Date.now();

    // Behavioral state
    this.mood = 'idle'; // idle | roaming | thinking | alert-error | alert-warning | suggesting | happy | sleeping
    this.roamMode = 'free-roam'; // free-roam | follow-mouse | perch
    this.isDragging = false;
    this.isHovered = false;
    this.dragOffsetX = 0;
    this.dragOffsetY = 0;
    this.isBlinking = false;
    this.isTalking = false;
    this.talkUntil = 0;

    // Timers
    this.nextRoamTime = Date.now() + 5500;
    this.nextBlinkTime = Date.now() + 2600;

    this.setupInteractions();
    this.startLoop();
  }

  setCompanion(type) {
    if (!this.rigs[type]) {
      type = 'bird';
    }
    this.companion = type;

    Object.keys(this.rigs).forEach((key) => {
      const rig = this.rigs[key];
      if (rig) {
        if (key === type) {
          rig.classList.remove('hidden');
        } else {
          rig.classList.add('hidden');
        }
      }
    });

    const titles = {
      bird: 'Pip the Code Bird 🐦',
      cat: 'Mochi the Desk Cat 🐱',
      bot: 'Byte the Mini Bot 🤖',
      fox: 'Rusty the Red Fox 🦊',
      frog: 'Kero the Zen Frog 🐸',
      ghost: 'Boo the Lil Ghost 👻',
      chicken: 'Chicky the Chicken 🐔',
      crab: 'Shelly the Tiny Crab 🦀'
    };
    if (this.charEl) {
      this.charEl.setAttribute('title', titles[type] || 'CodeBird Companion');
    }

    const particles = {
      bird: ['🐦', '✨', '🪶'],
      cat: ['🐾', '💖', '🐟'],
      bot: ['⚡', '💡', '🤖'],
      fox: ['🦊', '🍂', '✨'],
      frog: ['🐸', '🍃', '💧'],
      ghost: ['👻', '⭐', '✨'],
      chicken: ['🐔', '🌾', '🥚', '✨'],
      crab: ['🦀', '🫧', '🌊', '🐚']
    };
    const sparks = particles[type] || ['✨'];
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const p = sparks[i % sparks.length];
        this.spawnParticle(p, this.x + 20 + Math.random() * 28, this.y + 4);
      }, i * 110);
    }
  }

  setupInteractions() {
    let dragMoved = false;

    this.stageEl.addEventListener('mouseenter', () => {
      this.isHovered = true;
    });

    this.stageEl.addEventListener('mouseleave', () => {
      this.isHovered = false;
    });

    // Right-click anywhere on the companion to immediately stop following mouse / perch
    this.charEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.onDisableFollow) {
        this.onDisableFollow();
      }
    });

    this.charEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.isDragging = true;
      dragMoved = false;
      this.dragOffsetX = e.clientX - this.x;
      this.dragOffsetY = e.clientY - this.y;
    });

    window.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      this.lastMouseMoveTime = Date.now();

      if (this.isDragging) {
        dragMoved = true;
        this.x = Math.max(20, Math.min(this.screenW - 120, e.clientX - this.dragOffsetX));
        this.y = Math.max(25, Math.min(this.screenH - 130, e.clientY - this.dragOffsetY));
        this.targetX = this.x;
        this.targetY = this.y;
        if (this.roamMode === 'follow-mouse' && this.onDisableFollow) {
          this.onDisableFollow();
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        if (!dragMoved && this.onBirdClicked) {
          this.onBirdClicked();
        }
      }
    });

    // Double-click to pet your companion!
    this.charEl.addEventListener('dblclick', () => {
      this.petBird();
    });

    window.addEventListener('resize', () => {
      this.screenW = window.innerWidth;
      this.screenH = window.innerHeight;
    });
  }

  updateOSMouse(x, y, screenWidth, screenHeight) {
    this.mouseX = x;
    this.mouseY = y;
    if (screenWidth) this.screenW = screenWidth;
    if (screenHeight) this.screenH = screenHeight;
    this.lastMouseMoveTime = Date.now();
    if (this.mood === 'sleeping') {
      this.setMood('idle');
    }
  }

  petBird() {
    this.setMood('happy');
    this.triggerTalk(1600);
    const hearts = {
      bird: ['💖', '🐦', '✨', '🪶'],
      cat: ['💖', '🐾', '🐟', '✨'],
      bot: ['⚡', '💡', '🤖', '✨'],
      fox: ['💖', '🦊', '🍂', '✨'],
      frog: ['🐸', '🍃', '✨', '💧'],
      ghost: ['👻', '⭐', '✨', '💫'],
      chicken: ['💖', '🐔', '🌾', '🥚', '✨'],
      crab: ['💖', '🦀', '🫧', '🐚', '🌊']
    };
    const list = hearts[this.companion] || ['💖', '✨'];
    for (let i = 0; i < 4; i++) {
      setTimeout(() => {
        const em = list[i % list.length];
        this.spawnParticle(em, this.x + 20 + Math.random() * 32, this.y + 6);
      }, i * 130);
    }
  }

  toggleCompanionEyes(happy) {
    const pairs = [
      [this.eyesOpen, this.eyesHappy],
      [this.catEyesOpen, this.catEyesHappy],
      [this.botEyesOpen, this.botEyesHappy],
      [this.foxEyesOpen, this.foxEyesHappy],
      [this.frogEyesOpen, this.frogEyesHappy],
      [this.ghostEyesOpen, this.ghostEyesHappy],
      [this.chickenEyesOpen, this.chickenEyesHappy],
      [this.crabEyesOpen, this.crabEyesHappy]
    ];
    pairs.forEach(([openEl, happyEl]) => {
      if (openEl && happyEl) {
        if (happy) {
          openEl.classList.add('hidden');
          happyEl.classList.remove('hidden');
        } else {
          happyEl.classList.add('hidden');
          openEl.classList.remove('hidden');
        }
      }
    });
  }

  setMood(mood) {
    this.mood = mood;
    if (this.eyebrowsAlert) this.eyebrowsAlert.classList.add('hidden');
    if (this.smartGlasses) this.smartGlasses.classList.add('hidden');
    this.toggleCompanionEyes(false);
    this.badgeEl.className = 'bird-badge hidden';

    if (mood === 'alert-error') {
      if (this.eyebrowsAlert) this.eyebrowsAlert.classList.remove('hidden');
      this.badgeEl.textContent = '❗';
      this.badgeEl.className = 'bird-badge badge-error';
      this.triggerTalk(2200);
      this.spawnParticle('❗', this.x + 36, this.y);
    } else if (mood === 'alert-warning') {
      if (this.smartGlasses) this.smartGlasses.classList.remove('hidden');
      this.badgeEl.textContent = '⚠️';
      this.badgeEl.className = 'bird-badge badge-warning';
      this.triggerTalk(1800);
    } else if (mood === 'suggesting') {
      if (this.smartGlasses) this.smartGlasses.classList.remove('hidden');
      this.badgeEl.textContent = '💡';
      this.badgeEl.className = 'bird-badge';
      this.triggerTalk(1800);
    } else if (mood === 'thinking' || mood === 'investigating') {
      if (this.smartGlasses) this.smartGlasses.classList.remove('hidden');
      this.badgeEl.textContent = '🔍';
      this.badgeEl.className = 'bird-badge';
    } else if (mood === 'happy') {
      this.toggleCompanionEyes(true);
      this.badgeEl.textContent = '✨';
      this.badgeEl.className = 'bird-badge';
      this.spawnParticle('✨', this.x + 36, this.y + 4);
    } else if (mood === 'sleeping') {
      this.toggleCompanionEyes(true);
      this.badgeEl.textContent = '💤';
      this.badgeEl.className = 'bird-badge';
    }
  }

  triggerTalk(durationMs = 1500) {
    this.isTalking = true;
    this.talkUntil = Date.now() + durationMs;
  }

  flyToCodeLine(viewportYRatio = 0.35, viewportXRatio = 0.55) {
    if (this.roamMode === 'perch' || this.isDragging) {
      return;
    }
    const desiredY = Math.max(70, Math.min(this.screenH - 220, Math.round(viewportYRatio * this.screenH)));
    const desiredX = Math.max(
      140,
      Math.min(this.screenW - 490, Math.round(viewportXRatio * this.screenW + 140))
    );
    this.targetX = desiredX;
    this.targetY = desiredY;
    this.nextRoamTime = Date.now() + 9000;
  }

  spawnParticle(symbol, x, y) {
    const el = document.createElement('div');
    el.className = 'particle';
    el.textContent = symbol;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    this.particleLayer.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 1100);
  }

  startLoop() {
    const step = (now) => {
      this.updatePhysics(now);
      this.updateRigAnimation(now);
      this.updateBubblePlacement();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  updatePhysics(now) {
    const wallTime = Date.now();

    // Auto-sleep if user hasn't moved mouse for 90 seconds and no active error
    if (
      wallTime - this.lastMouseMoveTime > 90000 &&
      this.mood !== 'alert-error' &&
      this.mood !== 'sleeping'
    ) {
      this.setMood('sleeping');
    }

    if (!this.isDragging) {
      if (this.roamMode === 'follow-mouse') {
        const distToBird = Math.hypot(this.mouseX - (this.x + 36), this.mouseY - (this.y + 36));
        if (!this.isHovered && distToBird > 240) {
          const offsetX = this.mouseX > this.screenW * 0.6 ? -150 : 110;
          const offsetY = this.mouseY > this.screenH * 0.7 ? -120 : -65;
          this.targetX = Math.max(30, Math.min(this.screenW - 140, this.mouseX + offsetX));
          this.targetY = Math.max(35, Math.min(this.screenH - 140, this.mouseY + offsetY));
        } else {
          this.targetX = this.x;
          this.targetY = this.y;
          this.vx *= 0.5;
          this.vy *= 0.5;
        }
      } else if (this.roamMode === 'free-roam') {
        if (
          wallTime > this.nextRoamTime &&
          this.mood !== 'alert-error' &&
          this.mood !== 'alert-warning' &&
          this.mood !== 'thinking'
        ) {
          const waypoints = [
            {
              x: Math.max(60, Math.min(this.screenW - 480, this.mouseX + 120)),
              y: Math.max(60, Math.min(this.screenH - 220, this.mouseY - 50))
            },
            { x: Math.round(this.screenW * 0.74), y: 55 },
            { x: Math.round(this.screenW * 0.78), y: Math.round(this.screenH * 0.36) },
            { x: Math.round(this.screenW * 0.72), y: Math.round(this.screenH * 0.72) },
            { x: Math.round(this.screenW * 0.52), y: 65 }
          ];
          const pick = waypoints[Math.floor(Math.random() * waypoints.length)];
          this.targetX = pick.x;
          this.targetY = pick.y;
          this.nextRoamTime = wallTime + 7500 + Math.random() * 4500;
        }
      }

      // Smooth spring-damper physics toward (targetX, targetY)
      const dx = this.targetX - this.x;
      const dy = this.targetY - this.y;
      const stiffness = this.roamMode === 'follow-mouse' ? 0.045 : 0.024;
      const damping = 0.82;

      this.vx = (this.vx + dx * stiffness) * damping;
      this.vy = (this.vy + dy * stiffness) * damping;

      // Clamp max flight speed
      const speed = Math.hypot(this.vx, this.vy);
      const maxSpeed = 14;
      if (speed > maxSpeed) {
        this.vx = (this.vx / speed) * maxSpeed;
        this.vy = (this.vy / speed) * maxSpeed;
      }

      this.x += this.vx;
      this.y += this.vy;
    }

    this.stageEl.style.transform = `translate3d(${Math.round(this.x)}px, ${Math.round(this.y)}px, 0)`;
  }

  updateRigAnimation(now) {
    const wallTime = Date.now();
    const speed = Math.hypot(this.vx, this.vy);
    const isFlying = speed > 1.1;

    // 1. Body bobbing & banking tilt applied to current companion
    const bobOffset = isFlying
      ? Math.sin(now * 0.022) * 5
      : Math.sin(now * 0.0045) * 2.5;
    const bankAngle = Math.max(-16, Math.min(16, this.vx * 1.45));

    const activeRig = this.rigs[this.companion] || this.rigBird;
    if (activeRig) {
      activeRig.setAttribute('transform', `translate(0, ${bobOffset.toFixed(1)}) rotate(${bankAngle.toFixed(1)}, 70, 74)`);
    }

    // 2. Real-time 2D Eye Pupil Tracking toward OS Mouse Cursor
    const compCenterX = this.x + 36;
    const compCenterY = this.y + 36;
    const angleToMouse = Math.atan2(this.mouseY - compCenterY, this.mouseX - compCenterX);
    const distToMouse = Math.min(1, Math.hypot(this.mouseX - compCenterX, this.mouseY - compCenterY) / 220);
    const pupilRadius = 3.2 * distToMouse;
    const px = (Math.cos(angleToMouse) * pupilRadius).toFixed(2);
    const py = (Math.sin(angleToMouse) * pupilRadius).toFixed(2);

    // Track pupils on whichever companion is active
    if (this.companion === 'bird') {
      if (this.pupilLeft) this.pupilLeft.setAttribute('transform', `translate(${px}, ${py})`);
      if (this.pupilRight) this.pupilRight.setAttribute('transform', `translate(${px}, ${py})`);
    } else if (this.companion === 'cat') {
      if (this.catPupilLeft) this.catPupilLeft.setAttribute('transform', `translate(${px}, ${py})`);
      if (this.catPupilRight) this.catPupilRight.setAttribute('transform', `translate(${px}, ${py})`);
    } else if (this.companion === 'bot') {
      const bpx = (Math.cos(angleToMouse) * (2.2 * distToMouse)).toFixed(2);
      const bpy = (Math.sin(angleToMouse) * (2.2 * distToMouse)).toFixed(2);
      if (this.botPupilLeft) this.botPupilLeft.setAttribute('transform', `translate(${bpx}, ${bpy})`);
      if (this.botPupilRight) this.botPupilRight.setAttribute('transform', `translate(${bpx}, ${bpy})`);
    } else if (this.companion === 'fox') {
      if (this.foxPupilLeft) this.foxPupilLeft.setAttribute('transform', `translate(${px}, ${py})`);
      if (this.foxPupilRight) this.foxPupilRight.setAttribute('transform', `translate(${px}, ${py})`);
    } else if (this.companion === 'frog') {
      if (this.frogPupilLeft) this.frogPupilLeft.setAttribute('transform', `translate(${px}, ${py})`);
      if (this.frogPupilRight) this.frogPupilRight.setAttribute('transform', `translate(${px}, ${py})`);
    } else if (this.companion === 'ghost') {
      if (this.ghostPupilLeft) this.ghostPupilLeft.setAttribute('transform', `translate(${px}, ${py})`);
      if (this.ghostPupilRight) this.ghostPupilRight.setAttribute('transform', `translate(${px}, ${py})`);
    } else if (this.companion === 'chicken') {
      if (this.chickenPupilLeft) this.chickenPupilLeft.setAttribute('transform', `translate(${px}, ${py})`);
      if (this.chickenPupilRight) this.chickenPupilRight.setAttribute('transform', `translate(${px}, ${py})`);
    } else if (this.companion === 'crab') {
      if (this.crabPupilLeft) this.crabPupilLeft.setAttribute('transform', `translate(${px}, ${py})`);
      if (this.crabPupilRight) this.crabPupilRight.setAttribute('transform', `translate(${px}, ${py})`);
    }

    // 3. Natural Blinking across all companions
    if (wallTime > this.nextBlinkTime && this.mood !== 'happy' && this.mood !== 'sleeping') {
      this.toggleCompanionEyes(true);
      setTimeout(() => {
        if (this.mood !== 'happy' && this.mood !== 'sleeping') {
          this.toggleCompanionEyes(false);
        }
      }, 140);
      this.nextBlinkTime = wallTime + 2400 + Math.random() * 3400;
    }

    // 4. Companion-Specific Motion Animations:
    if (this.companion === 'bird') {
      // Wings
      let wingAngle = 0;
      if (isFlying) {
        wingAngle = Math.sin(now * 0.032) * 36;
      } else if (this.mood === 'alert-error' || this.mood === 'happy') {
        wingAngle = Math.sin(now * 0.024) * 22;
      } else {
        wingAngle = Math.sin(now * 0.004) * 4;
      }
      if (this.wingLeft) this.wingLeft.setAttribute('transform', `translate(34, 68) rotate(${wingAngle.toFixed(1)}, 8, -4)`);
      if (this.wingRight) this.wingRight.setAttribute('transform', `translate(106, 68) rotate(${(-wingAngle).toFixed(1)}, -8, -4)`);

      // Crest bounce
      const crestAngle = Math.sin(now * 0.007) * 6 + bankAngle * 0.4;
      if (this.headCrest) this.headCrest.setAttribute('transform', `translate(70, 38) rotate(${crestAngle.toFixed(1)})`);

      // Beak talking
      if (this.isTalking && wallTime < this.talkUntil) {
        const beakOpen = Math.abs(Math.sin(now * 0.028)) * 4.5;
        if (this.beakLower) this.beakLower.setAttribute('transform', `translate(0, ${beakOpen.toFixed(1)})`);
      } else {
        this.isTalking = false;
        if (this.beakLower) this.beakLower.setAttribute('transform', 'translate(0, 0)');
      }
    } else if (this.companion === 'cat') {
      // Tail swish
      const tailAngle = Math.sin(now * 0.005) * 14 + (isFlying ? Math.sin(now * 0.02) * 22 : 0);
      if (this.catTail) this.catTail.setAttribute('transform', `rotate(${tailAngle.toFixed(1)}, 96, 86)`);

      // Ear twitch
      const earTwitch = Math.sin(now * 0.008) * 6;
      if (this.catEarLeft) this.catEarLeft.setAttribute('transform', `rotate(${earTwitch.toFixed(1)}, 40, 54)`);
      if (this.catEarRight) this.catEarRight.setAttribute('transform', `rotate(${(-earTwitch).toFixed(1)}, 100, 54)`);
    } else if (this.companion === 'bot') {
      // Antenna bounce
      const antennaAngle = Math.sin(now * 0.006) * 7 + bankAngle * 0.5;
      if (this.botAntenna) this.botAntenna.setAttribute('transform', `rotate(${antennaAngle.toFixed(1)}, 70, 44)`);

      // Beacon glow pulse
      const beaconGlow = 0.4 + Math.abs(Math.sin(now * 0.006)) * 0.6;
      if (this.botBeacon) this.botBeacon.setAttribute('opacity', beaconGlow.toFixed(2));

      // Thruster flame flicker
      const flameScale = 0.7 + Math.random() * 0.6;
      if (this.botFlame) this.botFlame.setAttribute('transform', `scale(1, ${flameScale.toFixed(2)})`);
    } else if (this.companion === 'fox') {
      // Tail sway
      const foxTailAngle = Math.sin(now * 0.004) * 12 + (isFlying ? Math.sin(now * 0.025) * 20 : 0);
      if (this.foxTail) this.foxTail.setAttribute('transform', `rotate(${foxTailAngle.toFixed(1)}, 96, 88)`);

      // Ear perk
      const earPerk = Math.sin(now * 0.007) * 5;
      if (this.foxEarLeft) this.foxEarLeft.setAttribute('transform', `rotate(${earPerk.toFixed(1)}, 38, 52)`);
      if (this.foxEarRight) this.foxEarRight.setAttribute('transform', `rotate(${(-earPerk).toFixed(1)}, 102, 52)`);
    } else if (this.companion === 'frog') {
      // Lotus leaf tilt
      const leafAngle = Math.sin(now * 0.006) * 10 + bankAngle * 0.4;
      if (this.frogLeaf) this.frogLeaf.setAttribute('transform', `translate(70, 38) rotate(${leafAngle.toFixed(1)})`);

      // Belly breathing pulse
      const breathScale = 1 + Math.sin(now * 0.0035) * 0.07;
      if (this.frogBelly) this.frogBelly.setAttribute('transform', `translate(70, 85) scale(${breathScale.toFixed(2)}) translate(-70, -85)`);
    } else if (this.companion === 'ghost') {
      // Floating arms
      const armAngleLeft = Math.sin(now * 0.005) * 12;
      const armAngleRight = Math.cos(now * 0.005) * 12;
      if (this.ghostArmLeft) this.ghostArmLeft.setAttribute('transform', `rotate(${armAngleLeft.toFixed(1)}, 40, 70)`);
      if (this.ghostArmRight) this.ghostArmRight.setAttribute('transform', `rotate(${armAngleRight.toFixed(1)}, 100, 70)`);

      // Soft float ripple
      const ghostSquash = 1 + Math.sin(now * 0.004) * 0.06;
      if (this.ghostBody) this.ghostBody.setAttribute('transform', `translate(70, 72) scale(1, ${ghostSquash.toFixed(2)}) translate(-70, -72)`);
    } else if (this.companion === 'chicken') {
      // Comb wobble & bounce
      const combWobble = Math.sin(now * 0.008) * 8 + bankAngle * 0.4;
      if (this.chickenComb) this.chickenComb.setAttribute('transform', `translate(70, 42) rotate(${combWobble.toFixed(1)})`);

      // Wattle swing
      const wattleSwing = Math.sin(now * 0.01) * 7;
      if (this.chickenWattle) this.chickenWattle.setAttribute('transform', `translate(70, 76) rotate(${wattleSwing.toFixed(1)})`);

      // Wings flap / peck flutter
      let wingAngle = 0;
      if (isFlying) {
        wingAngle = Math.sin(now * 0.034) * 34;
      } else if (this.mood === 'happy' || this.mood === 'alert-error') {
        wingAngle = Math.sin(now * 0.026) * 22;
      } else {
        wingAngle = Math.sin(now * 0.004) * 5;
      }
      if (this.chickenWingLeft) this.chickenWingLeft.setAttribute('transform', `translate(36, 72) rotate(${wingAngle.toFixed(1)}, 6, 4)`);
      if (this.chickenWingRight) this.chickenWingRight.setAttribute('transform', `translate(104, 72) rotate(${(-wingAngle).toFixed(1)}, -6, 4)`);

      // Beak pecking bob when talking
      if (this.isTalking && wallTime < this.talkUntil) {
        const peck = Math.abs(Math.sin(now * 0.028)) * 3;
        if (this.chickenBeak) this.chickenBeak.setAttribute('transform', `translate(0, ${peck.toFixed(1)})`);
      } else {
        if (this.chickenBeak) this.chickenBeak.setAttribute('transform', 'translate(0, 0)');
      }
    } else if (this.companion === 'crab') {
      // Claws swaying & bobbing
      const clawAngleLeft = Math.sin(now * 0.006) * 10 + (isFlying ? Math.sin(now * 0.024) * 18 : 0);
      const clawAngleRight = Math.cos(now * 0.006) * 10 + (isFlying ? Math.cos(now * 0.024) * 18 : 0);
      if (this.crabClawLeft) this.crabClawLeft.setAttribute('transform', `translate(32, 60) rotate(${clawAngleLeft.toFixed(1)}, 12, 18)`);
      if (this.crabClawRight) this.crabClawRight.setAttribute('transform', `translate(108, 60) rotate(${(-clawAngleRight).toFixed(1)}, -12, 18)`);

      // Pincers snapping (happy, alert, or talking snappy clicks)
      const snapLeft = (this.mood === 'happy' || this.isTalking)
        ? Math.sin(now * 0.025) * 12
        : Math.sin(now * 0.008) * 5;
      const snapRight = (this.mood === 'happy' || this.isTalking)
        ? Math.cos(now * 0.025) * 12
        : Math.cos(now * 0.008) * 5;
      if (this.crabPincerLeft) this.crabPincerLeft.setAttribute('transform', `rotate(${snapLeft.toFixed(1)}, -6, 4)`);
      if (this.crabPincerRight) this.crabPincerRight.setAttribute('transform', `rotate(${(-snapRight).toFixed(1)}, 6, 4)`);

      // 6 Walking legs scuttling rhythm
      const legSway = Math.sin(now * 0.016) * 3.5;
      if (this.crabLegs) this.crabLegs.setAttribute('transform', `translate(${legSway.toFixed(1)}, 0)`);
    }
  }

  updateBubblePlacement() {
    if (this.x > this.screenW - 485) {
      this.bubbleEl.classList.add('flip-left');
    } else {
      this.bubbleEl.classList.remove('flip-left');
    }

    if (this.y > this.screenH - 300) {
      this.bubbleEl.classList.add('flip-up');
    } else {
      this.bubbleEl.classList.remove('flip-up');
    }
  }
}

window.CodeBirdAnimator = CodeBirdAnimator;
