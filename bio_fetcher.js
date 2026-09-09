// ================================================================
// bio_fetcher.js — leitor de bio 100% JS (Node >= 18)
// ================================================================

const { HistoricoBio } = require('./models');
const { RequestBuilder } = require('@qnaplus/node-curl-impersonate');
const tokenManager = require('./token_manager');



// ================================================================
// PROXY CLOUDFLARE WORKER
// ================================================================
const PROXY_BASE =
  process.env.PROXY_BASE ||
  'https://discord-proxy-bio.limmathiassousa.workers.dev';

const CACHE_MS = 6 * 60 * 60 * 1000;

// Cache do perfil completo
const cachePerfilCompleto = new Map();

const cacheInacessivel = new Map();

// ---------------------------------------------------------------
// TOKENS
// ---------------------------------------------------------------
let TOKENS = [];

tokenManager.onTokensAtualizados((novosTokens) => {
  TOKENS = [...novosTokens];
  recriarEstadoTokens();
  console.log(`[bio] pool atualizado: ${TOKENS.length} tokens`);
});

// ---------------------------------------------------------------
// CAMADA 1 — Headers
// ---------------------------------------------------------------
const UA_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

let BUILD_NUMBER = 317422;

function gerarXSuperProperties() {
  const props = {
    os: 'Windows',
    browser: 'Chrome',
    device: '',
    system_locale: 'pt-BR',
    browser_user_agent: UA_CHROME,
    browser_version: '125.0.0.0',
    os_version: '10',
    client_build_number: BUILD_NUMBER,
    release_channel: 'stable',
    client_version: '1.0.202',
    os_arch: 'x64',
    app_patched: false,
    client_event_source: null,
  };

  return Buffer.from(JSON.stringify(props)).toString('base64');
}

async function atualizarBuildNumber() {
  try {
    const respHtml = await new RequestBuilder()
      .url(`${PROXY_BASE}/app`)
      .preset({ name: 'chrome', version: '125' })
      .send();

    const html = await extrairTexto(respHtml);

    const assets = [
      ...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g),
    ].map((m) => m[1]);

    for (const asset of assets) {
      const respJs = await new RequestBuilder()
        .url(`${PROXY_BASE}${asset}`)
        .preset({ name: 'chrome', version: '125' })
        .send();

      const js = await extrairTexto(respJs);

      const b = js.match(/"buildNumber":(\d+)/);

      if (b) {
        BUILD_NUMBER = Number(b[1]);
        console.log(`[bio] build number atualizado: ${BUILD_NUMBER}`);
        return;
      }
    }
  } catch {
    // mantém o último valor
  }
}

atualizarBuildNumber();
setInterval(atualizarBuildNumber, 12 * 60 * 60 * 1000);

