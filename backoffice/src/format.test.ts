import { lbp, parseUsdToCents, pctText, timeAgo, usd } from './format';

describe('money', () => {
  it('formats USD with two decimals and thousands separators', () => {
    expect(usd(250)).toBe('$2.50');
    expect(usd(545000)).toBe('$5,450.00');
    expect(usd(0)).toBe('$0.00');
  });
  it('converts cents to LBP at the stored rate', () => {
    expect(lbp(250, 89500)).toBe('223,750 LBP');
    expect(lbp(100, 89500)).toBe('89,500 LBP');
  });
  it('parses typed prices into cents and rejects bad input', () => {
    expect(parseUsdToCents('2.5')).toBe(250);
    expect(parseUsdToCents('$12')).toBe(1200);
    expect(parseUsdToCents('0.05')).toBe(5);
    expect(parseUsdToCents('2.555')).toBeNull();
    expect(parseUsdToCents('abc')).toBeNull();
    expect(parseUsdToCents('')).toBeNull();
    expect(parseUsdToCents('-1')).toBeNull();
  });
});

describe('text helpers', () => {
  it('says how long ago a sync was', () => {
    const now = new Date('2026-11-01T12:00:00Z').getTime();
    expect(timeAgo(null, now)).toBe('Never');
    expect(timeAgo('2026-11-01T11:59:40Z', now)).toBe('Just now');
    expect(timeAgo('2026-11-01T11:50:00Z', now)).toBe('10 min ago');
  });
  it('words a week-on-week change', () => {
    expect(pctText(8, 'last week')).toEqual({ text: '+8% vs last week', good: true });
    expect(pctText(-3, 'last week')).toEqual({ text: '-3% vs last week', good: false });
    expect(pctText(null, 'last week').text).toBe('No data for last week');
  });
});
