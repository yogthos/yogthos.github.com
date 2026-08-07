/** External Links **/
document.querySelectorAll('a[rel="external"]').forEach(function(a) {
    a.target = '_blank';
});

/** Mobile Menu Toggle **/
(function() {
    var toggle = document.querySelector('.menu-toggle');
    var menu = document.querySelector('.menu');
    if (toggle && menu) {
        toggle.addEventListener('click', function() {
            toggle.classList.toggle('active');
            menu.classList.toggle('open');
        });
    }
})();

/** Dark Mode Toggle **/
(function() {
    var btn = document.querySelector('.theme-toggle');
    if (!btn) return;

    function isDark() {
        var theme = document.documentElement.getAttribute('data-theme');
        if (theme === 'dark') return true;
        if (theme === 'light') return false;
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }

    btn.addEventListener('click', function() {
        var next = isDark() ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('theme', next);
        // Flip the highlight.js stylesheets to match the manual choice;
        // otherwise the code-block text keeps the OS-scheme palette while
        // the block background follows the toggle, becoming unreadable.
        var l = document.getElementById('hljs-light');
        var d = document.getElementById('hljs-dark');
        if (l && d) {
            if (next === 'dark') {
                l.media = 'not all';
                d.media = 'all';
            } else {
                l.media = 'all';
                d.media = 'not all';
            }
        }
    });
})();

/** Syntax Highlighting **/
if (typeof hljs !== 'undefined') {
    hljs.highlightAll();
}
