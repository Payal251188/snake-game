/* Cosmetic definitions only: skins never change simulation state or actor identity. */
(function (root) {
  'use strict';
  const details = {
    mark: '#354a2eaa', scales: '#d4d8a35e', flank: '#d4d3a16b', outline: '#293f2b',
    jaw: '#e0d9a1', eye: '#d6af48', pupil: '#101f15', glint: '#fff6d2',
    nostril: '#293d26', headMark: '#546638', tongue: '#df817b',
  };
  const define = (id, name, description, pattern, palette) => Object.freeze({
    id, name, description, pattern, palette: Object.freeze({ ...details, ...palette }),
  });
  const classic = define('classic', 'Classic Olive', 'The original shaded olive snake with fine scales.', 'scales', {
    label: '#b5f4cc', body: '#71a65c', shadow: '#263d27', low: '#759250', light: '#a7b975',
    mid: '#6f8947', edge: '#334c2e', headShadow: '#405332', headLight: '#b3bd7b', headMid: '#6e7e46',
  });
  const catalog = Object.freeze({
    classic,
    neon: define('neon', 'Neon Circuit', 'Bright lime with dark circuit-like bands.', 'bands', {
      label: '#d4ff56', body: '#a1c936', shadow: '#344619', low: '#719829', light: '#e1ff82',
      mid: '#9dc832', edge: '#425b1e', headShadow: '#678526', headLight: '#e5ff9d', headMid: '#96bd39',
      mark: '#344619', scales: '#eaffb1', flank: '#d5ff79', headMark: '#536c20',
    }),
    ember: define('ember', 'Ember Viper', 'Warm coral with dark ember spots.', 'spots', {
      label: '#ff9d8a', body: '#d86756', shadow: '#6b2829', low: '#b54b3e', light: '#ffb8a0',
      mid: '#db7059', edge: '#783332', headShadow: '#a33f35', headLight: '#ffd0b4', headMid: '#ce624b',
      mark: '#7b3035', scales: '#ffd8c0', flank: '#ffb294', headMark: '#943e35', jaw: '#ffe1c2',
    }),
    frost: define('frost', 'Frost Pearl', 'Smooth pearl-white scales with cool silver shading.', 'plain', {
      label: '#edf7ff', body: '#b4d2df', shadow: '#465d73', low: '#8caabc', light: '#f4fbff',
      mid: '#b8d3df', edge: '#5b768a', headShadow: '#7794a8', headLight: '#ffffff', headMid: '#bad3e1',
      mark: '#6f90a5', scales: '#ffffff', flank: '#e6f6ff', outline: '#4b687c',
      jaw: '#edfaff', eye: '#83cce2', headMark: '#6d899b', nostril: '#465e73',
    }),
  });
  // Preserve existing local-player-two and AI colors, regardless of the selected skin.
  const opponents = Object.freeze([
    define('opponent-orange', 'Orange', '', 'scales', {
      label: '#f8b487', body: '#d29052', shadow: '#704024', low: '#c87c42', light: '#ffd29a',
      mid: '#d29052', edge: '#754a2e', headShadow: '#99532b', headLight: '#ffd29a', headMid: '#d29052',
    }),
    define('opponent-cyan', 'Cyan', '', 'scales', {
      label: '#83d9f2', body: '#479ebc', shadow: '#204555', low: '#438ca6', light: '#a1e8fa',
      mid: '#4d9db7', edge: '#275263', headShadow: '#32677c', headLight: '#a1e8fa', headMid: '#4d9db7',
    }),
    define('opponent-purple', 'Purple', '', 'scales', {
      label: '#d3b0ff', body: '#9c72c6', shadow: '#47305d', low: '#9363b2', light: '#dfbcff',
      mid: '#aa80cb', edge: '#553b70', headShadow: '#70468f', headLight: '#dfbcff', headMid: '#aa80cb',
    }),
  ]);
  const has = (id) => typeof id === 'string' && Object.hasOwn(catalog, id);
  const get = (id) => has(id) ? catalog[id] : classic;
  const forPlayer = (index, selected) => index === 0 ? get(selected) : opponents[index - 1] || opponents[0];
  const SnakeSkins = Object.freeze({ catalog, has, get, forPlayer });
  if (typeof module !== 'undefined' && module.exports) module.exports = { SnakeSkins };
  else root.SnakeSkins = SnakeSkins;
})(typeof globalThis !== 'undefined' ? globalThis : this);
