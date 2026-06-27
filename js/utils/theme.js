(function () {
  var KEY = 'ss_theme';
  var current = localStorage.getItem(KEY) || 'light';

  function apply(theme) {
    current = theme;
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(KEY, theme);
    var btn = document.getElementById('theme-btn');
    if (btn) {
      btn.textContent = theme === 'dark' ? '☀' : '🌙';
      btn.title = theme === 'dark' ? 'Light mode' : 'Dark mode';
    }
  }

  /* Apply before first paint — prevents flash */
  apply(current);

  window.SS = window.SS || {};
  window.SS.toggleTheme = function () { apply(current === 'dark' ? 'light' : 'dark'); };

  /* Update button icon once DOM is ready */
  document.addEventListener('DOMContentLoaded', function () { apply(current); });
})();
