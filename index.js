console.log('[atelier-site] Запуск Node.js...');
try {
  require('./server.js');
} catch (err) {
  console.error('[atelier-site] Ошибка старта:', err);
  process.exit(1);
}