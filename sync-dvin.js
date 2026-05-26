const fs = require('fs');
const path = require('path');
const log = [];
const src = 'C:\\Users\\QWERTY_\\dvin-guesthouse';
const files = [
  ['css/style.css', 'public/css/style.css'],
  ['js/main.js', 'public/js/main.js'],
  ['js/gallery.js', 'public/js/gallery.js'],
  ['images/manifest.json', 'public/images/manifest.json'],
];
const base = 'C:\\Users\\QWERTY_\\atelier-site';
for (const [from, to] of files) {
  const s = path.join(src, from);
  const d = path.join(base, to);
  fs.mkdirSync(path.dirname(d), { recursive: true });
  fs.copyFileSync(s, d);
  log.push('OK ' + to + ' ' + fs.statSync(d).size);
}
fs.writeFileSync(path.join(base, 'sync-log.txt'), log.join('\n'));
