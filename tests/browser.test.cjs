const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { SnakeGame } = require('../snake-engine.js');

// Run the real UI controller with a small DOM/Canvas stand-in, no production test hooks.
// Existing lifecycle cases use solo; playerCount: null exercises the production two-player default.
function load({ storage = new Map(), blocked = false, player = 'Alex', audioSupport = false, mediaError = null, playerCount = 1 } = {}) {
  const elements = new Map();
  const noop = () => {};
  let focused;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      textContent: '', value: '', hidden: false, disabled: false, dataset: {}, attrs: {}, listeners: {},
      tagName: id === 'modeSelect' || id === 'playersSelect' ? 'SELECT' : id === 'playerInput' || id === 'opponentInput' || id.startsWith('avatar-') ? 'INPUT' : id.endsWith('Button') ? 'BUTTON' : 'CANVAS',
      setAttribute(name, value) { this.attrs[name] = value; },
      addEventListener(name, callback) { this.listeners[name] = callback; },
      focus() { focused = id; },
      closest(selector) { return selector === 'button' && this.tagName === 'BUTTON' ? this : null; },
      getBoundingClientRect: () => ({ width: 720, height: 600 }),
      setPointerCapture: noop,
    });
    return elements.get(id);
  }
  const context = new Proxy({}, { get: (_, key) => key === 'createLinearGradient' ? () => ({ addColorStop: noop }) : noop, set: () => true });
  element('board').getContext = () => context;
  Object.assign(element('music'), {
    paused: true, volume: 0.75, plays: 0,
    play() { this.plays++; if (mediaError) return Promise.reject(mediaError); this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  });
  Object.assign(element('chomp'), {
    paused: true, volume: 0.75, muted: false, currentTime: 0, plays: 0,
    play() { this.plays++; this.paused = false; return Promise.resolve(); },
    pause() { this.paused = true; },
  });
  const events = {};
  const documentEvents = {};
  const touchButtons = [0, 1].flatMap((playerIndex) => ['up', 'down', 'left', 'right'].map((direction) => {
    const button = element(`p${playerIndex}-${direction}Button`);
    button.dataset = { direction, player: String(playerIndex) };
    return button;
  }));
  const document = {
    getElementById: element, querySelector: element, querySelectorAll: () => touchButtons, hidden: false,
    addEventListener: (name, callback) => { documentEvents[name] = callback; },
  };
  let engine;
  let frame;
  const timers = new Map();
  let timerId = 0;
  const audioStats = { notes: 0, stopped: 0, voices: [], gains: [] };
  class FakeAudio {
    constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = {}; }
    async resume() { this.state = 'running'; }
    createOscillator() {
      const voice = { frequencies: [], connect: noop, disconnect: noop,
        start(time) { audioStats.notes++; this.startTime = time; },
        stop(time) { audioStats.stopped++; this.stopTime = time; } };
      voice.frequency = {
        setValueAtTime: (value) => voice.frequencies.push(value),
        exponentialRampToValueAtTime: (value) => voice.frequencies.push(value),
      };
      audioStats.voices.push(voice);
      return voice;
    }
    createGain() {
      const values = [];
      audioStats.gains.push(values);
      return { gain: { setValueAtTime: (value) => values.push(value), linearRampToValueAtTime: noop,
        exponentialRampToValueAtTime: noop, cancelScheduledValues: noop, setTargetAtTime: noop },
        connect: noop, disconnect: noop };
    }
  }
  const sandbox = {
    setInterval: (callback) => { const id = ++timerId; timers.set(id, callback); return id; },
    clearInterval: (id) => timers.delete(id),
    SnakeGame: class extends SnakeGame { constructor(options) { super({ ...options, random: () => 0, ...(playerCount === null ? {} : { playerCount }) }); engine = this; } },
    document,
    window: { AudioContext: audioSupport ? FakeAudio : undefined, matchMedia: () => ({ matches: true }), devicePixelRatio: 1,
      addEventListener: (name, callback) => { events[name] = callback; } },
    localStorage: {
      getItem: (key) => { if (blocked) throw Error('Blocked'); return storage.get(key) ?? null; },
      setItem: (key, value) => { if (blocked) throw Error('Blocked'); storage.set(key, value); },
    },
    ResizeObserver: class { observe() {} },
    requestAnimationFrame: (callback) => { frame = callback; },
  };
  vm.runInNewContext(readFileSync(join(__dirname, '..', 'game.js'), 'utf8'), sandbox);
  if (!element('playerInput').value) element('playerInput').value = player;
  return {
    element, engine, events, document, documentEvents, storage, timers, audioStats,
    focus: () => focused,
    frame: (time) => frame(time),
    click: (id) => element(id).listeners.click(),
    key: (key, extra = {}) => events.keydown({ key, target: element('board'), preventDefault: noop, ...extra }),
    state: () => element('.game-shell').dataset.state,
  };
}

