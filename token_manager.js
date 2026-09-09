// ================================================================
// token_manager.js — usa tokens fixos das env vars
// ================================================================

const UPDATERS = [];

function onTokensAtualizados(fn) { UPDATERS.push(fn); }

function getTokens() {
  const tokens = [];
  for (let i = 1; i <= 5; i++) {
    const t = process.env[`USER_TOKEN_${i}`];
    if (t) tokens.push(t);
  }
  return tokens;
}

// Dispara os callbacks DEPOIS que todos os requires terminarem
const tokens = getTokens();
if (tokens.length > 0) {
  process.nextTick(() => {
    UPDATERS.forEach(fn => fn(tokens));
  });
}

// Mantém a interface compatível
async function renovarTodos() {
  const tokens = getTokens();
  UPDATERS.forEach(fn => fn(tokens));
  return tokens;
}

module.exports = { getTokens, onTokensAtualizados, renovarTodos };