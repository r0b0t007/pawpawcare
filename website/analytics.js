/*
 * Google Analytics 4 — consent-gated.
 *
 * Nothing here contacts Google until the visitor clicks "Accept" on the cookie
 * banner. The choice is remembered in localStorage, so the banner shows once.
 * A declined or undecided visitor loads no Google script and gets no cookie.
 *
 * SETUP: paste your GA4 Measurement ID below — Analytics → Admin → Data streams
 * → your web stream → "Measurement ID" (looks like G-XXXXXXXXXX). Until you do,
 * this file is a no-op: no banner, no cookie, no tracking.
 */
(function () {
  'use strict';

  var GA_ID = 'G-XXXXXXXXXX'; // ← paste your GA4 Measurement ID here
  var STORAGE_KEY = 'ppc:analytics-consent';

  // Not configured yet → do nothing (no banner, no cookie, no Google contact).
  if (!/^G-[A-Z0-9]{6,}$/.test(GA_ID)) return;

  function readChoice() {
    try { return localStorage.getItem(STORAGE_KEY); } catch (e) { return null; }
  }
  function saveChoice(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) { /* private mode */ }
  }

  // Load gtag.js and start GA with analytics consent granted (ads stay denied).
  function enableAnalytics() {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag('js', new Date());
    // Consent Mode v2: default everything denied, then grant only analytics.
    gtag('consent', 'default', {
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
      analytics_storage: 'denied',
    });
    gtag('consent', 'update', { analytics_storage: 'granted' });
    gtag('config', GA_ID, { anonymize_ip: true });

    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(GA_ID);
    document.head.appendChild(s);
  }

  function showBanner() {
    var bar = document.createElement('div');
    bar.className = 'cookie-banner';
    bar.setAttribute('role', 'dialog');
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
    });
  }

  var choice = readChoice();
  if (choice === 'granted') enableAnalytics();
  else if (choice !== 'denied') showBanner();
})();
