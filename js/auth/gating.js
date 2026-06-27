/*
  gating.js — system locking for estimator.
  Auth is handled by firebase-init.js (loaded after this script).
  This file sets window._onAuthUser so firebase-init.js calls us back.
*/
(function () {
  var FREE_SYSTEMS = {
    'rate-limiter':      true,
    'url-shortener':     true,
    'distributed-cache': true,
    'message-queue':     true,
  };

  var STRIPE_PAYMENT_LINK = 'https://buy.stripe.com/REPLACE_WITH_YOUR_LINK';

  window.SS = window.SS || {};
  var SS = window.SS;
  SS._auth = { user: null, hasPaid: false, loaded: false };

  /* Helper: get Firebase helpers from shared init */
  function fb() { return window.SS_FIREBASE || null; }

  /* ── Lock modal HTML ──────────────────────────────────────── */
  var modalHtml = [
    '<div id="lock-overlay" style="display:none;position:fixed;inset:0;z-index:300;',
    'background:rgba(0,0,0,0.7);backdrop-filter:blur(10px);',
    'align-items:center;justify-content:center;padding:24px;" ',
    'onclick="SS.closeLockModal(event)">',
    '<div style="background:#0D1A20;border:1px solid rgba(43,160,126,0.3);border-radius:24px;',
    'padding:44px 40px;max-width:440px;width:100%;text-align:center;position:relative;',
    'box-shadow:0 40px 80px rgba(0,0,0,0.6);">',
    '<button onclick="SS.closeLockModal()" style="position:absolute;top:14px;right:14px;',
    'background:none;border:none;color:rgba(255,255,255,0.4);font-size:20px;cursor:pointer;',
    'width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;">✕</button>',
    '<div style="font-size:44px;margin-bottom:16px;">🔒</div>',
    '<div id="lock-system-name" style="font-family:JetBrains Mono,monospace;font-size:11px;',
    'font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#2BA07E;margin-bottom:12px;"></div>',
    '<h2 style="font-size:24px;font-weight:800;color:#F0F8F4;letter-spacing:-.5px;margin-bottom:10px;">',
    'Pro system</h2>',
    '<p style="font-size:14px;color:#7DA898;line-height:1.7;margin-bottom:28px;">',
    'This system is part of the Lifetime Access plan. Get all 12 pro systems, ',
    'reasoning cards, failure mode chains, and everything we add in the future.</p>',
    '<div style="background:rgba(43,160,126,0.06);border:1px solid rgba(43,160,126,0.18);',
    'border-radius:12px;padding:16px 20px;margin-bottom:24px;text-align:left;">',
    '<div style="display:flex;flex-direction:column;gap:8px;">',
    '<div style="font-size:13px;color:#C0D4CC;display:flex;align-items:center;gap:8px;">',
    '<span style="color:#2BA07E;font-weight:700;">✓</span> All 16 systems (4 free + 12 pro)</div>',
    '<div style="font-size:13px;color:#C0D4CC;display:flex;align-items:center;gap:8px;">',
    '<span style="color:#2BA07E;font-weight:700;">✓</span> 48 reasoning cards + 48 failure mode chains</div>',
    '<div style="font-size:13px;color:#C0D4CC;display:flex;align-items:center;gap:8px;">',
    '<span style="color:#2BA07E;font-weight:700;">✓</span> One-time $49 · lifetime access</div>',
    '</div></div>',
    '<div id="lock-auth-panel">',
    '<div id="lock-signup-form">',
    '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">',
    '<input id="lock-email" type="email" placeholder="Your email" ',
    'style="padding:12px 16px;border-radius:10px;background:rgba(255,255,255,0.06);',
    'border:1px solid rgba(255,255,255,0.12);color:#E0EDE8;font-size:14px;font-family:inherit;',
    'outline:none;width:100%;" />',
    '<input id="lock-pass" type="password" placeholder="Choose a password (min 6 chars)" ',
    'style="padding:12px 16px;border-radius:10px;background:rgba(255,255,255,0.06);',
    'border:1px solid rgba(255,255,255,0.12);color:#E0EDE8;font-size:14px;font-family:inherit;',
    'outline:none;width:100%;" />',
    '</div>',
    '<button onclick="SS.lockModalPurchase()" ',
    'style="width:100%;padding:15px;border-radius:12px;font-size:15px;font-weight:700;',
    'background:linear-gradient(135deg,#2BA07E,#3DC298);color:white;border:none;cursor:pointer;',
    'font-family:inherit;margin-bottom:10px;">',
    'Create account &amp; Get Access · $49 →</button>',
    '<p style="font-size:12px;color:#7DA898;">Already have an account? ',
    '<span onclick="SS.switchLockToLogin()" ',
    'style="color:#3DC298;cursor:pointer;font-weight:600;">Sign in →</span></p>',
    '</div>',
    '<div id="lock-login-form" style="display:none;">',
    '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">',
    '<input id="lock-login-email" type="email" placeholder="Your email" ',
    'style="padding:12px 16px;border-radius:10px;background:rgba(255,255,255,0.06);',
    'border:1px solid rgba(255,255,255,0.12);color:#E0EDE8;font-size:14px;font-family:inherit;',
    'outline:none;width:100%;" />',
    '<input id="lock-login-pass" type="password" placeholder="Password" ',
    'style="padding:12px 16px;border-radius:10px;background:rgba(255,255,255,0.06);',
    'border:1px solid rgba(255,255,255,0.12);color:#E0EDE8;font-size:14px;font-family:inherit;',
    'outline:none;width:100%;" />',
    '</div>',
    '<button onclick="SS.lockModalLogin()" ',
    'style="width:100%;padding:15px;border-radius:12px;font-size:15px;font-weight:700;',
    'background:linear-gradient(135deg,#2BA07E,#3DC298);color:white;border:none;cursor:pointer;',
    'font-family:inherit;margin-bottom:10px;">',
    'Sign in →</button>',
    '<p style="font-size:12px;color:#7DA898;">No account? ',
    '<span onclick="SS.switchLockToSignup()" ',
    'style="color:#3DC298;cursor:pointer;font-weight:600;">Sign up →</span></p>',
    '</div>',
    '<div id="lock-upgrade-panel" style="display:none;">',
    '<button onclick="SS.goToPayment()" ',
    'style="width:100%;padding:15px;border-radius:12px;font-size:15px;font-weight:700;',
    'background:linear-gradient(135deg,#2BA07E,#3DC298);color:white;border:none;cursor:pointer;',
    'font-family:inherit;">',
    'Get Lifetime Access · $49 →</button>',
    '</div>',
    '</div>',
    '<div id="lock-error" style="display:none;background:rgba(217,72,72,0.1);border:1px solid rgba(217,72,72,0.25);',
    'color:#F07070;border-radius:8px;padding:10px 14px;font-size:13px;margin-top:12px;"></div>',
    '</div></div>',
  ].join('');

  document.addEventListener('DOMContentLoaded', function () {
    var wrap = document.createElement('div');
    wrap.innerHTML = modalHtml;
    document.body.appendChild(wrap.firstElementChild);

    /* ── Intercept system selection ───────────────────── */
    var origSelect = SS.selectSystem;
    if (origSelect) {
      SS.selectSystem = function (id) {
        if (!FREE_SYSTEMS[id] && !SS._auth.hasPaid) {
          SS.showLockModal(id);
          return;
        }
        origSelect.call(SS, id);
      };
    }

    /* ── Patch sidebar render to show lock icons ──────── */
    var origRenderLeft = SS.renderLeft;
    if (origRenderLeft) {
      SS.renderLeft = function () {
        origRenderLeft.call(SS);
        document.querySelectorAll('.sys-btn').forEach(function (btn) {
          var id = btn.getAttribute('data-id') ||
            (btn.onclick && btn.onclick.toString().match(/'([^']+)'/)?.[1]);
          if (!id) return;
          if (!FREE_SYSTEMS[id] && !SS._auth.hasPaid) {
            if (!btn.querySelector('.sys-lock')) {
              var lock = document.createElement('span');
              lock.className = 'sys-lock';
              lock.textContent = '🔒';
              lock.style.cssText = 'font-size:10px;margin-left:auto;opacity:0.5;';
              btn.appendChild(lock);
            }
          }
        });
      };
    }

    if (new URLSearchParams(location.search).get('payment') === 'success') {
      handlePaymentSuccess();
    }
  });

  /* ── Auth callback (called by firebase-init.js) ─────────── */
  window._onAuthUser = function (user) {
    SS._auth.user = user;
    SS._auth.loaded = true;

    if (user) {
      var f = fb();
      if (!f) { SS._auth.hasPaid = false; afterAuthLoaded(); return; }
      f.fbStore.getDoc(f.fbStore.doc(f.db, 'users', user.uid)).then(function (snap) {
        SS._auth.hasPaid = snap.exists() ? !!snap.data().hasPaid : false;
        afterAuthLoaded();
      }).catch(function (e) {
        console.error('[gating] Firestore read failed:', e.code, e.message);
        SS._auth.hasPaid = false;
        afterAuthLoaded();
      });
    } else {
      SS._auth.hasPaid = false;
      afterAuthLoaded();
    }
  };

  function afterAuthLoaded() {
    if (SS.renderLeft) SS.renderLeft();
  }

  /* ── Lock modal ───────────────────────────────────────────── */
  SS.showLockModal = function (systemId) {
    var overlay = document.getElementById('lock-overlay');
    if (!overlay) return;
    var nameEl = document.getElementById('lock-system-name');
    if (nameEl && SS.SYSTEMS && SS.SYSTEMS[systemId]) {
      nameEl.textContent = SS.SYSTEMS[systemId].name || systemId;
    }
    var signupForm   = document.getElementById('lock-signup-form');
    var loginForm    = document.getElementById('lock-login-form');
    var upgradePanel = document.getElementById('lock-upgrade-panel');
    signupForm.style.display   = '';
    loginForm.style.display    = 'none';
    upgradePanel.style.display = 'none';
    if (SS._auth.user && !SS._auth.hasPaid) {
      signupForm.style.display   = 'none';
      upgradePanel.style.display = '';
    }
    clearLockError();
    overlay.style.display = 'flex';
  };

  SS.closeLockModal = function (e) {
    if (e && e.target !== document.getElementById('lock-overlay')) return;
    document.getElementById('lock-overlay').style.display = 'none';
  };

  SS.switchLockToLogin  = function () {
    document.getElementById('lock-signup-form').style.display = 'none';
    document.getElementById('lock-login-form').style.display  = '';
  };
  SS.switchLockToSignup = function () {
    document.getElementById('lock-login-form').style.display  = 'none';
    document.getElementById('lock-signup-form').style.display = '';
  };

  SS.lockModalPurchase = async function () {
    var email = document.getElementById('lock-email').value.trim();
    var pass  = document.getElementById('lock-pass').value;
    if (!email || !pass) { showLockError('Enter your email and a password.'); return; }
    var f = fb();
    if (!f) { showLockError('Service not ready. Try again in a moment.'); return; }
    try {
      var cred = await f.fbAuth.createUserWithEmailAndPassword(f.auth, email, pass);
      await f.fbStore.setDoc(
        f.fbStore.doc(f.db, 'users', cred.user.uid),
        { email: email, hasPaid: false, createdAt: Date.now() }
      );
      SS._auth.user = cred.user;
      SS.goToPayment();
    } catch (err) {
      var code = err.code || '';
      showLockError(
        code === 'auth/email-already-in-use' ? 'Account exists. Sign in instead.' :
        code === 'auth/weak-password' ? 'Password needs 6+ characters.' :
        err.message || 'Something went wrong.'
      );
    }
  };

  SS.lockModalLogin = async function () {
    var email = document.getElementById('lock-login-email').value.trim();
    var pass  = document.getElementById('lock-login-pass').value;
    if (!email || !pass) { showLockError('Enter your email and password.'); return; }
    var f = fb();
    if (!f) { showLockError('Service not ready. Try again in a moment.'); return; }
    try {
      var cred = await f.fbAuth.signInWithEmailAndPassword(f.auth, email, pass);
      SS._auth.user = cred.user;
      var snap = await f.fbStore.getDoc(f.fbStore.doc(f.db, 'users', cred.user.uid));
      SS._auth.hasPaid = snap.exists() ? !!snap.data().hasPaid : false;
      if (SS._auth.hasPaid) {
        document.getElementById('lock-overlay').style.display = 'none';
        if (SS.renderLeft) SS.renderLeft();
        if (SS.renderAll) SS.renderAll();
      } else {
        SS.goToPayment();
      }
    } catch (err) {
      showLockError('Incorrect email or password.');
    }
  };

  SS.goToPayment = function () {
    var user = SS._auth.user;
    if (!user) { window.location.href = 'login.html'; return; }
    window.location.href = STRIPE_PAYMENT_LINK +
      '?prefilled_email=' + encodeURIComponent(user.email || '');
  };

  SS.signOut = function () {
    var f = fb();
    if (f) f.fbAuth.signOut(f.auth);
    SS._auth = { user: null, hasPaid: false, loaded: true };
    window.location.href = 'login.html';
  };

  /* ── Payment success (Stripe redirect) ───────────────────── */
  async function handlePaymentSuccess() {
    /* Poll until firebase-init.js resolves auth */
    var waited = 0;
    var iv = setInterval(async function () {
      waited += 200;
      var f = fb();
      if (f && SS._auth.user) {
        clearInterval(iv);
        await markPaid(SS._auth.user.uid);
      } else if (waited >= 8000) {
        clearInterval(iv);
      }
    }, 200);
    history.replaceState(null, '', location.pathname);
  }

  async function markPaid(uid) {
    var f = fb();
    if (!f) return;
    try {
      await f.fbStore.setDoc(
        f.fbStore.doc(f.db, 'users', uid),
        { hasPaid: true, paidAt: Date.now() },
        { merge: true }
      );
      SS._auth.hasPaid = true;
      if (SS.renderLeft) SS.renderLeft();
      showPaymentSuccessToast();
    } catch (e) { /* silent */ }
  }

  function showPaymentSuccessToast() {
    var toast = document.createElement('div');
    toast.style.cssText = [
      'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);',
      'background:linear-gradient(135deg,#0D1A20,#142028);',
      'border:1px solid rgba(43,160,126,0.4);',
      'border-radius:14px;padding:16px 24px;',
      'font-size:14px;font-weight:600;color:#E0EDE8;',
      'box-shadow:0 20px 40px rgba(0,0,0,0.5),0 0 30px rgba(43,160,126,0.15);',
      'display:flex;align-items:center;gap:12px;z-index:500;',
      'animation:slideUp 0.4s cubic-bezier(0.34,1.56,0.64,1);',
    ].join('');
    toast.innerHTML = '<span style="font-size:20px;">🎉</span> Lifetime access unlocked! All 16 systems are yours.';
    document.body.appendChild(toast);
    setTimeout(function () { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.4s'; }, 4000);
    setTimeout(function () { toast.remove(); }, 4500);
  }

  function showLockError(msg) {
    var el = document.getElementById('lock-error');
    if (!el) return;
    el.textContent = msg; el.style.display = 'block';
  }
  function clearLockError() {
    var el = document.getElementById('lock-error');
    if (el) el.style.display = 'none';
  }

})();
