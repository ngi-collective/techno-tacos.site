import { SETUP_STEPS } from './simulation.js';

export const KEYS = [
  ['T', 'tunnel on/off'], ['H', 'high tide'], ['L', 'lid'], ['B', 'big or real size'],
  ['F', 'ride with a hatchling'], ['-/+', 'speed'], ['N', 'skip setup'], ['R', 'replay setup'],
];

const SIMULATION_LABEL = 'Simulation, not real data';

// Pure: the words for the current moment.
export const captionFor = ({ phase, step }, mode) => {
  if (phase === 'setup') return `Step ${step + 1} of ${SETUP_STEPS.length}: ${SETUP_STEPS[step]}`;
  if (phase === 'sunset') return 'Sunset: the nest is ready';
  return mode === 'tunnel' ? 'Night: hatchlings follow the guiding lights' : 'No tunnel: hatchlings head for the wrong lights';
};

export const scoreRows = (counts) => [
  ['With tunnel', counts.tunnel],
  ['No tunnel', counts.open],
];

export const boardLines = (counts) => [
  'Hatchlings: ocean / lost / caught',
  ...scoreRows(counts).map(([name, c]) => `${name}: ${c.ocean} / ${c.lost} / ${c.caught}`),
  SIMULATION_LABEL,
];

const setText = (element, text) => { if (element.textContent !== text) element.textContent = text; };

export const createHud = (root) => {
  const caption = root.getElementById('caption');
  const message = root.getElementById('message');
  const score = root.getElementById('score');
  root.getElementById('keys').innerHTML = KEYS.map(([key, label]) => `<b>${key}</b> ${label}`).join(' &nbsp; ') + ' &nbsp; <span id="speed"></span>';

  const speed = root.getElementById('speed');
  let lastScore = '';
  let messageUntil = 0;
  return {
    setCaption: (text) => setText(caption, text),
    showMessage: (text, now, seconds = 5) => {
      setText(message, text);
      messageUntil = now + seconds;
    },
    setSpeed: (rate) => setText(speed, `Speed ${rate}x`),
    tick: (now) => { if (now > messageUntil) setText(message, ''); },
    setScore: (counts) => {
      const key = JSON.stringify(counts);
      if (key === lastScore) return;
      lastScore = key;
      const rows = scoreRows(counts)
        .map(([name, c]) => `<tr><td>${name}</td><td>${c.ocean}</td><td>${c.lost}</td><td>${c.caught}</td></tr>`).join('');
      score.innerHTML = `<table><tr><th>Hatchlings</th><th>Ocean</th><th>Lost</th><th>Caught</th></tr>${rows}</table><small>${SIMULATION_LABEL}</small>`;
    },
  };
};