test('production defaults to two players, shows two identities, controls and individual scores', () => {
  const g = load({ playerCount: null });
  assert.equal(g.engine.playerCount, 2);
  assert.equal(g.element('playersSelect').value, '2');
  assert.equal(g.element('.game-shell').dataset.players, '2');
  assert.equal(g.element('opponentEntry').hidden, false);
  assert.equal(g.element('opponentScoreGroup').hidden, false);
  assert.equal(g.element('opponentInput').required, true);
  assert.equal(g.element('playerTwoControls').hidden, false);
  assert.match(g.element('overlayTitle').textContent, /Two snakes/);
  assert.match(g.element('controlsHint').textContent, /Player 2: arrow keys/);
  g.element('opponentInput').value = 'Jamie';
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('opponentName').textContent, 'Jamie');
  assert.equal(g.element('score').textContent, '00');
  assert.equal(g.element('opponentScore').textContent, '00');
  assert.equal(g.element('playersSelect').disabled, true);
  assert.equal(g.storage.get('snake-club-player-two-v1'), 'Jamie');
});

test('WASD, arrows, and both touch pads steer separate snakes; pause blocks turns', () => {
  const g = load({ playerCount: null });
  g.click('playButton');
  g.key('W'); g.key('ArrowDown');
  assert.deepEqual(g.engine.players[0].turns, ['up']);
  assert.deepEqual(g.engine.players[1].turns, ['down']);
  g.click('p0-leftButton'); g.click('p1-rightButton');
  assert.deepEqual(g.engine.players[0].turns, ['up', 'left']);
  assert.deepEqual(g.engine.players[1].turns, ['down', 'right']);
  g.click('pauseButton');
  assert.equal(g.element('playersSelect').disabled, true);
  g.engine.players.forEach((player) => { player.turns = []; });
  g.key('w'); g.key('ArrowDown'); g.click('p0-upButton'); g.click('p1-downButton');
  assert.ok(g.engine.players.every((player) => player.turns.length === 0));
  const before = JSON.stringify(g.engine.players);
  g.frame(3000); assert.equal(JSON.stringify(g.engine.players), before);
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  g.click('restartButton');
  assert.ok(g.engine.players.every((player) => player.score === 0 && player.snake.length === 3));
});

test('Player 2 catches update only their score, champion, cheer and combined catch table', () => {
  const g = load({ playerCount: null });
  g.element('opponentInput').value = '<b>Jamie</b>';
  g.click('playButton');
  const head = g.engine.players[1].snake[0];
  g.engine.food = { x: head.x - 1, y: head.y };
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.element('score').textContent, '00');
  assert.equal(g.element('opponentScore').textContent, '01');
  assert.equal(g.element('bestName').textContent, '<b>Jamie</b>');
  assert.equal(g.element('ratCount').textContent, '1');
  assert.equal(g.element('totalEaten').textContent, '1');
  assert.match(g.element('friendMessage').textContent, /Nice catch, <b>Jamie<\/b>/);
  assert.deepEqual(JSON.parse(g.storage.get('snake-club-record-v2')), { score: 1, name: '<b>Jamie</b>' });
  assert.equal(load({ storage: g.storage, playerCount: null }).element('opponentInput').value, '<b>Jamie</b>');
});

