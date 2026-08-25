/* ============================================
   Get Bee Seen — interactions
   ============================================ */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* --------------------------------------------
     1. Loading screen
     Fills the hexagon while the page loads, then
     hands off to the reveal + counter animations.
     -------------------------------------------- */
  var loader   = document.getElementById('loader');
  var hexFill  = document.getElementById('hexFill');
  var bar      = document.getElementById('loaderBar');
  var pct      = document.getElementById('loaderPct');
  var status   = document.getElementById('loaderStatus');

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
  var tick = null;

  function paint(value) {
    var v = Math.min(100, Math.round(value));
    if (bar)     bar.style.width = v + '%';
    if (hexFill) hexFill.style.height = v + '%';
    if (pct)     pct.textContent = v + '%';
    if (status) {
      var idx = Math.min(messages.length - 1, Math.floor(v / 21));
      if (status.textContent !== messages[idx]) status.textContent = messages[idx];
    }
  }

  function finish() {
    if (finished) return;
    finished = true;
    if (tick) clearInterval(tick);
    paint(100);

    window.setTimeout(function () {
      loader.classList.add('is-done');
      document.body.classList.remove('is-loading');
      startCounters();
      // Drop the loader out of the accessibility tree once it's hidden.
      window.setTimeout(function () { loader.setAttribute('hidden', ''); }, 800);
    }, reduceMotion ? 0 : 420);
  }

  // Creep toward 90% while assets load, then snap to 100 on window.load.
  tick = window.setInterval(function () {
    var ceiling = pageLoaded ? 100 : 90;
    var stepSize = pageLoaded ? 9 : Math.random() * 7 + 2;
    progress = Math.min(ceiling, progress + stepSize);
    paint(progress);
    if (progress >= 100) finish();
  }, reduceMotion ? 40 : 180);

  window.addEventListener('load', function () {
    pageLoaded = true;
  });

  // Safety net: never trap the visitor behind the loader.
  window.setTimeout(function () { pageLoaded = true; }, 4000);
  window.setTimeout(finish, 7000);

  /* --------------------------------------------
     2. Sticky header
     -------------------------------------------- */
  var header = document.getElementById('header');

  function onScroll() {
    header.classList.toggle('is-stuck', window.scrollY > 20);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* --------------------------------------------
     3. Mobile nav
     -------------------------------------------- */
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

  /* --------------------------------------------
     4. Scroll reveal
     -------------------------------------------- */
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

  /* --------------------------------------------
     5. Hero stat counters
     -------------------------------------------- */
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
      var duration = 1400;

      function step(now) {
        var t = Math.min(1, (now - start) / duration);
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = (target * eased).toFixed(decimals) + suffix;
        if (t < 1) requestAnimationFrame(step);
      }

      requestAnimationFrame(step);
    });
  }

  /* --------------------------------------------
     6. FAQ accordion
     -------------------------------------------- */
  document.querySelectorAll('.faq__q').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var item = btn.parentElement;
      var panel = item.querySelector('.faq__a');
      var isOpen = item.classList.contains('is-open');

      // Close every panel, then reopen this one if it was closed.
      document.querySelectorAll('.faq__item').forEach(function (other) {
        other.classList.remove('is-open');
        other.querySelector('.faq__a').style.maxHeight = null;
        other.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
      });

      if (!isOpen) {
        item.classList.add('is-open');
        panel.style.maxHeight = panel.scrollHeight + 'px';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });

  /* --------------------------------------------
     7. Contact form (front-end only)
     -------------------------------------------- */
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

  /* --------------------------------------------
     8. Footer year
     -------------------------------------------- */
  document.getElementById('year').textContent = new Date().getFullYear();
})();
