const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'dvin-guesthouse');
const dst = path.join(__dirname, 'public');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const s = path.join(from, name);
    const d = path.join(to, name);
    if (fs.statSync(s).isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

if (!fs.existsSync(src)) {
  console.error('Нет папки dvin-guesthouse:', src);
  process.exit(1);
}

copyDir(src, dst);
console.log('Скопировано в public/');
console.log(fs.readdirSync(dst));
