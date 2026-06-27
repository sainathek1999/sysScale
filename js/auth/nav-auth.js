/* nav-auth.js — adds Sign In / Sign Out chip to every page header */
(function () {
  var CFG = {
    apiKey:            "AIzaSyB6MnpKcgmCf_00u2iEmrrst6-fzVeXeP8",
    authDomain:        "systemdesign-5c850.firebaseapp.com",
    projectId:         "systemdesign-5c850",
    storageBucket:     "systemdesign-5c850.firebasestorage.app",
    messagingSenderId: "725562832285",
    appId:             "1:725562832285:web:78a8f15be0c62ffa3c6b74",
  };

  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js').then(function (m) {
    var app;
    try { app = m.getApp('nav'); } catch (_) { app = m.initializeApp(CFG, 'nav'); }
    return Promise.all([
      app,
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
    ]);
  }).then(function (vals) {
    var app = vals[0], authMod = vals[1];
    var auth = authMod.getAuth(app);

    authMod.onAuthStateChanged(auth, function (user) {
      var right = document.querySelector('.header-right');
      if (!right) return;

      var existing = document.getElementById('nav-auth-chip');
      if (existing) existing.remove();

      var chip = document.createElement('div');
      chip.id = 'nav-auth-chip';
      chip.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

      if (user) {
        var name = (user.displayName || user.email || '').split('@')[0];
        chip.innerHTML =
          '<span style="font-size:11px;color:var(--text3);font-family:var(--font-mono);' +
          'max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (user.email || '') + '">' +
          name + '</span>' +
          '<button id="nav-signout-btn" style="font-size:11px;font-weight:600;color:var(--text3);' +
          'background:none;border:1px solid var(--border2);cursor:pointer;padding:4px 10px;' +
          'border-radius:6px;font-family:var(--font-body);transition:background var(--dur-fast),' +
          'color var(--dur-fast);" ' +
          'onmouseover="this.style.background=\'var(--bg2)\';this.style.color=\'var(--text)\'" ' +
          'onmouseout="this.style.background=\'none\';this.style.color=\'var(--text3)\'">Sign out</button>';

        chip.querySelector('#nav-signout-btn').addEventListener('click', function () {
          authMod.signOut(auth).then(function () {
            window.location.href = 'login.html';
          });
        });
      } else {
        chip.innerHTML =
          '<a href="login.html" style="font-size:11px;font-weight:600;color:var(--indigo);' +
          'padding:5px 12px;background:var(--indigo3);border:1px solid rgba(var(--indigo-rgb),0.2);' +
          'border-radius:20px;text-decoration:none;white-space:nowrap;">Sign In</a>';
      }

      var vbadge = right.querySelector('.version-badge');
      right.insertBefore(chip, vbadge || right.firstChild);
    });
  }).catch(function () { /* Firebase not reachable — skip chip */ });
})();
