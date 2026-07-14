/*
 * Google Analytics 4 — consent-gated.
 *
 * Nothing here contacts Google until the visitor clicks "Accept" on the cookie
 * banner. The choice is remembered in localStorage, so the banner shows once.
 * A declined or undecided visitor loads no Google script and gets no cookie.
 *
 * Visitors can change their mind any time via a "Cookie settings" control —
 * any element with [data-cookie-settings] re-opens the banner.
 *
 * To point this at a different property, replace GA_ID with your GA4
 * Measurement ID (Analytics → Admin → Data streams → web stream → looks like
 * G-XXXXXXXXXX). An unset/placeholder ID makes this file a no-op.
 */
(function () {
  'use strict';

  var GA_ID = 'G-0WTMCMYQ38'; // GA4 Measurement ID (Analytics → Admin → Data streams)
  var STORAGE_KEY = 'ppc:analytics-consent';
  var started = false; // gtag.js injected this page load?

  // Not configured → do nothing (no banner, no cookie, no Google contact).
  if (!/^G-[A-Z0-9]{6,}$/.test(GA_ID)) return;

  function readChoice() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function saveChoice(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* private mode */ }
  }

  function ensureGtag() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  }

  // Load gtag.js and start GA with analytics consent granted (ads stay denied).
  function enableAnalytics() {
    ensureGtag();
    if (started) { gtag('consent', 'update', { analytics_storage: 'granted' }); return; }
    started = true;
    gtag('js', new Date());
    // Consent Mode v2: default everything denied, then grant only analytics.
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('config', GA_ID);

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
  }

  // Withdraw consent for a visitor who already accepted earlier this session.
  function disableAnalytics() {
    if (started) gtag('consent', 'update', { analytics_storage: 'denied' });
  }

  function showBanner() {
    var existing = document.querySelector('.cookie-banner');
    if (existing) existing.remove();

    var bar = document.createElement('div');
    bar.className = 'cookie-banner';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Analytics cookies');
    bar.innerHTML =
      '<p class="cookie-text">We use Google Analytics to see which pages help visitors' +
      ' — no ads, and we never sell your data. <a href="/privacy/">Privacy&nbsp;Policy</a></p>' +
      '<div class="cookie-actions">' +
        '<button type="button" class="cookie-btn cookie-decline">Decline</button>' +
        '<button type="button" class="cookie-btn cookie-accept">Accept</button>' +
      '</div>';
    document.body.appendChild(bar);

    bar.querySelector('.cookie-accept').addEventListener('click', function () {
      saveChoice('granted');
      bar.remove();
      enableAnalytics();
    });
    bar.querySelector('.cookie-decline').addEventListener('click', function () {
      saveChoice('denied');
      bar.remove();
      disableAnalytics();
    });
  }

  // "Cookie settings" links (in the footer) re-open the banner at any time.
  document.addEventListener('click', function (e) {
    var trigger = e.target.closest('[data-cookie-settings]');
    if (trigger) { e.preventDefault(); showBanner(); }
  });

  // Defer the banner until the visitor scrolls or dwells a moment, so it never
  // covers the hero headline at first paint on small screens (SEO audit C1).
  function scheduleBanner() {
    var shown = false, timer;
    function reveal() {
      if (shown) return;
      shown = true;
      window.removeEventListener('scroll', onScroll);
      clearTimeout(timer);
      showBanner();
    }
    function onScroll() { if (window.pageYOffset > 80) reveal(); }
    window.addEventListener('scroll', onScroll, { passive: true });
    timer = setTimeout(reveal, 6000); // fallback for readers who don't scroll
  }

  var choice = readChoice();
  if (choice === 'granted') enableAnalytics();
  else if (choice !== 'denied') scheduleBanner();
})();
