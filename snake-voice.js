/* Optional browser speech for break alerts. No network or generated audio assets. */
(function (root) {
  'use strict';
  function create({ synthesis = root.speechSynthesis, Utterance = root.SpeechSynthesisUtterance } = {}) {
    let current = null;
    const available = Boolean(synthesis && Utterance);
    function cancel() {
      if (current && synthesis) { synthesis.cancel(); current = null; }
    }
    return Object.freeze({
      available,
      cancel,
      speak(text, volume = 0.75) {
        if (!available || !Number.isFinite(volume) || volume <= 0) return false;
        try {
          cancel();
          const utterance = new Utterance(text);
          const voices = synthesis.getVoices?.() || [];
          utterance.voice = voices.find((voice) => /^en/i.test(voice.lang) && /\b(david|daniel|george|alex|fred|male)\b/i.test(voice.name))
            || voices.find((voice) => /^en/i.test(voice.lang)) || null;
          utterance.lang = utterance.voice?.lang || 'en-US';
          utterance.pitch = 0.55;
          utterance.rate = 0.82;
          utterance.volume = Math.min(1, volume);
          utterance.onend = utterance.onerror = () => { if (current === utterance) current = null; };
          current = utterance;
          synthesis.speak(utterance);
          return true;
        } catch { current = null; return false; }
      },
    });
  }
  const SnakeVoice = Object.freeze({ create });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeVoice };
  else root.SnakeVoice = SnakeVoice;
})(typeof globalThis !== 'undefined' ? globalThis : this);
