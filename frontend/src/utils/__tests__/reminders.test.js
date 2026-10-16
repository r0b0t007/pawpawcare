import i18n from '../../i18n';
import { recurringSummary, reminderKind } from '../reminders';

const rem = (recurrence, time_of_day = '09:00') => ({ schedule_type: 'recurring', recurrence, time_of_day });

afterEach(() => i18n.changeLanguage('en'));

describe('recurringSummary', () => {
  it('formats the time like the rest of the app in English', () => {
    expect(recurringSummary(rem('daily'))).toBe('Daily at 9:00 AM');
    expect(recurringSummary(rem('weekly', '18:30'))).toBe('Weekly at 6:30 PM');
    expect(recurringSummary(rem('monthly', '01:30'))).toBe('Monthly at 1:30 AM');
  });

  it('defaults to daily at 9:00', () => {
    expect(recurringSummary({ schedule_type: 'recurring' })).toBe('Daily at 9:00 AM');
  });

  it('uses 24h time in French', async () => {
    await i18n.changeLanguage('fr');
    expect(recurringSummary(rem('daily', '09:05'))).toBe('Tous les jours à 9:05');
    expect(recurringSummary(rem('weekly', '18:30'))).toBe('Toutes les semaines à 18:30');
  });

  it('says "a la 1:30" but "a las 9:30" in Spanish', async () => {
    await i18n.changeLanguage('es');
    expect(recurringSummary(rem('daily', '01:30'))).toBe('Cada día a la 1:30');
    expect(recurringSummary(rem('daily', '09:30'))).toBe('Cada día a las 9:30');
    expect(recurringSummary(rem('monthly', '13:00'))).toBe('Cada mes a las 13:00');
    expect(recurringSummary(rem('weekly', '00:15'))).toBe('Cada semana a las 0:15');
  });

  it.each(['en', 'fr', 'es'])('never shows a raw recurrence value (%s)', async (lng) => {
    await i18n.changeLanguage(lng);
    const text = recurringSummary(rem('yearly', '09:00'));
    expect(text).not.toMatch(/yearly/i);
    expect(text).toMatch(/9:00/);
  });

  it('keeps an unparseable time as stored', () => {
    expect(recurringSummary(rem('daily', 'soon'))).toBe('Daily at soon');
  });
});

describe('reminderKind', () => {
  it('names one-off and recurring reminders', () => {
    expect(reminderKind({ schedule_type: 'once' })).toBe('Reminder');
    expect(reminderKind(rem('weekly'))).toBe('Weekly reminder');
  });

  it.each([
    ['en', 'Repeating reminder'],
    ['fr', 'Rappel récurrent'],
    ['es', 'Recordatorio periódico'],
  ])('translates an unknown recurrence instead of showing it (%s)', async (lng, expected) => {
    await i18n.changeLanguage(lng);
    expect(reminderKind(rem('yearly'))).toBe(expected);
  });
});
