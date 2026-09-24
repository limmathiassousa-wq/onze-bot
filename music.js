// music.js — sistema de música via Lavalink (Kazagumo), no lugar do
// DisTube + yt-dlp antigo.
//
// Por que isso resolve o bloqueio de IP: quem baixa o áudio de verdade
// não é mais o seu bot na Render — é o node Lavalink (um servidor público,
// de graça, mantido pela comunidade, com IP diferente do da Render). O bot
// só manda "toca essa música" pro node e recebe o áudio já pronto.
//
// Busca por link do Spotify: sem precisar de API key/conta de desenvolvedor.
// A gente lê o <title> da própria página pública do Spotify (formato
// "Nome da Música - song by Artista | Spotify"), extrai nome+artista, e
// busca isso no YouTube através do próprio node Lavalink.

const { Kazagumo } = require('kazagumo');
const { Connectors } = require('shoukaku');

// Nodes públicos e gratuitos. Nodes públicos caem ou mudam de endereço com
// frequência — por isso a lista tem mais de um (o Shoukaku troca pro
// próximo sozinho se um cair). Se ambos pararem de responder, pegue nodes
// atualizados em:
// https://lavalink-list.darrennathanael.com/  (lista com status ao vivo)
// https://github.com/DarrenOfficial/lavalink-list
const NODES = [
    {
        name: 'node-1',
        url: 'lavalink.jirayu.net:13592',
        auth: 'youshallnotpass',
        secure: false
    },
    {
        name: 'node-2',
        url: 'lava-v4.ajieblogs.eu.org:443',
        auth: 'https://dsc.gg/ajidevserver',
        secure: true
    }
];

let kazagumo = null;

function iniciarMusica(client) {
    kazagumo = new Kazagumo(
        {
            defaultSearchEngine: 'youtube',
            send: (guildId, payload) => {
                const guild = client.guilds.cache.get(guildId);
                if (guild) guild.shard.send(payload);
            }
        },
        new Connectors.DiscordJS(client),
        NODES
    );

    kazagumo.shoukaku.on('ready', (name) =>
        console.log(`[MÚSICA] Node Lavalink "${name}" conectado.`)
    );
    kazagumo.shoukaku.on('error', (name, err) =>
        console.error(`[MÚSICA] Erro no node "${name}":`, err?.message || err)
    );
    kazagumo.shoukaku.on('close', (name, code, reason) =>
        console.warn(`[MÚSICA] Node "${name}" fechou a conexão (code ${code}): ${reason}`)
    );
    kazagumo.shoukaku.on('disconnect', (name) =>
        console.warn(`[MÚSICA] Node "${name}" desconectou. Tentando outro node da lista...`)
    );

    kazagumo.on('playerStart', (player, track) => {
        const canal = client.channels.cache.get(player.textId);
        if (canal) canal.send(`🎶 Tocando agora: **${track.title}**`).catch(() => {});
    });

    kazagumo.on('playerEmpty', (player) => {
        const canal = client.channels.cache.get(player.textId);
        if (canal) canal.send('Fila acabou, saindo da call.').catch(() => {});
        player.destroy();
    });

    kazagumo.on('playerException', (player, payload) => {
        console.error('[MÚSICA] Erro no player:', payload?.exception || payload);
        const canal = client.channels.cache.get(player.textId);
        if (canal) canal.send('Deu erro nessa música, pulando pra próxima...').catch(() => {});
    });

    console.log('[MÚSICA] Kazagumo inicializado, conectando aos nodes...');
    return kazagumo;
}

function ehLinkSpotify(texto) {
    return /open\.spotify\.com\/(track|album|playlist)\//i.test(texto);
}

// Extrai "Nome da Música Artista" a partir da página pública do Spotify,
// sem precisar de client id/secret nem login — só lendo o <title> da página,
// que o próprio Spotify preenche com "Música - song by Artista | Spotify".
async function resolverSpotify(url) {
    const resposta = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    if (!resposta.ok) {
        throw new Error(`Spotify respondeu ${resposta.status} ao tentar ler a página.`);
    }

    const html = await resposta.text();
    const tituloTag = html.match(/<title>(.*?)<\/title>/i)?.[1];

    if (!tituloTag) {
        throw new Error('Não achei o título da página do Spotify.');
    }

    // "Nome - song by Artista | Spotify" / "Nome - single by Artista | Spotify"
    // -> "Nome Artista"
    const limpo = tituloTag
        .replace(/\s*\|\s*Spotify\s*$/i, '')
        .replace(/\s*-\s*(song|single|album|playlist)\s+by\s+/i, ' ')
        .trim();

    return limpo;
}

// --- Função principal, chamada pelo comando /play ---
async function tocarMusica(interaction, query) {
    if (!kazagumo) {
        return interaction.editReply({
            content: 'Sistema de música ainda está inicializando, tenta de novo em uns segundos.'
        });
    }

    const canalVoz = interaction.member?.voice?.channel;
    if (!canalVoz) {
        return interaction.editReply({ content: 'Você precisa estar em um canal de voz pra usar isso.' });
    }

    let buscaFinal = query;

    if (ehLinkSpotify(query)) {
        try {
            buscaFinal = await resolverSpotify(query);
            console.log(`[MÚSICA] Link do Spotify resolvido pra: "${buscaFinal}"`);
        } catch (err) {
            console.error('--- Erro ao resolver link do Spotify ---', err);
            return interaction.editReply({ content: 'Não consegui identificar essa música a partir do link do Spotify.' });
        }
    }

    let player = kazagumo.players.get(interaction.guild.id);

    if (!player) {
        player = await kazagumo.createPlayer({
            guildId: interaction.guild.id,
            textId: interaction.channel.id,
            voiceId: canalVoz.id,
            volume: 80,
            deaf: true
        });
    }

    let resultado;
    try {
        resultado = await kazagumo.search(buscaFinal, { requester: interaction.user });
    } catch (err) {
        console.error('--- Erro ao buscar música (Lavalink) ---', err);
        return interaction.editReply({ content: 'Deu erro buscando essa música. Tenta de novo em instantes (pode ser o node do Lavalink oscilando).' });
    }

    if (!resultado || !resultado.tracks.length) {
        return interaction.editReply({ content: `Não encontrei nada pra "${buscaFinal}".` });
    }

    if (resultado.type === 'PLAYLIST') {
        player.queue.add(resultado.tracks);
        await interaction.editReply({
            content: `Adicionei a playlist **${resultado.playlistName}** (${resultado.tracks.length} música(s)) na fila.`
        });
    } else {
        player.queue.add(resultado.tracks[0]);
        await interaction.editReply({ content: `Adicionei **${resultado.tracks[0].title}** na fila.` });
    }

    if (!player.playing && !player.paused) player.play();
}

module.exports = { iniciarMusica, tocarMusica };
