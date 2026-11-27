/* Continuous foreground-play reminders, independent of simulation pace and score. */
(function (root) {
  'use strict';
  function normalize(value = {}) {
    return { enabled: value?.enabled === true, minutes: Number.isInteger(value?.minutes) && value.minutes >= 1 && value.minutes <= 60 ? value.minutes : 2 };
  }
  function create(value) {
    let settings = normalize(value);
    let continuousMs = 0;
    return Object.freeze({
      get settings() { return { ...settings }; },
      get continuousMs() { return continuousMs; },
      configure(value) { settings = normalize(value); continuousMs = 0; },
      reset() { continuousMs = 0; },
      advance(milliseconds) {
        if (!settings.enabled) { continuousMs = 0; return false; }
        if (Number.isFinite(milliseconds) && milliseconds > 0) continuousMs += milliseconds;
        if (continuousMs < settings.minutes * 60000) return false;
        continuousMs = 0;
        return true;
      },
    });
  }
  const SnakeBreaks = Object.freeze({ create, normalize });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeBreaks };
  else root.SnakeBreaks = SnakeBreaks;
})(typeof globalThis !== 'undefined' ? globalThis : this);
