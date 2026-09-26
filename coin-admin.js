(() => {
  'use strict';

  const openButton = document.querySelector('#coin-admin-open');
  const panel = document.querySelector('#coin-admin-panel');
  const closeButton = document.querySelector('#coin-admin-close');
  const loginForm = document.querySelector('#coin-admin-login');
  const passwordInput = document.querySelector('#coin-admin-password');
  const controls = document.querySelector('#coin-admin-controls');
  const saveButton = document.querySelector('#coin-admin-save');
  const logoutButton = document.querySelector('#coin-admin-logout');
  const notice = document.querySelector('#coin-mode-notice');
  const loginMessage = document.querySelector('#coin-admin-login-message');
  const message = document.querySelector('#coin-admin-message');
  const diceTarget = document.querySelector('#dice-target-sum');
  const diceSaveButton = document.querySelector('#dice-settings-save');
  const diceMessage = document.querySelector('#dice-settings-message');
  const modeLabels = { random: '무작위', heads: '항상 앞면', tails: '항상 뒷면' };
  if (!panel || !loginForm || !controls) return;

  const setMessage = (text, kind = '') => {
    message.textContent = text;
    message.dataset.error = String(kind === 'error');
    message.dataset.success = String(kind === 'success');
  };
  const setLoginMessage = (text, kind = '') => {
    if (!loginMessage) return;
    loginMessage.textContent = text;
    loginMessage.dataset.error = String(kind === 'error');
    loginMessage.dataset.success = String(kind === 'success');
  };
  const setDiceMessage = (text, kind = '') => {
    if (!diceMessage) return;
    diceMessage.textContent = text;
    diceMessage.dataset.error = String(kind === 'error');
    diceMessage.dataset.success = String(kind === 'success');
  };
  const showDiceTarget = targetSum => {
    if (diceTarget) diceTarget.value = targetSum == null ? 'random' : String(targetSum);
  };
  const request = async (url, body) => {
    const options = { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', headers: {} };
    if (body) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
    return data;
  };
  const showMode = mode => {
    const label = modeLabels[mode] || modeLabels.random;
    notice.textContent = mode === 'random' ? `현재 모드: ${label}` : `관리자가 지정한 모드: ${label}`;
    const selected = document.querySelector(`#coin-admin-modes input[value="${mode}"]`);
    if (selected) selected.checked = true;
  };
  const setAuthenticated = (authenticated, mode) => {
    loginForm.hidden = authenticated;
    controls.hidden = !authenticated;
    if (openButton) openButton.textContent = authenticated ? '관리자 설정 열기' : '관리자 로그인';
    if (mode) showMode(mode);
  };

  async function refreshStatus() {
    try {
      const status = await request('/api/admin/status');
      setAuthenticated(status.authenticated, status.mode);
      showDiceTarget(status.dice_target_sum);
    } catch (_) {
      notice.textContent = '관리자 모드 상태를 불러오지 못했습니다.';
    }
  }
  openButton?.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    openButton.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden && loginForm.hidden) document.querySelector('#coin-admin-modes input:checked')?.focus();
    else if (!panel.hidden) passwordInput.focus();
  });
  closeButton?.addEventListener('click', () => {
    panel.hidden = true;
    openButton?.setAttribute('aria-expanded', 'false');
    openButton?.focus();
  });
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const submit = loginForm.querySelector('button[type="submit"]');
    submit.disabled = true;
    setLoginMessage('로그인 확인 중…');
    try {
      const data = await request('/api/admin/login', { password: passwordInput.value });
      passwordInput.value = '';
      setLoginMessage('');
      setAuthenticated(true, data.mode);
      showDiceTarget(data.dice_target_sum);
      setMessage('관리자로 로그인했습니다. 이 브라우저 세션은 8시간 후 만료됩니다.', 'success');
    } catch (error) {
      setLoginMessage(error.message, 'error');
      passwordInput.select();
    } finally {
      submit.disabled = false;
    }
  });
  saveButton.addEventListener('click', async () => {
    const mode = document.querySelector('#coin-admin-modes input:checked')?.value;
    if (!mode) return;
    saveButton.disabled = true;
    setMessage('설정 저장 중…');
    try {
      const data = await request('/api/admin/mode', { mode });
      showMode(data.mode);
      setMessage(`저장 완료: ${modeLabels[data.mode]}. 이 설정은 모든 방문자에게 적용됩니다.`, 'success');
    } catch (error) {
      if (error.message.includes('로그인')) setAuthenticated(false);
      setMessage(error.message, 'error');
    } finally {
      saveButton.disabled = false;
    }
  });
  logoutButton.addEventListener('click', async () => {
    try {
      await request('/api/admin/logout', {});
      setAuthenticated(false);
      setMessage('로그아웃했습니다.');
    } catch (error) {
      setMessage(error.message, 'error');
    }
  });
  diceSaveButton?.addEventListener('click', async () => {
    if (!diceTarget) return;
    const targetSum = diceTarget.value === 'random' ? null : Number(diceTarget.value);
    diceSaveButton.disabled = true;
    setDiceMessage('주사위 설정 저장 중…');
    try {
      const data = await request('/api/admin/dice-settings', { target_sum: targetSum });
      showDiceTarget(data.target_sum);
      const label = data.target_sum == null ? '무작위 합계' : `합계 ${data.target_sum}`;
      setDiceMessage(`저장 완료: ${label}. 동전과 별도로 모든 주사위 방문자에게 적용됩니다.`, 'success');
    } catch (error) {
      if (error.message.includes('로그인')) setAuthenticated(false);
      setDiceMessage(error.message, 'error');
    } finally {
      diceSaveButton.disabled = false;
    }
  });
  refreshStatus();
})();
