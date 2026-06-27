/*
  firebase-init.js — single Firebase init for every page.

  Pages that require login: add data-auth-required="true" to <body>.
  gating.js listens via window._onAuthUser callback.
*/
(function () {
  var CFG = {
    apiKey:            "AIzaSyB6MnpKcgmCf_00u2iEmrrst6-fzVeXeP8",
    authDomain:        "systemdesign-5c850.firebaseapp.com",
    projectId:         "systemdesign-5c850",
    storageBucket:     "systemdesign-5c850.firebasestorage.app",
    messagingSenderId: "725562832285",
    appId:             "1:725562832285:web:78a8f15be0c62ffa3c6b74",
  };

  Promise.all([
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
  ]).then(function (mods) {
    var fbApp   = mods[0];
    var fbAuth  = mods[1];
    var fbStore = mods[2];

    var app  = fbApp.initializeApp(CFG);
    var auth = fbAuth.getAuth(app);
    var db   = fbStore.getFirestore(app);

    /* Shared instance — gating.js picks this up */
    window.SS_FIREBASE = {
      auth:    auth,
      db:      db,
      fbAuth:  fbAuth,
      fbStore: fbStore,
    };

    var resolved = false;
    fbAuth.onAuthStateChanged(auth, function (user) {
      window.SS_USER = user || null;

      /* Render nav chip */
      renderNavAuth(user);

      /* Auth-required pages redirect on first resolution */
      if (!resolved) {
        resolved = true;
        var needsAuth = document.body.getAttribute('data-auth-required') === 'true';
        if (needsAuth && !user) {
          var next = encodeURIComponent(location.pathname.replace(/^\//, '') + location.search);
          window.location.replace('login.html?next=' + next);
          return;
        }
      }

      /* Ensure Firestore user doc exists — fallback if login.html write failed */
      if (user) ensureUserDoc(user);

      /* Notify gating.js / any other listener */
      if (typeof window._onAuthUser === 'function') window._onAuthUser(user);
    });

    function ensureUserDoc(user) {
      var ref = fbStore.doc(db, 'users', user.uid);
      fbStore.getDoc(ref).then(function (snap) {
        if (!snap.exists()) {
          return fbStore.setDoc(ref, {
            email:     user.email || '',
            hasPaid:   false,
            createdAt: Date.now(),
          });
        }
      }).then(function () {
        console.log('[firebase-init] user doc OK for', user.uid);
      }).catch(function (e) {
        console.error('[firebase-init] Firestore error:', e.code, e.message);
      });
    }

    /* ── Nav auth chip ──────────────────────────────────────── */
    function renderNavAuth(user) {
      var chip = document.getElementById('nav-auth');
      if (!chip) return;

      if (user) {
        var name = (user.displayName || user.email || '').split('@')[0];
        chip.innerHTML =
          '<span class="nav-user-name" title="' + esc(user.email || '') + '">' + esc(name) + '</span>' +
          '<button class="nav-signout-btn" id="__signout">Sign out</button>';
        document.getElementById('__signout').onclick = function () {
          fbAuth.signOut(auth).then(function () { window.location.href = 'login.html'; });
        };
      } else {
        chip.innerHTML = '<a href="login.html" class="nav-signin-link">Sign in</a>';
      }
    }

    function esc(s) {
      return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
  }).catch(function (e) {
    console.warn('[firebase-init]', e);
  });
})();
