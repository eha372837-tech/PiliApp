(() => {
  'use strict';
  const template = document.querySelector('#cube-template');
  const diceArea = document.querySelector('#cubes-wrapper');
  const countSelect = document.querySelector('#num');
  const rollButton = document.querySelector('#roll');
  const totalLine = document.querySelector('#dice-total');
  if (!template || !diceArea || !countSelect || !rollButton) return;

  // Original PiliApp face orientations, with its 4-second CSS transform roll.
  const faceRotation = [null, [5, -5, 0], [5, -95, 0], [-85, 0, -5], [95, 0, 5], [5, 85, 0], [5, -185, 0]];
  const soundStart = new Audio('/assets/dice/click-1.mp3');
  const soundEnd = new Audio('/assets/dice/click-2.mp3');
  let targetSum = null;
  let rolling = false;
  let diceNodes = [];

  const randomInt = maxExclusive => {
    if (maxExclusive <= 1) return 0;
    if (window.crypto?.getRandomValues) {
      const limit = Math.floor(0x100000000 / maxExclusive) * maxExclusive;
      const word = new Uint32Array(1);
      do { window.crypto.getRandomValues(word); } while (word[0] >= limit);
      return word[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  };
  const randomSign = () => randomInt(2) ? 1 : -1;
  function validCount(value) {
    const number = Number(value);
    return Number.isInteger(number) && number >= 1 && number <= 6 ? number : 1;
  }
  function renderDice(count) {
    diceArea.replaceChildren();
    diceNodes = [];
    diceArea.className = `row dice-count-${count}`;
    for (let i = 0; i < count; i++) {
      const column = document.createElement('div');
      column.className = 'cube-column';
      const wrapper = document.createElement('div');
      wrapper.className = 'cube-wrapper';
      wrapper.setAttribute('role', 'img');
      wrapper.setAttribute('aria-label', `주사위 ${i + 1}`);
      const cube = template.content.firstElementChild.cloneNode(true);
      cube.dataset.spinX = '0';
      cube.dataset.spinY = '0';
      cube.dataset.value = '1';
      wrapper.append(cube);
      column.append(wrapper);
      diceArea.append(column);
      diceNodes.push({ cube, wrapper });
      wrapper.addEventListener('click', () => roll(false));
    }
  }
  function closestFeasibleCount(selected, sum) {
    const min = Math.ceil(sum / 6);
    const max = Math.min(sum, 6);
    return Math.max(min, Math.min(max, selected));
  }
  function randomFaces(count, sum) {
    if (sum == null) return Array.from({ length: count }, () => randomInt(6) + 1);
    const results = [];
    const visit = (remainingDice, remainingSum, prefix) => {
      if (remainingDice === 0) {
        if (remainingSum === 0) results.push(prefix);
        return;
      }
      const low = Math.max(1, remainingSum - (remainingDice - 1) * 6);
      const high = Math.min(6, remainingSum - (remainingDice - 1));
      for (let face = low; face <= high; face++) visit(remainingDice - 1, remainingSum - face, [...prefix, face]);
    };
    visit(count, sum, []);
    return results[randomInt(results.length)] || Array(count).fill(1);
  }
  async function readTargetSum() {
    try {
      const response = await fetch('/api/dice-settings', { cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) throw new Error('settings unavailable');
      const data = await response.json();
      targetSum = Number.isInteger(data.target_sum) && data.target_sum >= 1 && data.target_sum <= 36 ? data.target_sum : null;
    } catch (_) {
      targetSum = null;
    }
  }
  function spinCube(die, face) {
    const cube = die.cube;
    const base = faceRotation[face];
    const spinX = Number(cube.dataset.spinX) + 360 * (1 + randomInt(2)) * randomSign();
    const spinY = Number(cube.dataset.spinY) + 360 * (4 + randomInt(3)) * randomSign();
    cube.dataset.spinX = String(spinX);
    cube.dataset.spinY = String(spinY);
    cube.dataset.value = String(face);
    cube.style.transform = `rotateX(${base[0] + spinX}deg) rotateY(${base[1] + spinY}deg) rotateZ(${base[2]}deg)`;
  }
  async function roll(isInitialRoll = false) {
    if (rolling) return;
    rolling = true;
    rollButton.disabled = true;
    document.documentElement.classList.remove('dice-loaded');
    if (totalLine) totalLine.textContent = '';
    await readTargetSum();
    const requestedCount = validCount(countSelect.value);
    const count = targetSum == null ? requestedCount : closestFeasibleCount(requestedCount, targetSum);
    if (countSelect.value !== String(count)) {
      countSelect.value = String(count);
      const url = new URL(location.href);
      url.searchParams.set('num', String(count));
      history.replaceState(null, '', url);
    }
    if (diceNodes.length !== count) renderDice(count);
    const faces = randomFaces(count, targetSum);
    if (!isInitialRoll) {
      soundStart.currentTime = 0;
      soundStart.play().catch(() => {});
    }
    for (const [index, die] of diceNodes.entries()) {
      die.wrapper.setAttribute('aria-label', `주사위 ${index + 1}: ${faces[index]}`);
      spinCube(die, faces[index]);
    }
    window.setTimeout(() => {
      const sum = faces.reduce((total, face) => total + face, 0);
      if (totalLine) {
        totalLine.textContent = `${faces.join(' + ')} = ${sum}`;
        totalLine.dataset.sum = String(sum);
      }
      if (!isInitialRoll) {
        soundEnd.currentTime = 0;
        soundEnd.play().catch(() => {});
      }
      document.documentElement.classList.add('dice-loaded');
      rollButton.disabled = false;
      rolling = false;
    }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 200 : 4000);
  }

  const queryCount = new URLSearchParams(location.search).get('num') || '1';
  countSelect.value = String(validCount(queryCount));
  renderDice(validCount(countSelect.value));
  countSelect.addEventListener('change', () => {
    const url = new URL(location.href);
    url.searchParams.set('num', String(validCount(countSelect.value)));
    location.assign(url);
  });
  rollButton.addEventListener('click', () => roll(false));
  window.setTimeout(() => roll(true), 40);
})();
