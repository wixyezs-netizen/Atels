const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'dvin-guesthouse', 'css', 'style.css');
const dst = path.join(__dirname, 'public', 'css', 'style.css');
if (!fs.existsSync(src)) {
  console.warn('copy-css: нет', src);
  process.exit(0);
}
fs.mkdirSync(path.dirname(dst), { recursive: true });
fs.copyFileSync(src, dst);
console.log('CSS скопирован:', dst, fs.statSync(dst).size, 'bytes');
