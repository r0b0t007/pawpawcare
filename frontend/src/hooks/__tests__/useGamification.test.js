// milestoneLabel is pure, but the module imports services/api, whose chain
// reaches the AsyncStorage native module — mock it like mappers.test.js does.
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
}));

import { milestoneLabel } from '../useGamification';

describe('milestoneLabel', () => {
  it('labels known milestone keys', () => {
    expect(milestoneLabel('first_record')).toBe('First health record');
    expect(milestoneLabel('records_100')).toBe('100 health records');
    expect(milestoneLabel('weights_5')).toBe('5 weight entries');
    expect(milestoneLabel('vax_complete')).toBe('Vaccinations all caught up');
  });

  it('labels anniversaries with correct pluralization', () => {
    expect(milestoneLabel('anniversary_1')).toBe('1 year together');
    expect(milestoneLabel('anniversary_7')).toBe('7 years together');
  });

  it('returns null for unknown keys — a newer server must never render raw identifiers', () => {
    expect(milestoneLabel('records_500')).toBeNull();
    expect(milestoneLabel('anniversary_x')).toBeNull();
    expect(milestoneLabel('')).toBeNull();
    expect(milestoneLabel(null)).toBeNull();
    expect(milestoneLabel(undefined)).toBeNull();
  });
});