test('a crash announces the surviving winner and rematch resets both snakes', () => {
  const g = load({ playerCount: null });
  g.element('opponentInput').value = 'Jamie'; g.click('playButton');
  Object.assign(g.engine.players[0], { snake: [{ x: 1, y: 5 }], direction: 'left' });
  Object.assign(g.engine.players[1], { snake: [{ x: 15, y: 15 }], direction: 'right' });
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.state(), 'over');
  assert.equal(g.element('overlayTitle').textContent, 'Jamie wins!');
  assert.match(g.element('overlayText').textContent, /Alex hit a wall/);
  assert.match(g.element('announcer').textContent, /Jamie wins/);
  assert.equal(g.element('playersSelect').disabled, false);
  assert.equal(g.element('music').paused, true);
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  assert.equal(g.engine.winner, null);
  assert.ok(g.engine.players.every((player) => player.collision === null && player.score === 0 && player.snake.length === 3));
});

test('simultaneous head collisions announce a draw rather than favouring either player', () => {
  const g = load({ playerCount: null }); g.click('playButton');
  Object.assign(g.engine.players[0], { snake: [{ x: 10, y: 10 }], direction: 'right' });
  Object.assign(g.engine.players[1], { snake: [{ x: 12, y: 10 }], direction: 'left' });
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.state(), 'over');
  assert.match(g.element('overlayTitle').textContent, /draw/);
  assert.match(g.element('announcer').textContent, /head-on/);
});

test('Player 2 name is required in versus; Enter starts, and solo does not require it', () => {
  const g = load({ playerCount: null });
  g.element('opponentInput').value = '  '; g.click('playButton');
  assert.equal(g.state(), 'ready');
  assert.equal(g.focus(), 'opponentInput');
  assert.equal(g.element('opponentInput').attrs['aria-invalid'], 'true');
  g.element('opponentInput').value = ' Jamie  Fox ';
  g.element('opponentInput').listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('opponentName').textContent, 'Jamie Fox');
  const solo = load({ playerCount: null });
  solo.element('playersSelect').value = '1'; solo.element('playersSelect').listeners.change();
  solo.element('opponentInput').value = '';
  assert.equal(solo.element('opponentEntry').hidden, true);
  assert.equal(solo.element('opponentInput').required, false);
  assert.equal(solo.element('playerTwoControls').hidden, true);
  solo.click('playButton');
  assert.equal(solo.state(), 'playing');
  solo.key('ArrowUp'); assert.deepEqual(solo.engine.turns, ['up']);
  assert.equal(load({ storage: solo.storage, playerCount: null }).engine.playerCount, 1);
});

test('versus survives blocked storage and corrupt preferences fall back to two players', () => {
  for (const saved of ['0', '3', 'NaN', '__proto__']) {
    const g = load({ playerCount: null, storage: new Map([['snake-club-players-v1', saved]]) });
    assert.equal(g.engine.playerCount, 2);
  }
  const g = load({ playerCount: null, blocked: true });
  g.click('playButton'); assert.equal(g.state(), 'playing');
  assert.equal(g.engine.playerCount, 2);
});

test('mode picker previews, remembers and locks the selected mode during a round', () => {
  const g = load();
  assert.equal(g.element('modeSelect').value, 'obstacles');
  assert.ok(g.engine.obstacles.some(({ type }) => type === 'barrier'));
  assert.ok(g.engine.obstacles.some(({ type }) => type === 'rock'));
  assert.equal(g.element('.game-shell').dataset.mode, 'obstacles');
  assert.match(g.element('overlayText').textContent, /walls/);
  assert.equal(g.element('modeSelect').disabled, false);
  g.element('modeSelect').value = 'maze';
  g.element('modeSelect').listeners.change();
  assert.equal(g.engine.mode, 'maze');
  assert.ok(g.engine.obstacles.length > 0);
  assert.match(g.element('modeHint').textContent, /maze walls/);
  assert.match(g.element('board').attrs['aria-label'], /Maze mode/);
  assert.equal(g.storage.get('snake-club-mode-v1'), 'maze');
  assert.equal(load({ storage: g.storage }).element('modeSelect').value, 'maze');
  // Native select keys must not trigger game shortcuts.
  g.key(' ', { target: g.element('modeSelect') });
  g.key('r', { target: g.element('modeSelect') });
  assert.equal(g.state(), 'ready');
  g.click('playButton');
  assert.equal(g.engine.mode, 'maze');
  assert.equal(g.element('modeSelect').disabled, true);
  assert.match(g.element('announcer').textContent, /Maze mode/);
  g.click('pauseButton');
  assert.equal(g.element('modeSelect').disabled, true);
  g.element('modeSelect').value = 'classic';
  g.element('modeSelect').listeners.change();
  assert.equal(g.engine.mode, 'maze');
  g.click('playButton');
  g.click('restartButton');
  assert.equal(g.engine.mode, 'maze');
  g.engine.snake = [{ x: 1, y: 5 }]; g.engine.direction = 'left';
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.state(), 'over');
  assert.match(g.element('overlayText').textContent, /hit a wall/);
  assert.match(g.element('announcer').textContent, /hit a wall/);
  assert.equal(g.element('modeSelect').disabled, false);
  g.element('modeSelect').value = 'classic';
  g.element('modeSelect').listeners.change();
  assert.deepEqual(g.engine.obstacles, []);
  g.click('playButton');
  assert.equal(g.engine.mode, 'classic');
});

