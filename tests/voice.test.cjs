const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SnakeVoice } = require('../snake-voice.js');

test('spoken break alerts prefer a suitable voice and use a low pitch and measured pace', () => {
  const spoken = []; let cancelled = 0;
  class Utterance { constructor(text) { this.text = text; } }
  const synthesis = { getVoices: () => [{ name: 'Female English', lang: 'en-US' }, { name: 'Microsoft David', lang: 'en-US' }], speak: (utterance) => spoken.push(utterance), cancel: () => { cancelled++; } };
  const voice = SnakeVoice.create({ synthesis, Utterance });
  assert.equal(voice.speak('10', 0.6), true);
  assert.equal(spoken[0].voice.name, 'Microsoft David');
  assert.equal(spoken[0].pitch, 0.55);
  assert.equal(spoken[0].rate, 0.82);
  assert.equal(spoken[0].volume, 0.6);
  voice.speak('9');
  assert.equal(cancelled, 1, 'numbers do not build up into a stale speech queue');
  voice.cancel();
  assert.equal(cancelled, 2);
  voice.cancel();
  assert.equal(cancelled, 2, 'does not cancel speech owned by other features');
});

test('missing browser speech, mute and speech failures never interrupt gameplay', () => {
  assert.equal(SnakeVoice.create({ synthesis: null, Utterance: null }).speak('10'), false);
  class Utterance {}
  let calls = 0;
  const voice = SnakeVoice.create({ Utterance, synthesis: { speak() { calls++; throw Error('Unavailable'); }, cancel() {}, getVoices: () => [] } });
  assert.equal(voice.speak('10', 0), false);
  assert.equal(calls, 0);
  assert.equal(voice.speak('10', 1), false);
  assert.equal(calls, 1);
});
