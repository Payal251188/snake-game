/* Read-only round goals and medals. No timers, randomness, storage or DOM access. */
(function (root) {
  'use strict';
  const goals = Object.freeze([
    Object.freeze({ id: 'balanced', title: 'Balanced diet', description: 'Catch one rat, one rabbit and one frog.', target: 3 }),
    Object.freeze({ id: 'survivor', title: 'Survivor', description: 'Stay alive for 60 active seconds.', target: 60 }),
    Object.freeze({ id: 'combo', title: 'Catch rhythm', description: 'Build a 3-animal catch chain.', target: 3 }),
  ]);
  function goalFor(round = 1) {
    const index = Number.isSafeInteger(round) && round > 0 ? (round - 1) % goals.length : 0;
    return goals[index];
  }
  function goalProgress(player, goal) {
    const value = goal.id === 'balanced' ? Object.values(player.eaten).filter((count) => count > 0).length
      : goal.id === 'survivor' ? Math.floor((player.survivedMs || 0) / 1000) : player.bestCombo || 0;
    return { value: Math.min(value, goal.target), target: goal.target, complete: value >= goal.target };
  }
  function medals(player, newRecord = false) {
    if (player.ai) return [];
    const result = [];
    if (Object.values(player.eaten).every((count) => count > 0)) result.push('🥗 Balanced diet');
    if (player.survivedMs >= 60000) result.push('⏱ Survivor');
    if (player.shieldSaves > 0) result.push('🛡 Shield save');
    if (player.bestCombo >= 3) result.push('🎵 Catch rhythm');
    if (newRecord) result.push('🏆 New record');
    return result;
  }
  function timeLabel(milliseconds) {
    const seconds = Math.max(0, Math.floor((Number.isFinite(milliseconds) ? milliseconds : 0) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }
  function summary(player, { goal = goals[0], newRecord = false } = {}) {
    return {
      score: player.score, time: timeLabel(player.survivedMs),
      animals: Object.values(player.eaten).reduce((sum, count) => sum + count, 0),
      eaten: { ...player.eaten }, bestCombo: player.bestCombo || 0, comboBonus: player.comboBonus || 0,
      medals: medals(player, newRecord), goal: { ...goal, ...goalProgress(player, goal) },
    };
  }
  const SnakeRewards = Object.freeze({ goalFor, goalProgress, medals, timeLabel, summary });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeRewards };
  else root.SnakeRewards = SnakeRewards;
})(typeof globalThis !== 'undefined' ? globalThis : this);