test('an explicitly saved Classic choice remains available without obstacles', () => {
  const g = load({ storage: new Map([['snake-club-mode-v1', 'classic']]) });
  assert.equal(g.element('modeSelect').value, 'classic');
  assert.equal(g.element('.game-shell').dataset.mode, 'classic');
  assert.deepEqual(g.engine.obstacles, []);
  assert.match(g.element('overlayText').textContent, /Edges wrap/);
  g.element('modeSelect').value = 'obstacles';
  g.element('modeSelect').listeners.change();
  assert.ok(g.engine.obstacles.length > 0);
  assert.equal(g.element('.game-shell').dataset.mode, 'obstacles');
});

test('obstacle hits show the cause and replay restores a safe layout', () => {
  for (const type of ['barrier', 'rock']) {
    const g = load();
    g.element('modeSelect').value = 'obstacles';
    g.element('modeSelect').listeners.change();
    g.click('playButton');
    const target = g.engine.obstacles.find((cell) => cell.type === type);
    g.engine.snake = [{ x: target.x - 1, y: target.y }];
    for (const time of [0, 200, 400, 600, 800]) g.frame(time);
    assert.equal(g.state(), 'over');
    assert.ok(g.element('overlayText').textContent.includes(`hit a ${type}`));
    assert.equal(g.element('music').paused, true);
    g.click('playButton');
    assert.equal(g.state(), 'playing');
    assert.equal(g.engine.collision, null);
    assert.equal(g.engine.mode, 'obstacles');
    assert.equal(g.engine.snake.length, 3);
  }
});

test('invalid saved modes default to obstacles and blocked storage still permits selection', () => {
  for (const mode of ['unknown', '__proto__', 'constructor', '']) {
    const g = load({ storage: new Map([['snake-club-mode-v1', mode]]) });
    assert.equal(g.engine.mode, 'obstacles');
    assert.equal(g.element('modeSelect').value, 'obstacles');
  }
  const g = load({ blocked: true });
  g.element('modeSelect').value = 'obstacles';
  g.element('modeSelect').listeners.change();
  g.click('playButton');
  assert.equal(g.engine.mode, 'obstacles');
  assert.equal(g.state(), 'playing');
});

function eat(g) {
  g.engine.food = { x: g.engine.snake[0].x + 1, y: g.engine.snake[0].y };
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
}

test('UI starts, moves, pauses without advancing, resumes and restarts', () => {
  const g = load();
  assert.equal(g.state(), 'ready');
  assert.equal(g.element('pauseButton').disabled, true);
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  assert.equal(g.focus(), 'board');
  assert.equal(g.element('overlay').hidden, true);
  g.key('ArrowUp');
  g.frame(0);
  for (const time of [200, 400, 600, 800]) g.frame(time);
  assert.equal(g.engine.direction, 'up');
  g.key(' ');
  assert.equal(g.state(), 'paused');
  const before = JSON.stringify(g.engine.snake);
  g.frame(1800);
  assert.equal(JSON.stringify(g.engine.snake), before);
  g.click('playButton');
  g.frame(5000);
  assert.equal(JSON.stringify(g.engine.snake), before); // No hidden-time catch-up.
  g.frame(5200);
  assert.notEqual(JSON.stringify(g.engine.snake), before);
  g.key('r');
  assert.equal(g.engine.score, 0);
  assert.equal(g.engine.direction, 'right');
  assert.equal(g.state(), 'playing');
});

