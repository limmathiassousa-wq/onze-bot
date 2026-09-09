const Redis = require('ioredis');
const redis = new Redis(process.env.REDIS_URL);

redis.on('connect', () => console.log('[Redis] Conectado com sucesso!'));
redis.on('error', (err) => console.error('--- Erro no Redis ---', err));

module.exports = redis;