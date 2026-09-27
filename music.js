// music.js — sistema de música via Lavalink (Kazagumo) com painel de controle
// em Components V2 (embeds "novo estilo": Container/TextDisplay/Separator/
// Section/ActionRow), botões com emoji customizado, select menus e modais.
//
// Por que isso resolve o bloqueio de IP: quem baixa o áudio de verdade não é
// o bot na Render — é o node Lavalink (servidor público, com IP diferente).
//
// Busca por link do Spotify: lê o <title> da página pública do Spotify
// ("Nome - song by Artista | Spotify"), extrai nome+artista e busca isso no
// YouTube através do próprio node Lavalink (sem precisar de API key).

const { Kazagumo } = require('kazagumo');
const { Connectors } = require('shoukaku');
const { getVoiceConnection } = require('@discordjs/voice');
const { botCallDB } = require('./state');
const {
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    SectionBuilder,
    ThumbnailBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    UserSelectMenuBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');

// ---------------------------------------------------------------------------
// Emojis customizados usados no painel de música (defina os IDs certos do
// seu servidor de emojis aqui, caso troque algum no futuro).
// ---------------------------------------------------------------------------
const EMOJI = {
    mais: '<:mais:1548558348863938660>',
    carregando: '<a:carregando:1548558543253409882>',
    voltar: '<:seta2:1551792590431715328>',
    pausar: '<:stop:1551794465000136755>',   // mostrado enquanto TOCA (clicar pausa)
    retomar: '<:play:1551794618381639782>',  // mostrado enquanto PAUSADO (clicar retoma)
    avancar: '<:seta1:1551792510810984569>',
    sair: '<:24733:1551796338365300786>',
    filaContinuaOff: '<:25787:1553529126655107152>',
    filaContinuaOn: '<:25786:1553529109903056906>'
};

// ---------------------------------------------------------------------------
// Nodes públicos e gratuitos de Lavalink. Caem/mudam com frequência — por
// isso a lista tem mais de um. Se todos pararem de responder, pegue nodes
// atualizados em https://lavalink-list.darrennathanael.com/
// ---------------------------------------------------------------------------
const NODES = [
    {
        // Lavalink rodando dentro do próprio serviço Render (veja lavalink-launcher.js).
        // Fica sempre em primeiro: é o mais rápido e confiável, já que roda localmente.
        name: 'local',
        url: 'localhost:2333',
        auth: '050612@rayan', // precisa ser IGUAL à senha no application.yml
        secure: false
    },
    {
        name: 'serenetia',
        url: 'lavalinkv4.serenetia.com:443',
        auth: 'https://dsc.gg/ajidevserver',
        secure: true
    },
    {
        name: 'ajieblogs',
        url: 'lava-v4.ajieblogs.eu.org:443',
        auth: 'https://dsc.gg/ajidevserver',
        secure: true
    },
    // stackryze removido: deu ECONNREFUSED constante no log (node caiu ou
    // bloqueou conexões do Render). Como o "local" já está funcionando, não
    // faz falta.
    {
        name: 'jirayu',
        url: 'lavalink.jirayu.net:13592',
        auth: 'youshallnotpass',
        secure: false
    }
    // heaven-us / heaven-eu removidos: o domínio heavencloud.in não resolve
    // mais (ENOTFOUND nos logs), o node saiu do ar / mudou de domínio.
];

let kazagumo = null;
let clienteBot = null;

// Cache temporário das buscas feitas pelo modal "Adicionar à fila", pra
// alimentar o select menu de resultados sem estourar o limite de 100
// caracteres de um customId. Cada entrada expira sozinha em 5 minutos.
const buscaCache = new Map();

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
function iniciarMusica(client) {
    clienteBot = client;

    kazagumo = new Kazagumo(
        {
            defaultSearchEngine: 'youtube',
            send: (guildId, payload) => {
                const guild = client.guilds.cache.get(guildId);
                if (guild) guild.shard.send(payload);
            }
        },
        new Connectors.DiscordJS(client),
        [], // os nodes são conectados manualmente logo abaixo (ver conectarNodes)
        {
            // reconnectTries * reconnectInterval = tempo total tentando cada node.
            // No Render free o Java do Lavalink local pode levar 2-3 min pra subir
            // (CPU compartilhada é lenta), então precisa de bastante margem aqui.
            reconnectTries: 40,
            reconnectInterval: 10, // 40 * 10s = ~6,5 min de tentativas
            restTimeout: 15000,
            moveOnDisconnect: false
        }
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

    // --- Eventos de reprodução: é aqui que o painel público é criado/atualizado ---
    kazagumo.on('playerStart', (player, track) => {
        const anterior = player.data.get('faixaAtual');
        if (anterior) {
            const historico = player.data.get('historico') || [];
            historico.push(anterior);
            player.data.set('historico', historico);
        }
        player.data.set('faixaAtual', track);
        enviarPainel(player).catch((err) => console.error('--- Erro ao enviar painel de música ---', err));
    });

    kazagumo.on('playerEmpty', async (player) => {
        // Fila natural acabou (a música que estava tocando já saiu sozinha da
        // fila, isso é padrão do Kazagumo). Como não sobrou nada pra tocar em
        // seguida, o bot sempre busca uma música pra continuar a festa — não
        // sai da call sozinho, só quando o botão de sair for clicado ou o DJ
        // sair da call sem substituto.
        //
        // "Fila contínua" ativa deixa a busca mais restrita: só músicas da
        // mesma banda/artista da que acabou de tocar. Desativada, a busca é
        // mais aberta (menos "clone" da mesma banda, mais variedade).
        const atual = player.data.get('faixaAtual');
        const restrito = !!player.data.get('autoplay');
        try {
            const termo = restrito
                ? (atual?.author || atual?.title)
                : (atual?.title ? `${atual.title} mix` : atual?.author);
            if (termo) {
                const resultado = await kazagumo.search(termo, { requester: atual?.requester });
                const candidatos = (resultado?.tracks || []).filter((t) => t.uri !== atual?.uri);
                const escolhida = candidatos[0] || resultado?.tracks?.[0];
                if (escolhida) {
                    player.queue.add(escolhida);
                    player.play();
                    return;
                }
            }
        } catch (err) {
            console.error('--- Erro ao buscar próxima música automaticamente ---', err);
        }

        // Só desiste e sai da call se a busca falhou de verdade.
        await limparPainel(player);
        player.destroy();
    });

    kazagumo.on('playerException', (player, payload) => {
        console.error('[MÚSICA] Erro no player:', payload?.exception || payload);
        const canal = clienteBot.channels.cache.get(player.textId);
        if (canal) canal.send('Deu erro nessa música, pulando pra próxima...').catch(() => {});
    });

    // O conector do Shoukaku só conecta os nodes num client.once('ready'). Como o
    // iniciarMusica() é chamado de dentro do 'clientReady' (o ready já aconteceu),
    // esse evento nunca dispara e os nodes ficam sem conectar — por isso a gente
    // dispara a conexão na mão aqui.
    const conectarNodes = () => {
        const conector = kazagumo.shoukaku.connector;
        if (typeof conector.ready === 'function') {
            conector.ready(NODES);
        } else {
            kazagumo.shoukaku.id = client.user.id;
            for (const n of NODES) kazagumo.shoukaku.addNode(n);
        }
    };

    if (client.isReady()) conectarNodes();
    else client.once('clientReady', conectarNodes);

    // Quem sai da call e era o DJ: passa o controle pra quem ficou, ou o bot
    // sai sozinho se a call ficou vazia.
    client.on('voiceStateUpdate', tratarSaidaDaCall);

    // Botões / select menus / modais do painel de música. Registrado à parte
    // do roteador gigante do index.js — só reage a customId que comece com
    // "music_", então convive sem conflito com o resto do bot.
    client.on('interactionCreate', async (interaction) => {
        try {
            if (interaction.isButton() && interaction.customId.startsWith('music_')) {
                await tratarBotaoMusica(interaction);
            } else if (interaction.isUserSelectMenu() && interaction.customId.startsWith('music_')) {
                await tratarUserSelectMusica(interaction);
            } else if (interaction.isStringSelectMenu() && interaction.customId.startsWith('music_')) {
                await tratarSelectMusica(interaction);
            } else if (interaction.isModalSubmit() && interaction.customId.startsWith('music_')) {
                await tratarModalMusica(interaction);
            }
        } catch (err) {
            console.error('--- Erro numa interação de música ---', err);
            const payload = { content: 'Deu erro processando isso, tenta de novo.', flags: [MessageFlags.Ephemeral] };
            if (interaction.deferred || interaction.replied) {
                interaction.editReply(payload).catch(() => {});
            } else {
                interaction.reply(payload).catch(() => {});
            }
        }
    });

    console.log('[MÚSICA] Kazagumo inicializado, conectando aos nodes...');
    return kazagumo;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function ehLinkSpotify(texto) {
    return /open\.spotify\.com\/(track|album|playlist)\//i.test(texto);
}

// Extrai "Nome da Música Artista" a partir da página pública do Spotify, sem
// precisar de client id/secret nem login — só lendo o <title> da página.
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

    const limpo = tituloTag
        .replace(/\s*\|\s*Spotify\s*$/i, '')
        .replace(/\s*-\s*(song|single|album|playlist|track)(\s+and\s+lyrics)?\s+by\s+/i, ' ')
        .trim();

    return limpo;
}

function formatarDuracao(ms) {
    if (!ms || ms <= 0) return '00:00';
    const totalSeg = Math.floor(ms / 1000);
    const min = Math.floor(totalSeg / 60);
    const seg = totalSeg % 60;
    return `${min}:${String(seg).padStart(2, '0')}`;
}

function truncar(texto, max) {
    if (!texto) return '???';
    return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

function ehDJ(interaction, player) {
    return interaction.user.id === player.data.get('djId');
}

async function semPermissao(interaction) {
    return interaction.reply({
        content: '🔒 Só quem está no controle da música (DJ) pode usar isso.',
        flags: [MessageFlags.Ephemeral]
    });
}

// ---------------------------------------------------------------------------
// Containers (Components V2)
// ---------------------------------------------------------------------------
function containerTexto(...linhas) {
    const container = new ContainerBuilder();
    for (const linha of linhas) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(linha));
    }
    return container;
}

function containerErro(mensagem) {
    return containerTexto(`❌ ${mensagem}`);
}

function containerBuscando() {
    return containerTexto(`${EMOJI.carregando} **Buscando música... aguarde**`);
}

function containerMusicaTocando(track, usuario) {
    const cabecalho = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Música tocando\n${track.title} — ${formatarDuracao(track.length)}`),
        new TextDisplayBuilder().setContent(`-# **Executado por:** ${usuario}`)
    );
    if (track.thumbnail) cabecalho.setThumbnailAccessory(new ThumbnailBuilder().setURL(track.thumbnail));

    return new ContainerBuilder()
        .addSectionComponents(cabecalho)
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('music_addqueue_btn')
                    .setLabel('Adicionar à fila')
                    .setEmoji(EMOJI.mais)
                    .setStyle(ButtonStyle.Secondary)
            )
        );
}