test('score and best update on eating, survive restart and reload', () => {
  const g = load();
  g.click('playButton');
  eat(g);
  assert.equal(g.element('score').textContent, '01');
  assert.equal(g.element('best').textContent, '01');
  g.click('restartButton');
  assert.equal(g.element('score').textContent, '00');
  assert.equal(g.element('best').textContent, '01');
  assert.equal(load({ storage: g.storage }).element('best').textContent, '01');
});

test('death shows the replay overlay and replay resets the game', () => {
  const g = load();
  g.click('playButton');
  g.engine.snake = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.state(), 'over');
  assert.equal(g.element('overlay').hidden, false);
  assert.equal(g.element('pauseButton').disabled, true);
  g.click('playButton');
  assert.equal(g.engine.snake.length, 3);
  assert.equal(g.state(), 'playing');
});

test('blur and hidden tabs pause automatically', () => {
  const g = load();
  g.click('playButton');
  g.events.blur();
  assert.equal(g.state(), 'paused');
  g.click('playButton');
  g.document.hidden = true;
  g.documentEvents.visibilitychange();
  assert.equal(g.state(), 'paused');
});

test('blocked and corrupt storage never prevent playing', () => {
  const g = load({ blocked: true });
  g.click('playButton');
  eat(g);
  assert.equal(g.element('best').textContent, '01');
  assert.match(g.element('storageNote').textContent, /session/);
  for (const bad of ['NaN', '-3', 'Infinity', '2.7', '9999999999999999999999']) {
    assert.equal(load({ storage: new Map([['snake-club-best-v1', bad]]) }).element('best').textContent, '00');
  }
});

test('button Space is left to native click, repeat input and modifiers are ignored', () => {
  const g = load();
  g.key(' ', { target: g.element('playButton') });
  assert.equal(g.state(), 'ready');
  g.key(' ', { repeat: true });
  assert.equal(g.state(), 'ready');
  g.key('r', { ctrlKey: true });
  assert.equal(g.state(), 'ready');
  g.key(' ');
  assert.equal(g.state(), 'playing');
});

test('swipes steer only during play and stop after pointer cancellation', () => {
  const g = load();
  const handlers = g.element('board').listeners;
  g.click('playButton');
  handlers.pointerdown({ isPrimary: true, pointerId: 1, clientX: 100, clientY: 100 });
  handlers.pointermove({ pointerId: 1, clientX: 100, clientY: 60 });
  assert.deepEqual(g.engine.turns, ['up']);
  handlers.pointercancel();
  handlers.pointermove({ pointerId: 1, clientX: 60, clientY: 60 });
  assert.deepEqual(g.engine.turns, ['up']);
});

test('asks for a nonblank name; Enter starts and names never become HTML', () => {
  const g = load({ player: '' });
  assert.equal(g.focus(), 'playerInput');
  g.click('playButton');
  assert.equal(g.state(), 'ready');
  assert.equal(g.element('playerInput').attrs['aria-invalid'], 'true');
  g.element('playerInput').value = '  <b>Sam</b>   Fox  ';
  g.element('playerInput').listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('playerName').textContent, '<b>Sam</b> Fox');
  assert.equal(g.element('playerEntry').hidden, true);
  assert.equal(g.storage.get('snake-club-player-v1'), '<b>Sam</b> Fox');
});

