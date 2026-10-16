import { convertWeight, weightInsight } from '../weight';
import i18n from '../../i18n';

const pt = (value, loggedAt) => ({ id: loggedAt, value, loggedAt });

describe('convertWeight', () => {
  it('returns the value unchanged for the same unit or no source', () => {
    expect(convertWeight(10, 'kg', 'kg')).toBe(10);
    expect(convertWeight(10, null, 'kg')).toBe(10);
  });

  it('converts between kg and lbs both ways', () => {
    expect(convertWeight(10, 'kg', 'lbs')).toBeCloseTo(22.046, 2);
    expect(convertWeight(10, 'lbs', 'kg')).toBeCloseTo(4.536, 2);
  });

  it('coerces non-numeric input to 0', () => {
    expect(convertWeight('abc', 'kg', 'kg')).toBe(0);
  });
});

describe('weightInsight', () => {
  it('returns null with fewer than two points', () => {
    expect(weightInsight([], 'kg')).toBeNull();
    expect(weightInsight([pt(4.0, '2026-01-01')], 'kg')).toBeNull();
  });

  it('detects an upward trend and flags it notable', () => {
    const i = weightInsight(
      [pt(4.0, '2026-01-01'), pt(4.4, '2026-02-01'), pt(4.8, '2026-04-01')],
      'kg',
    );
    expect(i.direction).toBe('up');
    expect(i.changeAbs).toBe(0.8);
    expect(i.changePct).toBe(20);
    expect(i.current).toBe(4.8);
    expect(i.notable).toBe(true);
    expect(i.summary).toBe('Up 0.8 kg (20%) over the last 3 months');
  });

  it('detects a downward trend and shows the percent unsigned', () => {
    const i = weightInsight([pt(5.0, '2026-01-01'), pt(4.5, '2026-03-01')], 'kg');
    expect(i.direction).toBe('down');
    expect(i.changeAbs).toBe(-0.5);
    expect(i.notable).toBe(true);
    expect(i.summary).toBe('Down 0.5 kg (10%) over the last 8 weeks');
  });

  it('treats small changes as stable and not notable', () => {
    const i = weightInsight([pt(4.0, '2026-01-01'), pt(4.05, '2026-02-15')], 'kg');
    expect(i.direction).toBe('stable');
    expect(i.notable).toBe(false);
    expect(i.summary).toMatch(/^Stable over the last/);
  });

  it('treats exactly 3% as a trend, not stable (exclusive threshold)', () => {
    const i = weightInsight([pt(4.0, '2026-01-01'), pt(4.12, '2026-03-01')], 'kg');
    expect(i.changePct).toBe(3);
    expect(i.direction).toBe('up');
  });

  it('measures earliest → latest regardless of input order', () => {
    const i = weightInsight(
      [pt(4.8, '2026-04-01'), pt(4.0, '2026-01-01'), pt(4.4, '2026-02-01')],
      'kg',
    );
    expect(i.changeAbs).toBe(0.8);
    expect(i.current).toBe(4.8);
  });

  it('humanizes the span as days, weeks, or months', () => {
    expect(weightInsight([pt(4.0, '2026-01-01'), pt(4.5, '2026-01-06')], 'kg').summary)
      .toContain('5 days');
    expect(weightInsight([pt(4.0, '2026-01-01'), pt(4.0, '2026-03-01')], 'kg').summary)
      .toContain('8 weeks'); // 59 days
    expect(weightInsight([pt(4.0, '2026-01-01'), pt(4.0, '2026-03-02')], 'kg').summary)
      .toContain('2 months'); // 60 days
  });

  it('uses the passed unit label in the summary', () => {
    const i = weightInsight([pt(9.0, '2026-01-01'), pt(11.0, '2026-03-01')], 'lbs');
    expect(i.summary).toContain('lbs');
  });

  it('avoids divide-by-zero when the first weight is 0', () => {
    const i = weightInsight([pt(0, '2026-01-01'), pt(4.0, '2026-02-01')], 'kg');
    expect(i.changePct).toBe(0);
    expect(i.direction).toBe('stable');
  });

  describe('in the app language (formal fr / es-ES drafts)', () => {
    afterEach(() => i18n.changeLanguage('en'));

    it('builds the French summary', async () => {
      await i18n.changeLanguage('fr');
      expect(weightInsight([pt(4.0, '2026-01-01'), pt(4.8, '2026-04-01')], 'kg').summary)
        .toBe('En hausse de 0.8 kg (20 %) sur 3 mois');
      expect(weightInsight([pt(4.0, '2026-01-01'), pt(4.0, '2026-01-02')], 'kg').summary)
        .toBe('Stable sur 1 jour');
    });

    it('builds the Spanish summary', async () => {
      await i18n.changeLanguage('es');
      expect(weightInsight([pt(5.0, '2026-01-01'), pt(4.5, '2026-02-26')], 'kg').summary)
        .toBe('Ha bajado 0.5 kg (10 %) en 8 semanas');
    });
  });
});
