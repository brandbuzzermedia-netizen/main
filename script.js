/* ============================================================
   Get Bee Seen — interactions
   ============================================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----------------------------------------------------------
     1. Loading screen
     Progress creeps to 90% while assets download, completes on
     window.load, then the ink curtain wipes up off the page.
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

  function finish() {
    if (finished) return;
    finished = true;
    clearInterval(tick);
    paint(100);

    window.setTimeout(function () {
      loader.classList.add('is-done');
      document.body.classList.remove('is-loading');
      startCounters();
      // Drop the loader out of the accessibility tree once it's gone.
      window.setTimeout(function () { loader.setAttribute('hidden', ''); }, 1000);
    }, reduceMotion ? 0 : 620);
  }

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
  window.setTimeout(finish, 7000);

  /* ----------------------------------------------------------
     2. Mobile nav
     ---------------------------------------------------------- */
  var nav = document.getElementById('nav');
  var navToggle = document.getElementById('navToggle');

  function closeNav() {
    nav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  }

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

  /* ----------------------------------------------------------
     3. Header — hide on scroll down, show on scroll up
     ---------------------------------------------------------- */
  var header = document.getElementById('header');
  var lastY = 0;

  window.addEventListener('scroll', function () {
    var y = window.scrollY;
    var goingDown = y > lastY && y > 260;
    header.classList.toggle('is-hidden', goingDown && !nav.classList.contains('is-open'));
    lastY = y;
  }, { passive: true });

  /* ----------------------------------------------------------
     4. Scroll reveal
     ---------------------------------------------------------- */
  var revealables = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        window.setTimeout(function () { el.classList.add('is-in'); }, i * 70);
        io.unobserve(el);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px' });

    revealables.forEach(function (el) { io.observe(el); });
  } else {
    revealables.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ----------------------------------------------------------
     5. Counters
     ---------------------------------------------------------- */
  var countersRun = false;

  function startCounters() {
    if (countersRun) return;
    countersRun = true;

    document.querySelectorAll('[data-count]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var suffix = el.getAttribute('data-suffix') || '';
      var decimals = (String(target).split('.')[1] || '').length;

      if (reduceMotion) {
        el.textContent = target.toFixed(decimals) + suffix;
        return;
      }

      var start = performance.now();

      function frame(now) {
        var t = Math.min(1, (now - start) / 1400);
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = (target * eased).toFixed(decimals) + suffix;
        if (t < 1) requestAnimationFrame(frame);
      }

      requestAnimationFrame(frame);
    });
  }

  /* ----------------------------------------------------------
     6. FAQ accordion
     ---------------------------------------------------------- */
  document.querySelectorAll('.faq__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.parentElement;
      var wasOpen = item.classList.contains('is-open');

      document.querySelectorAll('.faq__item').forEach(function (other) {
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

  /* ----------------------------------------------------------
     7. Contact form (front-end only)
     ---------------------------------------------------------- */
  var form = document.getElementById('contactForm');
  var formOk = document.getElementById('formOk');

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    var name = document.getElementById('name');
    var email = document.getElementById('email');

    if (!name.value.trim()) { name.focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) { email.focus(); return; }

    formOk.classList.add('is-visible');
    form.reset();
    window.setTimeout(function () { formOk.classList.remove('is-visible'); }, 6000);
  });

  /* ----------------------------------------------------------
     8. Footer year
     ---------------------------------------------------------- */
  document.getElementById('year').textContent = new Date().getFullYear();
})();
