/* Kagura Auth UI V4 - development module */
(() => {
  'use strict';

  function ensureStyle() {
    if (document.getElementById('kagura-auth-v4-style')) return;
    const style = document.createElement('style');
    style.id = 'kagura-auth-v4-style';
    style.textContent = `
      .kagura-auth-v4{border:1px solid #d7e1de;border-radius:9px;padding:9px;margin:8px 0;background:#f8fafc;color:#182230;font:12px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}
      .kagura-auth-v4-row{display:flex;align-items:center;gap:7px;margin:6px 0}
      .kagura-auth-v4-label{width:52px;flex:0 0 52px;color:#667085}
      .kagura-auth-v4-input{flex:1;min-width:0;padding:7px 8px;border:1px solid #cfd8df;border-radius:7px;background:#fff;color:#182230}
      .kagura-auth-v4-status{flex:1;font-weight:700;color:#08785e;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .kagura-auth-v4-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:7px}
      .kagura-auth-v4-button{border:0;border-radius:7px;padding:7px 11px;cursor:pointer;font-weight:700;background:#10a37f;color:#fff}
      .kagura-auth-v4-button.secondary{background:#eef2f6;color:#344054}
      .kagura-auth-v4-button:disabled{opacity:.55;cursor:not-allowed}
      .kagura-auth-v4-message{margin-top:6px;min-height:17px;color:#b42318;word-break:break-word}
    `;
    document.documentElement.appendChild(style);
  }

  function mount(container, options = {}) {
    if (!container) throw new Error('KaguraAuthUI mount container missing');
    const auth = globalThis.KaguraAuth;
    if (!auth) throw new Error('KaguraAuth module missing');
    ensureStyle();

    const fieldNonce = (() => {
      try {
        return crypto.randomUUID();
      } catch (_) {
        return Math.random().toString(36).slice(2) + Date.now().toString(36);
      }
    })();

    const root = document.createElement('section');
    root.className = 'kagura-auth-v4';
    root.innerHTML = `
      <div data-role="guest">
        <div class="kagura-auth-v4-row"><span class="kagura-auth-v4-label">账号</span><input class="kagura-auth-v4-input" data-role="username" name="kagura-user-${fieldNonce}" autocomplete="off" autocapitalize="off" spellcheck="false" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other"></div>
        <div class="kagura-auth-v4-row"><span class="kagura-auth-v4-label">密码</span><input class="kagura-auth-v4-input" data-role="password" name="kagura-secret-${fieldNonce}" type="password" autocomplete="new-password" autocapitalize="off" spellcheck="false" readonly data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other"></div>
        <div class="kagura-auth-v4-actions"><button type="button" class="kagura-auth-v4-button" data-role="login">登录</button></div>
      </div>
      <div data-role="member" hidden>
        <div class="kagura-auth-v4-row"><span class="kagura-auth-v4-label">账号</span><span class="kagura-auth-v4-status" data-role="member-name">-</span></div>
        <div class="kagura-auth-v4-row"><span class="kagura-auth-v4-label">状态</span><span class="kagura-auth-v4-status">已授权</span></div>
        <div class="kagura-auth-v4-actions"><button type="button" class="kagura-auth-v4-button secondary" data-role="logout">退出登录</button></div>
      </div>
      <div class="kagura-auth-v4-message" data-role="message"></div>`;

    container.prepend(root);

    const guest = root.querySelector('[data-role="guest"]');
    const member = root.querySelector('[data-role="member"]');
    const usernameInput = root.querySelector('[data-role="username"]');
    const passwordInput = root.querySelector('[data-role="password"]');
    const memberName = root.querySelector('[data-role="member-name"]');
    const loginButton = root.querySelector('[data-role="login"]');
    const logoutButton = root.querySelector('[data-role="logout"]');
    const message = root.querySelector('[data-role="message"]');

    let busy = false;

    function setBusy(next) {
      busy = Boolean(next);
      loginButton.disabled = busy;
      logoutButton.disabled = busy;
    }

    function resetPasswordField() {
      passwordInput.value = '';
      passwordInput.readOnly = true;
    }

    function render(state = auth.getPublicState()) {
      guest.hidden = state.authenticated;
      member.hidden = !state.authenticated;
      memberName.textContent = state.username || '-';
      if (!state.authenticated && !busy) message.textContent = '';
      if (state.authenticated) resetPasswordField();
    }

    function allowPasswordPaste(event) {
      const text = event.clipboardData?.getData('text');
      if (typeof text !== 'string') return;

      event.preventDefault();
      passwordInput.readOnly = false;

      const start = Number.isInteger(passwordInput.selectionStart) ? passwordInput.selectionStart : passwordInput.value.length;
      const end = Number.isInteger(passwordInput.selectionEnd) ? passwordInput.selectionEnd : passwordInput.value.length;
      try {
        passwordInput.setRangeText(text, start, end, 'end');
      } catch (_) {
        passwordInput.value = passwordInput.value.slice(0, start) + text + passwordInput.value.slice(end);
      }
      message.textContent = '';
      passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
    }

    function blockPasswordCopy(event) {
      event.preventDefault();
      event.stopPropagation();
      message.textContent = '密码内容不可复制';
    }

    async function handleLogin() {
      if (busy) return;
      setBusy(true);
      message.textContent = '正在验证…';
      try {
        await auth.login(usernameInput.value, passwordInput.value);
        resetPasswordField();
        message.textContent = '';
        render();
        options.onAuthorized?.(auth.getPublicState());
      } catch (error) {
        resetPasswordField();
        message.textContent = auth.userMessage(error);
        options.onUnauthorized?.(error);
      } finally {
        setBusy(false);
      }
    }

    async function handleLogout() {
      if (busy) return;
      setBusy(true);
      message.textContent = '正在退出…';
      try {
        await auth.logout();
        resetPasswordField();
        message.textContent = '';
        render();
        options.onUnauthorized?.({ code: 'LOGOUT' });
      } finally {
        setBusy(false);
      }
    }

    loginButton.addEventListener('click', handleLogin);
    logoutButton.addEventListener('click', handleLogout);

    passwordInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        handleLogin();
        return;
      }

      const permitsManualEditing = event.key?.length === 1 || ['Backspace', 'Delete'].includes(event.key);
      if (permitsManualEditing && passwordInput.readOnly) passwordInput.readOnly = false;
    });

    // Allow pasting into the password field, including Ctrl/Cmd+V and context-menu paste.
    passwordInput.addEventListener('paste', allowPasswordPaste);

    // Do not allow the password value to be copied or cut back out of the field.
    passwordInput.addEventListener('copy', blockPasswordCopy);
    passwordInput.addEventListener('cut', blockPasswordCopy);

    passwordInput.addEventListener('blur', () => {
      passwordInput.readOnly = true;
    });
    passwordInput.addEventListener('input', () => {
      if (passwordInput.readOnly && passwordInput.value) passwordInput.value = '';
    });

    // Browsers/password managers sometimes attempt delayed autofill after mount.
    // Clear only while the field is still readonly, so genuine keyboard entry or paste is never erased.
    [0, 100, 500, 1500].forEach(delay => {
      setTimeout(() => {
        if (passwordInput.readOnly && passwordInput.value) passwordInput.value = '';
      }, delay);
    });

    const unsubscribe = auth.onChange(render);
    render();

    if (auth.getPublicState().authenticated) {
      auth.me({ force: true }).then(render).catch(error => {
        render();
        message.textContent = '';
        options.onUnauthorized?.(error);
      });
    }

    return {
      root,
      render,
      destroy() {
        unsubscribe();
        root.remove();
      },
    };
  }

  globalThis.KaguraAuthUI = Object.freeze({ mount });
})();