test('three avatars unlock after naming, appear during play and survive pause, restart and reload', () => {
  const g = load({ player: '' });
  assert.equal(g.element('avatarPicker').disabled, true);
  assert.equal(g.element('playerAvatar').hidden, true);
  assert.equal(g.element('avatar-mint').checked, true);
  g.element('playerInput').value = '   ';
  g.element('playerInput').listeners.input();
  assert.equal(g.element('avatarPicker').disabled, true);
  g.element('playerInput').value = 'Sam';
  g.element('playerInput').listeners.input();
  assert.equal(g.element('avatarPicker').disabled, false);
  for (const id of ['mint', 'peach', 'olive']) {
    for (const other of ['mint', 'peach', 'olive']) g.element(`avatar-${other}`).checked = other === id;
    g.element(`avatar-${id}`).listeners.change();
    g.click('playButton');
    assert.equal(g.state(), 'playing');
    assert.equal(g.element('playerAvatar').hidden, false);
    assert.equal(g.element('playerAvatar').dataset.avatar, id);
    assert.match(g.element('playerAvatar').attrs.alt, /human face avatar/);
    assert.equal(g.element('playerAvatar').attrs.src, `assets/avatar-${id}.svg`);
    assert.equal(g.storage.get('snake-club-avatar-v1'), id);
    g.click('pauseButton');
    assert.equal(g.element('playerEntry').hidden, true);
    g.click('playButton');
    g.click('restartButton');
    assert.equal(g.element('playerAvatar').dataset.avatar, id);
    const next = load({ storage: g.storage });
    assert.equal(next.element(`avatar-${id}`).checked, true);
    assert.equal(next.element('playerAvatar').dataset.avatar, id);
    assert.equal(next.element('avatarPicker').disabled, false);
    g.engine.snake = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
    for (const time of [0, 200, 400, 600, 800]) g.frame(time);
    assert.equal(g.state(), 'over');
    assert.equal(g.element('playerEntry').hidden, false);
  }
});

test('avatar keyboard controls are not game controls; Enter starts with the selection', () => {
  const g = load();
  g.element('avatar-mint').checked = false;
  const radio = g.element('avatar-peach');
  radio.checked = true;
  radio.listeners.change();
  g.key('ArrowRight', { target: radio });
  g.key(' ', { target: radio });
  assert.equal(g.state(), 'ready');
  assert.deepEqual(g.engine.turns, []);
  radio.listeners.keydown({ key: 'Enter', preventDefault() {} });
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('playerAvatar').dataset.avatar, 'peach');
  assert.match(g.element('announcer').textContent, /Peach avatar/);
});

test('invalid saved avatars default safely and blocked storage still allows a choice', () => {
  for (const value of ['unknown', '__proto__', 'constructor', '<script>', '']) {
    const g = load({ storage: new Map([['snake-club-avatar-v1', value]]) });
    assert.equal(g.element('avatar-mint').checked, true);
    g.click('playButton');
    assert.equal(g.element('playerAvatar').dataset.avatar, 'mint');
  }
  const g = load({ blocked: true });
  g.element('avatar-olive').checked = true;
  g.element('avatar-olive').listeners.change();
  g.click('playButton');
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('playerAvatar').dataset.avatar, 'olive');
});

test('avatar markup uses three labeled native radios with one default choice', () => {
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  assert.equal((html.match(/type="radio" name="avatar"/g) || []).length, 3);
  assert.equal((html.match(/name="avatar"[^>]*checked/g) || []).length, 1);
  assert.match(html, /<legend>Choose your avatar<\/legend>/);
  const portraits = new Set();
  for (const id of ['mint', 'peach', 'olive']) {
    assert.ok(html.includes(`src="assets/avatar-${id}.svg" data-avatar="${id}" alt=""`));
    const svg = readFileSync(join(__dirname, '..', 'assets', `avatar-${id}.svg`), 'utf8');
    assert.match(svg, /viewBox="0 0 96 96"/);
    portraits.add(svg);
  }
  assert.equal(portraits.size, 3);
});

test('champion name persists, ties keep the first champion, a higher score replaces it', () => {
  const g = load();
  g.click('playButton'); eat(g);
  const next = load({ storage: g.storage });
  assert.equal(next.element('bestName').textContent, 'Alex');
  assert.equal(next.element('playerInput').value, 'Alex');
  next.element('playerInput').value = 'Jamie';
  next.click('playButton'); eat(next);
  assert.equal(next.element('bestName').textContent, 'Alex');
  next.engine.food = { x: next.engine.snake[0].x + 1, y: next.engine.snake[0].y };
  next.frame(1000);
  assert.equal(next.element('bestName').textContent, 'Jamie');
  assert.deepEqual(JSON.parse(next.storage.get('snake-club-record-v2')), { score: 2, name: 'Jamie' });
  assert.equal(load({ storage: next.storage }).element('bestName').textContent, 'Jamie');
});

