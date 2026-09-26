(() => {
  'use strict';

  const coin = document.querySelector('#coin');
  const content = document.querySelector('#content');
  const button = document.querySelector('#flip');
  const result = document.querySelector('#result');
  const sides = document.querySelector('.sides');
  if (!coin || !content || !button || !result || !sides) return;

  // Original PiliApp motion constants and 90-segment 3D coin edge.
  const duration = 9000;
  const reducedMotionDuration = duration;
  const sideCount = 90;
  let rotationY = 0;
  let rotationX = 0;
  let rotationZ = 0;
  let currentMode = 'random';
  let modeReady = false;
  let rolling = false;

  const edgeRules = Array.from({ length: sideCount }, (_, index) => {
    const deg = 360 * index / sideCount;
    return `.side:nth-child(${index + 1}){transform:rotateZ(${deg}deg) rotateY(90deg) translateZ(var(--edge-radius))}`;
  }).join('\n');
  const coinStyle = document.querySelector('#coin-edge-css');
  if (coinStyle) {
    coinStyle.textContent += `\n:root{--edge:calc(var(--radius)*.069799);--edge-radius:calc(var(--radius)*.999391)}\n${edgeRules}\n.heads i{background-image:url('/assets/coin/KRW-heads.png')}\n.tails i{background-image:url('/assets/coin/KRW-tails.png')}\n#coin{transition:transform ${duration}ms cubic-bezier(.2,.2,0,1)}\n@media(prefers-reduced-motion:reduce){#coin{transition-duration:${reducedMotionDuration}ms}}`;
  }
  sides.innerHTML = '<div class="side"></div>'.repeat(sideCount);
  coin.setAttribute('role', 'button');
  coin.setAttribute('tabindex', '0');
  coin.setAttribute('aria-label', '동전 던지기');
  result.setAttribute('role', 'status');
  result.setAttribute('aria-live', 'polite');

  const secureWord = () => {
    if (window.crypto?.getRandomValues) {
      const word = new Uint32Array(1);
      window.crypto.getRandomValues(word);
      return word[0];
    }
    return Math.floor(Math.random() * 0x100000000);
  };
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
  const makeSound = file => {
    const audio = new Audio(`/assets/coin/${file}`);
    audio.volume = 0.3;
    return audio;
  };
  const soundStart = makeSound('snap.mp3');
  const soundEnd = makeSound('pop_cork.mp3');
  const playSound = sound => {
    sound.currentTime = 0;
    sound.play().catch(() => {});
  };

  async function refreshMode() {
    try {
      const response = await fetch('/api/coin-mode', { cache: 'no-store' });
      if (response.ok) {
        const value = (await response.json()).mode;
        currentMode = ['random', 'heads', 'tails'].includes(value) ? value : 'random';
      }
    } catch (_) {
      // Use a normal fair toss if the local setting endpoint is unavailable.
    } finally {
      modeReady = true;
      if (!rolling) button.disabled = false;
    }
  }

  async function toss() {
    if (button.disabled || rolling || !modeReady) return;
    rolling = true;
    button.disabled = true;
    const mode = currentMode;

    // Match the original: reset CSS transition, then start the flip immediately
    // from the click; never wait on a network request before motion or sound.
    content.classList.remove('flipped', 'demo');
    content.classList.add('stop');
    void getComputedStyle(coin).transform;
    content.classList.remove('stop');
    content.classList.add('flipping');
    void getComputedStyle(coin).transform;
    playSound(soundStart);

    const previousParity = Math.round(Math.abs(rotationY) / 180) % 2;
    const targetParity = mode === 'heads' ? 0 : mode === 'tails' ? 1 : randomInt(2);
    const sideOffset = ((targetParity - previousParity + 2) % 2) * 180;
    const fullSpins = 2 + randomInt(2);
    rotationX += 360 * randomSign();
    rotationY += sideOffset + 360 * fullSpins * randomSign();
    // PiliApp's original keeps the Z-axis angle stable.
    coin.style.transform = `rotateX(${rotationX}deg) rotateY(${rotationY}deg) rotateZ(${rotationZ}deg)`;
    const heads = Math.abs(rotationY / 180) % 2 === 0;

    window.setTimeout(() => {
      result.textContent = heads ? '앞면' : '뒷면';
      coin.classList.remove('rst-heads', 'rst-tails');
      coin.classList.add(heads ? 'rst-heads' : 'rst-tails');
      content.classList.remove('flipping');
      content.classList.add('flipped');
      playSound(soundEnd);
      rolling = false;
      button.disabled = false;
      button.focus({ preventScroll: true });
      // Refresh in the background so admin changes affect the next toss.
      refreshMode();
    }, duration);
  }

  button.disabled = true;
  refreshMode();
  button.addEventListener('click', toss);
  coin.addEventListener('click', toss);
  coin.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toss();
    }
  });
})();
