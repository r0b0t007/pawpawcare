import {
  isExpectedError,
  scrubBreadcrumb,
  scrubEvent,
  scrubText,
  scrubTransaction,
  scrubUrl,
} from '../scrub';

const PET = '9f1c2b7e-4a6d-4c1e-9b0a-3d2f1e0c9a8b';

describe('scrubUrl', () => {
  test('drops query and fragment, templates ids', () => {
    expect(scrubUrl(`https://api.pawpawcare.app/pets/${PET}/documents/42/raw?expires=1&signature=abc#x`)).toBe(
      'https://api.pawpawcare.app/pets/:id/documents/:id/raw',
    );
    expect(scrubUrl('/reminders/7')).toBe('/reminders/:id');
    expect(scrubUrl('/users/me')).toBe('/users/me');
  });
});

describe('scrubText', () => {
  test('redacts emails, tokens, JWTs, credential params and URL details', () => {
    const out = scrubText(
      `Failed for owner@example.com: Bearer abc.def eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig ` +
        `GET https://api.pawpawcare.app/pets/${PET}?token=xyz then /share?code=123456&page=2`,
    );
    expect(out).not.toMatch(/owner@example\.com|abc\.def|eyJ|xyz|123456|9f1c2b7e/);
    expect(out).toContain('[email]');
    expect(out).toContain('Bearer [redacted]');
    expect(out).toContain('[jwt]');
    expect(out).toContain('https://api.pawpawcare.app/pets/:id');
    expect(out).toContain('/share?code=[redacted]&page=2');
  });
});

describe('scrubBreadcrumb', () => {
  test('drops categories that can echo screen content', () => {
    for (const category of ['console', 'touch', 'ui.click', 'ui.input']) {
      expect(scrubBreadcrumb({ category, message: 'Luna — rabies booster' })).toBeNull();
    }
  });

  test('templates request URLs and strips navigation params', () => {
    const http = scrubBreadcrumb({
      category: 'xhr',
      data: { url: `https://api.pawpawcare.app/pets/${PET}?q=luna`, method: 'GET', status_code: 500 },
    });
    expect(http.data).toEqual({ url: 'https://api.pawpawcare.app/pets/:id', method: 'GET', status_code: 500 });

    const nav = scrubBreadcrumb({
      category: 'navigation',
      data: { from: 'PetsList', to: 'PetProfile', params: { petName: 'Luna' }, 'route.params': { id: 1 } },
    });
    expect(nav.data).toEqual({ from: 'PetsList', to: 'PetProfile' });
  });
});

describe('isExpectedError', () => {
  test('session expiry, 4xx and network failures are expected; 5xx and bugs are not', () => {
    expect(isExpectedError(new Error('SESSION_EXPIRED'))).toBe(true);
    expect(isExpectedError(Object.assign(new Error('Not found'), { status: 404 }))).toBe(true);
    expect(isExpectedError(Object.assign(new Error('offline'), { isNetworkError: true }))).toBe(true);
    expect(isExpectedError(Object.assign(new Error('boom'), { status: 500 }))).toBe(false);
    expect(isExpectedError(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(isExpectedError(undefined)).toBe(false);
  });
});

describe('scrubEvent', () => {
  test('drops expected errors', () => {
    const err = Object.assign(new Error('Validation failed'), { status: 422 });
    expect(scrubEvent({ message: 'x' }, { originalException: err })).toBeNull();
  });

  test('keeps the user id only and scrubs every text field', () => {
    const out = scrubEvent(
      {
        user: { id: 12, email: 'owner@example.com', ip_address: '1.2.3.4', username: 'Sam' },
        request: { url: 'https://api.pawpawcare.app/pets?x=1', headers: { Authorization: 'Bearer t' } },
        message: 'Saving for owner@example.com',
        exception: { values: [{ type: 'Error', value: `GET https://api.pawpawcare.app/pets/${PET}?token=t failed` }] },
        breadcrumbs: [
          { category: 'console', message: 'Luna' },
          { category: 'navigation', data: { to: 'PetProfile', params: { name: 'Luna' } } },
        ],
        extra: { note: 'mail owner@example.com', nested: { url: 'https://x.test/a?b=1' } },
        tags: { screen: 'PetProfile', who: 'owner@example.com' },
      },
      { originalException: new Error('boom') },
    );

    expect(out.user).toEqual({ id: '12' });
    expect(out.request).toBeUndefined();
    expect(out.message).toBe('Saving for [email]');
    expect(out.exception.values[0].value).toBe('GET https://api.pawpawcare.app/pets/:id failed');
    expect(out.breadcrumbs).toEqual([{ category: 'navigation', message: undefined, data: { to: 'PetProfile' } }]);
    expect(out.extra).toEqual({ note: 'mail [email]', nested: { url: 'https://x.test/a' } });
    expect(out.tags).toEqual({ screen: 'PetProfile', who: '[email]' });
  });
});

describe('scrubTransaction', () => {
  test('templates span descriptions and drops params and queries', () => {
    const out = scrubTransaction({
      transaction: 'PetProfile',
      user: { id: 3, email: 'a@b.co' },
      spans: [
        {
          description: `GET https://api.pawpawcare.app/pets/${PET}/documents?signature=s`,
          data: { url: `https://api.pawpawcare.app/pets/${PET}`, 'http.query': 'signature=s', 'route.params': { id: 1 } },
        },
      ],
      contexts: { trace: { data: { 'route.params': { petName: 'Luna' }, 'route.name': 'PetProfile' } } },
    });

    expect(out.user).toEqual({ id: '3' });
    expect(out.spans[0].description).toBe('GET https://api.pawpawcare.app/pets/:id/documents');
    expect(out.spans[0].data).toEqual({ url: 'https://api.pawpawcare.app/pets/:id' });
    expect(out.contexts.trace.data).toEqual({ 'route.name': 'PetProfile' });
  });
});