test('legacy scores migrate and invalid records are ignored', () => {
  const legacy = load({ storage: new Map([['snake-club-best-v1', '12']]) });
  assert.equal(legacy.element('best').textContent, '12');
  assert.equal(legacy.element('bestName').textContent, 'Unknown player');
  for (const raw of ['{bad', 'null', '{"score":-2}', '{"score":1.5}', '{"score":"5"}']) {
    assert.equal(load({ storage: new Map([['snake-club-record-v2', raw]]) }).element('best').textContent, '00');
  }
});

test('native music plays without Web Audio, mutes, pauses, resumes and stops on game over', async () => {
  const g = load();
  assert.equal(g.element('music').paused, true);
  g.click('playButton'); await new Promise(setImmediate);
  assert.equal(g.element('music').paused, false);
  assert.equal(g.element('soundLabel').textContent, 'MUSIC PLAYING');
  g.click('soundButton');
  assert.equal(g.element('music').paused, true);
  assert.equal(g.element('soundLabel').textContent, 'MUSIC OFF');
  g.click('soundButton'); await Promise.resolve();
  assert.equal(g.element('music').paused, false);
  g.click('pauseButton');
  assert.equal(g.element('music').paused, true);
  g.click('playButton'); await Promise.resolve();
  assert.equal(g.element('music').paused, false);
  g.engine.snake = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
  for (const time of [0, 200, 400, 600, 800]) g.frame(time);
  assert.equal(g.state(), 'over');
  assert.equal(g.element('music').paused, true);
});

test('test sound works before playing; volume, stop and hidden tabs work', async () => {
  const g = load(); g.click('testSoundButton'); await Promise.resolve();
  assert.equal(g.state(), 'ready');
  assert.equal(g.element('music').paused, false);
  g.element('volumeInput').value = '0.4'; g.element('volumeInput').listeners.input();
  assert.equal(g.element('music').volume, 0.4);
  g.click('testSoundButton');
  assert.equal(g.element('music').paused, true);
  g.click('testSoundButton');
  g.document.hidden = true; g.documentEvents.visibilitychange();
  assert.equal(g.element('music').paused, true);
});

test('blocked media reports a retry instead of falsely claiming sound is on', async () => {
  const g = load({ mediaError: { name: 'NotAllowedError' } });
  g.click('playButton'); await new Promise(setImmediate);
  assert.equal(g.state(), 'playing');
  assert.equal(g.element('soundLabel').textContent, 'RETRY SOUND');
  assert.match(g.element('audioStatus').textContent, /blocked/);
  assert.equal(g.element('soundButton').disabled, false);
});

test('catches chomp and game over plays a distinct descending sound only once', () => {
  const g = load({ audioSupport: true });
  g.click('playButton');
  eat(g);
  assert.equal(g.element('chomp').plays, 2); // Silent priming, then the bite.
  assert.equal(g.element('chomp').muted, false);
  assert.equal(g.element('chomp').currentTime, 0);
  assert.equal(g.audioStats.notes, 0);
  g.engine.snake = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
  g.frame(1000);
  assert.equal(g.state(), 'over');
  assert.equal(g.element('music').paused, true);
  assert.equal(g.audioStats.notes, 3);
  assert.deepEqual(g.audioStats.voices.map((voice) => voice.type),
    ['sawtooth', 'sawtooth', 'sawtooth']);
  assert.ok(g.audioStats.voices[2].stopTime > 0.7);
  g.frame(1200);
  assert.equal(g.audioStats.notes, 3);
  assert.equal(g.audioStats.stopped, 3);
  // Muting also silences any scheduled tail of the game-over effect.
  g.click('soundButton');
  assert.equal(g.audioStats.gains[0].at(-1), 0);
});

