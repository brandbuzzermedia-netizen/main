/* ============================================================
   Get Bee Seen — interactions
   Shared by every page.
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------
     1. Loading screen
     Runs in full on the first visit. On later page loads in the
     same session it clears immediately, so moving around the
     site never feels gated.
     ---------------------------------------------------------- */
  var loader = document.getElementById('loader');
  var bar    = document.getElementById('loaderBar');
  var pct    = document.getElementById('loaderPct');
  var status = document.getElementById('loaderStatus');

  var messages = [
    'Warming up the hive',
    'Gathering the good stuff',
    'Mixing the honey',
    'Polishing the pixels',
    'Ready to be seen'
  ];

  var seen = false;
  try {
    seen = sessionStorage.getItem('gbs-seen') === '1';
  } catch (e) {
    // private browsing or blocked storage — just show the loader
  }

  var progress = 0;
  var pageLoaded = false;
  var finished = false;
  var tick;

  function paint(value) {
    var v = Math.min(100, Math.round(value));
    if (bar) bar.style.width = v + '%';
    if (pct) pct.textContent = v + '%';
    if (status) {
      var msg = messages[Math.min(messages.length - 1, Math.floor(v / 21))];
      if (status.textContent !== msg) status.textContent = msg;
    }
  }

  function finish(immediate) {
    if (finished) return;
    finished = true;
    clearInterval(tick);
    paint(100);

    try { sessionStorage.setItem('gbs-seen', '1'); } catch (e) {}

    window.setTimeout(function () {
      loader.classList.add('is-done');
      document.body.classList.remove('is-loading');
      startCounters();
      window.setTimeout(function () { loader.setAttribute('hidden', ''); }, 700);
    }, immediate || reduceMotion ? 0 : 560);
  }

  if (!loader) {
    document.body.classList.remove('is-loading');
  } else if (seen) {
    finish(true);
  } else {
    tick = window.setInterval(function () {
      var ceiling = pageLoaded ? 100 : 90;
      var step = pageLoaded ? 9 : Math.random() * 7 + 2;
      progress = Math.min(ceiling, progress + step);
      paint(progress);
      if (progress >= 100) finish();
    }, reduceMotion ? 40 : 180);

    window.addEventListener('load', function () { pageLoaded = true; });

    // Safety nets: never trap a visitor behind the loader.
    window.setTimeout(function () { pageLoaded = true; }, 4000);
    window.setTimeout(function () { finish(); }, 7000);
  }

  /* ----------------------------------------------------------
     2. Mobile nav
     ---------------------------------------------------------- */
  var nav = document.getElementById('nav');
  var navToggle = document.getElementById('navToggle');

  function closeNav() {
    if (!nav) return;
    nav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  }

  if (nav && navToggle) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
    });

    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') closeNav();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });
  }

  /* ----------------------------------------------------------
     3. Header — hide on scroll down, show on scroll up
     ---------------------------------------------------------- */
  var header = document.getElementById('header');
  var lastY = 0;

  if (header) {
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      var goingDown = y > lastY && y > 260;
      header.classList.toggle('is-hidden', goingDown && !(nav && nav.classList.contains('is-open')));
      lastY = y;
    }, { passive: true });
  }

  /* ----------------------------------------------------------
     4. Scroll reveal
     ---------------------------------------------------------- */
  var io = null;

  if ('IntersectionObserver' in window && !reduceMotion) {
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        window.setTimeout(function () { el.classList.add('is-in'); }, i * 70);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px' });
  }

  function observeReveals(scope) {
    var els = (scope || document).querySelectorAll('.reveal:not(.is-in)');
    if (!io) {
      els.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    els.forEach(function (el) { io.observe(el); });
  }

  observeReveals();

  /* ----------------------------------------------------------
     5. Counters
     ---------------------------------------------------------- */
  function startCounters(scope) {
    (scope || document).querySelectorAll('[data-count]').forEach(function (el) {
      if (el.dataset.counted) return;
      el.dataset.counted = '1';

      var target = parseFloat(el.getAttribute('data-count'));
      var suffix = el.getAttribute('data-suffix') || '';
      var decimals = (String(target).split('.')[1] || '').length;

      // thousands separators, so 5000 reads as 5,000
      function format(n) {
        return n.toLocaleString('en-IN', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        }) + suffix;
      }

      if (reduceMotion) {
        el.textContent = format(target);
        return;
      }

      var start = performance.now();

      function frame(now) {
        var t = Math.min(1, (now - start) / 1400);
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = format(t < 1 ? Number((target * eased).toFixed(decimals)) : target);
        if (t < 1) requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    });
  }

  /* ----------------------------------------------------------
     6. FAQ accordion
     ---------------------------------------------------------- */
  function bindFaq(scope) {
    (scope || document).querySelectorAll('.faq__q').forEach(function (btn) {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';

      btn.addEventListener('click', function () {
        var item = btn.parentElement;
        var group = item.parentElement;
        var wasOpen = item.classList.contains('is-open');

        group.querySelectorAll('.faq__item').forEach(function (other) {
          other.classList.remove('is-open');
          other.querySelector('.faq__a').style.maxHeight = null;
          other.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
        });

        if (!wasOpen) {
          var panel = item.querySelector('.faq__a');
          item.classList.add('is-open');
          panel.style.maxHeight = panel.scrollHeight + 'px';
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  }

  bindFaq();

  /* ----------------------------------------------------------
     7. Contact form (front-end only — contact page)
     ---------------------------------------------------------- */
  function bindForm(scope) {
    var form = (scope || document).querySelector('#contactForm');
    if (!form || form.dataset.bound) return;
    form.dataset.bound = '1';

    var formOk = form.querySelector('#formOk');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var name = form.querySelector('#name');
      var email = form.querySelector('#email');

      if (!name.value.trim()) { name.focus(); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { email.focus(); return; }

      formOk.classList.add('is-visible');
      form.reset();
      window.setTimeout(function () { formOk.classList.remove('is-visible'); }, 6000);
    });
  }

  bindForm();

  /* ----------------------------------------------------------
     8. Footer year
     ---------------------------------------------------------- */
  document.querySelectorAll('.js-year').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });

  /* ----------------------------------------------------------
     9. Re-run the above for newly shown content.
     Only the bundled preview build uses this.
     ---------------------------------------------------------- */
  window.gbsRefresh = function (scope) {
    observeReveals(scope);
    startCounters(scope);
    bindFaq(scope);
    bindForm(scope);
  };
})();
