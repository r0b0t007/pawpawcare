import { vaxStatusOn } from '../vaccines';

const TODAY = new Date('2026-10-13T09:00:00');

describe('vaxStatusOn', () => {
  it('flips open records forward as days pass', () => {
    expect(vaxStatusOn('due_soon', '2026-10-12', TODAY)).toBe('overdue'); // due yesterday
    expect(vaxStatusOn('upcoming', '2026-10-12', TODAY)).toBe('overdue');
    expect(vaxStatusOn('upcoming', '2026-10-13', TODAY)).toBe('due_soon'); // due today: not overdue
    expect(vaxStatusOn('upcoming', '2026-11-12', TODAY)).toBe('due_soon'); // 30 days out
    expect(vaxStatusOn('upcoming', '2026-11-13', TODAY)).toBe('upcoming');
  });

  it('never touches completed or undated records', () => {
    expect(vaxStatusOn('completed', '2026-10-01', TODAY)).toBe('completed');
    expect(vaxStatusOn('upcoming', null, TODAY)).toBe('upcoming');
    expect(vaxStatusOn('upcoming', 'not-a-date', TODAY)).toBe('upcoming');
  });
});
