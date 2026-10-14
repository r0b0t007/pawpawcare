// Non-text contrast (WCAG 1.4.11): field outlines and status colors must
// reach 3:1 against every light surface they sit on.
import { ui } from '../index';

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test.each(['inputBorder', 'warn', 'ringOk'])('%s reaches 3:1 on background, surface and selectedTint', (token) => {
  ['background', 'surface', 'selectedTint'].forEach((bg) => {
    expect(contrast(ui[token], ui[bg])).toBeGreaterThanOrEqual(3);
  });
});
