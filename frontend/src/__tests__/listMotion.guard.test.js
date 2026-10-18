// CHW-236: list rows must not use Reanimated layout transitions. On Android a
// row's layout animation could stall when a row was inserted while its Card
// grew, leaving two rows drawn on top of each other until the screen
// remounted (seen in Reminders, reproduced on main). Rows may still fade out
// (`exiting`); the rest of the list just settles into place.
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');

function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return ['__tests__', 'node_modules'].includes(entry.name) ? [] : sourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

test('no screen or component animates list rows with a layout transition', () => {
  const offenders = sourceFiles(SRC)
    .filter((file) => /\blayout=\{|LinearTransition|SequencedTransition|CurvedTransition/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(SRC, file).replace(/\\/g, '/'));

  expect(offenders).toEqual([]);
});
