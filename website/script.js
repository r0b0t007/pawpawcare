document.documentElement.classList.add('js');

// Sticky header shadow once the page scrolls
var header = document.getElementById('site-header');
var onScroll = function () {
  header.classList.toggle('scrolled', window.scrollY > 8);
};
onScroll();
window.addEventListener('scroll', onScroll, { passive: true });

// Mobile nav toggle
var navToggle = document.querySelector('.nav-toggle');
if (navToggle && header) {
  var setNav = function (open) {
    header.classList.toggle('nav-open', open);
    navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  };
  navToggle.addEventListener('click', function () {
    setNav(!header.classList.contains('nav-open'));
  });
  // Close when a link is tapped, on Escape, or when tapping outside the header
  header.querySelectorAll('#primary-nav a').forEach(function (a) {
    a.addEventListener('click', function () { setNav(false); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') setNav(false);
  });
  document.addEventListener('click', function (e) {
    if (header.classList.contains('nav-open') && !header.contains(e.target)) setNav(false);
  });
}

// Reveal sections as they enter the viewport (CSS no-ops under reduced motion)
if ('IntersectionObserver' in window) {
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        io.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.reveal').forEach(function (el) { io.observe(el); });
  // Safety net: if the observer never fires (bfcache restore, anchor jumps, odd
  // viewports) nothing should stay invisible.
  setTimeout(function () {
    document.querySelectorAll('.reveal:not(.in)').forEach(function (el) { el.classList.add('in'); });
  }, 1500);
} else {
  document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); });
}

// Prevent double submits; button shows progress while the POST is in flight
document.querySelectorAll('form[name="waitlist"]').forEach(function (form) {
  form.addEventListener('submit', function () {
    var btn = form.querySelector('button[type="submit"]');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Joining…';
    }
  });
});