function headersCliente(token) {
  return {
    authorization: token,
    accept: '*/*',
    'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'user-agent': UA_CHROME,
    'x-super-properties': gerarXSuperProperties(),
    'x-discord-locale': 'pt-BR',
    'x-debug-options': 'bugReporterEnabled',
    'sec-ch-ua':
      '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    referer: 'https://discord.com/channels/@me',
  };
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
let jaLogouFormato = false;

function logarFormatoResposta(response) {
  if (jaLogouFormato) return;

  jaLogouFormato = true;

  try {
    console.log(
      '[DEBUG bio] chaves da resposta:',
      Object.keys(response)
    );

    console.log(
      '[DEBUG bio] typeof response.response:',
      typeof response.response,
      'length:',
      response.response?.length
    );

    console.log(
      '[DEBUG bio] details:',
      JSON.stringify(response.details)
    );

    console.log('[DEBUG bio] stderr:', response.stderr);

    console.log(
      '[DEBUG bio] amostra response.response:',
      String(response.response).slice(0, 300)
    );
  } catch (e) {
    console.log('[DEBUG bio] erro ao logar formato:', e.message);
  }
}

function obterStatus(response) {
  return (
    response.status ??
    response.statusCode ??
    response.details?.status ??
    response.details?.statusCode ??
    response.details?.http_code ??
    response.details?.response_code ??
    null
  );
}

async function extrairTexto(response) {
  if (typeof response.response === 'string') {
    return response.response;
  }

  if (Buffer.isBuffer(response.response)) {
    return response.response.toString('utf-8');
  }

  if (typeof response.text === 'function') {
    return await response.text();
  }

  if (typeof response.body === 'string') {
    return response.body;
  }

  if (Buffer.isBuffer(response.body)) {
    return response.body.toString('utf-8');
  }

  if (typeof response.data === 'string') {
    return response.data;
  }

  return String(
    response.response ??
      response.body ??
      response.data ??
      ''
  );
}

async function extrairJson(response) {
  if (typeof response.json === 'function') {
    return await response.json();
  }

  const texto = await extrairTexto(response);

  if (!texto || !texto.trim()) {
    throw new Error(
      'resposta vazia — não deu pra extrair JSON'
    );
  }

  return JSON.parse(texto);
}

// ---------------------------------------------------------------
// CAMADA 2 — Fila
// ---------------------------------------------------------------
const filaPerfil = [];
let processando = false;

function enfileirar(fn) {
  return new Promise((resolve, reject) => {
    filaPerfil.push({
      fn,
      resolve,
      reject,
    });

    processarFila();
  });
}

async function processarFila() {
  if (processando || !filaPerfil.length) return;

  processando = true;

  while (filaPerfil.length) {
    const { fn, resolve, reject } = filaPerfil.shift();

    try {
      const token = obterToken();

      if (!token) {
        reject(
          new Error(
            'todos os tokens estão mortos ou pausados'
          )
        );

        continue;
      }

      resolve(await fn());
    } catch (e) {
      reject(e);
    }
  }

  processando = false;
}

// ---------------------------------------------------------------
// CAMADA 3 — Pool de tokens
// ---------------------------------------------------------------
const estadoTokens = new Map();

function recriarEstadoTokens() {
  estadoTokens.clear();

  for (const t of TOKENS) {
    estadoTokens.set(t, {
      vivo: true,
      pausadoAte: 0,
      erros: 0,
    });
  }
}

let bloqueioGlobalAte = 0;
let bloqueiosSeguidos = 0;

function obterToken() {
  if (Date.now() < bloqueioGlobalAte) {
    return null;
  }

  for (const t of TOKENS) {
    const e = estadoTokens.get(t);

    if (
      e &&
      e.vivo &&
      Date.now() >= e.pausadoAte
    ) {
      return t;
    }
  }

  return null;
}

// ---------------------------------------------------------------
// CARGA INICIAL
// ---------------------------------------------------------------
const tokensIniciais = tokenManager.getTokens();

TOKENS = [...tokensIniciais];

recriarEstadoTokens();

console.log(
  `[bio] ${TOKENS.length} tokens carregados (síncrono)`
);

// ================================================================
// getUserBio — agora é só um wrapper do getUserPerfil
// ================================================================
async function getUserBio(userId, guildId, { force = false } = {}) {
  if (!force) {
    const ultimo = await HistoricoBio.findOne({ userId }).sort({ registradoEm: -1 }).catch(() => null);
    if (ultimo && Date.now() - ultimo.registradoEm < CACHE_MS) {
      return ultimo.bio || '';
    }
  }

  const perfil = await getUserPerfil(userId, guildId, { force: true });
  return perfil.bio;
}

// ================================================================
// getUserPerfil — PERFIL COMPLETO
// ================================================================
async function getUserPerfil(
  userId,
  guildId, // agora pode ser null
  { force = false } = {}
) {
  if (!force) {
    const cache = cachePerfilCompleto.get(userId);

    if (cache && Date.now() - cache.timestamp < CACHE_MS) {
      return {
        bio: cache.bio,
        pronouns: cache.pronouns,
        privado: cache.privado,
        connections: cache.connections,
      };
    }
  }

  // NOVO: se sabemos que esse usuário é inacessível, nem tenta de novo
  if (
    cacheInacessivel.get(userId) &&
    Date.now() - cacheInacessivel.get(userId) < 10 * 60 * 1000
  ) {
    throw new Error('nenhuma conta de consulta compartilhada');
  }

  return enfileirar(async () => {
    const token = obterToken();

    if (!token) {
      throw new Error('todos os tokens estão mortos ou pausados');
    }

    // ---- helper: monta e envia a requisição (guildId agora é opcional) ----
    const pedirPerfil = async (gid) => {
      let url = `${PROXY_BASE}/api/v9/users/${userId}/profile?with_mutual_guilds=false&with_mutual_friends_count=false`;
      if (gid) url += `&guild_id=${gid}`;

      let builder = new RequestBuilder().url(url).preset({ name: 'chrome', version: '125' });

      const headers = headersCliente(token);
      for (const [chave, valor] of Object.entries(headers)) {
        builder = builder.header(chave, valor);
      }

      return builder.send();
    };

    // ---- helper: interpreta a resposta (bio pode vir em user.bio também) ----
    const interpretar = (data) => ({
      bio: data.user_profile?.bio || data.user?.bio || '',
      pronouns: data.user_profile?.pronouns || '',
      privado: data.private === true,
      connections: data.connected_accounts || [],
    });

    try {
      const response = await pedirPerfil(guildId ?? null);

      logarFormatoResposta(response);

      const status = obterStatus(response);
      const e = estadoTokens.get(token);

      if (status === 200) {
        bloqueiosSeguidos = 0;

        const data = await extrairJson(response);
        let resultado = interpretar(data);

        // ------------------------------------------------------------
        // Fallback: pediu com guild_id mas o usuário NÃO está nesse
        // servidor → a bio vem vazia. Refaz SEM o guild_id para pegar
        // a bio global.
        // ------------------------------------------------------------
        if (guildId && !resultado.privado && !resultado.bio.trim() && !resultado.connections.length) {
          const resp2 = await pedirPerfil(null);

          if (obterStatus(resp2) === 200) {
            const data2 = await extrairJson(resp2);
            const r2 = interpretar(data2);

            if (r2.bio.trim() || r2.connections.length) {
              resultado = r2;
            }
          }
        }

        cachePerfilCompleto.set(userId, { ...resultado, timestamp: Date.now() });
        return resultado;
      }

      // ====== ddaqui pra baixo é exatamente o seu código atual (429/403/401/400+) ======
      if (status === 429) {
        const retryAfter = response.details?.headers?.['retry-after'] ?? 300;
        e.pausadoAte = Date.now() + Number(retryAfter) * 1000 + 1000;
        throw new Error(`429 — pausa de ${retryAfter}s`);
      }

      if (status === 403) {
        const corpo = await extrairTexto(response).catch(() => '');

        if (corpo.includes('40333') || corpo.includes('internal network error')) {
          bloqueiosSeguidos++;
          bloqueioGlobalAte = Date.now() + Math.min(10 * 60 * 1000 * bloqueiosSeguidos, 60 * 60 * 1000);
          throw new Error('40333 — bloqueio Cloudflare');
        }

        if (/captcha|verify your account|flagged/i.test(corpo)) {
          e.pausadoAte = Date.now() + 60 * 60 * 1000;
          throw new Error('403 — conta sob suspeita');
        }

        e.vivo = false;
        throw new Error('403 — token morta');
      }

      if (status === 401) {
        e.vivo = false;
        throw new Error('401 — token morta');
      }
      
      if (status === 404) {
      	
      	if (Date.now() - (cacheInacessivel.get(userId) || 0) > 10 * 60 * 1000) {
            cacheInacessivel.set(userId, Date.now());
          }
       
        throw new Error('nenhuma conta de consulta compartilhada');
      }

      if (status && status >= 400) {
        e.erros++;
        if (e.erros >= 3) {
          e.pausadoAte = Date.now() + 10 * 60 * 1000;
          e.erros = 0;
        }
        throw new Error(`HTTP ${status}`);
      }

      // BLOCO 2
      const data = await extrairJson(response);
      return interpretar(data);
    } catch (err) {
      console.error('[perfil] erro:', err.message);
      throw err;
    }
  });
}

// ================================================================
// EXPORTS
// ================================================================
module.exports = {
  getUserBio,
  getUserPerfil,
};