function containerResultados(tracks, cacheKey) {
    const opcoes = tracks.slice(0, 25).map((t, i) =>
        new StringSelectMenuOptionBuilder()
            .setLabel(truncar(`${t.title} — ${t.author}`, 100))
            .setDescription(truncar(t.isStream ? 'Ao vivo' : `Duração: ${formatarDuracao(t.length)}`, 100))
            .setValue(String(i))
    );

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Músicas encontradas: ${tracks.length}`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# **Escolha abaixo a música que deseja**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`music_pick_${cacheKey}`)
                    .setPlaceholder('Selecione uma música')
                    .addOptions(opcoes)
            )
        );
}

function containerAdicionada(track) {
    return containerTexto(`✅ **${track.title}** foi adicionada à fila.`);
}

function containerFila(player) {
    const fila = [...player.queue];

    if (!fila.length) {
        return containerTexto('### Fila', '-# Não há músicas na fila.');
    }

    const container = new ContainerBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Fila (${fila.length})`)
    );

    fila.forEach((t, i) => {
        const requisitante = t.requester?.username ?? t.requester?.tag ?? 'desconhecido';
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${t.title} · ${t.author} · ${requisitante}`)
        );
        if (i < fila.length - 1) container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    });

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const opcoes = fila.slice(0, 25).map((t, i) =>
        new StringSelectMenuOptionBuilder().setLabel(truncar(`${t.title} — ${t.author}`, 100)).setValue(String(i))
    );

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('music_queue_remove')
                .setPlaceholder('Remover música(s) da fila')
                .setMinValues(1)
                .setMaxValues(opcoes.length)
                .addOptions(opcoes)
        )
    );

    return container;
}

function containerTransferirDJ() {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Selecione quem vai virar o(a) novo(a) DJ:'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('music_transfer_select')
                    .setPlaceholder('Selecione o novo DJ')
                    .setMinValues(1)
                    .setMaxValues(1)
            )
        );
}

// Painel principal ("Tocando agora"), enviado ao canal (não efêmero) sempre
// que uma nova música começa a tocar. `desativado` congela os botões (usado
// quando o DJ sai da call e ninguém ainda assumiu o controle via clique).
function construirPainelPrincipal(player, opts = {}) {
    const desativado = !!opts.desativado;
    const atual = player.data.get('faixaAtual') || player.queue.current;
    const autoplay = !!player.data.get('autoplay');
    const historico = player.data.get('historico') || [];
    const volume = player.data.get('volume') ?? player.volume ?? 80;
    const pausado = !!player.paused;

    const cabecalho = new SectionBuilder().addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`### Tocando agora\n${atual?.title ?? '???'} — ${atual?.author ?? '???'}`),
        new TextDisplayBuilder().setContent(`-# **Duração:** ${atual?.isStream ? 'Ao vivo' : formatarDuracao(atual?.length)}`)
    );
    if (atual?.thumbnail) cabecalho.setThumbnailAccessory(new ThumbnailBuilder().setURL(atual.thumbnail));

    return new ContainerBuilder()
        .addSectionComponents(cabecalho)
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('music_rewind')
                    .setEmoji(EMOJI.voltar)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(desativado || historico.length === 0),
                new ButtonBuilder()
                    .setCustomId('music_pauseresume')
                    .setEmoji(pausado ? EMOJI.retomar : EMOJI.pausar)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(desativado),
                new ButtonBuilder()
                    .setCustomId('music_forward')
                    .setEmoji(EMOJI.avancar)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(desativado)
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('music_volume')
                    .setLabel(`Volume ${volume}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(desativado),
                new ButtonBuilder()
                    .setCustomId('music_leave')
                    .setEmoji(EMOJI.sair)
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(desativado)
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('music_menu')
                    .setPlaceholder('Mais opções')
                    .setDisabled(desativado)
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel(`Fila contínua (${autoplay ? 'Ativada' : 'Desativada'})`)
                            .setDescription('Ativa: só músicas da mesma banda. Desativada: mais variedade')
                            .setValue('autoplay_toggle'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Adicionar à fila')
                            .setDescription('Busca e adiciona uma nova música na fila')
                            .setValue('add_queue'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Fila')
                            .setDescription('Mostra as próximas músicas da fila')
                            .setValue('view_queue'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Passar controles')
                            .setDescription('Escolhe quem vai controlar a música')
                            .setValue('transfer_dj')
                    )
            )
        );
}

// ---------------------------------------------------------------------------
// Painel: enviar / limpar
// ---------------------------------------------------------------------------
async function enviarPainel(player) {
    const canal = clienteBot.channels.cache.get(player.textId);
    if (!canal) return;

    await limparPainel(player);

    const container = construirPainelPrincipal(player);
    const msg = await canal
        .send({ components: [container], flags: [MessageFlags.IsComponentsV2] })
        .catch((err) => {
            console.error('--- Erro ao enviar painel de música ---', err);
            return null;
        });

    if (msg) player.data.set('panelMessageId', msg.id);
}

async function limparPainel(player) {
    const panelId = player.data.get('panelMessageId');
    if (!panelId) return;
    const canal = clienteBot.channels.cache.get(player.textId);
    if (!canal) return;
    await canal.messages.delete(panelId).catch(() => {});
    player.data.delete('panelMessageId');
}

async function desativarPainel(player) {
    const panelId = player.data.get('panelMessageId');
    if (!panelId) return;
    const canal = clienteBot.channels.cache.get(player.textId);
    if (!canal) return;
    const container = construirPainelPrincipal(player, { desativado: true });
    await canal.messages
        .edit(panelId, { components: [container], flags: [MessageFlags.IsComponentsV2] })
        .catch(() => {});
}

// ---------------------------------------------------------------------------
// Comando /play
// ---------------------------------------------------------------------------
async function tocarMusica(interaction, query) {
    if (!kazagumo) {
        return interaction.editReply({ content: 'Sistema de música ainda está inicializando, tenta de novo em uns segundos.' });
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
        // state === 2 é Constants.State.CONNECTED no Shoukaku (0=CONNECTING,
        // 1=NEARLY, 2=CONNECTED, 3=RECONNECTING, 4=DISCONNECTING, 5=DISCONNECTED).
        // Antes checava === 1 (NEARLY), que é só um estado de transição — por
        // isso o /play quase sempre dizia "nenhum servidor online" mesmo com
        // o node local perfeitamente conectado.
        const nodeOnline = [...kazagumo.shoukaku.nodes.values()].some((n) => n.state === 2);
        if (!nodeOnline) {
            console.error('[MÚSICA] /play chamado, mas nenhum node Lavalink está conectado.');
            return interaction.editReply({ content: 'Nenhum servidor de música está online agora. Tenta de novo em instantes.' });
        }

        // O sistema de "BotCall" (@discordjs/voice) e o Kazagumo/Shoukaku não podem
        // ter conexão de voz ativa ao mesmo tempo no mesmo servidor: se o BotCall já
        // estiver conectado, o Discord trata a entrada do Kazagumo como só uma troca
        // de canal dentro da MESMA sessão e não reenvia o VOICE_SERVER_UPDATE — aí o
        // Shoukaku fica esperando o pacote que nunca chega e trava em 15s de timeout.
        // Destruindo a conexão antiga primeiro, o Discord manda tudo de novo do zero.
        const conexaoBotCall = getVoiceConnection(interaction.guild.id);
        if (conexaoBotCall) {
            console.log('[MÚSICA] Encerrando conexão do BotCall nesse servidor antes de entrar com o Kazagumo.');
            conexaoBotCall.destroy();

            // Atualiza o Map em memória (mesmo formato usado em index.js/functions.js)
            // pra o painel do BotCall não continuar mostrando "conectado".
            const dadosAtuais = botCallDB.get(interaction.guild.id) || { canalId: null, conectado: false };
            botCallDB.set(interaction.guild.id, { canalId: dadosAtuais.canalId, conectado: false });

            // require tardio (só na hora de usar) pra evitar dependência circular:
            // functions.js -> commands.js -> music.js já existe, então music.js não
            // pode dar require('./functions') lá no topo do arquivo.
            try {
                const { removerVoiceState, atualizarPainelBotCallAuto } = require('./functions');
                await removerVoiceState(interaction.guild.id);
                await atualizarPainelBotCallAuto(interaction.guild.id);
            } catch (err) {
                console.error('--- Erro ao limpar voice state do BotCall no banco ---', err);
            }
        }

        try {
            player = await kazagumo.createPlayer({
                guildId: interaction.guild.id,
                textId: interaction.channel.id,
                voiceId: canalVoz.id,
                volume: 80,
                deaf: true
            });
        } catch (err) {
            console.error('--- Erro ao criar player (Lavalink) ---', err);
            return interaction.editReply({ content: 'Não consegui entrar na call agora. Tenta de novo em instantes.' });
        }

        // Sessão nova: quem chamou o /play primeiro vira o DJ da festa.
        player.data.set('djId', interaction.user.id);
        player.data.set('autoplay', false);
        player.data.set('volume', 80);
        player.data.set('historico', []);
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

    const trackEscolhida = resultado.tracks[0];

    if (resultado.type === 'PLAYLIST') {
        player.queue.add(resultado.tracks);
    } else {
        player.queue.add(trackEscolhida);
    }

    if (!player.playing && !player.paused) player.play();

    await interaction.editReply({
        components: [containerMusicaTocando(trackEscolhida, interaction.user)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

// ---------------------------------------------------------------------------
// Fluxo de busca (usado pelo botão da confirmação do /play e pela opção
// "Adicionar à fila" do painel principal)
// ---------------------------------------------------------------------------
async function abrirModalBusca(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('music_modal_search')
        .setTitle('Adicionar música')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('query')
                    .setLabel('Nome ou link da música')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );
    return interaction.showModal(modal);
}

async function processarBuscaModal(interaction) {
    const player = kazagumo.players.get(interaction.guildId);
    if (!player) {
        return interaction.reply({ content: 'Não há player de música ativo nesse servidor.', flags: [MessageFlags.Ephemeral] });
    }
    if (!ehDJ(interaction, player)) return semPermissao(interaction);

    const queryTexto = interaction.fields.getTextInputValue('query');

    await interaction.reply({
        components: [containerBuscando()],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });

    let buscaFinal = queryTexto;
    if (ehLinkSpotify(queryTexto)) {
        try {
            buscaFinal = await resolverSpotify(queryTexto);
        } catch (err) {
            console.error('--- Erro ao resolver link do Spotify ---', err);
            return interaction.editReply({
                components: [containerErro('Não consegui identificar essa música a partir do link do Spotify.')],
                flags: [MessageFlags.IsComponentsV2]
            });
        }
    }

    let resultado;
    try {
        resultado = await kazagumo.search(buscaFinal, { requester: interaction.user });
    } catch (err) {
        console.error('--- Erro ao buscar música (Lavalink) ---', err);
        return interaction.editReply({
            components: [containerErro('Deu erro buscando essa música. Tenta de novo.')],
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    if (!resultado || !resultado.tracks.length) {
        return interaction.editReply({
            components: [containerErro(`Não encontrei nada pra "${buscaFinal}".`)],
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    const tracks = resultado.tracks.slice(0, 25);
    const cacheKey = interaction.id;
    buscaCache.set(cacheKey, { tracks, guildId: interaction.guildId });
    setTimeout(() => buscaCache.delete(cacheKey), 5 * 60 * 1000);

    await interaction.editReply({
        components: [containerResultados(tracks, cacheKey)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

async function processarEscolhaMusica(interaction) {
    const cacheKey = interaction.customId.slice('music_pick_'.length);
    const cache = buscaCache.get(cacheKey);

    if (!cache) {
        return interaction.update({ components: [containerErro('Essa busca expirou, tenta de novo.')], flags: [MessageFlags.IsComponentsV2] });
    }

    const player = kazagumo.players.get(interaction.guildId);
    if (!player) {
        buscaCache.delete(cacheKey);
        return interaction.update({ components: [containerErro('O player de música não existe mais.')], flags: [MessageFlags.IsComponentsV2] });
    }
    if (!ehDJ(interaction, player)) return semPermissao(interaction);

    const indice = Number(interaction.values[0]);
    const track = cache.tracks[indice];
    buscaCache.delete(cacheKey);

    if (!track) {
        return interaction.update({ components: [containerErro('Essa opção não é mais válida.')], flags: [MessageFlags.IsComponentsV2] });
    }

    player.queue.add(track);
    if (!player.playing && !player.paused) player.play();

    await interaction.update({ components: [containerAdicionada(track)], flags: [MessageFlags.IsComponentsV2] });
}

// ---------------------------------------------------------------------------
// Botões do painel
// ---------------------------------------------------------------------------
async function tratarBotaoMusica(interaction) {
    const player = kazagumo.players.get(interaction.guildId);

    if (interaction.customId === 'music_addqueue_btn') {
        // Esse botão vive na confirmação efêmera do /play; não depende do
        // painel público existir.
        return abrirModalBusca(interaction);
    }

    if (!player) {
        return interaction.reply({ content: 'Não há música tocando nesse servidor.', flags: [MessageFlags.Ephemeral] });
    }
    if (!ehDJ(interaction, player)) return semPermissao(interaction);

    if (interaction.customId === 'music_rewind') {
        const historico = player.data.get('historico') || [];
        const anterior = historico.pop();
        if (!anterior) {
            return interaction.reply({ content: 'Não há música anterior.', flags: [MessageFlags.Ephemeral] });
        }
        player.data.set('historico', historico);
        await interaction.deferUpdate();
        player.play(anterior); // dispara playerStart, que reconstrói o painel sozinho
        return;
    }

    if (interaction.customId === 'music_pauseresume') {
        player.pause(!player.paused);
        return interaction.update({ components: [construirPainelPrincipal(player)], flags: [MessageFlags.IsComponentsV2] });
    }

    if (interaction.customId === 'music_forward') {
        await interaction.deferUpdate();
        if (player.queue.length > 0) {
            player.skip(); // playerEnd -> próxima música da fila dispara playerStart
            return;
        }
        // Fila vazia: busca uma música nova, mesmo sem "fila contínua" ativa.
        const atual = player.data.get('faixaAtual');
        const termo = atual?.author || atual?.title;
        if (!termo) return;
        try {
            const resultado = await kazagumo.search(termo, { requester: atual?.requester });
            const candidatos = (resultado?.tracks || []).filter((t) => t.uri !== atual?.uri);
            const escolhida = candidatos[0] || resultado?.tracks?.[0];
            if (escolhida) player.play(escolhida);
        } catch (err) {
            console.error('--- Erro ao buscar próxima música (avançar) ---', err);
        }
        return;
    }

    if (interaction.customId === 'music_volume') {
        const modal = new ModalBuilder()
            .setCustomId('music_modal_volume')
            .setTitle('Volume da música')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('valor')
                        .setLabel('Volume (0 a 150)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setValue(String(player.data.get('volume') ?? 80))
                )
            );
        return interaction.showModal(modal);
    }

    if (interaction.customId === 'music_leave') {
        await limparPainel(player);
        player.destroy();
        return interaction.deferUpdate().catch(() => {});
    }
}

// ---------------------------------------------------------------------------
// Select menus (string select) do painel
// ---------------------------------------------------------------------------
async function tratarSelectMusica(interaction) {
    if (interaction.customId.startsWith('music_pick_')) {
        return processarEscolhaMusica(interaction);
    }

    const player = kazagumo.players.get(interaction.guildId);
    if (!player) {
        return interaction.reply({ content: 'Não há player de música ativo nesse servidor.', flags: [MessageFlags.Ephemeral] });
    }
    if (!ehDJ(interaction, player)) return semPermissao(interaction);

    if (interaction.customId === 'music_menu') {
        const escolha = interaction.values[0];

        if (escolha === 'autoplay_toggle') {
            player.data.set('autoplay', !player.data.get('autoplay'));
            return interaction.update({ components: [construirPainelPrincipal(player)], flags: [MessageFlags.IsComponentsV2] });
        }

        if (escolha === 'add_queue') {
            return abrirModalBusca(interaction);
        }

        if (escolha === 'view_queue') {
            return interaction.reply({
                components: [containerFila(player)],
                flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
            });
        }

        if (escolha === 'transfer_dj') {
            return interaction.reply({
                components: [containerTransferirDJ()],
                flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
            });
        }
        return;
    }

    if (interaction.customId === 'music_queue_remove') {
        const indices = interaction.values.map(Number).sort((a, b) => b - a);
        for (const i of indices) player.queue.splice(i, 1);
        return interaction.update({ components: [containerFila(player)], flags: [MessageFlags.IsComponentsV2] });
    }
}

// ---------------------------------------------------------------------------
// User select menu (transferir DJ)
// ---------------------------------------------------------------------------
async function tratarUserSelectMusica(interaction) {
    if (interaction.customId !== 'music_transfer_select') return;

    const player = kazagumo.players.get(interaction.guildId);
    if (!player) {
        return interaction.update({ content: 'Player de música não existe mais.', components: [] });
    }
    if (!ehDJ(interaction, player)) return semPermissao(interaction);

    const novoId = interaction.values[0];
    player.data.set('djId', novoId);

    await interaction.update({ components: [containerTexto('✅ Controles transferidos!')], flags: [MessageFlags.IsComponentsV2] });

    const canal = clienteBot.channels.cache.get(player.textId);
    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Novo DJ\n<@${novoId}> Você agora é o novo(a) DJ da festa`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# <t:${Math.floor(Date.now() / 1000)}:t>`));
    canal?.send({ components: [container], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
}

// ---------------------------------------------------------------------------
// Modais
// ---------------------------------------------------------------------------
async function tratarModalMusica(interaction) {
    if (interaction.customId === 'music_modal_search') {
        return processarBuscaModal(interaction);
    }

    if (interaction.customId === 'music_modal_volume') {
        const player = kazagumo.players.get(interaction.guildId);
        if (!player) {
            return interaction.reply({ content: 'Player de música não existe mais.', flags: [MessageFlags.Ephemeral] });
        }
        if (!ehDJ(interaction, player)) return semPermissao(interaction);

        const bruto = interaction.fields.getTextInputValue('valor').replace(/\D/g, '');
        let valor = parseInt(bruto, 10);
        if (Number.isNaN(valor)) valor = 80;
        valor = Math.max(0, Math.min(150, valor));

        player.setVolume(valor);
        player.data.set('volume', valor);

        if (interaction.isFromMessage && interaction.isFromMessage()) {
            return interaction.update({ components: [construirPainelPrincipal(player)], flags: [MessageFlags.IsComponentsV2] });
        }
        return interaction.reply({ content: `Volume ajustado para ${valor}.`, flags: [MessageFlags.Ephemeral] });
    }
}

// ---------------------------------------------------------------------------
// DJ saindo da call
// ---------------------------------------------------------------------------
async function tratarSaidaDaCall(oldState, newState) {
    if (!kazagumo) return;
    const player = kazagumo.players.get(oldState.guild.id);
    if (!player) return;

    const saiuDoCanalDoPlayer = oldState.channelId === player.voiceId && newState.channelId !== player.voiceId;
    if (!saiuDoCanalDoPlayer) return;
    if (oldState.id !== player.data.get('djId')) return; // só nos importa se quem saiu era o DJ

    const canalVoz = oldState.guild.channels.cache.get(player.voiceId);
    const humanos = canalVoz ? canalVoz.members.filter((m) => !m.user.bot) : null;
    const canalTexto = clienteBot.channels.cache.get(player.textId);

    // Congela o painel atual: fica assim até a próxima música tocar (o
    // playerStart seguinte apaga esse e manda um painel novo já liberado).
    await desativarPainel(player);

    if (humanos && humanos.size > 0) {
        const novoDJ = humanos.first();
        player.data.set('djId', novoDJ.id);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('### O DJ da festa saiu'))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Os controles da música foram passados para: <@${novoDJ.id}>`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# <t:${Math.floor(Date.now() / 1000)}:t>`));
        canalTexto?.send({ components: [container], flags: [MessageFlags.IsComponentsV2] }).catch(() => {});
        return;
    }

    // Ninguém mais na call: encerra tudo.
    player.destroy();

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### O DJ da festa saiu'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Não havia ninguém na call**'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Saindo agora...'));

    const msg = await canalTexto?.send({ components: [container], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
    if (msg) setTimeout(() => msg.delete().catch(() => {}), 60 * 1000);
}

module.exports = { iniciarMusica, tocarMusica };