test('native chomp plays without Web Audio, can be tested, and reports blocked playback', async () => {
  const g = load();
  g.click('playButton');
  await new Promise(setImmediate);
  assert.equal(g.element('chomp').paused, true);
  eat(g);
  await Promise.resolve();
  assert.equal(g.element('chomp').paused, false);
  assert.equal(g.element('chomp').muted, false);
  g.element('volumeInput').value = '0.4';
  g.element('volumeInput').listeners.input();
  assert.equal(g.element('chomp').volume, 0.4);
  g.click('soundButton');
  assert.equal(g.element('chomp').muted, true);
  g.click('testChompButton');
  assert.equal(g.state(), 'paused');
  assert.equal(g.element('music').paused, true);
  assert.equal(g.element('chomp').muted, false);
  assert.equal(g.element('chomp').plays, 3);
  g.element('chomp').play = () => Promise.reject({ name: 'NotAllowedError' });
  g.click('testChompButton');
  await new Promise(setImmediate);
  assert.match(g.element('audioStatus').textContent, /Chomp could not play/);
});

test('chomp file is a non-silent PCM wave and is wired into the page', () => {
  const wav = readFileSync(join(__dirname, '..', 'assets', 'chomp.wav'));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.readUInt32LE(24), 44100);
  assert.ok(wav.length > 20000);
  let peak = 0;
  for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
  assert.ok(peak >= 29000);
  const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /id="chomp" src="assets\/chomp\.wav"/);
  assert.match(html, /id="testChompButton"/);
});

test('effects follow volume and stay silent when muted or volume is zero', () => {
  for (const muted of [false, true]) {
    const g = load({ audioSupport: true });
    g.click('playButton');
    g.element('volumeInput').value = muted ? '0.4' : '0';
    g.element('volumeInput').listeners.input();
    assert.equal(g.audioStats.gains[0].at(-1), muted ? 0.4 : 0);
    if (muted) g.click('soundButton');
    eat(g);
    assert.equal(g.engine.score, 1);
    g.engine.snake = [{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }, { x: 3, y: 4 }];
    g.frame(1000);
    assert.equal(g.state(), 'over');
    assert.equal(g.audioStats.notes, 0);
    assert.equal(g.element('chomp').plays, 1); // No audible playback after priming.
  }
});

test('catch table, level, speed and next targets update together and reset on replay', () => {
  const g = load();
  assert.equal(g.element('ratCount').textContent, '0');
  assert.equal(g.element('level').textContent, '1');
  g.click('playButton');
  // The next frog completes the first set of 10 of each animal.
  g.engine.score = 29;
  g.engine.eaten = { rat: 10, rabbit: 10, frog: 9 };
  eat(g);
  for (const animal of ['rat', 'rabbit', 'frog']) {
    assert.equal(g.element(`${animal}Count`).textContent, '10');
    assert.equal(g.element(`${animal}Target`).textContent, '20');
  }
  assert.equal(g.element('totalEaten').textContent, '30');
  assert.equal(g.element('level').textContent, '2');
  assert.equal(g.element('levelSpeed').textContent, '1.2×');
  assert.equal(g.element('pace').textContent, '1.2×');
  assert.match(g.element('announcer').textContent, /Level 2/);
  g.click('restartButton');
  assert.equal(g.element('frogCount').textContent, '0');
  assert.equal(g.element('totalEaten').textContent, '0');
  assert.equal(g.element('level').textContent, '1');
  assert.equal(g.element('levelSpeed').textContent, '1.0×');
  assert.equal(g.element('frogTarget').textContent, '10');
});

test('snake friends clap on every catch, settle down, and reset on pause and restart', () => {
  const g = load();
  assert.equal(g.element('snakeFriends').dataset.cheering, 'false');
  g.click('playButton');
  assert.equal(g.element('snakeFriends').dataset.cheering, 'false');
  eat(g);
  assert.equal(g.element('snakeFriends').dataset.cheering, 'true');
  assert.match(g.element('friendMessage').textContent, /Nice catch, Alex/);
  for (const time of [1000, 1200, 1400, 1600, 1800, 2000]) g.frame(time);
  assert.equal(g.element('snakeFriends').dataset.cheering, 'false');
  g.engine.food = { x: (g.engine.snake[0].x + 1) % g.engine.columns, y: g.engine.snake[0].y };
  g.frame(2200);
  assert.equal(g.element('snakeFriends').dataset.cheering, 'true');
  g.click('pauseButton');
  assert.equal(g.element('snakeFriends').dataset.cheering, 'false');
  g.click('restartButton');
  assert.match(g.element('friendMessage').textContent, /rooting/);
});
