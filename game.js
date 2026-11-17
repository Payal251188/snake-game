(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const canvas = $('board');
  const ctx = canvas.getContext('2d');
  const engine = new SnakeGame();
  const storageKey = 'snake-club-record-v2';
  const playerKey = 'snake-club-player-v1';
  const avatarKey = 'snake-club-avatar-v1';
  const avatars = { mint: 'Mint', peach: 'Peach', olive: 'Olive' };
  let playerAvatar = 'mint';
  const cleanName = (value) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 24) : '';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let state = 'ready';
  let best = 0;
  let bestName = '';
  let playerName = '';
  let startingBest = 0;
  let canSave = true;
  let lastTime = null;
  let elapsed = 0;
  let width = 720;
  let height = 600;
  let soundOn = true;
  let audio = null;
  let effectsGain = null;
  const music = $('music');
  const chomp = $('chomp');
  let chompRequest = 0;
  let chompPriming = false;
  music.volume = 0.75;
  let previewSound = false;
  let playbackRequest = 0;
  let gesture = null;
  let cheerRemaining = 0;
  let cheerFrame = null;

  function resetCheer() {
    cheerRemaining = 0;
    cheerFrame = null;
    $('snakeFriends').dataset.cheering = 'false';
    $('friendMessage').textContent = 'Your snake friends are rooting for you!';
  }

  function cheer() {
    cheerRemaining = 1200;
    $('snakeFriends').dataset.cheering = 'true';
    $('friendMessage').textContent = `Nice catch, ${playerName}! 👏`;
  }

  function storageUnavailable() {
    canSave = false;
    $('storageNote').textContent = 'Best kept for this session. Browser storage is unavailable.';
  }
  try {
    const raw = localStorage.getItem(storageKey);
    let record;
    try { record = raw ? JSON.parse(raw) : null; } catch { record = null; }
    if (record && Number.isSafeInteger(record.score) && record.score > 0) {
      best = record.score;
      bestName = cleanName(record.name) || 'Unknown player';
    } else {
      // Keep scores saved by the previous version, which did not store names.
      const legacy = Number(localStorage.getItem('snake-club-best-v1'));
      best = Number.isSafeInteger(legacy) && legacy > 0 ? legacy : 0;
      bestName = best ? 'Unknown player' : '';
    }
    playerName = cleanName(localStorage.getItem(playerKey));
    const savedAvatar = localStorage.getItem(avatarKey);
    if (Object.hasOwn(avatars, savedAvatar)) playerAvatar = savedAvatar;
    localStorage.setItem(storageKey, JSON.stringify({ score: best, name: bestName }));
  } catch { storageUnavailable(); }

  $('playerInput').value = playerName;
  for (const id of Object.keys(avatars)) {
    const radio = $(`avatar-${id}`);
    radio.checked = id === playerAvatar;
    radio.addEventListener('change', () => {
      if (radio.checked) playerAvatar = id;
    });
    radio.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); startGame(); }
    });
  }
  function updateAvatarPicker() {
    const hasName = Boolean(cleanName($('playerInput').value));
    $('avatarPicker').disabled = !hasName;
    $('avatarHint').textContent = hasName
      ? 'Pick a face, then press Let’s play.'
      : 'Enter your name to unlock the avatars.';
  }
  $('playerInput').addEventListener('input', updateAvatarPicker);
  updateAvatarPicker();

  const announce = (message) => { $('announcer').textContent = message; };
  const format = (value) => String(value).padStart(2, '0');
  function updateScores() {
    $('score').textContent = format(engine.score);
    $('best').textContent = format(best);
    $('playerName').textContent = playerName || '—';
    $('playerAvatar').hidden = !playerName;
    $('playerAvatar').dataset.avatar = playerAvatar;
    $('playerAvatar').setAttribute('src', `assets/avatar-${playerAvatar}.svg`);
    $('playerAvatar').setAttribute('alt', `${avatars[playerAvatar]} human face avatar`);
    $('bestName').textContent = bestName || 'No record yet';
    $('preyName').textContent = engine.foodType || 'None';
    const speed = `${(160 / engine.interval).toFixed(1)}×`;
    $('pace').textContent = speed;
    $('level').textContent = String(engine.level);
    $('levelSpeed').textContent = speed;
    $('totalEaten').textContent = String(engine.score);
    for (const animal of ['rat', 'rabbit', 'frog']) {
      $(`${animal}Count`).textContent = String(engine.eaten[animal]);
      $(`${animal}Target`).textContent = String(engine.level * 10);
    }
    $('levelHint').textContent = `Next level: reach ${engine.level * 10} of each animal. Each level adds 20% of base speed.`;
  }

  function setState(next) {
    state = next;
    if (state === 'paused' || state === 'over') resetCheer();
    document.querySelector('.game-shell').dataset.state = state;
    $('matchStatus').textContent = {
      ready: 'READY TO GROW', playing: 'ON THE MOVE', paused: 'TAKING A BREATHER',
      over: 'GOOD GAME', won: 'BOARD COMPLETE',
    }[state];
    $('overlay').hidden = state === 'playing';
    $('playerEntry').hidden = state === 'playing' || state === 'paused';
    previewSound = false;
    syncMusic();
    $('pauseButton').disabled = !['playing', 'paused'].includes(state);
    $('pauseButton').textContent = state === 'paused' ? '▷ RESUME' : 'Ⅱ PAUSE';
    $('pauseButton').setAttribute('aria-label', state === 'paused' ? 'Resume game' : 'Pause game');
    lastTime = null;
    gesture = null;
  }

  function showOverlay(tag, title, text, button, hint) {
    $('overlayTag').textContent = tag;
    $('overlayTitle').textContent = title;
    $('overlayText').textContent = text;
    $('playLabel').textContent = button;
    $('spaceHint').textContent = hint;
    (state === 'paused' ? $('playButton') : $('playerInput')).focus({ preventScroll: true });
  }

  // Effects are optional; failure here must never disable the music track.
  async function unlockAudio() {
    if (!soundOn) return;
    // Prime native playback during the user gesture, even without Web Audio.
    const request = ++chompRequest;
    chompPriming = true;
    chomp.muted = true;
    try {
      Promise.resolve(chomp.play()).then(() => {
        if (request !== chompRequest) return;
        chomp.pause();
        chomp.currentTime = 0;
        chompPriming = false;
        chomp.muted = !soundOn;
      }).catch(() => { /* An actual catch or Test chomp can retry. */ });
    } catch { /* Retry on the next catch. */ }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      if (!audio) audio = new AudioContext();
      if (!effectsGain) {
        effectsGain = audio.createGain();
        effectsGain.connect(audio.destination);
      }
      effectsGain.gain.setValueAtTime(soundOn ? music.volume : 0, audio.currentTime);
      if (audio.state !== 'running') await audio.resume();
    } catch { /* Native media playback still works without Web Audio. */ }
  }

  function updateSoundControls() {
    chomp.volume = music.volume;
    chomp.muted = !soundOn || chompPriming;
    if (effectsGain) effectsGain.gain.setValueAtTime(soundOn ? music.volume : 0, audio.currentTime);
    $('soundButton').setAttribute('aria-pressed', String(soundOn));
    $('soundButton').setAttribute('aria-label', soundOn ? 'Mute music and sound' : 'Enable music and sound');
    $('testSoundButton').textContent = previewSound ? '■ Stop test' : '♪ Test sound';
    $('testSoundButton').setAttribute('aria-pressed', String(previewSound));
  }

  function syncMusic() {
    const request = ++playbackRequest;
    updateSoundControls();
    if (!soundOn || (state !== 'playing' && !previewSound)) {
      music.pause();
      $('soundLabel').textContent = soundOn ? 'MUSIC READY' : 'MUSIC OFF';
      $('audioStatus').textContent = soundOn ? 'Music starts with Play, or try Test sound.' : 'Music and effects are muted.';
      return;
    }
    music.muted = false;
    $('soundLabel').textContent = 'STARTING…';
    $('audioStatus').textContent = 'Starting audio…';
    // Call play directly inside the click/key handler to satisfy autoplay rules.
    try {
      Promise.resolve(music.play()).then(() => {
        if (request !== playbackRequest) return;
        $('soundLabel').textContent = 'MUSIC PLAYING';
        $('audioStatus').textContent = music.volume === 0 ? 'Volume is zero. Move the volume slider to hear music.' : 'Track playing. If silent, check the browser tab/site mute and your speaker output.';
      }).catch((error) => audioFailed(error, request));
    } catch (error) { audioFailed(error, request); }
  }

  function audioFailed(error, request) {
    if (request !== playbackRequest) return;
    previewSound = false;
    updateSoundControls();
    $('soundLabel').textContent = 'RETRY SOUND';
    $('audioStatus').textContent = error.name === 'NotAllowedError'
      ? 'Browser blocked audio. Click Test sound to allow playback.'
      : 'Music could not load. Refresh the page, then click Test sound to retry.';
  }

  function tone(frequency, duration = 0.09, { delay = 0, end = frequency, type = 'sine', volume = 0.22 } = {}) {
    if (!soundOn || !effectsGain || audio.state !== 'running' || music.volume === 0) return;
    const start = audio.currentTime + delay;
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(end, start + duration);
    gain.gain.setValueAtTime(0.001, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
    oscillator.connect(gain);
    gain.connect(effectsGain);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start);
    oscillator.stop(start + duration);
  }

  function playChomp() {
    if (!soundOn || music.volume === 0) return;
    const request = ++chompRequest;
    chompPriming = false;
    chomp.muted = false;
    chomp.volume = music.volume;
    const failed = () => {
      if (request === chompRequest) $('audioStatus').textContent = 'Chomp could not play. Click Test chomp to retry, or refresh the page.';
    };
    try {
      chomp.currentTime = 0;
      Promise.resolve(chomp.play()).catch(failed);
    } catch { failed(); }
  }

  function playGameOver() {
    // A longer descending buzz is deliberately distinct from a bite.
    tone(220, 0.16, { end: 175, type: 'sawtooth', volume: 0.16 });
    tone(165, 0.18, { delay: 0.17, end: 125, type: 'sawtooth', volume: 0.16 });
    tone(110, 0.38, { delay: 0.36, end: 45, type: 'sawtooth', volume: 0.18 });
  }

  function startGame() {
    const name = cleanName($('playerInput').value);
    if (!name) {
      if (state === 'playing') pause();
      $('playerEntry').hidden = false;
      $('playerInput').setAttribute('aria-invalid', 'true');
      $('nameHint').textContent = 'Please enter your name before playing.';
      $('playerInput').focus({ preventScroll: true });
      announce('Who is playing? Please enter your name.');
      return;
    }
    playerName = name;
    $('playerInput').value = name;
    $('playerInput').setAttribute('aria-invalid', 'false');
    $('nameHint').textContent = 'Enter a name, then choose your avatar. Music starts when you play.';
    updateAvatarPicker();
    if (canSave) {
      try {
        localStorage.setItem(playerKey, playerName);
        localStorage.setItem(avatarKey, playerAvatar);
      } catch { storageUnavailable(); }
    }
    void unlockAudio();
    engine.reset();
    resetCheer();
    startingBest = best;
    elapsed = -450; // A brief runway to choose your first direction.
    updateScores();
    setState('playing');
    $('footerMessage').textContent = 'Find your rhythm. Feed your ambition.';
    canvas.focus({ preventScroll: true });
    announce(`${playerName}, game started with the ${avatars[playerAvatar]} avatar. Use arrow keys or W A S D to steer. Catch the ${engine.foodType}.`);
  }

  function pause() {
    if (state === 'playing') {
      setState('paused');
      showOverlay('NO RUSH. WE’LL WAIT.', 'A little breather.', 'Your next bite is right where you left it.', 'BACK TO IT', 'or press space to resume');
      announce('Game paused.');
    } else if (state === 'paused') {
      void unlockAudio();
      setState('playing');
      elapsed = 0;
      canvas.focus({ preventScroll: true });
      announce('Game resumed.');
    }
  }

  function advance() {
    const previousLevel = engine.level;
    const result = engine.tick();
    if (result === 'ate' || result === 'won') {
      if (engine.score > best) {
        best = engine.score;
        bestName = playerName;
        if (canSave) {
          try { localStorage.setItem(storageKey, JSON.stringify({ score: best, name: bestName })); }
          catch { storageUnavailable(); }
        }
      }
      updateScores();
      cheer();
      playChomp();
      const levelUp = engine.level > previousLevel;
      $('footerMessage').textContent = levelUp ? `Level ${engine.level}! Speed increased.` : best > startingBest ? 'A new club record. Stay hungry.' : 'Another catch toward your next level.';
      announce(`${levelUp ? `Level ${engine.level}! Speed increased. ` : ''}Score ${engine.score}. Next prey: ${engine.foodType || 'none'}.`);
    }
    if (result === 'lost' || result === 'won') {
      const won = result === 'won';
      setState(won ? 'won' : 'over');
      if (won) tone(880, 0.25);
      else playGameOver();
      showOverlay(won ? 'EVERY LAST BITE' : engine.score > startingBest ? 'A NEW CLUB RECORD' : 'EVERY END IS A NEW BEGINNING',
        won ? 'You outgrew the board.' : 'One more bite?',
        `${playerName}, you scored ${engine.score}. Best: ${best} by ${bestName || '—'}.\n${won ? 'A perfectly full plate. Well played.' : 'Same player or a new challenger?'}`, 
        'PLAY AGAIN', 'or press space for another round');
      announce(`${won ? 'You won!' : 'Game over.'} ${playerName} scored ${engine.score}. Best score ${best} by ${bestName || 'no one yet'}.`);
    }
  }

  function roundedRect(x, y, w, h, radius, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
  }

  function ellipse(x, y, rx, ry, color, rotation = 0) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rotation, 0, Math.PI * 2); ctx.fill();
  }

  function drawPrey(x, y, cell) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(cell, cell);
    // A warm halo keeps the small animals easy to spot against the court.
    ellipse(0, 0, 0.48, 0.46, '#f8b48722');
    if (engine.foodType === 'frog') {
      for (const side of [-1, 1]) {
        ellipse(side * 0.29, 0.18, 0.15, 0.19, '#79ad45', side * 0.65);
        ellipse(side * 0.23, -0.24, 0.13, 0.14, '#a8d95f');
      }
      ellipse(0, 0.05, 0.27, 0.3, '#8dc34f');
      ellipse(0, 0.11, 0.16, 0.18, '#c1db7a');
      for (const side of [-1, 1]) {
        ellipse(side * 0.23, -0.27, 0.075, 0.08, '#f8edbc');
        ellipse(side * 0.23, -0.29, 0.035, 0.05, '#172c23');
      }
    } else {
      const rabbit = engine.foodType === 'rabbit';
      const fur = rabbit ? '#e4d7b9' : '#aaa59e';
      if (!rabbit) {
        ctx.strokeStyle = '#d99f99'; ctx.lineWidth = 0.055; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-0.2, 0.2); ctx.bezierCurveTo(-0.55, 0.48, -0.48, -0.12, -0.28, 0.04); ctx.stroke();
      }
      ellipse(0, 0.12, 0.26, 0.28, fur);
      if (rabbit) ellipse(-0.25, 0.22, 0.1, 0.1, '#fff2db');
      for (const side of [-1, 1]) {
        ellipse(side * 0.16, rabbit ? -0.3 : -0.2, rabbit ? 0.085 : 0.13, rabbit ? 0.23 : 0.13, fur, side * 0.2);
        ellipse(side * 0.16, rabbit ? -0.31 : -0.2, rabbit ? 0.04 : 0.075, rabbit ? 0.15 : 0.075, '#d99f99', side * 0.2);
      }
      ellipse(0, -0.08, 0.21, 0.2, fur);
      for (const side of [-1, 1]) {
        ellipse(side * 0.12, -0.12, 0.035, 0.04, '#182a29');
        ctx.strokeStyle = '#ede5d3'; ctx.lineWidth = 0.018;
        ctx.beginPath(); ctx.moveTo(side * 0.07, 0.01); ctx.lineTo(side * 0.32, -0.02);
        ctx.moveTo(side * 0.07, 0.04); ctx.lineTo(side * 0.32, 0.09); ctx.stroke();
      }
      ellipse(0, 0.025, 0.045, 0.035, '#c98685');
    }
    ctx.restore();
  }

  function drawSnake(left, top, cell, time) {
    const points = engine.snake.map(({ x, y }) => ({ x: left + (x + 0.5) * cell, y: top + (y + 0.5) * cell }));
    const radius = (i) => cell * (0.025 + 0.3 * Math.min(1, (points.length - 1 - i) / 3));
    ctx.lineCap = 'round';
    // Connected, tapered body rather than separate square tiles.
    for (let i = points.length - 1; i > 0; i--) {
      const a = points[i]; const b = points[i - 1];
      // Never draw a line across the whole court when the body wraps an edge.
      if (Math.abs(a.x - b.x) > cell * 1.5 || Math.abs(a.y - b.y) > cell * 1.5) {
        ellipse(a.x, a.y, radius(i), radius(i), '#71a65c');
        ellipse(b.x, b.y, radius(i - 1), radius(i - 1), '#71a65c');
        continue;
      }
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const nx = -Math.sin(angle); const ny = Math.cos(angle);
      const ra = radius(i); const rb = radius(i - 1);
      const skin = ctx.createLinearGradient(b.x - nx * rb, b.y - ny * rb, b.x + nx * rb, b.y + ny * rb);
      skin.addColorStop(0, '#263d27'); skin.addColorStop(0.28, '#759250');
      skin.addColorStop(0.52, '#a7b975'); skin.addColorStop(0.8, '#6f8947'); skin.addColorStop(1, '#334c2e');
      ctx.fillStyle = skin;
      ctx.beginPath();
      ctx.moveTo(a.x + nx * ra, a.y + ny * ra); ctx.lineTo(b.x + nx * rb, b.y + ny * rb);
      ctx.lineTo(b.x - nx * rb, b.y - ny * rb); ctx.lineTo(a.x - nx * ra, a.y - ny * ra);
      ctx.closePath(); ctx.fill();
      // Rounded joints and a narrowing tail keep the silhouette continuous.
      ellipse(b.x, b.y, rb, rb, skin);
      ellipse(a.x, a.y, ra, ra, skin);
    }
    for (let i = points.length - 1; i > 0; i--) {
      const p = points[i]; const next = points[i - 1];
      let dx = next.x - p.x; let dy = next.y - p.y;
      if (Math.abs(dx) > cell * 1.5) dx = -Math.sign(dx) * cell;
      if (Math.abs(dy) > cell * 1.5) dy = -Math.sign(dy) * cell;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(dy, dx)); ctx.scale(cell, cell);
      const r = radius(i) / cell;
      // Irregular olive saddle markings, fine overlapping scales, pale flanks.
      ellipse(0, 0, 0.21, r * 0.58, '#354a2eaa', i % 2 ? 0.22 : -0.22);
      ctx.strokeStyle = '#d4d8a35e'; ctx.lineWidth = 0.014;
      for (const side of [-1, 0, 1]) {
        for (const offset of [-0.28, -0.09, 0.1, 0.29]) {
          ctx.beginPath();
          ctx.ellipse(offset + (side === 0 ? 0.05 : 0), side * r * 0.62, 0.09, Math.max(0.015, r * 0.25), 0, 0, Math.PI);
          ctx.stroke();
        }
      }
      if (r > 0.12) {
        ctx.strokeStyle = '#d4d3a16b'; ctx.lineWidth = 0.026;
        ctx.beginPath(); ctx.moveTo(-0.35, r * 0.8); ctx.lineTo(0.35, r * 0.8); ctx.stroke();
      }
      ctx.restore();
    }
    const head = points[0];
    ctx.save(); ctx.translate(head.x, head.y);
    ctx.rotate({ right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 }[engine.direction]);
    ctx.scale(cell, cell);
    if (state === 'playing' && !reducedMotion && Math.sin(time / 160) > 0.6) {
      ctx.strokeStyle = '#df817b'; ctx.lineWidth = 0.035;
      ctx.beginPath(); ctx.moveTo(0.34, 0); ctx.lineTo(0.62, 0); ctx.lineTo(0.71, -0.07);
      ctx.moveTo(0.62, 0); ctx.lineTo(0.71, 0.07); ctx.stroke();
    }
    const headSkin = ctx.createLinearGradient(0, -0.32, 0.12, 0.32);
    headSkin.addColorStop(0, '#405332'); headSkin.addColorStop(0.4, '#b3bd7b'); headSkin.addColorStop(1, '#6e7e46');
    // Narrow neck, broad cheeks and a gently flattened snout.
    ctx.fillStyle = headSkin; ctx.strokeStyle = '#293f2b'; ctx.lineWidth = 0.025;
    ctx.beginPath(); ctx.moveTo(-0.43, -0.19);
    ctx.bezierCurveTo(-0.25, -0.2, -0.2, -0.34, 0.03, -0.33);
    ctx.bezierCurveTo(0.25, -0.32, 0.5, -0.22, 0.5, 0);
    ctx.bezierCurveTo(0.5, 0.22, 0.25, 0.32, 0.03, 0.33);
    ctx.bezierCurveTo(-0.2, 0.34, -0.25, 0.2, -0.43, 0.19);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#e0d9a1'; ctx.lineWidth = 0.045;
    ctx.beginPath(); ctx.moveTo(-0.02, 0.27); ctx.quadraticCurveTo(0.41, 0.25, 0.47, 0.04); ctx.stroke();
    for (const side of [-1, 1]) {
      ellipse(0.06, side * 0.25, 0.075, 0.065, '#d6af48');
      ellipse(0.08, side * 0.25, 0.018, 0.054, '#101f15');
      ellipse(0.045, side * 0.25 - 0.018, 0.015, 0.013, '#fff6d2');
      ellipse(0.35, side * 0.105, 0.022, 0.016, '#293d26');
    }
    ctx.strokeStyle = '#546638'; ctx.lineWidth = 0.015;
    ctx.beginPath(); ctx.moveTo(-0.25, 0); ctx.lineTo(0.31, 0);
    ctx.moveTo(-0.15, -0.16); ctx.lineTo(0.15, -0.13); ctx.lineTo(0.29, 0); ctx.lineTo(0.15, 0.13); ctx.lineTo(-0.15, 0.16);
    ctx.moveTo(-0.12, -0.15); ctx.lineTo(-0.12, 0.15); ctx.stroke();
    ctx.restore();
  }

  function draw(time) {
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#101e25';
    ctx.fillRect(0, 0, width, height);
    const cell = Math.min((width - 24) / engine.columns, (height - 24) / engine.rows);
    const left = (width - cell * engine.columns) / 2;
    const top = (height - cell * engine.rows) / 2;
    const boardWidth = cell * engine.columns;
    const boardHeight = cell * engine.rows;
    roundedRect(left, top, boardWidth, boardHeight, 3, '#162a30');
    ctx.strokeStyle = '#a6d4bc0a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= engine.columns; x++) { ctx.moveTo(left + x * cell, top); ctx.lineTo(left + x * cell, top + boardHeight); }
    for (let y = 0; y <= engine.rows; y++) { ctx.moveTo(left, top + y * cell); ctx.lineTo(left + boardWidth, top + y * cell); }
    ctx.stroke();
    ctx.strokeStyle = '#7ba59555';
    ctx.strokeRect(left, top, boardWidth, boardHeight);

    if (engine.food) drawPrey(left + (engine.food.x + 0.5) * cell, top + (engine.food.y + 0.5) * cell, cell);
    drawSnake(left, top, cell, time);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    width = Math.max(1, rect.width);
    height = Math.max(1, rect.height);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    draw(0);
  }

  const directionKeys = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    // Let focused buttons handle Space themselves; do not trigger two actions.
    if (key === ' ' && event.target.closest('button')) return;
    if (directionKeys[key] || [' ', 'r', 'Escape'].includes(key)) event.preventDefault();
    if (event.repeat) return;
    if (directionKeys[key] && state === 'playing') engine.turn(directionKeys[key]);
    if (key === ' ') { if (['ready', 'over', 'won'].includes(state)) startGame(); else pause(); }
    if (key === 'r') startGame();
    if (key === 'Escape' && state === 'playing') pause();
  });
  $('playerInput').addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.repeat) { event.preventDefault(); startGame(); }
  });
  $('playButton').addEventListener('click', () => state === 'paused' ? pause() : startGame());
  $('pauseButton').addEventListener('click', pause);
  $('restartButton').addEventListener('click', startGame);
  document.querySelectorAll('[data-direction]').forEach((button) => {
    button.addEventListener('click', () => {
      if (state === 'playing') engine.turn(button.dataset.direction);
    });
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (state !== 'playing' || !event.isPrimary) return;
    canvas.setPointerCapture(event.pointerId);
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!gesture || gesture.id !== event.pointerId || state !== 'playing') return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    engine.turn(Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 'right' : 'left' : dy > 0 ? 'down' : 'up');
    gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((name) => canvas.addEventListener(name, () => { gesture = null; }));
  function suspendPlayback() {
    if (state === 'playing') pause();
    else if (previewSound) { previewSound = false; syncMusic(); }
  }
  window.addEventListener('blur', suspendPlayback);
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspendPlayback(); });
  $('soundButton').addEventListener('click', () => {
    soundOn = !soundOn;
    if (!soundOn) previewSound = false;
    syncMusic();
    if (soundOn) void unlockAudio();
  });
  $('testChompButton').addEventListener('click', () => {
    if (state === 'playing') pause();
    soundOn = true;
    if (music.volume === 0) { music.volume = 0.75; $('volumeInput').value = '0.75'; }
    previewSound = false;
    syncMusic();
    playChomp();
  });
  $('testSoundButton').addEventListener('click', () => {
    if (state === 'playing') pause();
    previewSound = !previewSound;
    if (previewSound) {
      soundOn = true;
      if (music.volume === 0) { music.volume = 0.75; $('volumeInput').value = '0.75'; }
    }
    syncMusic();
  });
  $('volumeInput').addEventListener('input', () => {
    music.volume = Number($('volumeInput').value);
    updateSoundControls();
    if (soundOn && (state === 'playing' || previewSound)) syncMusic();
  });
  music.addEventListener('error', () => {
    if (soundOn && (state === 'playing' || previewSound)) audioFailed(new Error('Media failed'), playbackRequest);
  });

  function frame(time) {
    if (cheerRemaining > 0 && cheerFrame !== null) {
      cheerRemaining -= Math.min(time - cheerFrame, 200);
      if (cheerRemaining <= 0) resetCheer();
    }
    cheerFrame = time;
    if (state === 'playing') {
      if (lastTime !== null) elapsed += Math.min(time - lastTime, 200);
      lastTime = time;
      while (elapsed >= engine.interval && state === 'playing') {
        elapsed -= engine.interval;
        advance();
      }
    }
    draw(time);
    requestAnimationFrame(frame);
  }
  new ResizeObserver(resize).observe($('boardWrap'));
  resetCheer();
  updateScores();
  setState('ready');
  $('playerInput').focus({ preventScroll: true });
  resize();
  requestAnimationFrame(frame);
})();
