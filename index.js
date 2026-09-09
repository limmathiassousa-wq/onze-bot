require('dotenv').config();
const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot Online!'));
app.listen(process.env.PORT || 3000, () => console.log('Servidor web do bot iniciado!'));


const { Client, GatewayIntentBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ThumbnailBuilder, SectionBuilder, ChannelType, ActivityType, AttachmentBuilder, EmbedBuilder, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, UserSelectMenuBuilder, ChannelSelectMenuBuilder, LabelBuilder, FileUploadBuilder, RoleSelectMenuBuilder, Events, Routes, AuditLogEvent,
ContextMenuCommandBuilder, ApplicationCommandType, StickerFormatType, PermissionFlagsBits } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { getUserBio, getUserPerfil } = require('./bio_fetcher.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require("path");
const os = require('os');
const crypto = require('crypto');

const { comandos, montarPainelBotCall, registrarPainelBotCall, montarPainelPD, obterPrimeirasDamas, montarPainelMuteInicial, montarPainelMuteTimeout, montarPainelMuteCargo } = require('./commands');
const { botCallDB, botCallPaineis, confirmacaoModeracaoDB, msgCriadorDB, sorteioDraftDB, muteDraftDB } = require('./state');

const {
    esperar, containerTexto, comRetry, xpNecessario,
    montarPainelConfirmacaoModeracao,
    getSaldo, somarSaldo, getXP, setXP, getMensagens, setMensagens,
    urlValida, avisoSucessoModeracao
} = require('./helpers');

const { logar, enviarLogModeracao, logarBanimento, logarMembro, logarCargo, logarCallTemp, logarExpulsao } = require('./logger');


// ============ BOT ============
const TOKEN = process.env.DISCORD_TOKEN;
const PREFIXO = 'o!';
const MONGO_URI = process.env.MONGO_URI;
const PUBLIC_BASE_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;


const eventoMoedas = { ativo: false, mensagem: null, ganho: false, timeoutId: null };
 
const mongoConectado = mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('[MongoDB] Conectado com sucesso!');
        return true;
    })
    .catch(err => {
        console.error('--- Erro ao conectar no MongoDB ---', err);
        return false;
    });
    
const redis = require('./redis');

const {
    ServerBackup, BeijoStreak, Carteira, XP, Mensagens, ConfigMoedas, EventoMoedasState,
    CargoLoja, VoiceState, BotCallPainel, ContadorTicket, TicketData,
    ProtecaoConfigModel, PrimeiraDama, ConviteStats,
    ConviteMembro, Sorteio, TellonymPost, InstaPost,
    HistoricoUsername, HistoricoAvatar, HistoricoBanner,
    Daily, Afk, TellonymPendente,
    MapaPersistenteEntry, HistoricoBio, MuteCargo, TranscriptModel, TranscriptMedia
} = require('./models');


const { 
    EMOJI_ATIVADO, EMOJI_DESATIVADO,
    CANAL_TELLONYM_MOD, CANAL_TELLONYM, CANAL_TICKETS,
    GIFS_BEIJO,
    CANAL_LOGS_MOD, CANAL_LOGS_TICKETS, CATEGORIA_MOEDAS_BOASVINDAS,
    CANAIS_INSTA, CANAL_GERADOR_ID,
    REACOES_ANEXO, INTERVALO_TICK_CALL_SORTEIO_MS, CORES_MSG_CRIADOR,
    CORES_BOTAO, POSICOES_BOTAO,
    CARGOS_ATENDENTE, CARGO_AUTOMATICO, CARGO_LIMPAR,
    CARGO_BOOSTER, USUARIOS_BLOQUEADOS_EDICAO, DURACAO_CARGO_LOJA_DIAS,
    INTERVALO_CHECAGEM_CARGOS_LOJA_MS, IDADE_MINIMA_CONVITE_DIAS,
    CARGO_PD_PERMISSAO, CARGO_PRIMEIRA_DAMA, LIMITE_PRIMEIRAS_DAMAS, CARGOS_LOJA,
    EMOJI_CROW, EMOJI_CURTIR, EMOJI_COMENTAR, EMOJI_INFO,
    EMOJI_LIXEIRA, EMOJI_INSTA_PERFIL, EMOJI_ATUALIZAR_PREVIEW, EMOJI_VOLTAR_PAINEL,
    IMG_MOEDAS, IMG_DISCORD_LOGO,
    XP_MIN_POR_MENSAGEM, XP_MAX_POR_MENSAGEM, MOEDAS_POR_NIVEL, TAXA_MOEDA_XP_EXTRA,
    MOEDAS_DAILY, COOLDOWN_DAILY_MS,
    DOMINIOS_MUSICA_PERMITIDOS, DOMINIOS_IMAGEM_CONFIAVEIS, BLACKLIST_DOMINIOS,
    DOMINIOS_CONVITE, EXTENSOES_IMAGEM,
    CACHE_MEMBROS_MS,
    INTERVALO_LIMPEZA_INVITES_MS,
    CATEGORIA_STATUS_SORTEIO, CARGOS_BOOST, CARGO_MUTADO, CANAL_LOGS_BANS, CANAL_LOGS_MEMBROS, CANAL_LOGS_CARGOS, CANAL_LOGS_CALLTEMP, CARGO_BLOQUEADO_MODERACAO
} = require('./constants');

// ============ LET ============
let cacheMembros = null;
let cacheMembrosTimestamp = 0;
let eventoMoedasAtivo = true;

async function salvarConfigMoedas() {
    try {
        await ConfigMoedas.findByIdAndUpdate(
            'config_moedas',
            { ativo: eventoMoedasAtivo },
            { upsert: true }
        );
    } catch (err) {
        console.error('--- Erro ao salvar config do evento de moedas ---', err);
    }
}

async function carregarConfigMoedas() {
    try {
        const doc = await ConfigMoedas.findById('config_moedas');
        if (doc && typeof doc.ativo === 'boolean') eventoMoedasAtivo = doc.ativo;
        console.log(`[Moedas] Evento automático carregado: ${eventoMoedasAtivo ? 'ativo' : 'desativado'}.`);
    } catch (err) {
        console.error('--- Erro ao carregar config do evento de moedas ---', err);
    }
}


class MapaPersistente extends Map {
    constructor(namespace) {
        super();
        this.namespace = namespace;
    }

    async carregar() {
        const docs = await MapaPersistenteEntry.find({ namespace: this.namespace });
        for (const doc of docs) super.set(doc.chave, doc.valor);
        console.log(`[MapaPersistente:${this.namespace}] ${docs.length} entrada(s) carregada(s).`);
        return this;
    }

    async definir(chave, valor) {
        super.set(chave, valor);
        await MapaPersistenteEntry.findByIdAndUpdate(
            `${this.namespace}:${chave}`,
            { namespace: this.namespace, chave, valor },
            { upsert: true }
        ).catch(err => console.error(`--- Erro ao salvar ${this.namespace}:${chave} ---`, err));
    }

    async remover(chave) {
        const existia = super.delete(chave);
        await MapaPersistenteEntry.deleteOne({ _id: `${this.namespace}:${chave}` }).catch(() => {});
        return existia;
    }
}

// ============ MAPS ============
const tellonymPendentesDB = new Map(); 
const nukeEmAndamento = new Set();
const ticketDB = new Map();
const gerenciarCargosDB = new Map();
const sorteioVoiceSessions = new Map();
const callTempDeleteTimeouts = new Map();
const sorteioTimeouts = new Map();      
const invitesCache = new Map();
const paineisProtecao = new MapaPersistente('paineis_protecao');
const respostasBotoesMsg = new MapaPersistente('respostas_botoes_msg');
const canaisLockDB = new MapaPersistente('canais_lock');
const processosBackup = new Map();

// ============ CARD TELLONYM ============
GlobalFonts.registerFromPath(
    path.join(__dirname, "ARIAL.TTF"),
    "Arial"
);

GlobalFonts.registerFromPath(
    path.join(__dirname, "ARIALBD.TTF"),
    "Arial Bold"
);

const SCALE = 3;
const CARD_WIDTH = 900;
const CARD_RADIUS = 28;
const PADDING_X = 30;
const PADDING_TOP = 30;
const AVATAR_SIZE = 70;
const NAME_SIZE = 30;
const HANDLE_SIZE = 20;
const MESSAGE_SIZE = 24;
const MESSAGE_LINE_HEIGHT = 34;
const TIME_SIZE = 22;
const DIVIDER_MARGIN = 28;
const DIVIDER_BOTTOM = 50;
const EMOJI_SIZE = 30;
const EMOJI_SIZE_CUSTOM = 32;

       function roundedRect(ctx, x, y, width, height, radius) {

    ctx.beginPath();

    ctx.moveTo(x + radius, y);

    ctx.arcTo(x + width, y, x + width, y + height, radius);

    ctx.arcTo(x + width, y + height, x, y + height, radius);

    ctx.arcTo(x, y + height, x, y, radius);

    ctx.arcTo(x, y, x + width, y, radius);

    ctx.closePath();

}

async function loadAvatar(url, anonimo) {

    try {

        if (anonimo || !url)
            return await loadImage(IMG_DISCORD_LOGO);

        return await loadImage(url);

    } catch {

        return await loadImage(IMG_DISCORD_LOGO);

    }

}

const REGEX_EMOJI_INTERNO = /<a?:\w{2,32}:\d{15,21}>|[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|(?:\p{Extended_Pictographic}\uFE0F?)(?:\u200D(?:\p{Extended_Pictographic}\uFE0F?))*/gu;

function tokenizarPalavraComEmoji(palavra) {
    const atoms = [];
    let ultimoIndex = 0;

    for (const match of palavra.matchAll(REGEX_EMOJI_INTERNO)) {
        if (match.index > ultimoIndex) {
            atoms.push({ type: 'text', value: palavra.slice(ultimoIndex, match.index) });
        }

        const trecho = match[0];

        if (trecho.startsWith('<')) {
            const info = trecho.match(/<a?:\w{2,32}:(\d{15,21})>/);
            atoms.push({ type: 'emoji', custom: true, url: `https://cdn.discordapp.com/emojis/${info[1]}.png?size=64` });
        } else {
            const codepoints = [...trecho]
                .map(c => c.codePointAt(0))
                .filter(cp => cp !== 0xFE0F)
                .map(cp => cp.toString(16))
                .join('-');
            atoms.push({ type: 'emoji', custom: false, url: `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${codepoints}.png` });
        }

        ultimoIndex = match.index + trecho.length;
    }

    if (ultimoIndex < palavra.length) {
        atoms.push({ type: 'text', value: palavra.slice(ultimoIndex) });
    }

    return atoms.length ? atoms : [{ type: 'text', value: palavra }];
}

function tokenizarLinhaComEmoji(paragrafo) {
    const partes = paragrafo.split(/(\s+)/).filter(p => p.length > 0);
    const atoms = [];

    for (const parte of partes) {
        if (/^\s+$/.test(parte)) {
            atoms.push({ type: 'space' });
        } else {
            atoms.push(...tokenizarPalavraComEmoji(parte));
        }
    }

    return atoms;
}

function quebrarLinhasComEmoji(ctx, atoms, maxWidth) {
    const linhas = [];
    let atualLine = [];
    let atualWidth = 0;
    const espacoLargura = ctx.measureText(' ').width;

    for (const atom of atoms) {
        if (atom.type === 'space') {
            if (atualLine.length && atualWidth + espacoLargura <= maxWidth) {
                atualLine.push({ type: 'space' });
                atualWidth += espacoLargura;
            }
            continue;
        }

        const largura = atom.type === 'emoji' ? (atom.custom ? EMOJI_SIZE_CUSTOM : EMOJI_SIZE) : ctx.measureText(atom.value).width;

        if (atualWidth + largura > maxWidth && atualLine.length > 0) {
            while (atualLine.length && atualLine[atualLine.length - 1].type === 'space') atualLine.pop();
            linhas.push(atualLine);
            atualLine = [];
            atualWidth = 0;
        }

        // palavra de texto maior que a largura máxima sozinha -> quebra por caractere
        if (largura > maxWidth && atom.type === 'text') {
            let parte = '';
            for (const char of atom.value) {
                const teste = parte + char;
                if (ctx.measureText(teste).width > maxWidth && parte) {
                    atualLine.push({ type: 'text', value: parte });
                    linhas.push(atualLine);
                    atualLine = [];
                    atualWidth = 0;
                    parte = '';
                }
                parte += char;
            }
            if (parte) {
                atualLine.push({ type: 'text', value: parte });
                atualWidth += ctx.measureText(parte).width;
            }
            continue;
        }

        atualLine.push(atom);
        atualWidth += largura;
    }

    while (atualLine.length && atualLine[atualLine.length - 1].type === 'space') atualLine.pop();
    if (atualLine.length) linhas.push(atualLine);
    if (!linhas.length) linhas.push([]);

    return linhas;
}

function montarLinhasComEmoji(ctx, mensagem, maxWidth) {
    const paragrafos = String(mensagem ?? "").replace(/\r/g, "").split("\n");
    const todasLinhas = [];

    for (const paragrafo of paragrafos) {
        const atoms = tokenizarLinhaComEmoji(paragrafo);
        todasLinhas.push(...quebrarLinhasComEmoji(ctx, atoms, maxWidth));
    }

    return todasLinhas;
}

function breakText(ctx, text, maxWidth) {

    const lines = [];

    const paragraphs = String(text ?? "").replace(/\r/g, "").split("\n");

    for (const paragraph of paragraphs) {

        if (!paragraph.trim()) {
            lines.push("");
            continue;
        }

        let current = "";

        const words = paragraph.split(/\s+/);

        for (let word of words) {

            // Palavra muito grande
            while (ctx.measureText(word).width > maxWidth) {

                let part = "";

                for (const char of [...word]) {

                    const test = part + char;

                    if (ctx.measureText(test).width > maxWidth)
                        break;

                    part += char;

                }

                if (current) {
                    lines.push(current);
                    current = "";
                }

                lines.push(part);

                word = word.slice(part.length);

            }

            const test =
                current.length
                    ? current + " " + word
                    : word;

            if (
                ctx.measureText(test).width > maxWidth &&
                current
            ) {

                lines.push(current);

                current = word;

            } else {

                current = test;

            }

        }

        if (current)
            lines.push(current);

    }

    return lines;

}

function calculateHeight(lineCount) {

    const HEADER =
    PADDING_TOP +
    AVATAR_SIZE +
    14;

    const MESSAGE =
        lineCount *
        MESSAGE_LINE_HEIGHT;

    const FOOTER = 65;

    return (
        HEADER +
        MESSAGE +
        FOOTER
    );

}

async function drawAvatar(
    ctx,
    avatarUrl,
    anonimo
) {

    const avatar =
        await loadAvatar(
            avatarUrl,
            anonimo
        );

    ctx.save();

    ctx.beginPath();

    ctx.arc(

        PADDING_X + AVATAR_SIZE / 2,

        PADDING_TOP + AVATAR_SIZE / 2,

        AVATAR_SIZE / 2,

        0,

        Math.PI * 2

    );

    ctx.closePath();

    ctx.clip();

    ctx.drawImage(

        avatar,

        PADDING_X,

        PADDING_TOP,

        AVATAR_SIZE,

        AVATAR_SIZE

    );

    ctx.restore();

}

async function gerarCardTellonym({
    nome,
    handle,
    avatarUrl,
    mensagem,
    anonimo,
    marcadoNome = null,
    marcadoAvatarUrl = null
}) {

    if (anonimo) {
        nome = "Anônimo";
        handle = "@anonimo";
    }

    const tempCanvas = createCanvas(CARD_WIDTH, 100);
    const tempCtx = tempCanvas.getContext("2d");
    tempCtx.font = `${MESSAGE_SIZE}px Arial`;

    const linhas = montarLinhasComEmoji(tempCtx, mensagem, CARD_WIDTH - (PADDING_X * 2));

    // ---- Pré-carrega os emojis usados na mensagem ----
    const urlsEmoji = new Set();
    for (const linha of linhas) {
        for (const atom of linha) {
            if (atom.type === 'emoji') urlsEmoji.add(atom.url);
        }
    }
    const imagensEmoji = new Map();
    await Promise.all([...urlsEmoji].map(async (url) => {
        try {
            imagensEmoji.set(url, await loadImage(url));
        } catch (err) {
            console.error('--- Falha ao carregar emoji no card Tellonym ---', url, err.message);
        }
    }));

    const cardHeight = calculateHeight(linhas.length);
    const canvas = createCanvas(CARD_WIDTH * SCALE, cardHeight * SCALE);
    const ctx = canvas.getContext("2d");
    ctx.scale(SCALE, SCALE);

    ctx.fillStyle = "#FFFFFF";
    roundedRect(ctx, 0, 0, CARD_WIDTH, cardHeight, CARD_RADIUS);
    ctx.fill();

    await drawAvatar(ctx, avatarUrl, anonimo);

    const TEXT_X = PADDING_X + AVATAR_SIZE + 14;
    ctx.textBaseline = "top";

    // ============ MENCIONADOS (BADGE) ============
    if (marcadoNome) {
        const MENTION_LABEL_SIZE = 13;
        const MENTION_PILL_TEXT_SIZE = 15;
        const MENTION_PILL_HEIGHT = 32;
        const MENTION_AVATAR_SIZE = 38;
        const MENTION_GAP_LABEL_PILL = 8;
        const MENTION_PILL_MAX_TEXT_WIDTH = 150;
        const MENTION_PILL_PADDING_X = 14;
        const MENTION_GAP_PILL_AVATAR = 8;

        ctx.textAlign = "right";
        ctx.fillStyle = "#7C8790";
        ctx.font = `${MENTION_LABEL_SIZE}px "Arial Bold"`;
        ctx.fillText("Mencionados", CARD_WIDTH - PADDING_X, PADDING_TOP);
        ctx.textAlign = "left";

        ctx.font = `${MENTION_PILL_TEXT_SIZE}px "Arial Bold"`;
        let textoPill = marcadoNome;
        if (ctx.measureText(textoPill).width > MENTION_PILL_MAX_TEXT_WIDTH) {
            while (textoPill.length > 1 && ctx.measureText(textoPill + '…').width > MENTION_PILL_MAX_TEXT_WIDTH) {
                textoPill = textoPill.slice(0, -1);
            }
            textoPill += '…';
        }

        const larguraTexto = ctx.measureText(textoPill).width;
        const pillWidth = larguraTexto + MENTION_PILL_PADDING_X * 2;
        const pillY = PADDING_TOP + MENTION_LABEL_SIZE + MENTION_GAP_LABEL_PILL;

        const avatarX = CARD_WIDTH - PADDING_X - MENTION_AVATAR_SIZE;
        const pillX = avatarX - pillWidth - MENTION_GAP_PILL_AVATAR;

        ctx.fillStyle = "#16181C";
        roundedRect(ctx, pillX, pillY, pillWidth, MENTION_PILL_HEIGHT, MENTION_PILL_HEIGHT / 2);
        ctx.fill();

        ctx.fillStyle = "#FFFFFF";
        ctx.fillText(textoPill, pillX + MENTION_PILL_PADDING_X, pillY + (MENTION_PILL_HEIGHT - MENTION_PILL_TEXT_SIZE) / 2);

        const avatarY = pillY + (MENTION_PILL_HEIGHT - MENTION_AVATAR_SIZE) / 2;
        const avatarMencionado = await loadAvatar(marcadoAvatarUrl, false);

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + MENTION_AVATAR_SIZE / 2, avatarY + MENTION_AVATAR_SIZE / 2, MENTION_AVATAR_SIZE / 2 + 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.fillStyle = "#FFFFFF";
        ctx.fill();
        ctx.restore();

        ctx.save();
        ctx.beginPath();
        ctx.arc(avatarX + MENTION_AVATAR_SIZE / 2, avatarY + MENTION_AVATAR_SIZE / 2, MENTION_AVATAR_SIZE / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatarMencionado, avatarX, avatarY, MENTION_AVATAR_SIZE, MENTION_AVATAR_SIZE);
        ctx.restore();
    }

    ctx.fillStyle = "#3B4351";
    ctx.font = `${NAME_SIZE}px "Arial Bold"`;
    ctx.fillText(nome, TEXT_X, PADDING_TOP + 1);

    if (handle) {
        ctx.fillStyle = "#7C8790";
        ctx.font = `${HANDLE_SIZE}px Arial`;
        ctx.fillText(handle, TEXT_X, PADDING_TOP + 35);
    }

    ctx.fillStyle = "#090b0b";
    ctx.font = `${MESSAGE_SIZE}px Arial`;

    let textY = PADDING_TOP + AVATAR_SIZE + 18;
    const espacoLargura = ctx.measureText(' ').width;

    for (const linha of linhas) {
        let cursorX = PADDING_X;
        for (const atom of linha) {
            if (atom.type === 'space') {
                cursorX += espacoLargura;
            } else if (atom.type === 'emoji') {
                const img = imagensEmoji.get(atom.url);
                const tam = atom.custom ? EMOJI_SIZE_CUSTOM : EMOJI_SIZE;
                if (img) {
                    ctx.drawImage(img, cursorX, textY + (MESSAGE_LINE_HEIGHT - tam) / 2 - 4, tam, tam);
                }
                cursorX += tam;
            } else {
                ctx.fillText(atom.value, cursorX, textY);
                cursorX += ctx.measureText(atom.value).width;
            }
        }
        textY += MESSAGE_LINE_HEIGHT;
    }

    const dividerY = cardHeight - DIVIDER_BOTTOM;
    ctx.beginPath();
    ctx.moveTo(PADDING_X, dividerY);
    ctx.lineTo(CARD_WIDTH - PADDING_X, dividerY);
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#D9DCE0";
    ctx.stroke();

    const footerText = "há pouco tempo";
    ctx.fillStyle = "#C7CBD1";
    ctx.font = `${TIME_SIZE}px Arial`;
    const footerWidth = ctx.measureText(footerText).width;
    ctx.fillText(footerText, CARD_WIDTH - PADDING_X - footerWidth, cardHeight - 44);

    return canvas.encode("png");
}

module.exports = {
    gerarCardTellonym
};

// ============ FUNCTIONS/ACTIONS============


// ============ GERENCIAMENTO DE CARGOS (o!groles) ============
const GROLES_POR_PAGINA = 5;
const PERMS_POR_PAGINA = 5;

const CARGOS_BLOQUEADOS_GROLES = ['1542321888309809210'];

const CARGO_GERENCIADOR_LIMITADO = '1542321888309809212';
const CARGOS_RESTRITOS_GERENCIADOR_LIMITADO = [
    '1542321888355684456',
    '1542321888355684455',
    '1546504893890691093',
    '1542733119604654152',
    '1542321888355684454',
    '1542321888355684453',
    '1546329251219771512',
    '1546499881156485234',
    '1542321888309809212',
    '1542321888309809210',
    '1546352749703200798',
    '1546354415689007105',
    '1546350016342532126',
    '1542321888309809211',
    '1546329417062686820',
    '1546552187201527848',
    '1546552147804692480',
    '1545230701534777375',
    '1542321888309809204',
    '1542321888309809203',
    '1542321888234045549',
    '1542321888234045548',
    '1542321888234045547',
    '1542321888234045546'
];

function ehAdminGRoles(member) {
    return member.permissions.has('Administrator') || member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
}

const PERM_LABELS_GROLES = {
    CreateInstantInvite: 'Criar convite',
    KickMembers: 'Expulsar membros',
    BanMembers: 'Banir membros',
    Administrator: 'Administrador',
    ManageChannels: 'Gerenciar canais',
    ManageGuild: 'Gerenciar servidor',
    AddReactions: 'Adicionar reações',
    ViewAuditLog: 'Ver Auditlog',
    PrioritySpeaker: 'Prioridade para falar',
    Stream: 'Transmitir vídeo (Stream)',
    ViewChannel: 'Ver canal',
    SendMessages: 'Enviar mensagens',
    SendTTSMessages: 'Enviar mensagens de texto para voz',
    ManageMessages: 'Gerenciar mensagens',
    EmbedLinks: 'Inserir links (embeds)',
    AttachFiles: 'Anexar arquivos',
    ReadMessageHistory: 'Ver histórico de mensagens',
    MentionEveryone: 'Mencionar @everyone',
    UseExternalEmojis: 'Usar emojis externos',
    ViewGuildInsights: 'Ver estatísticas do servidor',
    Connect: 'Conectar em call',
    Speak: 'Falar em call',
    MuteMembers: 'Silenciar em call',
    DeafenMembers: 'Ensurdecer em call',
    MoveMembers: 'Mover membros',
    UseVAD: 'Usar detecção de voz',
    ChangeNickname: 'Alterar apelido',
    ManageNicknames: 'Gerenciar apelidos',
    ManageRoles: 'Gerenciar cargos',
    ManageWebhooks: 'Gerenciar webhooks',
    ManageGuildExpressions: 'Gerenciar emojis/figurinhas',
    ManageEmojisAndStickers: 'Gerenciar emojis/figurinhas (antigo)',
    UseApplicationCommands: 'Usar comandos de aplicativo',
    RequestToSpeak: 'Solicitar para falar (palco)',
    ManageEvents: 'Gerenciar eventos',
    ManageThreads: 'Gerenciar tópicos',
    CreatePublicThreads: 'Criar tópicos públicos',
    CreatePrivateThreads: 'Criar tópicos privados',
    UseExternalStickers: 'Usar figurinhas externas',
    SendMessagesInThreads: 'Enviar mensagens em tópicos',
    UseEmbeddedActivities: 'Usar atividades incorporadas',
    ModerateMembers: 'Mutar membros (timeout)',
    ViewCreatorMonetizationAnalytics: 'Ver análises de monetização',
    UseSoundboard: 'Usar soundboard',
    CreateGuildExpressions: 'Criar emojis/figurinhas/sons',
    CreateEvents: 'Criar eventos',
    UseExternalSounds: 'Usar sons externos',
    SendVoiceMessages: 'Enviar mensagens de voz',
    SetVoiceChannelStatus: 'Definir status de canal de voz',
    SendPolls: 'Criar enquetes',
    UseExternalApps: 'Usar aplicativos externos'
};

const LISTA_PERMS_EDITAVEIS_GROLES = Object.keys(PERM_LABELS_GROLES)
    .filter((key, idx, arr) => arr.indexOf(key) === idx && PermissionFlagsBits[key] !== undefined);

function filtrarPermsGRoles(busca) {
    if (!busca) return LISTA_PERMS_EDITAVEIS_GROLES;
    const termo = busca.trim().toLowerCase();
    return LISTA_PERMS_EDITAVEIS_GROLES.filter(key => {
        const label = (PERM_LABELS_GROLES[key] || key).toLowerCase();
        return label.includes(termo) || key.toLowerCase().includes(termo);
    });
}

function montarPermissoesTextoGRoles(cargo) {
    if (cargo.permissions.has('Administrator')) return 'Administrador (todas as permissões)';
    const flags = cargo.permissions.toArray();
    const legiveis = [...new Set(flags.map(f => PERM_LABELS_GROLES[f]).filter(Boolean))];
    if (!legiveis.length) return 'Nenhuma permissão';
    return legiveis.slice(0, 6).join(', ') + (legiveis.length > 6 ? ` (+${legiveis.length - 6})` : '');
}

function obterCargosGerenciaveisGRoles(guild) {
    return [...guild.roles.cache
        .filter(r => r.id !== guild.id && r.editable && !r.managed)
        .values()]
        .sort((a, b) => b.position - a.position);
}

function filtrarCargosGRoles(guild, alvoMembro, filtro, busca) {
    let lista = obterCargosGerenciaveisGRoles(guild);

    if (busca) {
        const termo = busca.trim().toLowerCase().replace(/^<@&/, '').replace(/>$/, '').replace(/^@/, '');
        lista = lista.filter(c =>
            c.id === termo ||
            c.name.toLowerCase().includes(termo)
        );
    }

    if (filtro === 'adicionaveis') {
        lista = lista.filter(c => !alvoMembro.roles.cache.has(c.id));
    } else {
       
        lista = lista.filter(c => alvoMembro.roles.cache.has(c.id));
    }

    return lista;
}

const grolesTimeouts = new Map();

function agendarExpiracaoGRoles(painelId, channelId) {
    const antigo = grolesTimeouts.get(painelId);
    if (antigo) clearTimeout(antigo);

    const timeoutId = setTimeout(async () => {
        gerenciarCargosDB.delete(painelId);
        grolesTimeouts.delete(painelId);

        try {
            const canal = await client.channels.fetch(channelId).catch(() => null);
            if (!canal) return;
            const msg = await canal.messages.fetch(painelId).catch(() => null);
            if (msg) await msg.delete().catch(() => null);
        } catch (err) {
            console.error('--- Erro ao expirar painel de cargos por inatividade ---', err);
        }
    }, 5 * 60 * 1000);

    grolesTimeouts.set(painelId, timeoutId);
}

// ============ EDITAR CARGOS (Criar/Excluir) ============
const EXCLUIR_CARGOS_POR_PAGINA = 4;

const CORES_CARGO_GROLES = [
    { label: 'Vermelho', value: 'E74C3C' },
    { label: 'Laranja', value: 'E67E22' },
    { label: 'Amarelo', value: 'F1C40F' },
    { label: 'Verde', value: '2ECC71' },
    { label: 'Turquesa', value: '1ABC9C' },
    { label: 'Azul claro', value: '3498DB' },
    { label: 'Azul', value: '2980B9' },
    { label: 'Roxo', value: '9B59B6' },
    { label: 'Rosa', value: 'E91E63' },
    { label: 'Cinza claro', value: '95A5A6' },
    { label: 'Cinza escuro', value: '607D8B' },
    { label: 'Preto', value: '23272A' },
    { label: 'Branco', value: 'FFFFFF' },
    { label: 'Dourado', value: 'D4AF37' },
    { label: 'Marrom', value: '8B4513' }
];

function temPermissaoEditarCargosGRoles(member) {
    return member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
}

function montarPainelGRolesEditar() {
    return new ContainerBuilder()
        .setAccentColor(0xFFFFFF)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Gerenciamento de Cargos\n### Editar cargos do servidor'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Crie ou exclua cargos do servidor diretamente por aqui.'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('groles_criar_abrir').setLabel('Criar').setStyle(ButtonStyle.Success)
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Cria um novo cargo no servidor, definindo nome, cor e opções.'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('groles_excluir_abrir').setLabel('Excluir').setStyle(ButtonStyle.Danger)
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Lista os cargos existentes do servidor pra você excluir, com confirmação antes de apagar.'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('groles_permeditar_abrir').setLabel('Editar').setStyle(ButtonStyle.Primary)
            )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Edita as permissões de um cargo já existente no servidor. Apenas administradores.'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('groles_editar_voltar').setLabel('Voltar').setStyle(ButtonStyle.Secondary)
            )
        );
}



function montarPainelGRolesCriar(draft) {
    const cc = draft.criarCargo || {};
    const corFinal = cc.corHex || cc.corPredefinida || null;

    return new ContainerBuilder()
        .setAccentColor(0xFFFFFF)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Criar cargo'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Gerenciamento de Cargos > Editar > Criar'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Nome:** ${cc.nome ? `\`${cc.nome}\`` : '\`não definido\`'}\u2003\u2003\u2003**Cor:** ${corFinal ? `\`#${corFinal}\`` : '\`padrão\`'}\n` +
            `**Mostrar separadamente:** ${cc.mostrarSeparadamente ? EMOJI_ATIVADO : EMOJI_DESATIVADO}\u2003\u2003\u2003**Menções a qualquer um:** ${cc.permitirMencoes ? EMOJI_ATIVADO : EMOJI_DESATIVADO}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('groles_criar_editar').setLabel('Configurações').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('groles_criar_confirmar').setLabel('Criar').setStyle(ButtonStyle.Success).setDisabled(!cc.nome)
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('groles_editar_voltar_menu').setLabel('Voltar').setStyle(ButtonStyle.Secondary)
            )
        );
}

function obterCargosExcluiveisGRoles(guild) {
    return [...guild.roles.cache.filter(r => r.id !== guild.id).values()].sort((a, b) => b.position - a.position);
}

function montarPainelGRolesExcluir(guild, pagina = 0) {
    const lista = obterCargosExcluiveisGRoles(guild);
    const totalPaginas = Math.max(1, Math.ceil(lista.length / EXCLUIR_CARGOS_POR_PAGINA));
    const paginaAtual = Math.max(0, Math.min(pagina, totalPaginas - 1));
    const inicio = paginaAtual * EXCLUIR_CARGOS_POR_PAGINA;
    const fatia = lista.slice(inicio, inicio + EXCLUIR_CARGOS_POR_PAGINA);

    const container = new ContainerBuilder()
        .setAccentColor(0xFFFFFF)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Excluir cargo'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Gerenciamento de Cargos > Editar > Excluir'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (!fatia.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Nenhum cargo encontrado.'));
    }

for (const cargo of fatia) {
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `<@&${cargo.id}>\n<:21571:1546008424737677422> **${cargo.members.size}** membro(s)`
    ));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`groles_excluir_cargo_${cargo.id}_${paginaAtual}`).setLabel('Excluir').setStyle(ButtonStyle.Danger)
        )
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
}

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`groles_excluir_pagina_${paginaAtual - 1}`).setLabel('Voltar').setStyle(ButtonStyle.Secondary).setDisabled(paginaAtual === 0),
            new ButtonBuilder().setCustomId('groles_excluir_pagina_atual').setLabel(`${paginaAtual + 1}/${totalPaginas}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(`groles_excluir_pagina_${paginaAtual + 1}`).setLabel('Avançar').setStyle(ButtonStyle.Secondary).setDisabled(paginaAtual >= totalPaginas - 1)
        )
    );

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('groles_editar_voltar_menu').setLabel('Voltar ao menu').setStyle(ButtonStyle.Secondary)
        )
    );

    return container;
}

function montarPainelGRolesPermLista(guild, pagina = 0) {
    const lista = obterCargosGerenciaveisGRoles(guild);
    const totalPaginas = Math.max(1, Math.ceil(lista.length / EXCLUIR_CARGOS_POR_PAGINA));
    const paginaAtual = Math.max(0, Math.min(pagina, totalPaginas - 1));
    const inicio = paginaAtual * EXCLUIR_CARGOS_POR_PAGINA;
    const fatia = lista.slice(inicio, inicio + EXCLUIR_CARGOS_POR_PAGINA);

    const container = new ContainerBuilder()
        .setAccentColor(0xFFFFFF)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Editar permissões'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Gerenciamento de Cargos > Editar > Permissões'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (!fatia.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Nenhum cargo encontrado.'));
    }

    for (const cargo of fatia) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `<@&${cargo.id}>\n<:21573:1546008443456983140> **Permissões atuais:** ${montarPermissoesTextoGRoles(cargo)}`
        ));
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`groles_permeditar_cargo_${cargo.id}_${paginaAtual}`).setLabel('Editar').setStyle(ButtonStyle.Secondary)
            )
        );
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    }

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`groles_permeditar_pagina_${paginaAtual - 1}`).setLabel('Voltar').setStyle(ButtonStyle.Secondary).setDisabled(paginaAtual === 0),
            new ButtonBuilder().setCustomId('groles_permeditar_pagina_atual').setLabel(`${paginaAtual + 1}/${totalPaginas}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(`groles_permeditar_pagina_${paginaAtual + 1}`).setLabel('Avançar').setStyle(ButtonStyle.Secondary).setDisabled(paginaAtual >= totalPaginas - 1)
        )
    );

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('groles_editar_voltar_menu').setLabel('Voltar ao menu').setStyle(ButtonStyle.Secondary)
        )
    );

    return container;
}

function montarPainelGRolesPermissoes(cargo, pagina = 0, listaPagina = 0, busca = null) {
    const permsFiltradas = filtrarPermsGRoles(busca);
    const totalPaginas = Math.max(1, Math.ceil(permsFiltradas.length / PERMS_POR_PAGINA));
    const paginaAtual = Math.max(0, Math.min(pagina, totalPaginas - 1));
    const inicio = paginaAtual * PERMS_POR_PAGINA;
    const fatia = permsFiltradas.slice(inicio, inicio + PERMS_POR_PAGINA);

    const container = new ContainerBuilder()
        .setAccentColor(0xFFFFFF)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Permissões de <@&${cargo.id}>`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Gerenciamento de Cargos > Editar > Permissões > Cargo'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (busca) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# Busca ativa: \`${busca}\` · ${permsFiltradas.length} resultado(s)`
        ));
    }

    if (!fatia.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Nenhuma permissão encontrada com esse termo.'));
    }

    for (const permKey of fatia) {
        const possui = cargo.permissions.has(permKey, false);
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**${PERM_LABELS_GROLES[permKey] || permKey}**\n${possui ? EMOJI_ATIVADO : EMOJI_DESATIVADO} ${possui ? 'Ativada' : 'Desativada'}`
        ));
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`groles_permtoggle_${cargo.id}_${permKey}_${paginaAtual}_${listaPagina}`)
                    .setLabel(possui ? 'Desativar' : 'Ativar')
                    .setStyle(possui ? ButtonStyle.Danger : ButtonStyle.Success)
            )
        );
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    }

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`groles_permeditar_perm_pagina_${cargo.id}_${paginaAtual - 1}_${listaPagina}`).setLabel('Voltar').setStyle(ButtonStyle.Secondary).setDisabled(paginaAtual === 0),
            new ButtonBuilder().setCustomId('groles_permeditar_perm_pagina_atual').setLabel(`${paginaAtual + 1}/${totalPaginas}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId(`groles_permeditar_perm_pagina_${cargo.id}_${paginaAtual + 1}_${listaPagina}`).setLabel('Avançar').setStyle(ButtonStyle.Secondary).setDisabled(paginaAtual >= totalPaginas - 1),
            new ButtonBuilder().setCustomId(`groles_permbuscar_${cargo.id}_${listaPagina}`).setEmoji('🔍').setLabel('Buscar').setStyle(ButtonStyle.Secondary)
        )
    );

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`groles_permeditar_voltar_lista_${listaPagina}`).setLabel('Voltar aos cargos').setStyle(ButtonStyle.Secondary)
        )
    );

    return container;
}

function montarPainelGRolesExcluirConfirmar(cargo, pagina) {
    return new ContainerBuilder()
        .setAccentColor(0xFFFFFF)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Confirmar exclusão'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            ` Você tem certeza que deseja excluir o cargo <@&${cargo.id}>? Essa ação **não pode ser desfeita**.\n\n` +
            `**Nome:** ${cargo.name}\n**Membros:** \`${cargo.members.size}\``
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`groles_excluir_confirmar_${cargo.id}_${pagina}`).setLabel('Excluir').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`groles_excluir_cancelar_${pagina}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
            )
        );
}

async function montarPainelGRoles(guild, draft, adminId) {
    await obterMembrosCache(guild).catch(() => null);
    const alvoMembro = await guild.members.fetch({ user: draft.alvoId, force: true }).catch(() => null);
    const alvoUserFetch = alvoMembro?.user ?? await client.users.fetch(draft.alvoId, { force: true }).catch(() => null);
    const avatarAlvo = alvoUserFetch?.displayAvatarURL({ extension: 'png', size: 256 }) ?? IMG_DISCORD_LOGO;

    const adminMembro = await guild.members.fetch({ user: adminId, force: true }).catch(() => null);
    const adminEhLimitado = adminMembro?.roles.cache.has(CARGO_GERENCIADOR_LIMITADO) ?? false;

    const container = new ContainerBuilder().setAccentColor(0xFFFFFF);

    if (!alvoMembro) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `## Gerenciamento de Cargos\nEsse membro não foi encontrado no servidor.`
                ))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarAlvo))
        );
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('groles_alvo_select')
                    .setPlaceholder('Selecione quem você quer gerenciar')
                    .setMinValues(1).setMaxValues(1)
            )
        );
        return container;
    }

    const cargosFiltrados = filtrarCargosGRoles(guild, alvoMembro, draft.filtro, draft.busca);
    const totalPaginas = Math.max(1, Math.ceil(cargosFiltrados.length / GROLES_POR_PAGINA));
    const paginaAtual = Math.max(0, Math.min(draft.pagina, totalPaginas - 1));
    draft.pagina = paginaAtual;
    const inicio = paginaAtual * GROLES_POR_PAGINA;
    const fatia = cargosFiltrados.slice(inicio, inicio + GROLES_POR_PAGINA);

    const souEuMesmo = draft.alvoId === adminId;
    const textoTopo = souEuMesmo
        ? `## Gerenciamento de Cargos\n\nVocê está gerenciando seus próprios **cargos**.`
        : `## Gerenciamento de Cargos\n\nVocê esta gerenciando os **cargos** de <@${alvoMembro.id}>.`;

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(textoTopo))
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarAlvo))
    );

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId('groles_alvo_select')
                .setPlaceholder('Selecione quem você quer gerenciar')
                .setMinValues(1).setMaxValues(1)
        )
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (draft.busca) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# Busca ativa: \`${draft.busca}\` · ${cargosFiltrados.length} resultado(s)`
        ));
    }

    if (!fatia.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('Nenhum cargo encontrado com esses critérios.'));
    }

for (const cargo of fatia) {
    const possui = alvoMembro.roles.cache.has(cargo.id);
    const semPermissao = adminEhLimitado && CARGOS_RESTRITOS_GERENCIADOR_LIMITADO.includes(cargo.id);
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `<@&${cargo.id}>\n<:21571:1546008424737677422> **${cargo.members.size}** membro(s)\n<:21573:1546008443456983140> **Permissões:** ${montarPermissoesTextoGRoles(cargo)}`
    ));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`groles_toggle_${cargo.id}`)
                .setLabel(semPermissao ? 'Sem permissão' : (possui ? 'Remover' : 'Adicionar'))
                .setStyle(semPermissao ? ButtonStyle.Secondary : (possui ? ButtonStyle.Danger : ButtonStyle.Success))
                .setDisabled(semPermissao)
        )
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
}

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('groles_filtro_removiveis').setLabel('Removíveis').setStyle(draft.filtro === 'removiveis' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('groles_filtro_adicionaveis').setLabel('Adicionáveis').setStyle(draft.filtro === 'adicionaveis' ? ButtonStyle.Primary : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('groles_buscar').setEmoji('🔍').setLabel('Buscar').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('groles_editar_abrir').setLabel('Editar').setStyle(ButtonStyle.Secondary)
        )
    );

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('groles_pagina_anterior').setLabel('Voltar').setStyle(ButtonStyle.Secondary).setDisabled(paginaAtual === 0),
            new ButtonBuilder().setCustomId('groles_pagina_atual').setLabel(`${paginaAtual + 1}/${totalPaginas}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('groles_pagina_proxima').setLabel('Avançar').setStyle(ButtonStyle.Secondary).setDisabled(paginaAtual >= totalPaginas - 1)
        )
    );

    return container;
}

// ============ BACKUP DO SERVIDOR ============

async function montarPainelBackup(guildId) {
    const backups = await ServerBackup.find({ guildId }).sort({ criadoEm: -1 }).catch(() => []);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Backup do servidor'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Painel > Backup'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            'Salva cargos, categorias, canais e permissões do servidor. Membros não são salvos (é impossível recriá-los).'
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (backups.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Backups salvos:** \`${backups.length}\`\nSelecione um abaixo pra ver detalhes e restaurar.`
        ));
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            'Nenhum backup salvo para este servidor ainda.'
        ));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (backups.length) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('backup_selecionar')
                    .setPlaceholder('Selecione um backup salvo')
                    .addOptions(
                        backups.slice(0, 25).map(b => ({
                            label: (b.nome || `Backup de ${formatarDataBR(new Date(b.criadoEm).getTime())}`).slice(0, 100),
                            description: `Cargos: ${b.cargos.length} · Categorias: ${b.categorias.length} · Canais: ${b.canais.length}`.slice(0, 100),
                            value: String(b._id)
                        }))
                    )
            )
        );
    }

container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('backup_fazer').setLabel('Fazer novo backup').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('backup_remover_abrir').setLabel('Remover backup').setStyle(ButtonStyle.Danger).setDisabled(!backups.length)
        )
    );

    return container;
}

function montarPainelRemoverSelect(backups) {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Remover backup'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Selecione qual backup você deseja remover:'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('backup_remover_select')
                    .setPlaceholder('Selecione um backup')
                    .addOptions(
                        backups.slice(0, 25).map(b => ({
                            label: (b.nome || `Backup de ${formatarDataBR(new Date(b.criadoEm).getTime())}`).slice(0, 100),
                            description: `Cargos: ${b.cargos.length} · Categorias: ${b.categorias.length} · Canais: ${b.canais.length}`.slice(0, 100),
                            value: String(b._id)
                        }))
                    )
            )
        );
}

function montarPainelRemoverConfirmacao(backup) {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Confirmar remoção'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            ` Você tem certeza que deseja remover este backup? Essa ação **não pode ser desfeita**.\n\n` +
            `**Nome:** ${backup.nome || `Backup de ${formatarDataBR(new Date(backup.criadoEm).getTime())}`}\n` +
            `**Salvo:** <t:${Math.floor(new Date(backup.criadoEm).getTime() / 1000)}:R>\n` +
            `**Cargos:** \`${backup.cargos.length}\` · **Categorias:** \`${backup.categorias.length}\` · **Canais:** \`${backup.canais.length}\``
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`backup_remover_confirmar_${backup._id}`).setLabel('Confirmar remoção').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('backup_remover_cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)
            )
        );
}

function montarPainelBackupSelecionado(backup) {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Backup selecionado'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Nome:** ${backup.nome || `Backup de ${formatarDataBR(new Date(backup.criadoEm).getTime())}`}\n` +
            `**Salvo:** <t:${Math.floor(new Date(backup.criadoEm).getTime() / 1000)}:F> · <t:${Math.floor(new Date(backup.criadoEm).getTime() / 1000)}:R>\n\n` +
            `**Cargos:** \`${backup.cargos.length}\`\n` +
            `**Categorias:** \`${backup.categorias.length}\`\n` +
            `**Canais:** \`${backup.canais.length}\``
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`backup_restaurar_${backup._id}`).setLabel('Restaurar').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`backup_deletar_${backup._id}`).setLabel('Deletar').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('backup_voltar_lista').setLabel('Voltar').setStyle(ButtonStyle.Secondary)
            )
        );
}

function formatarHorarioRelativo(timestampMs) {
    const agora = new Date();
    const data = new Date(timestampMs);

    const horaFormatada = data.toLocaleTimeString('pt-BR', {
        hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
    });

    const mesmoDia = agora.toDateString() === data.toDateString();
    if (mesmoDia) return `Hoje às ${horaFormatada}`;

    const ontem = new Date(agora);
    ontem.setDate(ontem.getDate() - 1);
    if (ontem.toDateString() === data.toDateString()) return `Ontem às ${horaFormatada}`;

    return formatarDataBR(timestampMs);
}

function montarPainelProgressoBackup(etapaAtual, sucessos = [], erros = [], finalizado = false, podeParar = false, inicioMs = Date.now()) {
    const inicioUnix = Math.floor(inicioMs / 1000);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Status**'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(finalizado ? 'Concluído!' : etapaAtual))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `${EMOJI_ATIVADO} **Concluídos**\u2003\u2003\u2003${EMOJI_DESATIVADO} **Falhas**\n` +
            `${sucessos.length}\u2003\u2003\u2003\u2003\u2003\u2003\u2003${erros.length}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Tempo passado**'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            finalizado ? `<t:${inicioUnix}:R>` : `Iniciado <t:${inicioUnix}:R>`
        ));

    if (erros.length) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Último erro:**\n${erros[erros.length - 1]}`
        ));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${formatarHorarioRelativo(Date.now())}`
    ));

    if (!finalizado && podeParar) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('backup_parar').setLabel('Parar backup').setStyle(ButtonStyle.Danger)
            )
        );
    }

    return container;
}

async function fazerBackupServidor(guild, onProgresso, estado) {
    const resultado = { sucesso: [], erros: [] };
    const notificar = async (etapa) => { if (onProgresso) await onProgresso(etapa, resultado); };
    const cancelado = () => estado?.cancelado === true;

    if (cancelado()) {
        resultado.erros.push('Processo cancelado pelo usuário.');
        return resultado;
    }

    await notificar('Coletando cargos...');
    const cargos = [];
    try {
        const todosCargos = guild.roles.cache.filter(r => r.id !== guild.id);
        for (const cargo of todosCargos.values()) {
            cargos.push({
                id: cargo.id,
                nome: cargo.name,
                cor: cargo.color,
                hoist: cargo.hoist,
                mentionable: cargo.mentionable,
                permissions: cargo.permissions.bitfield.toString(),
                posicao: cargo.position
            });
        }
        resultado.sucesso.push(`${cargos.length} cargo(s) coletado(s)`);
    } catch (err) {
        resultado.erros.push(`Cargos: ${err.message}`);
    }

    if (cancelado()) {
        resultado.erros.push('Processo cancelado pelo usuário.');
        await notificar('Cancelado pelo usuário.');
        return resultado;
    }

    await notificar('Coletando categorias e canais...');
    const categorias = [];
    const canais = [];
    try {
        const todosCanais = [...guild.channels.cache.values()].sort((a, b) => a.rawPosition - b.rawPosition);

        for (const canal of todosCanais) {
            if (canal.type !== ChannelType.GuildCategory) continue;
            categorias.push({
                id: canal.id,
                nome: canal.name,
                posicao: canal.rawPosition,
                permissionOverwrites: canal.permissionOverwrites.cache.map(p => ({
                    id: p.id, type: p.type, allow: p.allow.bitfield.toString(), deny: p.deny.bitfield.toString()
                }))
            });
        }
        resultado.sucesso.push(`${categorias.length} categoria(s) coletada(s)`);

        for (const canal of todosCanais) {
            if (canal.type === ChannelType.GuildCategory) continue;
            canais.push({
                id: canal.id,
                nome: canal.name,
                tipo: canal.type,
                categoriaId: canal.parentId,
                posicao: canal.rawPosition,
                topic: canal.topic || null,
                nsfw: canal.nsfw || false,
                rateLimitPerUser: canal.rateLimitPerUser || 0,
                bitrate: canal.bitrate || null,
                userLimit: canal.userLimit || null,
                permissionOverwrites: canal.permissionOverwrites.cache.map(p => ({
                    id: p.id, type: p.type, allow: p.allow.bitfield.toString(), deny: p.deny.bitfield.toString()
                }))
            });
        }
        resultado.sucesso.push(`${canais.length} canal(is) coletado(s)`);
    } catch (err) {
        resultado.erros.push(`Canais: ${err.message}`);
    }

    if (cancelado()) {
        resultado.erros.push('Processo cancelado pelo usuário.');
        await notificar('Cancelado pelo usuário.');
        return resultado;
    }

await notificar('Salvando no banco de dados...');
    try {
        await ServerBackup.create({
            guildId: guild.id,
            nomeServidor: guild.name,
            iconeUrl: guild.iconURL({ extension: 'png', size: 512 }) || null,
            cargos, categorias, canais,
            criadoEm: Date.now()
        });
        resultado.sucesso.push('Backup salvo no MongoDB com sucesso');
    } catch (err) {
        resultado.erros.push(`MongoDB: ${err.message}`);
    }

    await notificar('Concluído!');
    return resultado;
}

function montarOverwritesRestauracao(overwritesBackup, mapaCargos, guild) {
    const resultado = [];
    for (const ow of overwritesBackup || []) {
        try {
            if (ow.type === 0) { // cargo
                const id = ow.id === guild.id ? guild.id : mapaCargos.get(ow.id)?.id;
                if (!id) continue;
                resultado.push({ id, type: 0, allow: BigInt(ow.allow), deny: BigInt(ow.deny) });
            } else { // membro (ID de usuário continua válido)
                resultado.push({ id: ow.id, type: 1, allow: BigInt(ow.allow), deny: BigInt(ow.deny) });
            }
        } catch { /* overwrite corrompido, ignora */ }
    }
    return resultado;
}

async function restaurarBackupServidor(guild, backupId, onProgresso, estado) {
    const resultado = { sucesso: [], erros: [] };

    let ultimaAtualizacao = 0;
    const INTERVALO_MIN_MS = 1500;
    const notificar = async (etapa, processadoAtual = null, totalAtual = null) => {
        if (onProgresso) await onProgresso(etapa, resultado, processadoAtual, totalAtual);
    };
    const cancelado = () => estado?.cancelado === true;

    const backup = await ServerBackup.findOne({ _id: backupId, guildId: guild.id }).catch(() => null);
    if (!backup) {
        resultado.erros.push('Esse backup não foi encontrado (pode ter sido deletado).');
        return resultado;
    }

// ---- Cargos ----
    const mapaCargos = new Map();
    const cargosOrdenados = [...backup.cargos].sort((a, b) => a.posicao - b.posicao);
    let idxCargo = 0;
    for (const cargoBackup of cargosOrdenados) {
        if (cancelado()) {
            resultado.erros.push('Processo cancelado pelo usuário.');
            await notificar('Cancelado pelo usuário.', null, null, true);
            return resultado;
        }
        idxCargo++;
        try {
            let cargoAtual = guild.roles.cache.find(r => r.name === cargoBackup.nome);
            if (!cargoAtual) {
                cargoAtual = await guild.roles.create({
                    name: cargoBackup.nome,
                    color: cargoBackup.cor,
                    hoist: cargoBackup.hoist,
                    mentionable: cargoBackup.mentionable,
                    permissions: BigInt(cargoBackup.permissions),
                    reason: 'Restauração de backup'
                });
                resultado.sucesso.push(`Cargo criado: ${cargoBackup.nome}`);
            } else {
                resultado.sucesso.push(`Cargo já existia: ${cargoBackup.nome}`);
            }
            mapaCargos.set(cargoBackup.id, cargoAtual);
        } catch (err) {
            resultado.erros.push(`Cargo "${cargoBackup.nome}": ${err.message}`);
        }
        const ehUltimo = idxCargo === cargosOrdenados.length;
        await notificar('Restaurando cargos...', idxCargo, cargosOrdenados.length, ehUltimo);
        await esperar(250);
    }

// ---- Categorias ----
    const mapaCategorias = new Map();
    let idxCat = 0;
    for (const catBackup of backup.categorias) {
        if (cancelado()) {
            resultado.erros.push('Processo cancelado pelo usuário.');
            await notificar('Cancelado pelo usuário.', null, null, true);
            return resultado;
        }
        idxCat++;
        try {
            let catAtual = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && c.name === catBackup.nome);
            if (!catAtual) {
                catAtual = await guild.channels.create({
                    name: catBackup.nome,
                    type: ChannelType.GuildCategory,
                    reason: 'Restauração de backup'
                });
                resultado.sucesso.push(`Categoria criada: ${catBackup.nome}`);
            } else {
                resultado.sucesso.push(`Categoria já existia: ${catBackup.nome}`);
            }
            mapaCategorias.set(catBackup.id, catAtual);

            const overwrites = montarOverwritesRestauracao(catBackup.permissionOverwrites, mapaCargos, guild);
            if (overwrites.length) await catAtual.permissionOverwrites.set(overwrites).catch(() => null);
        } catch (err) {
            resultado.erros.push(`Categoria "${catBackup.nome}": ${err.message}`);
        }
        const ehUltimo = idxCat === backup.categorias.length;
        await notificar('Restaurando categorias...', idxCat, backup.categorias.length, ehUltimo);
        await esperar(250);
    }

// ---- Canais ----
    const mapaCanais = new Map();
    let idxCanal = 0;
    for (const canalBackup of backup.canais) {
        if (cancelado()) {
            resultado.erros.push('Processo cancelado pelo usuário.');
            await notificar('Cancelado pelo usuário.', null, null, true);
            return resultado;
        }
        idxCanal++;
        try {
            let canalAtual = guild.channels.cache.find(c => c.name === canalBackup.nome && c.type === canalBackup.tipo);

            const categoria = canalBackup.categoriaId
                ? mapaCategorias.get(canalBackup.categoriaId)
                : null;

            if (!canalAtual) {
                canalAtual = await guild.channels.create({
                    name: canalBackup.nome,
                    type: canalBackup.tipo,
                    parent: categoria ? categoria.id : undefined,
                    topic: canalBackup.topic || undefined,
                    nsfw: canalBackup.nsfw,
                    rateLimitPerUser: canalBackup.rateLimitPerUser || undefined,
                    bitrate: canalBackup.bitrate || undefined,
                    userLimit: canalBackup.userLimit || undefined,
                    reason: 'Restauração de backup'
                });
                resultado.sucesso.push(`Canal criado: ${canalBackup.nome}`);
            } else {
                resultado.sucesso.push(`Canal já existia: ${canalBackup.nome}`);
            }

            mapaCanais.set(canalBackup.id, canalAtual);

            const overwrites = montarOverwritesRestauracao(canalBackup.permissionOverwrites, mapaCargos, guild);
            if (overwrites.length) await canalAtual.permissionOverwrites.set(overwrites).catch(() => null);
        } catch (err) {
            resultado.erros.push(`Canal "${canalBackup.nome}": ${err.message}`);
        }
        const ehUltimo = idxCanal === backup.canais.length;
        await notificar('Criando canais...', idxCanal, backup.canais.length, ehUltimo);
        await esperar(250);
    }
    
// ---- 2) Corrige posições ----
    await notificar('Ajustando posições (lote)...', null, null, true);
    try {
        const payloadPosicoes = [];

        for (const catBackup of backup.categorias) {
            const catAtual = mapaCategorias.get(catBackup.id);
            if (catAtual) payloadPosicoes.push({ id: catAtual.id, position: catBackup.posicao });
        }
        for (const canalBackup of backup.canais) {
            const canalAtual = mapaCanais.get(canalBackup.id);
            if (canalAtual) payloadPosicoes.push({ id: canalAtual.id, position: canalBackup.posicao });
        }

        const TAMANHO_LOTE = 20;
        const totalLotes = Math.ceil(payloadPosicoes.length / TAMANHO_LOTE);
        for (let i = 0; i < payloadPosicoes.length; i += TAMANHO_LOTE) {
            if (cancelado()) {
                resultado.erros.push('Processo cancelado pelo usuário.');
                await notificar('Cancelado pelo usuário.', null, null, true);
                return resultado;
            }

            const lote = payloadPosicoes.slice(i, i + TAMANHO_LOTE);
            await client.rest.patch(Routes.guildChannels(guild.id), { body: lote });
            resultado.sucesso.push(`Lote de posições sincronizado (${lote.length} canal(is))`);
            const numeroLote = Math.floor(i / TAMANHO_LOTE) + 1;
            const ehUltimoLote = numeroLote === totalLotes;
            await notificar('Ajustando posições (lote)...', numeroLote, totalLotes, ehUltimoLote);
            await esperar(1500);
        }
    } catch (err) {
        resultado.erros.push(`Sincronização de posições: ${err.message}`);
    }

    await notificar('Concluído!', null, null, true);
    return resultado;
}

async function registrarBioSeNecessario(userId, bio) {
    try {
        const bioLimpa = (bio || '').trim();

        // não registra se a bio atual está vazia
        if (!bioLimpa) return;

        const ultimo = await HistoricoBio.findOne({ userId }).sort({ registradoEm: -1 });
        if (ultimo && (ultimo.bio || '') === bioLimpa) return;

        await HistoricoBio.create({ userId, bio: bioLimpa, registradoEm: Date.now() });
    } catch (err) {
        console.error('--- Erro ao registrar histórico de bio ---', err);
    }
}

async function montarPainelBios(guild, alvoUser, autorId, expiraEm = 0) {
    let bioAtual = null;
    let erroBioAtual = false;
    let perfilPrivado = false;
    
    const membro = await guild.members.fetch({ user: alvoUser.id, force: true }).catch(() => null);

    try {
        const perfil = await getUserPerfil(alvoUser.id, membro ? guild.id : null, { force: true });

        bioAtual = perfil.bio || '';
        perfilPrivado = perfil.privado;
        if (!perfilPrivado) {
             await registrarBioSeNecessario(alvoUser.id, bioAtual);
        }
} catch (err) {
        console.error('--- Erro ao consultar bio atual pra registro ---', err.message);
        erroBioAtual = true;
        if (String(err.message).includes('PERFIL_INACESSIVEL')) {
            bioAtual = 'Perfil não acessível';
            erroBioAtual = false;
            perfilPrivado = false;
        }
    }

    const historicoCompleto = await HistoricoBio.find({ userId: alvoUser.id }).sort({ registradoEm: -1 }).catch(() => []);

    // remove o registro mais recente da lista de "antigas" se ele já for exibido como a atual
    const historicoAntigas = historicoCompleto.length && !erroBioAtual
        ? historicoCompleto.slice(1)
        : historicoCompleto;

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Biografia\n ${alvoUser.username}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // ---- Bio atual ----
if (erroBioAtual) {
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('**Bio atual:** não foi possível consultar agora.')
    );
} else if (perfilPrivado) {
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent('**Bio atual**\nPerfil privado — a biografia não está disponível para visualização.')
    );
} else {
    const textoAtual = bioAtual?.trim() ? bioAtual : '`sem biografia definida`';
    container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`**Bio atual**\n${textoAtual}`)
    );
}

// ---- Histórico ----
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Biografias anteriores** · \`${historicoAntigas.length}\` registro(s)`
    ));

if (!historicoAntigas.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(' Nenhuma biografia anterior catalogada.'));
    } else {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`userinfo_bios_ver_${alvoUser.id}_${autorId}_${expiraEm}`)
                    .setLabel('Ver biografias')
                    .setStyle(ButtonStyle.Secondary)
            )
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addActionRowComponents(montarSelectUserInfo(alvoUser.id, autorId, 'bios', expiraEm));
    return rodapeExpiracao(container, expiraEm);
}

async function montarPainelBiosLista(alvoUser, autorId, pagina = 0, expiraEm = 0) {
    const historicoCompleto = await HistoricoBio.find({ userId: alvoUser.id }).sort({ registradoEm: -1 }).catch(() => []);
    const historicoAntigas = historicoCompleto.length ? historicoCompleto.slice(1) : [];

    const POR_PAGINA = 5;
    const totalPaginas = Math.max(1, Math.ceil(historicoAntigas.length / POR_PAGINA));
    const paginaAtual = Math.max(0, Math.min(pagina, totalPaginas - 1));

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Biografias anteriores\n ${alvoUser.username}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (!historicoAntigas.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(' Nenhuma biografia anterior catalogada.'));
        return rodapeExpiracao(container, expiraEm);
    }

    const inicio = paginaAtual * POR_PAGINA;
    const fatia = historicoAntigas.slice(inicio, inicio + POR_PAGINA);

    const linhas = fatia.map((h, i) => {
        const texto = h.bio?.trim() ? h.bio : '`bio vazia`';
        return `**${inicio + i + 1}.** ${texto}\n captada em ${formatarDataBR(h.registradoEm)} · ${formatarTempoRelativo(h.registradoEm)}`;
    });

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(linhas.join('\n\n')));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`userinfo_bios_pagina_${alvoUser.id}_${autorId}_${paginaAtual - 1}_${expiraEm}`)
                .setLabel('Voltar')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(paginaAtual === 0),
            new ButtonBuilder()
                .setCustomId('userinfo_bios_pagina_atual')
                .setLabel(`${paginaAtual + 1}/${totalPaginas}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`userinfo_bios_pagina_${alvoUser.id}_${autorId}_${paginaAtual + 1}_${expiraEm}`)
                .setLabel('Avançar')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(paginaAtual >= totalPaginas - 1)
        )
    );

    return rodapeExpiracao(container, expiraEm);
}

function montarPainelInfoHierarquia(guild, autorId) {
    const iconUrl = guild.iconURL({ extension: 'png', size: 256 });

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## <:17676:1540328100099793048> Hierarquia de Cargos'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Cargo mais alto atualmente**: <@&1542321888355684456>'))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl || IMG_DISCORD_LOGO))
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Verifique quem possui cada **cargo** no servidor\n-# **Todos** os **cargos** são listados no painel'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`info_hierarquia_verificar_${autorId}`)
                    .setLabel('Verificar')
                    .setStyle(ButtonStyle.Secondary)
            )
        );
}

function montarPainelVerificacaoCargos() {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## <:17676:1540328100099793048> Hierarquia de Cargos'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Selecione o **cargo** abaixo para ver quem o **possui**'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('info_hierarquia_cargo_select')
                    .setPlaceholder('Selecione um cargo')
                    .setMinValues(1)
                    .setMaxValues(1)
            )
        );
}

async function montarPainelListaCargo(guild, cargo, pagina = 0) {
    const membros = await obterMembrosCache(guild);
    const membrosComCargo = [...membros.filter(m => m.roles.cache.has(cargo.id)).values()];

    const POR_PAGINA = 40; // segurança pra não estourar o limite de caracteres do Discord
    const totalPaginas = Math.max(1, Math.ceil(membrosComCargo.length / POR_PAGINA));
    const paginaAtual = Math.max(0, Math.min(pagina, totalPaginas - 1));

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Cargo: <@&${cargo.id}>`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# **Total:** ${membrosComCargo.length} · <@&${cargo.id}>`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (!membrosComCargo.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Ninguém possui o cargo <@&${cargo.id}>**`));
        return container;
    }

    const inicio = paginaAtual * POR_PAGINA;
    const listados = membrosComCargo.slice(inicio, inicio + POR_PAGINA);

    const linhas = listados.map(m =>
        `<@${m.id}> · \`${m.user.username}\` · \`${m.id}\``
    ).join('\n');

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(linhas));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`info_hierarquia_pagina_${cargo.id}_${paginaAtual - 1}`)
                .setLabel('Voltar')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(paginaAtual === 0),
            new ButtonBuilder()
                .setCustomId('info_hierarquia_pagina_atual')
                .setLabel(`${paginaAtual + 1}/${totalPaginas}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`info_hierarquia_pagina_${cargo.id}_${paginaAtual + 1}`)
                .setLabel('Avançar')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(paginaAtual >= totalPaginas - 1)
        )
    );

    return container;
}

async function baixarTikTok(link) {
    // ---- Tentativa 1: RapidAPI (tiktok-video-no-watermark2) ----
    if (process.env.TIKTOK_RAPIDAPI_KEY) {
        try {
            const resposta = await fetch(
                `https://tiktok-video-no-watermark2.p.rapidapi.com/?url=${encodeURIComponent(link)}&hd=1`,
                {
                    headers: {
                        'X-RapidAPI-Key': process.env.TIKTOK_RAPIDAPI_KEY,
                        'X-RapidAPI-Host': 'tiktok-video-no-watermark2.p.rapidapi.com'
                    }
                }
            );
            if (resposta.ok) {
                const dados = await resposta.json();
                if (dados.code === 0 && dados.data) {
                    const url = dados.data.hdplay || dados.data.play;
                    if (url) return url;
                }
            } else {
                console.error(`--- RapidAPI retornou status ${resposta.status} ---`);
            }
        } catch (err) {
            console.error('--- RapidAPI falhou, tentando fallback ---', err.message);
        }
    }

    // ---- Tentativa 2: tikwm (grátis, sem chave) ----
    try {
        const resposta = await fetch(`https://www.tikwm.com/api/`, {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Referer': 'https://www.tikwm.com/',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ url: link, hd: '1' })
        });
        if (resposta.ok) {
            const dados = await resposta.json();
            if (dados.code === 0 && dados.data) {
                return dados.data.hdplay || dados.data.play;
            }
        }
    } catch (err) {
        console.error('--- tikwm falhou, tentando próximo fallback ---', err.message);
    }

    // ---- Tentativa 3: tiklydown (grátis, sem chave) ----
    try {
        const respostaAlt = await fetch(`https://api.tiklydown.eu.org/api/download?url=${encodeURIComponent(link)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (respostaAlt.ok) {
            const dadosAlt = await respostaAlt.json();
            const url = dadosAlt?.video?.playAddr?.[0] || dadosAlt?.video?.downloadAddr;
            if (url) return url;
        }
    } catch (err) {
        console.error('--- tiklydown falhou ---', err.message);
    }

    return null;
}

async function limparInvitesCacheDesatualizado() {
    for (const guild of client.guilds.cache.values()) {
        try {
            const invitesAtuais = await guild.invites.fetch();
            const codigosValidos = new Set(invitesAtuais.map(inv => inv.code));

            const cache = invitesCache.get(guild.id);
            if (!cache) continue;

            for (const codigo of cache.keys()) {
                if (!codigosValidos.has(codigo)) cache.delete(codigo);
            }
        } catch (err) {
            console.error(`--- Erro ao limpar invitesCache de ${guild.id} ---`, err);
        }
    }
}


// ============ STATUS DO BOT ============
function formatarBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${unidades[i]}`;
}

function gerarBarraProgresso(percentual, tamanho = 14) {
    const pct = Math.max(0, Math.min(100, percentual || 0));
    const preenchido = Math.round((pct / 100) * tamanho);
    const vazio = tamanho - preenchido;
    return '▰'.repeat(preenchido) + '▱'.repeat(vazio);
}

async function obterMemoriaContainer() {
    // cgroup v2
    try {
        const maxRaw = fs.readFileSync('/sys/fs/cgroup/memory.max', 'utf8').trim();
        const usadaRaw = fs.readFileSync('/sys/fs/cgroup/memory.current', 'utf8').trim();

        if (maxRaw !== 'max') {
            const total = parseInt(maxRaw);
            const usada = parseInt(usadaRaw);
            if (!isNaN(total) && !isNaN(usada) && total > 0) {
                return { total, usada, livre: total - usada, fonte: 'cgroup v2' };
            }
        }
    } catch { /* não é cgroup v2, tenta v1 */ }

    // cgroup v1
    try {
        const totalRaw = fs.readFileSync('/sys/fs/cgroup/memory/memory.limit_in_bytes', 'utf8').trim();
        const usadaRaw = fs.readFileSync('/sys/fs/cgroup/memory/memory.usage_in_bytes', 'utf8').trim();

        const total = parseInt(totalRaw);
        const usada = parseInt(usadaRaw);

        // limite "sem limite" costuma vir como um número gigantesco (perto de 2^63)
        if (!isNaN(total) && !isNaN(usada) && total > 0 && total < Number.MAX_SAFE_INTEGER) {
            return { total, usada, livre: total - usada, fonte: 'cgroup v1' };
        }
    } catch { /* não é cgroup v1 também */ }

    // fallback: memória do host (pode não refletir o limite real do container)
    const total = os.totalmem();
    const livre = os.freemem();
    return { total, usada: total - livre, livre, fonte: 'host (os module)' };
}

function obterUsoCPU() {
    return new Promise((resolve) => {
        const inicio = os.cpus();
        setTimeout(() => {
            const fim = os.cpus();
            let totalIdle = 0;
            let totalTick = 0;

            for (let i = 0; i < inicio.length; i++) {
                const cpuInicio = inicio[i].times;
                const cpuFim = fim[i].times;

                const totalInicio = Object.values(cpuInicio).reduce((a, b) => a + b, 0);
                const totalFim = Object.values(cpuFim).reduce((a, b) => a + b, 0);

                totalIdle += (cpuFim.idle - cpuInicio.idle);
                totalTick += (totalFim - totalInicio);
            }

            const uso = totalTick > 0 ? 100 - Math.floor((totalIdle / totalTick) * 100) : 0;
            resolve(Math.max(0, Math.min(100, uso)));
        }, 300);
    });
}

async function montarPainelStatus(botClient) {
    const cpuUso = await obterUsoCPU();

    const memProcesso = process.memoryUsage();
    const { total: ramTotalSistema, usada: ramUsadaSistema, livre: ramLivreSistema, fonte: fonteMemoria } = await obterMemoriaContainer();
    const ramPercentualSistema = (ramUsadaSistema / ramTotalSistema) * 100;

    const ramProcessoPercentual = (memProcesso.rss / ramTotalSistema) * 100;

    const uptimeTexto = formatarDuracaoMs(botClient.uptime);
    const ping = Math.round(botClient.ws.ping);

    const servidores = botClient.guilds.cache.size;
    const usuarios = botClient.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Status do Nino`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**CPU**\n\`\`\`${gerarBarraProgresso(cpuUso)}  ${cpuUso}%\`\`\``
        ))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**RAM (Sistema)**\n\`\`\`${gerarBarraProgresso(ramPercentualSistema)}  ${ramPercentualSistema.toFixed(1)}%\`\`\`\n` +
            `\`${formatarBytes(ramUsadaSistema)} / ${formatarBytes(ramTotalSistema)}\`\n` +
            `-# fonte: ${fonteMemoria}`
        ))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**RAM (Processo do bot)**\n\`\`\`${gerarBarraProgresso(ramProcessoPercentual)}  ${ramProcessoPercentual.toFixed(1)}%\`\`\`\n` +
            `\`${formatarBytes(memProcesso.rss)}\``
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Ping:** \`${ping}ms\`\n` +
            `**Uptime:** \`${uptimeTexto}\`\n` +
            `**Servidores:** \`${servidores}\`\n` +
            `**Usuários:** \`${usuarios}\`\n` +
            `**Node.js:** \`${process.version}\``
        ));

    return container;
}

function extrairPrimeiraMediaUrl(components) {
    for (const comp of components ?? []) {
        if (!comp) continue;
        // MediaGallery (type 12)
        if (comp.type === 12 && comp.items?.length) {
            const url = comp.items[0]?.media?.url;
            if (url) return url;
        }
        // Thumbnail (type 11)
        if (comp.type === 11 && comp.media?.url) {
            return comp.media.url;
        }
        // desce recursivamente em containers, sections, action rows etc.
        if (comp.components?.length) {
            const achou = extrairPrimeiraMediaUrl(comp.components);
            if (achou) return achou;
        }
    }
    return null;
}

function limitarCache(map, tamanhoMax) {
    if (map.size <= tamanhoMax) return;
    const excesso = map.size - tamanhoMax;
    const chaves = [...map.keys()];
    for (let i = 0; i < excesso; i++) {
        map.delete(chaves[i]);
    }
}

function chaveBeijoStreak(guildId, userAId, userBId) {
    const [menor, maior] = [userAId, userBId].sort();
    return { id: `${guildId}_${menor}_${maior}`, menor, maior };
}

async function obterBeijoStreak(guildId, userAId, userBId) {
    const { id, menor, maior } = chaveBeijoStreak(guildId, userAId, userBId);
    const doc = await BeijoStreak.findById(id).catch(() => null);
    return doc?.streak ?? 0;
}

const LIMITE_RESET_STREAK_MS = 24 * 60 * 60 * 1000; // 24 horas sem beijar = reseta

async function incrementarBeijoStreak(guildId, userAId, userBId) {
    const { id, menor, maior } = chaveBeijoStreak(guildId, userAId, userBId);
    const agora = Date.now();

    try {
        const docAtual = await BeijoStreak.findById(id);

        const passouMuitoTempo = docAtual?.ultimoBeijoEm
            ? (agora - docAtual.ultimoBeijoEm) > LIMITE_RESET_STREAK_MS
            : false;

        const novoStreak = (!docAtual || passouMuitoTempo) ? 1 : docAtual.streak + 1;

        const doc = await BeijoStreak.findByIdAndUpdate(
            id,
            { $set: { guildId, userA: menor, userB: maior, streak: novoStreak, ultimoBeijoEm: agora } },
            { upsert: true, new: true }
        );

        return doc?.streak ?? 1;
    } catch (err) {
        console.error('--- Erro ao incrementar streak de beijo ---', err);
        return 1;
    }
}

const XP_POR_BEIJO = 10;
const LIMITE_RETRIBUIR_MS = 5 * 60 * 1000

const TEXTOS_BEIJO = [
    { min: 0, max: 2, variantes: [
        'Só um selinho de leve, mas já conta.',
        'Começou tímido, mas começou.',
        'O primeiro sempre é o mais estranho.',
        'Ainda sem graça, mas o clima já mudou.',
        'Passo inicial dado, o resto é história.',
        'Cara de quem não esperava, mas gostou.',
        'Quebrou o gelo, faltam só uns 500 pra virar casal oficial.',
        'Deu tudo certo, ninguém tropeçou nos dentes dessa vez.'
    ]},
    { min: 3, max: 4, variantes: [
        'Já tá pegando gosto pela coisa, hein.',
        'Repetindo o feito, cada vez mais soltos.',
        'A química tá evoluindo rapidinho.',
        'Terceira vez já não é coincidência.',
        'Tá virando hábito e ninguém tá reclamando.',
        'Confiança nas alturas, dá pra ver de longe.',
        'Cada beijo mais natural que o outro.',
        'Já sabem até a hora certa de fechar o olho.'
    ]},
    { min: 5, max: 9, variantes: [
        'Já virou rotina esses dois aqui.',
        'Tá esquentando de verdade agora.',
        'Ninguém mais separa esse casal.',
        'Cinco pra cima e o clima só cresce.',
        'Já tem gente shippando no chat.',
        'Rotina de beijo estabelecida, respeitem.',
        'A cada beijo, menos vergonha e mais sincronia.',
        'Tá osso pra qualquer um competir com essa dupla.'
    ]},
    { min: 10, max: 19, variantes: [
        'Combo de 10+! Já pode até pedir música no fantástico.',
        'Dois dígitos de beijo, oficialmente inseparáveis.',
        'A essa altura já são praticamente namorados.',
        'Beijo de profissional, sem hesitação nenhuma.',
        'Já viraram case de estudo de compatibilidade.',
        'Se fosse Big Brother, já tavam de aliança.',
        'A dupla mais consistente do servidor até agora.',
        'Quem apostava que ia durar 3 beijos perdeu feio.'
    ]},
    { min: 20, max: Infinity, variantes: [
        'Recorde histórico de beijos por aqui!',
        'Vira lenda do servidor com essa quantidade de beijo.',
        'Isso aqui já é documentário de tanto beijo.',
        'Nível lendário: já merece estátua no servidor.',
        'A essa altura, já deveriam pedir a mão em casamento.',
        'Streak absurdo, ninguém nem tenta mais competir.',
        'Já é oficialmente o casal mais fiel do Discord.',
        'Recorde batido e reescrito toda hora por esses dois.'
    ]}
];

function montarTextoBeijo(streak) {
    const faixa = TEXTOS_BEIJO.find(f => streak >= f.min && streak <= f.max) ?? TEXTOS_BEIJO[0];
    return faixa.variantes[Math.floor(Math.random() * faixa.variantes.length)];
}

function montarEmbedBeijo(autorUser, alvoUser, streak, retribuicao = false) {
    const gifUrl = GIFS_BEIJO[Math.floor(Math.random() * GIFS_BEIJO.length)];
    const textoFlavor = montarTextoBeijo(streak);

    const textoAcao = retribuicao
        ? `<@${autorUser.id}> retribuiu o beijo de <@${alvoUser.id}>!`
        : `<@${autorUser.id}> beijou <@${alvoUser.id}>.`;

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Beijo'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(textoAcao))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `Streak **${streak}x** · +${XP_POR_BEIJO} XP para cada um\n${textoFlavor}`
        ))
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(gifUrl))
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`beijar_retribuir_${autorUser.id}_${alvoUser.id}_${Date.now()}`)
                    .setLabel('Retribuir')
                    .setStyle(ButtonStyle.Secondary)
            )
        );
}

async function incrementarConviteStats(guildId, userId, campo, valor = 1) {
    return ConviteStats.findOneAndUpdate(
        { guildId, userId },
        { $inc: { [campo]: valor } },
        { upsert: true, new: true }
    ).catch(err => console.error('--- Erro ao incrementar stats de convite ---', err));
}

function inicializarSessoesVoiceSorteio() {
    for (const guild of client.guilds.cache.values()) {
        for (const canal of guild.channels.cache.values()) {
            if (canal.type !== ChannelType.GuildVoice && canal.type !== ChannelType.GuildStageVoice) continue;
            if (guild.afkChannelId && canal.id === guild.afkChannelId) continue;

            for (const membro of canal.members.values()) {
                if (membro.user.bot) continue;
                iniciarSessaoVoiceSorteio(guild.id, membro.id);
            }
        }
    }
}

function parseDuracaoTexto(texto) {
    const match = String(texto ?? '').trim().toLowerCase().match(/^(\d+)\s*(m|min|h|d)$/);
    if (!match) return null;
    const valor = parseInt(match[1]);
    const mult = { m: 60000, min: 60000, h: 3600000, d: 86400000 };
    return valor * mult[match[2]];
}

function formatarDuracaoMs(ms) {
    if (!ms || ms <= 0) return '—';
    const dias = Math.floor(ms / 86400000);
    const horas = Math.floor((ms % 86400000) / 3600000);
    const minutos = Math.floor((ms % 3600000) / 60000);
    const partes = [];
    if (dias) partes.push(`${dias}d`);
    if (horas) partes.push(`${horas}h`);
    if (minutos) partes.push(`${minutos}m`);
    return partes.length ? partes.join(' ') : '<1m';
}

function parseQuantidadeTexto(texto) {
    const match = String(texto ?? '').trim().toLowerCase().match(/^(\d+)/);
    return match ? parseInt(match[1]) : 0;
}

async function montarPainelSorteioInicial(guildId, autorId) {
    const ativos = await Sorteio.find({ guildId, criadorId: autorId, status: 'ativo' }).catch(() => []);
    const encerrados = await Sorteio.find({ guildId, criadorId: autorId, status: 'encerrado' }).sort({ criadoEm: -1 }).limit(10).catch(() => []);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('**SORTEIOS**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            'Esse painel permite criar e gerenciar sorteios no servidor.\n\n' +
            'Clique em **Criar novo** para montar um sorteio do zero, ou selecione um sorteio abaixo para editá-lo, encerrá-lo ou dar Reroll.'
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (ativos.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Seus sorteios ativos:**\n${ativos.map(s => `\`${s.tag}\` — ${s.premio || 'sem prêmio definido'}`).join('\n')}`
        ));
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('sorteio_gerenciar_select')
                    .setPlaceholder('Selecione um sorteio ativo para gerenciar')
                    .addOptions(ativos.slice(0, 25).map(s => ({
                        label: s.tag,
                        description: (s.premio || 'sem prêmio').slice(0, 100),
                        value: s.tag
                    })))
            )
        );
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    }

    if (encerrados.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Sorteios encerrados recentemente:**\n${encerrados.map(s => `\`${s.tag}\` — ${s.premio || 'sem prêmio definido'}`).join('\n')}`
        ));
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('sorteio_gerenciar_encerrado_select')
                    .setPlaceholder('Selecione um sorteio encerrado (ex: para dar Reroll)')
                    .addOptions(encerrados.slice(0, 25).map(s => ({
                        label: s.tag,
                        description: (s.premio || 'sem prêmio').slice(0, 100),
                        value: s.tag
                    })))
            )
        );
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    }

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sorteio_criar_novo').setLabel('Criar novo').setStyle(ButtonStyle.Success)
        )
    );

    return container;
}

function montarPainelSorteioConfig(draft) {
    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('**CONFIGURAR SORTEIO**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // ---- Tag ----
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Tag:** \`${draft.tag || 'não definida'}\``));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sorteio_editar_tag').setLabel('Editar tag').setStyle(ButtonStyle.Secondary)
        )
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // ---- Prêmio ----
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Prêmio:** ${draft.premio || '\`não definido\`'}`));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sorteio_editar_premio').setLabel('Editar prêmio').setStyle(ButtonStyle.Secondary)
        )
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // ---- Duração ----
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Duração:** ${draft.duracaoMs ? formatarDuracaoMs(draft.duracaoMs) : '\`não definida\`'}`
    ));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sorteio_editar_duracao').setLabel('Editar duração').setStyle(ButtonStyle.Secondary)
        )
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // ---- Imagem ----
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Imagem:** ${draft.imagemUrl ? 'definida' : '\`nenhuma\`'}`
    ));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sorteio_imagem').setLabel('Adicionar imagem').setStyle(ButtonStyle.Secondary)
        )
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // ---- Requisitos ----
    const temRequisito = draft.requisitoCallMs || draft.requisitoMensagens || draft.requisitoInvites || draft.requisitoTextoLivre;
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        '**Requisitos:**\n' +
        `${draft.requisitoCallMs ? `・Tempo em call: \`${draft.requisitoCallTexto}\`\n` : ''}` +
        `${draft.requisitoMensagens ? `・Mensagens: \`${draft.requisitoMensagens}\`\n` : ''}` +
        `${draft.requisitoInvites ? `・Convites: \`${draft.requisitoInvites}\`\n` : ''}` +
        `${draft.requisitoTextoLivre ? `・Outro: \`${draft.requisitoTextoLivre}\`\n` : ''}` +
        `${temRequisito ? '' : '\`nenhum requisito definido\`'}`
    ));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('sorteio_requisito').setLabel('Definir requisitos').setStyle(ButtonStyle.Secondary)
        )
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // ---- Canal (agora por último) ----
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Canal:** ${draft.canalId ? `<#${draft.canalId}>` : '\`não selecionado\`'}`
    ));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ChannelSelectMenuBuilder()
                .setCustomId('sorteio_canal_select')
                .setPlaceholder('Selecione o canal do sorteio')
                .setChannelTypes(ChannelType.GuildText)
        )
    );
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

// ---- Botões finais ----
    const configCompleta = draft.tag && draft.premio && draft.duracaoMs;
    const botoesAcao = [];

    if (draft.status === 'ativo') {
        botoesAcao.push(
            new ButtonBuilder().setCustomId('sorteio_encerrar').setLabel('Encerrar agora').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('sorteio_resortear').setLabel('Reroll').setStyle(ButtonStyle.Primary)
        );
    } else if (draft.status === 'encerrado') {
        botoesAcao.push(
            new ButtonBuilder().setCustomId('sorteio_resortear').setLabel('Reroll').setStyle(ButtonStyle.Primary)
        );
    } else {
        botoesAcao.push(
            new ButtonBuilder().setCustomId('sorteio_iniciar').setLabel('Iniciar').setStyle(ButtonStyle.Success).setDisabled(!configCompleta)
        );
    }

    botoesAcao.push(
        new ButtonBuilder().setCustomId('sorteio_deletar').setLabel('Deletar').setStyle(ButtonStyle.Danger)
    );

    container.addActionRowComponents(new ActionRowBuilder().addComponents(botoesAcao));

    return container;
}

function montarEmbedSorteioCanal(sorteio) {
    const container = new ContainerBuilder();

    if (sorteio.imagemUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(sorteio.imagemUrl))
        );
    }

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`# SORTEIO\n**Prêmio:** ${sorteio.premio}`));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const requisitosTexto = [];
    if (sorteio.requisitoCallMs) requisitosTexto.push(`・${sorteio.requisitoCallTexto} em call`);
    if (sorteio.requisitoMensagens) requisitosTexto.push(`・${sorteio.requisitoMensagens} mensagens`);
    if (sorteio.requisitoInvites) requisitosTexto.push(`・${sorteio.requisitoInvites} convites`);
    if (sorteio.requisitoTextoLivre) requisitosTexto.push(`・${sorteio.requisitoTextoLivre}`);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Termina:** <t:${Math.floor(sorteio.encerraEm / 1000)}:R>\n` +
        `**Participantes:** \`${sorteio.participantes.length}\`` +
        (requisitosTexto.length ? `\n\n**Requisitos:**\n${requisitosTexto.join('\n')}` : '')
    ));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`sorteio_participar_${sorteio._id}`).setLabel('Participar').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`sorteio_participantes_${sorteio._id}`).setLabel('Participantes').setStyle(ButtonStyle.Secondary)
        )
    );

    return container;
}

function participantesElegiveis(sorteio) {
    return sorteio.participantes.filter(uid => {
        if (sorteio.requisitoMensagens && (sorteio.progressoMensagens?.[uid] || 0) < sorteio.requisitoMensagens) return false;
        if (sorteio.requisitoCallMs && (sorteio.progressoCallMs?.[uid] || 0) < sorteio.requisitoCallMs) return false;
        if (sorteio.requisitoInvites && (sorteio.progressoInvites?.[uid] || 0) < sorteio.requisitoInvites) return false;
        return true;
    });
}

const REGEX_URL_SERVIDOR = /(\/onze\b)|(discord\.gg\/onze\b)/i;
const REGEX_CONVITE_GENERICO = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]+)/gi;

async function contemConviteDoServidor(texto, guildId) {
    if (!texto) return false;

    if (REGEX_URL_SERVIDOR.test(texto)) return true;

    const guild = client.guilds.cache.get(guildId);
    if (guild?.vanityURLCode && new RegExp(`\\/${guild.vanityURLCode}\\b`, 'i').test(texto)) {
        return true;
    }

    const matches = [...texto.matchAll(REGEX_CONVITE_GENERICO)];
    if (!matches.length) return false;

    const cacheDoServidor = invitesCache.get(guildId);

    for (const match of matches) {
        const codigo = match[1];

        
        if (cacheDoServidor?.has(codigo)) return true;

        
        try {
            const invite = await client.fetchInvite(codigo);
            if (invite.guild?.id === guildId) return true;
        } catch (err) {
            console.log(`[Sorteio/Verificação] Convite "${codigo}" não pôde ser verificado ao vivo (provavelmente expirado): ${err.message}`);
        }
    }

    return false;
}

async function verificarUrlNaBio(userId, guildId) {
    try {
        const perfil = await getUserPerfil(userId, guildId, { force: true });
        const textoCompleto = `${perfil.bio || ''} ${perfil.pronouns || ''}`;
        console.log(`[Sorteio/Verificação] Bio+pronomes de ${userId}: "${textoCompleto}"`); // <-- log
        const resultado = await contemConviteDoServidor(textoCompleto, guildId);
        console.log(`[Sorteio/Verificação] Resultado pra ${userId}: ${resultado}`); // <-- log
        return resultado;
    } catch (err) {
        console.error('--- Erro ao verificar URL na bio do vencedor do sorteio ---', err.message);
        return null;
    }
}

async function sortearGanhadorSorteio(sorteioId, motivoTexto = null) {
    const sorteio = await Sorteio.findById(sorteioId).catch(() => null);
    if (!sorteio) return null;

    const elegiveis = participantesElegiveis(sorteio);
    if (!elegiveis.length) return { sorteio, vencedorId: null };

    const vencedorId = elegiveis[Math.floor(Math.random() * elegiveis.length)];
    sorteio.vencedorId = vencedorId;
    await sorteio.save();

    const temUrlNaBio = await verificarUrlNaBio(vencedorId, sorteio.guildId);

    try {
        const canal = await client.channels.fetch(sorteio.canalId).catch(() => null);
        if (canal) {
            if (temUrlNaBio === true) {
                await canal.send(
                    `Parabéns! <@${vencedorId}> você acaba de ganhar **${sorteio.premio}**!${motivoTexto ? ` (${motivoTexto})` : ''}`
                );
            } else if (temUrlNaBio === false) {
                await canal.send(
                    `<@${vencedorId}> foi sorteado(a) para **${sorteio.premio}**, mas **não está** com o link do servidor na bio ou pronomes.`
                );
            } else {
                await canal.send(
                    `<@${vencedorId}> foi sorteado(a) para **${sorteio.premio}**, mas não foi possível verificar automaticamente a bio/pronomes.`
                );
            }
        }
    } catch (err) {
        console.error('--- Erro ao anunciar vencedor do sorteio ---', err);
    }

    return { sorteio, vencedorId, temUrlNaBio };
}

async function encerrarSorteio(sorteioId) {
    const sorteio = await Sorteio.findById(sorteioId).catch(() => null);
    if (!sorteio || sorteio.status !== 'ativo') return;

    const resultado = await sortearGanhadorSorteio(sorteioId, 'sorteio encerrado');

    try {
        const canal = await client.channels.fetch(sorteio.canalId).catch(() => null);
        if (canal && sorteio.mensagemId) {
            const msg = await canal.messages.fetch(sorteio.mensagemId).catch(() => null);
            if (msg) await msg.delete().catch(() => null);
        }
if (canal) {
    let statusTexto;
    if (resultado?.vencedorId) {
        if (resultado.temUrlNaBio === true) {
            statusTexto = `\nVencedor: <@${resultado.vencedorId}>`;
        } else if (resultado.temUrlNaBio === false) {
            statusTexto = `\nSorteado(a): <@${resultado.vencedorId}> — **sem o link na bio/pronomes**.`;
        } else {
            statusTexto = `\nSorteado(a): <@${resultado.vencedorId}> — não foi possível verificar a bio automaticamente.`;
        }
    } else {
        statusTexto = '\nNinguém elegível participou.';
    }

    const containerFim = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**SORTEIO ENCERRADO**\n\nO sorteio de **${sorteio.premio}** foi encerrado.${statusTexto}`
        ));
    await canal.send({ components: [containerFim], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
}
    } catch (err) {
        console.error('--- Erro ao encerrar sorteio ---', err);
    }

    sorteio.status = 'encerrado';
    await sorteio.save();

    const timeoutId = sorteioTimeouts.get(String(sorteio._id));
    if (timeoutId) { clearTimeout(timeoutId); sorteioTimeouts.delete(String(sorteio._id)); }

    await atualizarStatusCallsSorteio();
}

function agendarEncerramentoSorteio(sorteioId, encerraEm) {
    const id = String(sorteioId);
    if (sorteioTimeouts.has(id)) clearTimeout(sorteioTimeouts.get(id));

    const restante = encerraEm - Date.now();
    if (restante <= 0) { encerrarSorteio(sorteioId); return; }

    sorteioTimeouts.set(id, setTimeout(() => encerrarSorteio(sorteioId), restante));
}

async function atualizarProgressoMensagensSorteio(guildId, userId) {
    const ativos = await Sorteio.find({ guildId, status: 'ativo', participantes: userId, requisitoMensagens: { $gt: 0 } }).catch(() => []);
    for (const s of ativos) {
        await Sorteio.updateOne({ _id: s._id }, { $inc: { [`progressoMensagens.${userId}`]: 1 } }).catch(() => null);
    }
}

function iniciarSessaoVoiceSorteio(guildId, userId) {
    const chave = `${guildId}_${userId}`;
    if (!sorteioVoiceSessions.has(chave)) {
        sorteioVoiceSessions.set(chave, { entradaEm: Date.now() });
    }
}

async function finalizarSessaoVoiceSorteio(guildId, userId) {
    const chave = `${guildId}_${userId}`;
    const sessao = sorteioVoiceSessions.get(chave);
    if (!sessao) return;

    sorteioVoiceSessions.delete(chave);
    const decorrido = Date.now() - sessao.entradaEm;
    if (decorrido > 0) {
        await atualizarProgressoCallSorteio(guildId, userId, decorrido).catch(() => null);
    }
}

// ============ STATUS DE VOZ - LÍDER DO SORTEIO ============
function formatarTempoCurto(ms) {
    const horas = Math.floor(ms / 3600000);
    const minutos = Math.floor((ms % 3600000) / 60000);
    const hh = String(horas).padStart(2, '0');
    const mm = String(minutos).padStart(2, '0');
    return `${hh}h${mm}m`;
}

async function obterTop3CallSorteio(guildId) {
    const sorteio = await Sorteio.findOne({ guildId, status: 'ativo', requisitoCallMs: { $gt: 0 } }).sort({ criadoEm: -1 });
    if (!sorteio) return null;

    const progresso = sorteio.progressoCallMs || {};
    const ranking = Object.entries(progresso)
        .filter(([, ms]) => ms > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

    return ranking.length ? ranking : null;
}

function formatarTop3Texto(ranking, guild) {
    const posicoes = ['1º', '2º', '3º'];

    const partes = ranking.map(([userId, ms], i) => {
        const membro = guild.members.cache.get(userId);
        const nome = membro ? membro.displayName : 'Usuário';
        return `${posicoes[i]} ${nome} ${formatarTempoCurto(ms)}`;
    });

    return partes.join(' · ');
}

async function definirStatusCanal(canal, texto) {
    try {
        await client.rest.put(`/channels/${canal.id}/voice-status`, {
            body: { status: texto || '' }
        });
    } catch (err) {
        console.error(`--- Erro ao setar status do canal ${canal.id} (REST) ---`, err);
    }
}

async function atualizarStatusCallsSorteio() {
    for (const guild of client.guilds.cache.values()) {
        try {
            const top3 = await obterTop3CallSorteio(guild.id);
            const textoStatus = top3 ? formatarTop3Texto(top3, guild) : null;

            const canaisDaCategoria = guild.channels.cache
                .filter(c =>
                    (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) &&
                    c.parentId === CATEGORIA_STATUS_SORTEIO
                )
                .sort((a, b) => a.rawPosition - b.rawPosition);

            const primeiroCanal = canaisDaCategoria.first();

            for (const canal of canaisDaCategoria.values()) {
                const deveTerStatus = canal.id === primeiroCanal?.id;
                const textoAlvo = deveTerStatus ? textoStatus : null;

                if (canal.status === textoAlvo) continue;
                await definirStatusCanal(canal, textoAlvo);
            }
        } catch (err) {
            console.error(`--- Erro ao atualizar status de calls do sorteio em ${guild.id} ---`, err);
        }
    }
}

async function flushSessoesVoiceSorteio() {
    const agora = Date.now();
    for (const [chave, sessao] of sorteioVoiceSessions) {
        const [guildId, userId] = chave.split('_');
        const decorrido = agora - sessao.entradaEm;
        if (decorrido <= 0) continue;

        await atualizarProgressoCallSorteio(guildId, userId, decorrido).catch(() => null);
        sessao.entradaEm = agora;
    }

    await atualizarStatusCallsSorteio();
}

async function atualizarProgressoCallSorteio(guildId, userId, duracaoMs) {
    if (duracaoMs <= 0) return;
    const ativos = await Sorteio.find({ guildId, status: 'ativo', participantes: userId, requisitoCallMs: { $gt: 0 } }).catch(() => []);
    for (const s of ativos) {
        await Sorteio.updateOne({ _id: s._id }, { $inc: { [`progressoCallMs.${userId}`]: duracaoMs } }).catch(() => null);
    }
}

async function atualizarProgressoInviteSorteio(guildId, inviterId) {
    const ativos = await Sorteio.find({ guildId, status: 'ativo', participantes: inviterId, requisitoInvites: { $gt: 0 } }).catch(() => []);
    for (const s of ativos) {
        await Sorteio.updateOne({ _id: s._id }, { $inc: { [`progressoInvites.${inviterId}`]: 1 } }).catch(() => null);
    }
}


function montarPainelRoleAllInicial() {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **CARGOS EM MASSA**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            'Esse painel aplica um cargo para **todos os membros** do servidor de uma só vez.\n\n' +
            'Selecione abaixo qual cargo você deseja aplicar. Assim que escolher, um botão de confirmação vai aparecer aqui mesmo, nesse painel.\n\n' +
            ' Dependendo da quantidade de membros, o processo pode demorar alguns minutos. O painel vai se atualizar automaticamente mostrando o progresso, quantos foram aplicados com sucesso e possíveis erros.'
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new RoleSelectMenuBuilder()
                    .setCustomId('roleall_select')
                    .setPlaceholder('Selecione o cargo que será aplicado')
                    .setMinValues(1)
                    .setMaxValues(1)
            )
        );
}

async function localizarMensagemPainelTicket(thread, painelMessageId) {
    if (painelMessageId) {
        const msg = await thread.messages.fetch(painelMessageId).catch(() => null);
        if (msg) return msg;
    }
    const mensagens = await thread.messages.fetch({ limit: 50 }).catch(() => null);
    if (!mensagens) return null;
    return mensagens.find(m => m.author.id === client.user.id && m.components?.length) ?? null;
}

async function assumirTicket(thread, dados, staffMember) {
    if (dados.assumidoPor) return false;

    dados.assumidoPor = staffMember.id;
    await TicketData.findOneAndUpdate({ threadId: thread.id }, { assumidoPor: staffMember.id }).catch(err =>
        console.error('--- Erro ao salvar staff que assumiu o ticket ---', err)
    );

    const autorUser = await client.users.fetch(dados.autorId, { force: true }).catch(() => null);
    const avatarUrl = autorUser?.displayAvatarURL({ extension: 'png', size: 256 }) ?? 'https://cdn.discordapp.com/embed/avatars/0.png';
    const nomeAutor = autorUser?.username ?? 'Usuário';

    const containerPainel = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Ticket - ${nomeAutor}`))
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Assumido por:** \`${staffMember.user.username}\``))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Motivo:**\n\`\`\`${dados.motivo}\`\`\``))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## SUPORTE\n Porfavor, aguarde as instruções do staff responsável.`))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('ticket_assumir').setLabel('Assumido').setStyle(ButtonStyle.Success).setDisabled(true),
                new ButtonBuilder().setCustomId('ticket_finalizar').setLabel('Finalizar').setStyle(ButtonStyle.Danger)
            )
        );

    const painelMsg = await localizarMensagemPainelTicket(thread, dados.painelMessageId);
    if (painelMsg) {
        await painelMsg.edit({ components: [containerPainel], flags: [MessageFlags.IsComponentsV2] }).catch(err =>
            console.error('--- Erro ao atualizar painel do ticket ao assumir ---', err)
        );
        dados.painelMessageId = painelMsg.id;
    }

const nomeStaff = staffMember.displayName || staffMember.user.username;
const agoraUnix = Math.floor(Date.now() / 1000);

const mencaoFora = new TextDisplayBuilder().setContent(`<@${dados.autorId}>`);

const containerAviso = new ContainerBuilder()
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${nomeStaff}** assumiu este ticket e ira lhe atender`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Horário:** <t:${agoraUnix}:t>`));

await thread.send({
    components: [mencaoFora, containerAviso],
    flags: [MessageFlags.IsComponentsV2]
}).catch(err => console.error('--- Erro ao enviar aviso de ticket assumido ---', err));
return true;
}

async function proximoNumeroTicket() {
    const doc = await ContadorTicket.findByIdAndUpdate(
        'contador_ticket',
        { $inc: { valor: 1 } },
        { upsert: true, new: true }
    );
    return doc.valor;
}

const muteCargoTimeouts = new Map();

async function aplicarMuteCargo(guild, membro, motivo, autorId) {
    const cargosAnteriores = membro.roles.cache
        .filter(r => r.id !== guild.id && r.id !== CARGO_MUTADO)
        .map(r => r.id);

    const expiraEm = Date.now() + 5 * 60 * 1000;

    await membro.roles.set([CARGO_MUTADO], `Mute por cargo: ${motivo || 'Não informado'}`);

    await MuteCargo.findOneAndUpdate(
        { _id: `${guild.id}_${membro.id}` },
        { guildId: guild.id, userId: membro.id, cargosAnteriores, expiraEm, motivo: motivo || null, autorId: autorId || null },
        { upsert: true }
    ).catch(err => console.error('--- Erro ao salvar mute por cargo ---', err));

    agendarFimMuteCargo(guild.id, membro.id, expiraEm);
}

function agendarFimMuteCargo(guildId, userId, expiraEm) {
    const chave = `${guildId}_${userId}`;
    if (muteCargoTimeouts.has(chave)) clearTimeout(muteCargoTimeouts.get(chave));

    const executar = () => removerMuteCargo(guildId, userId).catch(err => console.error('--- Erro ao remover mute por cargo ---', err));
    const restante = expiraEm - Date.now();

    if (restante <= 0) { executar(); return; }
    muteCargoTimeouts.set(chave, setTimeout(executar, restante));
}

async function removerMuteCargo(guildId, userId) {
    const dados = await MuteCargo.findById(`${guildId}_${userId}`).catch(() => null);
    if (!dados) return;

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
        const membro = await guild.members.fetch(userId).catch(() => null);
        if (membro) {
            const cargosRestaurar = dados.cargosAnteriores.filter(id => guild.roles.cache.has(id));
            await membro.roles.set(cargosRestaurar, 'Fim do mute por cargo').catch(err => console.error('--- Erro ao restaurar cargos pós mute ---', err));
        }
    }

    await MuteCargo.deleteOne({ _id: `${guildId}_${userId}` }).catch(() => null);
    muteCargoTimeouts.delete(`${guildId}_${userId}`);
}

async function verificarCargosLojaExpirados() {
    try {
        const expirados = await CargoLoja.find({ expiraEm: { $lte: Date.now() } });
        if (!expirados.length) return;

        for (const doc of expirados) {
            try {
                const guild = await client.guilds.fetch(doc.guildId).catch(() => null);
                if (guild) {
                    const membro = await guild.members.fetch(doc.userId).catch(() => null);
                    if (membro) await membro.roles.remove(doc.cargoId).catch(() => null);
                }
            } catch (err) {
                console.error(`--- Erro ao remover cargo da loja expirado (${doc.userId}) ---`, err);
            }

            await CargoLoja.deleteOne({ _id: doc._id }).catch(() => null);
            console.log(`[Loja] Cargo ${doc.cargoId} removido de ${doc.userId} (expirado).`);
        }
    } catch (err) {
        console.error('--- Erro ao verificar cargos da loja expirados ---', err);
    }
}


function escapeHTML(texto) {
    return String(texto ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatarMarkdownDiscord(texto) {
    let t = escapeHTML(texto ?? '');
    t = t.replace(/^### (.*)$/gm, '<h3 class="md-h3">$1</h3>');
    t = t.replace(/^## (.*)$/gm, '<h2 class="md-h2">$1</h2>');
    t = t.replace(/^# (.*)$/gm, '<h1 class="md-h1">$1</h1>');
    t = t.replace(/^ (.*)$/gm, '<div class="md-subtext">$1</div>');
    t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
    t = t.replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
    t = t.replace(/\n/g, '<br>');
    return t;
}

function formatarConteudoComMencoes(texto, guild) {
    if (!texto) return '';
    const tokens = [];

    let temp = texto.replace(/<t:(\d+)(?::([tTdDfFR]))?>/g, (m, unix, formato) => {
        const textoFormatado = formatarTimestampDiscord(parseInt(unix), formato || 'f');
        tokens.push(`<span class="timestamp">${escapeHTML(textoFormatado)}</span>`);
        return `\u0000${tokens.length - 1}\u0000`;
    });

    temp = temp.replace(/<@!?(\d+)>/g, (m, id) => {
        const membro = guild?.members.cache.get(id);
        const nome = membro ? membro.displayName : 'usuário-desconhecido';
        tokens.push(`<span class="mention">@${escapeHTML(nome)}</span>`);
        return `\u0000${tokens.length - 1}\u0000`;
    });

    temp = temp.replace(/<@&(\d+)>/g, (m, id) => {
        const cargo = guild?.roles.cache.get(id);
        const nome = cargo ? cargo.name : 'cargo-desconhecido';
        tokens.push(`<span class="mention mention-role">@${escapeHTML(nome)}</span>`);
        return `\u0000${tokens.length - 1}\u0000`;
    });

    temp = temp.replace(/<#(\d+)>/g, (m, id) => {
        const canalMencionado = guild?.channels.cache.get(id);
        const nome = canalMencionado ? canalMencionado.name : 'canal-desconhecido';
        tokens.push(`<span class="mention">#${escapeHTML(nome)}</span>`);
        return `\u0000${tokens.length - 1}\u0000`;
    });

    let resultado = formatarMarkdownDiscord(temp);
    resultado = resultado.replace(/\u0000(\d+)\u0000/g, (m, idx) => tokens[Number(idx)]);
    return resultado;
}

function extrairDadosComponente(comp) {
    if (!comp) return null;
    if (typeof comp.toJSON === 'function') {
        try { return comp.toJSON(); } catch { /* segue tentando outras formas */ }
    }
    return comp.data ?? comp;
}

function renderComponentesV2(components, guild) {
    if (!components || !components.length) return '';
    return components.map(c => renderComponenteV2(c, guild)).join('');
}

function renderComponenteV2(comp, guild) {
    const raw = extrairDadosComponente(comp);
    if (!raw || typeof raw.type === 'undefined') {
        return '<!-- componente não reconhecido -->';
    }

    switch (raw.type) {
        case 17: { // Container
            const corHex = raw.accent_color ?? raw.accentColor;
            const cor = corHex ? `border-left: 4px solid #${Number(corHex).toString(16).padStart(6, '0')};` : '';
            const filhos = raw.components ?? [];
            return `<div class="v2-container" style="${cor}">${renderComponentesV2(filhos, guild)}</div>`;
        }
        case 9: { // Section
            const filhos = raw.components ?? [];
            const conteudo = renderComponentesV2(filhos, guild);
            const acessorioRaw = raw.accessory;
            const acessorio = acessorioRaw ? renderComponenteV2(acessorioRaw, guild) : '';
            return `<div class="v2-section">${acessorio ? `<div class="v2-section-conteudo">${conteudo}</div>${acessorio}` : conteudo}</div>`;
        }
        case 10: // TextDisplay
            return `<div class="v2-text">${formatarConteudoComMencoes(raw.content, guild)}</div>`;
        case 14: // Separator
            return (raw.divider === false) ? `<div class="v2-spacer"></div>` : `<hr class="v2-separator">`;
        case 12: { // MediaGallery
            const itens = (raw.items ?? []).map(it => {
                const url = it.media?.url ?? it.url ?? '';
                return `<img class="v2-media" src="${url}" loading="lazy">`;
            }).join('');
            return `<div class="v2-gallery">${itens}</div>`;
        }
        case 11: { // Thumbnail
            const url = raw.media?.url ?? raw.url ?? '';
            return `<img class="v2-thumb" src="${url}" loading="lazy">`;
        }
        case 13: { // File
            const url = raw.file?.url ?? raw.url ?? '#';
            return `<div class="anexo-arquivo"><a href="${url}" target="_blank">arquivo</a></div>`;
        }
        case 1: // ActionRow
            return `<div class="v2-row">${renderComponentesV2(raw.components ?? [], guild)}</div>`;
        case 2: { // Button
            const estilos = { 1: 'primary', 2: 'secondary', 3: 'success', 4: 'danger', 5: 'link' };
            const classe = estilos[raw.style] || 'secondary';
            const label = escapeHTML(raw.label || '');
            if (raw.style === 5 && raw.url) {
                return `<a class="v2-btn v2-btn-${classe}" href="${raw.url}" target="_blank">${label}</a>`;
            }
            return `<span class="v2-btn v2-btn-${classe}">${label}</span>`;
        }
        case 3: case 5: case 6: case 7: case 8: // Selects
            return `<div class="v2-btn v2-btn-secondary">${escapeHTML(raw.placeholder || 'Selecione uma opção')}</div>`;
        default:
            return '<!-- tipo de componente não suportado -->';
    }
}

app.get('/transcript/:id', async (req, res) => {
    try {
        const doc = await TranscriptModel.findById(req.params.id);
        if (!doc) return res.status(404).send('Transcript não encontrado ou expirado.');
        res.set('Content-Type', 'text/html; charset=utf-8');
        return res.send(doc.html);
    } catch (err) {
        console.error('--- Erro ao servir transcript ---', err);
        return res.status(500).send('Erro ao carregar transcript.');
    }
});

app.get('/transcript/:id/download', async (req, res) => {
    try {
        const doc = await TranscriptModel.findById(req.params.id);
        if (!doc) return res.status(404).send('Transcript não encontrado ou expirado.');
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Content-Disposition', `attachment; filename="transcript-${req.params.id}.html"`);
        return res.send(doc.html);
    } catch (err) {
        console.error('--- Erro ao baixar transcript ---', err);
        return res.status(500).send('Erro ao baixar transcript.');
    }
});

app.get('/transcript/media/:id', async (req, res) => {
    try {
        const doc = await TranscriptMedia.findById(req.params.id);
        if (!doc) return res.status(404).send('Mídia não encontrada ou expirada.');
        res.set('Content-Type', doc.contentType || 'application/octet-stream');
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(doc.data);
    } catch (err) {
        console.error('--- Erro ao servir mídia do transcript ---', err);
        return res.status(500).send('Erro ao carregar mídia.');
    }
});

function extrairLinksDoTexto(texto) {
    if (!texto) return [];
    const regex = /(https?:\/\/[^\s<>"')]+)/gi;
    return [...String(texto).matchAll(regex)].map(m => m[0]);
}

const EXT_AUDIO = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.opus', '.weba', '.aac'];
const EXT_IMAGEM = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

function classificarAnexoTranscript(nome) {
    const lower = (nome || '').toLowerCase();
    if (EXT_IMAGEM.some(ext => lower.endsWith(ext))) return 'imagem';
    if (EXT_AUDIO.some(ext => lower.endsWith(ext))) return 'audio';
    return 'arquivo';
}

const LIMITE_MEDIA_TRANSCRIPT = 20 * 1024 * 1024; // 20MB

async function hospedarMidiaTranscript(url, contentTypeSugerido) {
    try {
        const resposta = await fetch(url);
        if (!resposta.ok) return null;

        const arrayBuffer = await resposta.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length > LIMITE_MEDIA_TRANSCRIPT) return null;

        const id = crypto.randomUUID();
        const contentType = contentTypeSugerido || resposta.headers.get('content-type') || 'application/octet-stream';

        await TranscriptMedia.create({ _id: id, data: buffer, contentType });
        return `${PUBLIC_BASE_URL}/transcript/media/${id}`;
    } catch (err) {
        console.error('--- Erro ao hospedar mídia do transcript ---', err);
        return null;
    }
}

async function gerarTranscriptHTML(canal, transcriptId) {
    const LIMITE_MENSAGENS = 1000;
    let todasMensagens = [];
    let ultimaId = null;

    while (todasMensagens.length < LIMITE_MENSAGENS) {
        const opcoes = { limit: 100 };
        if (ultimaId) opcoes.before = ultimaId;

        const lote = await canal.messages.fetch(opcoes).catch(() => null);
        if (!lote || lote.size === 0) break;

        todasMensagens.push(...lote.values());
        ultimaId = lote.last().id;

        if (lote.size < 100) break;
    }

    todasMensagens.reverse();

    const guild = canal.guild;

    const grupos = [];
    for (const msg of todasMensagens) {
        const ultimoGrupo = grupos[grupos.length - 1];
        const mesmoAutor = ultimoGrupo && ultimoGrupo.autorId === msg.author.id;
        const dentroDaJanela = ultimoGrupo && (msg.createdTimestamp - ultimoGrupo.ultimoTimestamp) < 5 * 60 * 1000;

        if (mesmoAutor && dentroDaJanela) {
            ultimoGrupo.mensagens.push(msg);
            ultimoGrupo.ultimoTimestamp = msg.createdTimestamp;
        } else {
            grupos.push({
                autorId: msg.author.id,
                nome: msg.member?.displayName || msg.author.username,
                avatarUrl: msg.author.displayAvatarURL({ extension: 'png', size: 64 }),
                bot: msg.author.bot,
                ultimoTimestamp: msg.createdTimestamp,
                mensagens: [msg]
            });
        }
    }

    const formatarHora = (timestamp) => new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
    const formatarDataHora = (timestamp) => new Date(timestamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const galeriaImagens = [];
    const galeriaAudios = [];
    const galeriaLinks = [];
    let contadorAudio = 0;

    function registrarMediaDeComponentesV2(components, ctx) {
        for (const comp of components ?? []) {
            const raw = extrairDadosComponente(comp);
            if (!raw || typeof raw.type === 'undefined') continue;

            if (raw.type === 12) {
                for (const item of raw.items ?? []) {
                    const url = item.media?.url ?? item.url;
                    if (url) galeriaImagens.push({ url, nome: 'anexo', ...ctx });
                }
            }
            if (raw.type === 10 && raw.content) {
                for (const url of extrairLinksDoTexto(raw.content)) galeriaLinks.push({ url, ...ctx });
            }
            if (raw.components?.length) registrarMediaDeComponentesV2(raw.components, ctx);
        }
    }
    
function gerarAlturasOnda(seedTexto, quantidade = 20) {
    let seed = 0;
    for (let i = 0; i < seedTexto.length; i++) {
        seed = (seed * 31 + seedTexto.charCodeAt(i)) >>> 0;
    }
    const alturas = [];
    for (let i = 0; i < quantidade; i++) {
        seed = (seed * 1103515245 + 12345) >>> 0;
        alturas.push(20 + (seed % 81)); // entre 20% e 100%
    }
    return alturas;
}

function montarPlayerAudio(url, nomeArquivo) {
    contadorAudio++;
    const audioId = `audio-${contadorAudio}`;
    const alturas = gerarAlturasOnda(nomeArquivo || url || String(contadorAudio), 20);
    const barrasHtml = alturas.map(h => `<span style="height:${h}%"></span>`).join('');

    return `
    <div class="audio-player" data-audio-id="${audioId}">
        <audio class="audio-el" id="${audioId}" preload="metadata" src="${url}"></audio>
        <button class="audio-play-btn" type="button" aria-label="Reproduzir">
            <svg class="icon-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg class="icon-pause" viewBox="0 0 24 24" style="display:none"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
        </button>
        <div class="audio-waveform">${barrasHtml}</div>
        <span class="audio-time"><span class="audio-current">0:00</span> / <span class="audio-duration">0:00</span></span>
    </div>`;
}

    const gruposHtml = [];
    for (const grupo of grupos) {
        const horaInicio = formatarHora(grupo.mensagens[0].createdTimestamp);
        const partesMensagens = [];

        for (let idx = 0; idx < grupo.mensagens.length; idx++) {
            const msg = grupo.mensagens[idx];
            const horaHover = idx > 0 ? `<span class="hora-hover">${formatarHora(msg.createdTimestamp)}</span>` : '';
            const usaComponentsV2 = msg.flags?.has?.(MessageFlags.IsComponentsV2);
            const ctx = { autor: grupo.nome, avatarUrl: grupo.avatarUrl, hora: formatarHora(msg.createdTimestamp) };

            if (usaComponentsV2) {
                registrarMediaDeComponentesV2(msg.components, ctx);
                partesMensagens.push(`
                <div class="linha-msg">
                    ${horaHover}
                    ${renderComponentesV2(msg.components, guild)}
                </div>`);
                continue;
            }

            for (const url of extrairLinksDoTexto(msg.content)) galeriaLinks.push({ url, ...ctx });

            const conteudo = formatarConteudoComMencoes(msg.content, guild);

            let anexosHtml = '';
            if (msg.attachments.size) {
                const partesAnexo = [];
                for (const a of msg.attachments.values()) {
                    const tipo = classificarAnexoTranscript(a.name || '');

                    if (tipo === 'imagem') {
                        const urlHospedada = await hospedarMidiaTranscript(a.url, a.contentType) || a.url;
                        galeriaImagens.push({ url: urlHospedada, nome: a.name, ...ctx });
                        partesAnexo.push(`<div class="anexo"><img src="${urlHospedada}" alt="anexo" loading="lazy" onclick="abrirLightbox('${urlHospedada}')"></div>`);
                        continue;
                    }
                    if (tipo === 'audio') {
                        const urlHospedada = await hospedarMidiaTranscript(a.url, a.contentType) || a.url;
                        galeriaAudios.push({ url: urlHospedada, nome: a.name, ...ctx });
                        partesAnexo.push(montarPlayerAudio(urlHospedada, a.name));
                        continue;
                    }
                    partesAnexo.push(`<div class="anexo-arquivo"><a href="${a.url}" target="_blank">📎 ${escapeHTML(a.name || 'arquivo')}</a></div>`);
                }
                anexosHtml = partesAnexo.join('');
            }

            partesMensagens.push(`
            <div class="linha-msg">
                ${horaHover}
                <div class="texto">${conteudo}</div>
                ${anexosHtml}
            </div>`);
        }

        gruposHtml.push(`
        <div class="grupo-msg">
            <img class="avatar" src="${grupo.avatarUrl}" loading="lazy">
            <div class="conteudo-grupo">
                <div class="cabecalho">
                    <span class="autor">${escapeHTML(grupo.nome)}</span>
                    ${grupo.bot ? '<span class="badge-bot">BOT</span>' : ''}
                    <span class="hora">${horaInicio}</span>
                </div>
                ${partesMensagens.join('')}
            </div>
        </div>`);
    }

    const imagensHtml = galeriaImagens.length
        ? `<div class="grade-imagens">${galeriaImagens.map(img => `
            <div class="card-imagem" onclick="abrirLightbox('${img.url}')">
                <img src="${img.url}" loading="lazy">
                <div class="card-imagem-legenda">${escapeHTML(img.autor)} · ${img.hora}</div>
            </div>`).join('')}</div>`
        : `<div class="vazio">Nenhuma imagem encontrada nessa conversa.</div>`;

    const audiosHtml = galeriaAudios.length
        ? `<div class="lista-audios">${galeriaAudios.map(a => `
            <div class="card-audio">
                <img class="avatar-pequeno" src="${a.avatarUrl}" loading="lazy">
                <div class="card-audio-conteudo">
                    <div class="card-audio-topo"><span class="autor">${escapeHTML(a.autor)}</span><span class="hora">${a.hora}</span></div>
                    ${montarPlayerAudio(a.url, a.nome)}
                </div>
            </div>`).join('')}</div>`
        : `<div class="vazio">Nenhum áudio encontrado nessa conversa.</div>`;

    const linksHtml = galeriaLinks.length
        ? `<div class="lista-links">${galeriaLinks.map(l => `
            <a class="card-link" href="${l.url}" target="_blank">
                <img class="avatar-pequeno" src="${l.avatarUrl}" loading="lazy">
                <div class="card-link-conteudo">
                    <div class="card-link-topo"><span class="autor">${escapeHTML(l.autor)}</span><span class="hora">${l.hora}</span></div>
                    <div class="card-link-url">${escapeHTML(l.url)}</div>
                </div>
            </a>`).join('')}</div>`
        : `<div class="vazio">Nenhum link encontrado nessa conversa.</div>`;

    const linkDownload = transcriptId ? `${PUBLIC_BASE_URL}/transcript/${transcriptId}/download` : '#';

    const html = `<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Transcript - ${escapeHTML(canal.name)}</title>
<style>
    * { box-sizing: border-box; }

    body {
        background: #0a0a0d;
        color: #d4d4d8;
        font-family: 'gg sans', 'Helvetica Neue', Arial, sans-serif;
        margin: 0;
        padding: 0;
    }

    ::-webkit-scrollbar { width: 10px; }
    ::-webkit-scrollbar-track { background: #0a0a0d; }
    ::-webkit-scrollbar-thumb { background: #232327; border-radius: 5px; }

    .header {
        position: sticky;
        top: 0;
        z-index: 10;
        background: #111114;
        border-bottom: 2px solid #f4f4f5;
        padding: 20px 24px 0;
    }

    .header-topo {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 14px;
    }

    .header h1 { margin: 0; color: #f4f4f5; font-size: 20px; font-weight: 700; }
    .header p { margin: 4px 0 0; color: #71717a; font-size: 12px; }

.btn-baixar {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #f4f4f5;
    color: #111114;
    text-decoration: none;
    font-size: 13px;
    font-weight: 700;
    padding: 8px 14px;
    border-radius: 8px;
    white-space: nowrap;
    transition: filter 0.15s ease;
}
.btn-baixar:hover { filter: brightness(1.1); }

    .abas { display: flex; gap: 6px; padding-bottom: 14px; }

    .aba-btn {
        background: transparent;
        border: 1px solid #27272a;
        color: #a1a1aa;
        padding: 7px 16px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
    }
.aba-btn:hover { border-color: #f4f4f5; color: #e4e4e7; }
.aba-btn.ativa { background: #f4f4f5; border-color: #f4f4f5; color: #111114; }

    .aba-conteudo { display: none; }
    .aba-conteudo.ativa { display: block; }

    .container { max-width: 900px; margin: 0 auto; padding: 20px 20px 60px; }

    .grupo-msg { display: flex; gap: 14px; padding: 10px 12px; border-radius: 10px; margin-top: 4px; }
    .grupo-msg:hover { background: #131316; }

    .avatar { width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0; margin-top: 2px; }
    .avatar-pequeno { width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0; }

    .conteudo-grupo { min-width: 0; flex: 1; }
    .cabecalho { display: flex; align-items: baseline; gap: 8px; margin-bottom: 2px; }
    .autor { font-weight: 600; color: #f4f4f5; font-size: 14px; }

.badge-bot { background: #f4f4f5; color: #111114; font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 4px; letter-spacing: 0.3px; }
    .hora { font-size: 11px; color: #71717a; }

    .linha-msg { position: relative; line-height: 1.45; margin-top: 4px; }
    .hora-hover { position: absolute; left: -48px; top: 2px; font-size: 10px; color: #52525b; opacity: 0; width: 40px; text-align: right; }
    .linha-msg:hover .hora-hover { opacity: 1; }

    .texto { white-space: pre-wrap; word-break: break-word; font-size: 14px; color: #d4d4d8; }
.timestamp { background: rgba(255,255,255,0.12); color: #f4f4f5; padding: 1px 6px; border-radius: 5px; font-weight: 600; }

    .anexo img { max-width: 400px; max-height: 340px; border-radius: 10px; margin-top: 6px; display: block; border: 1px solid #232327; cursor: zoom-in; }

    .anexo-arquivo { margin-top: 6px; }
.anexo-arquivo a { display: inline-block; background: #131316; border: 1px solid #232327; color: #f4f4f5; text-decoration: none; padding: 8px 14px; border-radius: 8px; font-size: 13px; }
    .anexo-arquivo a:hover { background: #1a1a1d; }

.mention { background: rgba(255,255,255,0.14); color: #f4f4f5; padding: 0 2px; border-radius: 3px; font-weight: 500; }

    .v2-container { background: #131316; border: 1px solid #232327; border-radius: 10px; padding: 14px 16px; margin: 6px 0; }
    .v2-section { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .v2-section-conteudo { flex: 1; min-width: 0; }
    .v2-text { font-size: 14px; color: #d4d4d8; line-height: 1.5; }

    .md-h1 { font-size: 19px; margin: 6px 0; color: #f4f4f5; }
    .md-h2 { font-size: 17px; margin: 6px 0; color: #f4f4f5; }
    .md-h3 { font-size: 15px; margin: 4px 0; color: #f4f4f5; }
    .md-subtext { font-size: 12px; color: #71717a; margin: 2px 0; }
    .md-code { background: #0a0a0d; border: 1px solid #232327; border-radius: 4px; padding: 1px 5px; font-family: monospace; font-size: 13px; }

    .v2-separator { border: none; border-top: 1px solid #232327; margin: 10px 0; }
    .v2-spacer { height: 8px; }
    .v2-gallery { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .v2-media { max-width: 280px; max-height: 240px; border-radius: 10px; border: 1px solid #232327; cursor: zoom-in; }
    .v2-thumb { width: 60px; height: 60px; border-radius: 8px; object-fit: cover; flex-shrink: 0; }
    .v2-row { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
    .v2-btn { display: inline-block; padding: 6px 14px; border-radius: 7px; font-size: 13px; font-weight: 500; text-decoration: none; cursor: default; }
    .v2-btn-primary { background: #f4f4f5; color: #111114; }
    .v2-btn-secondary { background: #232327; color: #d4d4d8; }
    .v2-btn-success { background: #22c55e; color: #06120e; }
    .v2-btn-danger { background: #ef4444; color: #fff; }
    .v2-btn-link { background: #232327; color: #f4f4f5; }

    .vazio { text-align: center; color: #52525b; font-size: 14px; padding: 60px 0; }

    .grade-imagens { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px; }
    .card-imagem { display: block; border-radius: 10px; overflow: hidden; border: 1px solid #232327; text-decoration: none; background: #131316; cursor: zoom-in; }
    .card-imagem img { width: 100%; height: 130px; object-fit: cover; display: block; }
    .card-imagem-legenda { font-size: 11px; color: #a1a1aa; padding: 6px 8px; }

    .lista-audios, .lista-links { display: flex; flex-direction: column; gap: 10px; }

    .card-audio { display: flex; gap: 12px; background: #131316; border: 1px solid #232327; border-radius: 12px; padding: 12px 14px; }
    .card-audio-conteudo { flex: 1; min-width: 0; }
    .card-audio-topo { display: flex; gap: 8px; align-items: baseline; margin-bottom: 8px; }

    .card-link { display: flex; gap: 12px; background: #131316; border: 1px solid #232327; border-radius: 10px; padding: 10px 12px; text-decoration: none; }
    .card-link:hover { border-color: #f4f4f5; }
    .card-link-conteudo { flex: 1; min-width: 0; }
    .card-link-topo { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
    .card-link-url { font-size: 13px; color: #f4f4f5; word-break: break-all; }

/* ---- Player de áudio customizado ---- */
.audio-player {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    max-width: 320px;
    background: #1c1c20;
    border: 1px solid #2a2a2f;
    border-radius: 999px;
    padding: 6px 14px 6px 6px;
}
.audio-play-btn {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    border-radius: 50%;
    border: none;
    background: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.12s ease;
}
.audio-play-btn:hover { transform: scale(1.06); }
.audio-play-btn:active { transform: scale(0.94); }
.audio-play-btn svg { width: 14px; height: 14px; fill: #111114; }

.audio-time {
    font-size: 11px;
    color: rgba(255,255,255,0.6);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    white-space: nowrap;
}

.audio-waveform {
    display: flex;
    align-items: center;
    height: 20px;
    gap: 2px;
    cursor: pointer;
    flex: 1;
    min-width: 60px;
}
.audio-waveform span {
    flex: 1;
    min-width: 2px;
    border-radius: 2px;
    background: rgba(255,255,255,0.28);
    transform: scaleY(0.55);
    transform-origin: center;
    transition: transform 0.18s cubic-bezier(.34,1.56,.64,1), background-color 0.2s ease;
}
.audio-waveform span.tocado {
    background: #ffffff;
    transform: scaleY(1);
}
.audio-waveform span.atual {
    animation: barraViva 0.5s ease-in-out infinite;
}
@keyframes barraViva {
    0%, 100% { transform: scaleY(1); }
    50% { transform: scaleY(0.62); }
}

.audio-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; gap: 8px; }
    .audio-meta { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; gap: 8px; }
    .audio-nome { font-size: 11px; color: #71717a; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .audio-time { font-size: 11px; color: #a1a1aa; font-variant-numeric: tabular-nums; flex-shrink: 0; }

    /* ---- Lightbox de imagem ---- */
    .lightbox {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(5,5,7,0.92);
        z-index: 100;
        align-items: center;
        justify-content: center;
        padding: 30px;
        cursor: zoom-out;
    }
    .lightbox img { max-width: 100%; max-height: 100%; border-radius: 10px; box-shadow: 0 0 40px rgba(23,184,143,0.15); }

    .rodape { text-align: center; color: #52525b; font-size: 12px; padding: 24px 0 10px; }
</style>
</head>
<body>
    <div class="header">
        <div class="header-topo">
            <div>
                <h1>#${escapeHTML(canal.name)}</h1>
                <p>Transcript gerado em ${formatarDataHora(Date.now())} • ${todasMensagens.length} mensagens</p>
            </div>
            <a class="btn-baixar" href="${linkDownload}" download="transcript-${escapeHTML(canal.name)}.html">⬇ Baixar</a>
        </div>
        <div class="abas">
            <button class="aba-btn ativa" id="aba-btn-conversas" onclick="trocarAba('conversas')">Conversas</button>
            <button class="aba-btn" id="aba-btn-imagens" onclick="trocarAba('imagens')">Imagens</button>
            <button class="aba-btn" id="aba-btn-audios" onclick="trocarAba('audios')">Áudios</button>
            <button class="aba-btn" id="aba-btn-links" onclick="trocarAba('links')">Links</button>
        </div>
    </div>
    <div class="container">
        <div class="aba-conteudo ativa" id="aba-conversas">
            ${gruposHtml.join('\n')}
            <div class="rodape">Fim da conversa</div>
        </div>
        <div class="aba-conteudo" id="aba-imagens">${imagensHtml}</div>
        <div class="aba-conteudo" id="aba-audios">${audiosHtml}</div>
        <div class="aba-conteudo" id="aba-links">${linksHtml}</div>
    </div>

    <div class="lightbox" id="lightbox" onclick="fecharLightbox()">
        <img id="lightbox-img" src="">
    </div>

    <script>
        function trocarAba(nome) {
            document.querySelectorAll('.aba-conteudo').forEach(el => el.classList.remove('ativa'));
            document.querySelectorAll('.aba-btn').forEach(el => el.classList.remove('ativa'));
            document.getElementById('aba-' + nome).classList.add('ativa');
            document.getElementById('aba-btn-' + nome).classList.add('ativa');
        }

        function abrirLightbox(url) {
            const lb = document.getElementById('lightbox');
            document.getElementById('lightbox-img').src = url;
            lb.style.display = 'flex';
        }
        function fecharLightbox() {
            document.getElementById('lightbox').style.display = 'none';
            document.getElementById('lightbox-img').src = '';
        }

        function formatarTempoAudio(segundos) {
            if (!isFinite(segundos)) return '0:00';
            const m = Math.floor(segundos / 60);
            const s = Math.floor(segundos % 60).toString().padStart(2, '0');
            return m + ':' + s;
        }
        
        let audioCtxCompartilhado = null;
function obterAudioContext() {
    if (!audioCtxCompartilhado) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtxCompartilhado = new AudioContextClass();
    }
    if (audioCtxCompartilhado.state === 'suspended') {
        audioCtxCompartilhado.resume().catch(() => {});
    }
    return audioCtxCompartilhado;
}

document.querySelectorAll('.audio-player').forEach(player => {
    const audio = player.querySelector('.audio-el');
    const btn = player.querySelector('.audio-play-btn');
    const iconPlay = player.querySelector('.icon-play');
    const iconPause = player.querySelector('.icon-pause');
    const waveform = player.querySelector('.audio-waveform');
    const barras = [...waveform.querySelectorAll('span')];
    const elCurrent = player.querySelector('.audio-current');
    const elDuration = player.querySelector('.audio-duration');

    let rafId = null;

function pintarProgresso() {
    const pct = audio.duration ? (audio.currentTime / audio.duration) : 0;
    const tocadas = Math.round(pct * barras.length);
    barras.forEach((b, i) => {
        b.classList.toggle('tocado', i < tocadas);
        b.classList.toggle('atual', i === tocadas - 1 && !audio.paused);
    });
    elCurrent.textContent = formatarTempoAudio(audio.currentTime);
}

    function loop() {
        pintarProgresso();
        rafId = requestAnimationFrame(loop);
    }

    function pararLoop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
    }

    btn.addEventListener('click', () => {
        document.querySelectorAll('.audio-el').forEach(a => { if (a !== audio) a.pause(); });
        if (audio.paused) audio.play(); else audio.pause();
    });

    audio.addEventListener('play', () => {
        iconPlay.style.display = 'none';
        iconPause.style.display = 'block';
    });
    audio.addEventListener('playing', () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(loop);
    });
    audio.addEventListener('pause', () => {
        iconPlay.style.display = 'block';
        iconPause.style.display = 'none';
        pararLoop();
        pintarProgresso();
    });
    audio.addEventListener('seeked', pintarProgresso);
    audio.addEventListener('loadedmetadata', () => {
        elDuration.textContent = formatarTempoAudio(audio.duration);
    });
    audio.addEventListener('ended', () => {
        pararLoop();
        pintarProgresso();
    });

    waveform.addEventListener('click', (e) => {
        const rect = waveform.getBoundingClientRect();
        const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        if (audio.duration) {
            audio.currentTime = pct * audio.duration;
            pintarProgresso();
        }
    });
});
    </script>
</body>
</html>`;

    return html;
}

async function somarMensagens(userId, valor) {
    const doc = await Mensagens.findOneAndUpdate(
        { userId },
        { $inc: { quantidade: valor } },
        { upsert: true, new: true }
    );
    return doc.quantidade;
}


const bufferMensagens = new Map(); 

function bufferizarMensagem(userId) {
    bufferMensagens.set(userId, (bufferMensagens.get(userId) || 0) + 1);
}

async function flushBufferMensagens() {
    if (!bufferMensagens.size) return;
    const entradas = [...bufferMensagens.entries()];
    bufferMensagens.clear();

    const ops = entradas.map(([userId, valor]) => ({
        updateOne: { filter: { userId }, update: { $inc: { quantidade: valor } }, upsert: true }
    }));

    await Mensagens.bulkWrite(ops).catch(err => console.error('--- Erro no flush de mensagens ---', err));
}

async function obterMembrosCache(guild) {
    const agora = Date.now();
    if (cacheMembros && (agora - cacheMembrosTimestamp) < CACHE_MEMBROS_MS) {
        return cacheMembros;
    }
    const membros = await guild.members.fetch();
    cacheMembros = membros;
    cacheMembrosTimestamp = agora;
    return membros;
}

async function darXP(message) {
    const userId = message.author.id;

    const dados = await getXP(userId);
    const xpGanho = Math.floor(Math.random() * (XP_MAX_POR_MENSAGEM - XP_MIN_POR_MENSAGEM + 1)) + XP_MIN_POR_MENSAGEM;
    dados.xp += xpGanho;

    const ehTicket = ticketDB.has(message.channel.id);

    while (dados.xp >= xpNecessario(dados.nivel)) {
        const necessario = xpNecessario(dados.nivel);
        const xpExcedente = dados.xp - necessario;

        dados.xp = xpExcedente;
        dados.nivel += 1;

        const bonusMoedas = Math.floor(xpExcedente * TAXA_MOEDA_XP_EXTRA);
        const moedasGanhas = MOEDAS_POR_NIVEL + bonusMoedas;

        try {
            await somarSaldo(userId, moedasGanhas);
        } catch (err) {
            console.error(`--- Erro ao creditar moedas de level up para ${userId} ---`, err);
        }

        if (!ehTicket) { // NOVO: só envia se não for ticket
            const containerLevelUp = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Ei ${message.author}, você subiu para o nível **${dados.nivel}**!`));

            await message.channel.send({
                components: [containerLevelUp],
                flags: [MessageFlags.IsComponentsV2]
            }).catch(() => null);
        }
    }

    await setXP(userId, dados.xp, dados.nivel);
}

const protecaoConfig = {
    antiRaid: {
        nukeAtivo: false,
        whitelistIds: [],              
        acaoExecutor: 'remover_cargos', 
        limiteCanais: 3,
        limiteCargos: 3,
        limiteBans: 5,
        limiteWebhooks: 5,
        limiteBots: 1,
        janelaMs: 10000
    },
    antiSpam: { ativo: false, msgLimite: 6, janelaMs: 7000, duplicadoLimite: 3, muteMinutos: 10 },
    antiLink: { ativo: false, bloquearConvites: true, cargosBypass: [] },
    antiFake: { ativo: false, diasMinimos: 7, acao: 'kick' },
    antiBot: { ativo: false, acao: 'kick' }
};

async function salvarProtecao() {
    try {
        await ProtecaoConfigModel.findByIdAndUpdate(
            'protecao_config',
            {
                antiSpam: protecaoConfig.antiSpam,
                antiLink: protecaoConfig.antiLink,
                antiFake: protecaoConfig.antiFake,
                antiBot: protecaoConfig.antiBot,
                antiRaid: protecaoConfig.antiRaid
            },
            { upsert: true }
        );
    } catch (err) {
        console.error('--- Erro ao salvar config de proteção ---', err);
    }
}

async function carregarProtecao() {
    try {
        const doc = await ProtecaoConfigModel.findById('protecao_config');
        if (doc) {
            Object.assign(protecaoConfig.antiSpam, doc.antiSpam?.toObject?.() ?? doc.antiSpam ?? {});
            Object.assign(protecaoConfig.antiLink, doc.antiLink?.toObject?.() ?? doc.antiLink ?? {});
            Object.assign(protecaoConfig.antiFake, doc.antiFake?.toObject?.() ?? doc.antiFake ?? doc.contaNova?.toObject?.() ?? doc.contaNova ?? {});
            Object.assign(protecaoConfig.antiBot, doc.antiBot?.toObject?.() ?? doc.antiBot ?? {});
            Object.assign(protecaoConfig.antiRaid, doc.antiRaid?.toObject?.() ?? doc.antiRaid ?? {});
            console.log('[Proteção] Configuração carregada do MongoDB.');
        } else {
            console.log('[Proteção] Nenhuma config salva encontrada, usando padrão.');
        }
    } catch (err) {
        console.error('--- Erro ao carregar config de proteção ---', err);
    }
}

async function salvarTellonymPendenteUsuario(messageId, dados) {
    await TellonymPendente.create({ _id: messageId, ...dados }).catch(() => {});
}

async function removerTellonymPendenteUsuario(messageId) {
    await TellonymPendente.deleteOne({ _id: messageId }).catch(() => {});
}

async function carregarTellonymPendentes() {
    try {
        const docs = await TellonymPendente.find();
        for (const doc of docs) {
            tellonymPendentesDB.set(doc._id, {
                autorId: doc.autorId, anonimo: doc.anonimo,
                marcadoId: doc.marcadoId, mensagem: doc.mensagem,
                imagemUrl: doc.imagemUrl // ← novo
            });
        }
        console.log(`[Tellonym Pendentes] ${tellonymPendentesDB.size} carregado(s) do Mongo.`);
    } catch (err) {
        console.error('--- Erro ao carregar Tellonyms pendentes ---', err);
    }
}

async function verificarAntiLink(message) {
    if (!protecaoConfig.antiLink.ativo) return false;

    const cargosLiberados = [CARGO_BOOSTER, ...CARGOS_ATENDENTE, ...protecaoConfig.antiLink.cargosBypass];
    if (message.member.roles.cache.some(r => cargosLiberados.includes(r.id))) return false;

    if (protecaoConfig.antiLink.bloquearConvites) {
        const regexConvite = new RegExp(`(?:https?:\\/\\/)?(?:www\\.)?(${DOMINIOS_CONVITE.map(d => d.replace('.', '\\.')).join('|')})\\/(invite\\/)?[a-zA-Z0-9-]+`, 'i');

        if (regexConvite.test(message.content)) {
            await message.delete().catch(() => null);
            message.channel.send(`${message.author} Sem links aqui, seu trouxa!`)
                .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
            return true;
        }
    }

    const regexLink = /(https?:\/\/[^\s]+)/gi;
    const links = message.content.match(regexLink);

    if (links) {
        for (const link of links) {
            let host;
            try {
                host = new URL(link).hostname.toLowerCase().replace(/^www\./, '');
            } catch {
                continue;
            }

            if (BLACKLIST_DOMINIOS.some(d => host === d || host.endsWith(`.${d}`))) {
                await message.delete().catch(() => null);
                message.channel.send(`${message.author} Sem links aqui, seu trouxa!!`)
                    .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
                return true;
            }

            if (!linkPermitido(link)) {
                await message.delete().catch(() => null);
                message.channel.send(`${message.author} Sem links aqui, seu trouxa!!`)
                    .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
                return true;
            }
        }
    }

    return false;
}

async function enviarAlertaProtecao(guild, titulo, linhas, avatarUrl = null) {
    try {
        const canal = await guild.channels.fetch(CANAL_LOGS_MOD).catch(() => null);
        if (!canal) return;

        const container = new ContainerBuilder()
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${titulo}`))
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl || IMG_DISCORD_LOGO))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(linhas.join('\n')));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar alerta de proteção ---', err);
    }
}

// ============ ANTI-NUKE ============
const nukeTracker = {
    canais: new Map(),
    canaisCriados: new Map(),
    canaisEditados: new Map(),
    cargos: new Map(),
    cargosCriados: new Map(),
    cargosEditados: new Map(),
    bans: new Map(),
    kicks: new Map(),
    webhooks: new Map()
};

function limparNukeTrackerAntigo() {
    const agora = Date.now();
    const janela = protecaoConfig.antiRaid.janelaMs;
    for (const mapa of Object.values(nukeTracker)) {
        for (const [executorId, timestamps] of mapa) {
            const filtrado = timestamps.filter(t => agora - t < janela);
            if (filtrado.length === 0) mapa.delete(executorId);
            else mapa.set(executorId, filtrado);
        }
    }
}

function registrarAcaoNuke(mapa, executorId) {
    const agora = Date.now();
    const janela = protecaoConfig.antiRaid.janelaMs;
    const lista = (mapa.get(executorId) || []).filter(t => agora - t < janela);
    lista.push(agora);
    mapa.set(executorId, lista);
    return lista.length;
}



function limiteNukeAcao(executor, chaveLimite) {
    return executor?.bot ? protecaoConfig.antiRaid.limiteBots : protecaoConfig.antiRaid[chaveLimite];
}


const LIMITES_ANTINUKE_EXTRA = {
    canaisCriados: 4,
    canaisEditados: 5,
    cargosCriados: 4,
    cargosEditados: 4,
    kicks: 5
};

function limiteNukeAcaoExtra(executor, chave) {
    return executor?.bot ? protecaoConfig.antiRaid.limiteBots : LIMITES_ANTINUKE_EXTRA[chave];
}


const CACHE_AUDIT_MS = 800;
const auditLogCache = new Map(); 

async function buscarAuditLogsComCache(guild, tipoEvento) {
    const chave = `${guild.id}-${tipoEvento}`;
    const cacheado = auditLogCache.get(chave);
    if (cacheado && (Date.now() - cacheado.timestamp) < CACHE_AUDIT_MS) {
        return cacheado.entries;
    }
    try {
        const logs = await guild.fetchAuditLogs({ type: tipoEvento, limit: 5 });
        const entries = [...logs.entries.values()];
        auditLogCache.set(chave, { timestamp: Date.now(), entries });
        return entries;
    } catch (err) {
        console.error('--- Erro ao buscar audit log do Anti-Nuke ---', err);
        return [];
    }
}

async function obterExecutorAuditLog(guild, tipoEvento, alvoId = null) {
    const entries = await buscarAuditLogsComCache(guild, tipoEvento);
    const entrada = entries.find(e =>
        (Date.now() - e.createdTimestamp) < 15000 &&
        (!alvoId || e.target?.id === alvoId)
    );
    return entrada?.executor ?? null;
}

async function punirExecutorNuke(guild, executor, motivo) {
    if (!executor) return;
    if (executor.id === client.user.id) return;
    if (executor.id === guild.ownerId) return;
    if (protecaoConfig.antiRaid.whitelistIds.includes(executor.id)) return;

    
    const cadeia = executor.bot ? ['banir'] : [protecaoConfig.antiRaid.acaoExecutor];

    let acaoAplicada = null;

    for (const tentativa of cadeia) {
        try {
            if (tentativa === 'banir') {
                await guild.members.ban(executor.id, { reason: `Anti-Nuke: ${motivo}` });
                acaoAplicada = 'banir';
                break;
            }
            if (tentativa === 'kick') {
                const membro = await guild.members.fetch(executor.id).catch(() => null);
                if (membro?.kickable) {
                    await membro.kick(`Anti-Nuke: ${motivo}`);
                    acaoAplicada = 'kick';
                    break;
                }
            }
            if (tentativa === 'remover_cargos') {
                const membro = await guild.members.fetch(executor.id).catch(() => null);
                if (membro) {
                    const cargosRemover = membro.roles.cache.filter(r => r.id !== guild.id && r.editable);
                    await membro.roles.remove(cargosRemover, `Anti-Nuke: ${motivo}`);
                    acaoAplicada = 'remover_cargos';
                    break;
                }
            }
        } catch (err) {
            console.error(`--- Erro ao tentar punição "${tentativa}" no Anti-Nuke ---`, err.message);
        }
    }

    const textoAcao = { banir: 'banido', kick: 'expulso', remover_cargos: 'cargos removidos' };

    await enviarAlertaProtecao(guild, acaoAplicada ? 'ANTI-NUKE ACIONADO' : 'ANTI-NUKE DETECTOU MAS A PUNIÇÃO FALHOU', [
        `**Executor:** ${executor.tag} (${executor.id})${executor.bot ? ' · **é um bot**' : ''}`,
        `**Motivo:** ${motivo}`,
        `**Ação aplicada:** \`${acaoAplicada ? textoAcao[acaoAplicada] : 'nenhuma — revise a hierarquia do bot'}\``
   ], executor.displayAvatarURL({ extension: 'png', size: 256 }));
}

async function verificarSpamMensagem(message) {
    const cfg = protecaoConfig.antiSpam;
    if (!cfg.ativo) return false;
    if (message.member?.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) return false;

    const userId = message.author.id;
    const chave = `spam:${userId}`;

    const pipeline = redis.pipeline();
    pipeline.lpush(chave, JSON.stringify({ timestamp: Date.now(), conteudo: message.content }));
    pipeline.ltrim(chave, 0, cfg.msgLimite * 2);
    pipeline.expire(chave, Math.ceil(cfg.janelaMs / 1000) + 5);
    pipeline.lrange(chave, 0, -1);
    const resultados = await pipeline.exec();

    
    const bruto = resultados[3][1] || [];
    const agora = Date.now();
    const historico = bruto.map(s => JSON.parse(s));
    const recentes = historico.filter(m => agora - m.timestamp <= cfg.janelaMs);

    const flood = recentes.length >= cfg.msgLimite;
    const ultimasN = recentes.slice(0, cfg.msgLimite);
    const normalizar = (t) => t.trim().toLowerCase().replace(/\s+/g, ' ');
    const duplicado = ultimasN.length >= cfg.msgLimite &&
        ultimasN.every(m => normalizar(m.conteudo) === normalizar(ultimasN[0].conteudo) && m.conteudo.trim() !== '');

    if (!flood && !duplicado) return false;

    try {
        const buscadas = await message.channel.messages.fetch({ limit: 50 });
        const doUsuario = buscadas.filter(m => m.author.id === userId);
        await message.channel.bulkDelete(doUsuario, true).catch(() => null);
    } catch (err) {
        console.error('--- Erro ao apagar mensagens de spam ---', err);
    }

    try {
        const membro = await message.guild.members.fetch(userId).catch(() => null);
        if (membro && membro.moderatable) {
            await membro.timeout(cfg.muteMinutos * 60 * 1000, 'Anti-Spam: flood/mensagens duplicadas');
        }
    } catch (err) {
        console.error('--- Erro ao aplicar timeout de anti-spam ---', err);
    }

    await redis.del(chave);

    await enviarAlertaProtecao(message.guild, 'Spam detectado', [
        `**Usuário:** <@${userId}>`,
        `**Motivo:** ${flood ? 'Flood de mensagens' : 'Mensagens duplicadas'}`,
        `**Ação:** Mensagens apagadas + timeout de \`${cfg.muteMinutos}\` minuto(s)`
    ], message.author.displayAvatarURL({ extension: 'png', size: 256 }));

    return true;
}

function montarPainelMoedas() {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **Controle do evento de moedas**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Controle o envio automático do evento de moedas no canal.'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('moedas_toggle')
                    .setLabel(eventoMoedasAtivo ? 'Ativar' : 'Desativado')
                    .setStyle(eventoMoedasAtivo ? ButtonStyle.Success : ButtonStyle.Danger)
            )
        );
}

async function travarTodosCanais(guild, autorId, onProgresso) {
    const canaisTexto = guild.channels.cache.filter(c =>
        [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum].includes(c.type)
    );

    const estados = [];
    let sucesso = 0, erros = 0, processados = 0;
    const total = canaisTexto.size;

    for (const canal of canaisTexto.values()) {
        try {
            const overwriteAtual = canal.permissionOverwrites.cache.get(guild.id);
            const estadoAnterior = overwriteAtual?.deny.has('SendMessages') ? 'deny'
                : overwriteAtual?.allow.has('SendMessages') ? 'allow'
                : 'neutro';

            estados.push({ canalId: canal.id, estadoAnterior });
            await canal.permissionOverwrites.edit(guild.id, { SendMessages: false });
            sucesso++;
        } catch (err) {
            erros++;
            console.error(`--- Erro ao travar canal ${canal.id} ---`, err);
        }

        processados++;
        if (onProgresso) await onProgresso(processados, total, sucesso, erros);
        await esperar(300);
    }

    await canaisLockDB.definir(guild.id, { estados, travadoEm: Date.now(), autorId });
    return { sucesso, erros, total };
}

async function destravarTodosCanais(guild, onProgresso) {
    const dados = canaisLockDB.get(guild.id);
    if (!dados) return null;

    const total = dados.estados.length;
    let sucesso = 0, erros = 0, processados = 0;

    for (const estado of dados.estados) {
        try {
            const canal = guild.channels.cache.get(estado.canalId);
            if (canal) {
                if (estado.estadoAnterior === 'deny') {
                    await canal.permissionOverwrites.edit(guild.id, { SendMessages: false });
                } else if (estado.estadoAnterior === 'allow') {
                    await canal.permissionOverwrites.edit(guild.id, { SendMessages: true });
                } else {
                    await canal.permissionOverwrites.edit(guild.id, { SendMessages: null });
                }
            }
            sucesso++;
        } catch (err) {
            erros++;
            console.error(`--- Erro ao destravar canal ${estado.canalId} ---`, err);
        }

        processados++;
        if (onProgresso) await onProgresso(processados, total, sucesso, erros);
        await esperar(300);
    }

    await canaisLockDB.remover(guild.id);
    return { sucesso, erros, total };
}

function montarPainelProtecao(guildId) {
    const emoji = (ativo) => ativo ? EMOJI_ATIVADO : EMOJI_DESATIVADO;

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## <:19033:1542337647819620412> Painel de proteção do servidor'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Painel principal'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `${emoji(protecaoConfig.antiSpam.ativo)} **Anti Spam**\n` +
            `${emoji(protecaoConfig.antiLink.ativo)} **Anti Link**\n` +
            `${emoji(protecaoConfig.antiFake.ativo)} **Anti Fake**\n` +
            `${emoji(protecaoConfig.antiBot.ativo)} **Anti Bot**\n` +
            `${emoji(protecaoConfig.antiRaid.nukeAtivo)} **Anti Raid**\n` +
            `${emoji(!!canaisLockDB.get(guildId))} **Lock all**`
        ))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Selecione um sistema abaixo para configurar.'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('protecao_menu_select')
                    .setPlaceholder('Selecione um sistema de proteção')
                    .addOptions(
                        { label: 'Anti Spam', value: 'spam', description: 'Detecta flood e mensagens duplicadas' },
                        { label: 'Anti Link', value: 'link', description: 'Bloqueia links e convites não autorizados' },
                        { label: 'Anti Fake', value: 'antifake', description: 'Age sobre contas recém-criadas' },
                        { label: 'Anti Bot', value: 'antibot', description: 'Expulsa ou bane bots que entrarem no servidor' },
                        { label: 'Anti Raid', value: 'antiraid', description: 'Detecta raid e ações destrutivas em massa' },
                        { label: 'Backup', value: 'backup', description: 'Faça um backup do servidor e refaça-o do zero caso um random fdp o Raid' },
                        { label: 'Lock all', value: 'lock', description: 'Trava ou destrava o envio de mensagens em todos os canais' }
                    )
            )
        );
}

const DESCRICOES_PROTECAO = {
    spam: 'Detecta flood ou mensagens repetidas e aplica timeout automático.',
    link: 'Bloqueia links e convites de fora. Booster, Atendente e Links Livres têm bypass.',
    antifake: 'Age sobre contas muito recentes ao entrar (kick, ban ou mute).',
    antibot: 'Expulsa ou bane automaticamente qualquer bot que entrar no servidor.'
};

function montarPainelAntiNuke() {
    const tudoNoMaximo =
        protecaoConfig.antiSpam.ativo && protecaoConfig.antiSpam.msgLimite <= 3 && protecaoConfig.antiSpam.muteMinutos >= 1440 &&
        protecaoConfig.antiLink.ativo && protecaoConfig.antiLink.cargosBypass.length === 0 &&
        protecaoConfig.antiFake.ativo && protecaoConfig.antiFake.diasMinimos >= 30 && protecaoConfig.antiFake.acao === 'banir';

    const nuke = protecaoConfig.antiRaid;
    const acaoTexto = { banir: 'Banir', remover_cargos: 'Remover cargos' }[nuke.acaoExecutor] || nuke.acaoExecutor;

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${nuke.nukeAtivo ? EMOJI_ATIVADO : EMOJI_DESATIVADO} Anti Raid`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Painel > Anti Raid'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            'Detecta e pune ações destrutivas em massa (canais, cargos, bans, webhooks), mesmo vindas de staff.'
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Limites:** \`${nuke.limiteCanais}\`c · \`${nuke.limiteCargos}\`cg · \`${nuke.limiteBans}\`b · \`${nuke.limiteWebhooks}\`w em \`${nuke.janelaMs / 1000}s\`\n` +
            `**Ação:** \`${acaoTexto}\` · **Imunes:** \`${nuke.whitelistIds.length}\` · **Modo extremo:** \`${tudoNoMaximo ? 'ativo' : 'inativo'}\``
        ))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('antinuke_toggle')
                    .setLabel(nuke.nukeAtivo ? 'Desativar' : 'Ativar')
                    .setStyle(nuke.nukeAtivo ? ButtonStyle.Danger : ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('antinuke_configurar')
                    .setLabel('Configurar')
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(tudoNoMaximo ? 'antiraid_desativar' : 'antiraid_ativar')
                    .setLabel(tudoNoMaximo ? 'Desativar modo extremo' : 'Ativar modo extremo')
                    .setStyle(tudoNoMaximo ? ButtonStyle.Secondary : ButtonStyle.Danger)
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('antinuke_acao_select')
                    .setPlaceholder('Ação contra o executor')
                    .addOptions(
                        { label: 'Remover cargos do executor', value: 'remover_cargos', default: nuke.acaoExecutor === 'remover_cargos' },
                        { label: 'Banir executor', value: 'banir', default: nuke.acaoExecutor === 'banir' }
                    )
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('antinuke_whitelist_select')
                    .setPlaceholder('Usuários imunes')
                    .setMinValues(0)
                    .setMaxValues(10)
                    .setDefaultUsers(nuke.whitelistIds)
            )
        );
}

function montarPainelEfemeroProtecao(tipo) {
    const config = { spam: protecaoConfig.antiSpam, link: protecaoConfig.antiLink, antifake: protecaoConfig.antiFake, antibot: protecaoConfig.antiBot }[tipo];
    const titulo = { spam: 'Anti-Spam', link: 'Anti-Link', antifake: 'Anti Fake', antibot: 'Anti Bot' }[tipo];

    let statusAtual;
    if (tipo === 'spam') {
        statusAtual = `**Limite:** \`${config.msgLimite}\` msgs / \`${config.janelaMs / 1000}s\` · **Mute:** \`${config.muteMinutos}min\``;
    } else if (tipo === 'link') {
        statusAtual = `**Bloquear convites:** \`${config.bloquearConvites ? 'sim' : 'não'}\` · **Bypass extra:** \`${config.cargosBypass.length}\``;
    } else if (tipo === 'antifake') {
        statusAtual = `**Idade mínima:** \`${config.diasMinimos}\` dia(s) · **Ação:** \`${config.acao}\``;
    } else if (tipo === 'antibot') {
        const acaoTexto = { kick: 'Expulsar', banir: 'Banir' }[config.acao] || config.acao;
        statusAtual = `**Ação ao detectar bot:** \`${acaoTexto}\``;
    }

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${config.ativo ? EMOJI_ATIVADO : EMOJI_DESATIVADO} ${titulo}`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Painel > ${titulo}`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(DESCRICOES_PROTECAO[tipo]))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(statusAtual));

    const botoes = [
        new ButtonBuilder()
            .setCustomId(`protecao_ef_toggle_${tipo}`)
            .setLabel(config.ativo ? 'Desativar' : 'Ativar')
            .setStyle(config.ativo ? ButtonStyle.Danger : ButtonStyle.Success)
    ];

    if (tipo === 'spam' || tipo === 'antifake' || tipo === 'antibot') {
        botoes.push(
            new ButtonBuilder()
                .setCustomId(`protecao_ef_config_${tipo}`)
                .setLabel('Configurar')
                .setStyle(ButtonStyle.Secondary)
        );
    }

    container.addActionRowComponents(new ActionRowBuilder().addComponents(botoes));

    if (tipo === 'link') {
        const selectBypass = new RoleSelectMenuBuilder()
            .setCustomId('protecao_ef_bypass_select')
            .setPlaceholder('Cargos com bypass extra')
            .setMinValues(0)
            .setMaxValues(10);

        if (config.cargosBypass.length) {
            selectBypass.setDefaultRoles(...config.cargosBypass);
        }

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Selecione quais cargos além dos fixos (Booster, Atendente, Links Livres) ignoram o Anti-Link.'));
        container.addActionRowComponents(new ActionRowBuilder().addComponents(selectBypass));
    }

    return container;
}

function montarPainelLock(guildId) {
    const travado = canaisLockDB.get(guildId);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${travado ? EMOJI_ATIVADO : EMOJI_DESATIVADO} Lock`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Painel > Lock all'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            'Trava o envio de mensagens do `@everyone` em todos os canais de texto do servidor de uma vez'
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (travado) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Status:** \`travado\`\n**Canais afetados:** \`${travado.estados.length}\`\n**Travado em:** <t:${Math.floor(travado.travadoEm / 1000)}:R> por <@${travado.autorId}>`
        ));
    } else {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('**Status:** `normal`'));
    }

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(travado ? 'lock_destravar' : 'lock_travar')
                .setLabel(travado ? 'Destravar servidor' : 'Travar servidor')
                .setStyle(travado ? ButtonStyle.Success : ButtonStyle.Danger)
        )
    );

    return container;
}

async function registrarPainelProtecao(channelId, messageId) {
    await paineisProtecao.definir(messageId, { channelId });
}

async function atualizarTodosPaineisProtecao() {
    for (const [messageId, { channelId }] of paineisProtecao) {
        try {
            const canal = await client.channels.fetch(channelId).catch(() => null);
            if (!canal) { await paineisProtecao.remover(messageId); continue; }

            const msg = await canal.messages.fetch(messageId).catch(() => null);
            if (!msg) { await paineisProtecao.remover(messageId); continue; }

            await msg.edit({
                components: [montarPainelProtecao(msg.guild.id)],
                flags: [MessageFlags.IsComponentsV2]
            });
        } catch (err) {
            console.error('--- Erro ao auto-atualizar painel de proteção ---', err);
        }
    }
}

async function atualizarPainelBotCallAuto(guildId) {
    const info = botCallPaineis.get(guildId);
    if (!info) return;

    try {
        const canal = await client.channels.fetch(info.channelId).catch(() => null);
        if (!canal) return;

        const msg = await canal.messages.fetch(info.messageId).catch(() => null);
        if (!msg) return;

        await msg.edit({
            components: [montarPainelBotCall(guildId)],
            flags: [MessageFlags.IsComponentsV2]
        });
    } catch (err) {
        console.error('--- Erro ao auto-atualizar painel botcall ---', err);
    }
}

async function carregarBotCallPaineis() {
    try {
        const docs = await BotCallPainel.find();
        for (const doc of docs) {
            botCallPaineis.set(doc.guildId, { channelId: doc.channelId, messageId: doc.messageId });
        }
        console.log(`[BotCall] ${docs.length} painel(is) carregado(s) do banco.`);
    } catch (err) {
        console.error('--- Erro ao carregar paineis de botcall ---', err);
    }
}

function monitorarDesconexaoBotCall(guildId, connection) {
    connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
        console.log(`[Voice Debug] Desconectado — reason: ${newState?.reason}, closeCode: ${newState?.closeCode}`);

        // Não tenta reconectar em nenhuma hipótese: kick pelo perfil, canal deletado,
        // permissão removida ou botão do painel — o bot sai e fica fora.
        connection.destroy();
        console.log(`[Voice] Conexão encerrada, o bot não vai tentar voltar pro canal sozinho.`);

        await removerVoiceState(guildId).catch(() => null);

        const dadosAtuais = botCallDB.get(guildId) || { canalId: null, conectado: false };
        botCallDB.set(guildId, { canalId: dadosAtuais.canalId, conectado: false });

        await atualizarPainelBotCallAuto(guildId).catch(() => null);
    });
}

async function salvarEstadoEventoMoedas(mensagemId, enviadoEm) {
    try {
        await EventoMoedasState.findByIdAndUpdate(
            'evento_moedas',
            { mensagemId, enviadoEm },
            { upsert: true }
        );
    } catch (err) {
        console.error('--- Erro ao salvar estado do evento de moedas ---', err);
    }
}

async function limparEstadoEventoMoedas() {
    try {
        await EventoMoedasState.deleteOne({ _id: 'evento_moedas' });
    } catch (err) {
        console.error('--- Erro ao limpar estado do evento de moedas ---', err);
    }
}

async function verificarEventoMoedasAntigo() {
    try {
        const estado = await EventoMoedasState.findById('evento_moedas').catch(() => null);
        if (!estado) return;

        const canal = await obterPrimeiroCanalCategoria(CATEGORIA_MOEDAS_BOASVINDAS);
        if (!canal) { await limparEstadoEventoMoedas(); return; }

        const msg = await canal.messages.fetch(estado.mensagemId).catch(() => null);
        if (!msg) { await limparEstadoEventoMoedas(); return; }

        const tempoPassado = Date.now() - estado.enviadoEm;
        const tempoRestante = (60 * 1000) - tempoPassado;

        if (tempoRestante <= 0) {
            await msg.delete().catch(() => null);
            await limparEstadoEventoMoedas();
            console.log('[Moedas] Embed antiga expirada foi deletada ao reiniciar.');
        } else {
            eventoMoedas.ativo = true;
            eventoMoedas.mensagem = msg;
            eventoMoedas.ganho = false;
            eventoMoedas.sorteado = false;
            eventoMoedas.participantes = [];

            eventoMoedas.timeoutId = setTimeout(async () => {
                if (eventoMoedas.ativo && eventoMoedas.mensagem?.id === msg.id) {
                    await msg.delete().catch(() => null);
                    eventoMoedas.ativo = false;
                    eventoMoedas.mensagem = null;
                    eventoMoedas.timeoutId = null;
                    await limparEstadoEventoMoedas();
                }
            }, tempoRestante);

            console.log(`[Moedas] Embed antiga ainda válida, deletando em ${Math.ceil(tempoRestante / 1000)}s.`);
        }
    } catch (err) {
        console.error('--- Erro ao verificar evento de moedas antigo ---', err);
        await limparEstadoEventoMoedas();
    }
}

async function carregarTickets() {
    try {
        const docs = await TicketData.find();
        for (const doc of docs) {
            ticketDB.set(doc.threadId, {
                autorId: doc.autorId, motivo: doc.motivo,
                assumidoPor: doc.assumidoPor, numero: doc.numero
            });
        }
        console.log(`[Tickets] ${ticketDB.size} ticket(s) carregado(s) do Mongo.`);
    } catch (err) {
        console.error('--- Erro ao carregar tickets ---', err);
    }
}

async function getDonoCallTemp(channelId) {
    return await redis.get(`call_canal:${channelId}`);
}

async function getCallTemp(userId) {
    return await redis.get(`call:${userId}`);
}
async function setCallTemp(userId, channelId) {
    await redis.set(`call:${userId}`, channelId);
    await redis.set(`call_canal:${channelId}`, userId);
}
async function delCallTempPorCanal(channelId) {
    const userId = await redis.get(`call_canal:${channelId}`);
    if (userId) {
        await redis.del(`call:${userId}`);
        await redis.del(`call_canal:${channelId}`);
    }
    return userId;
}

async function getAfk(userId) {
    return await redis.get(`afk:${userId}`);
}
async function setAfk(userId, motivo) {
    await redis.set(`afk:${userId}`, motivo);
}
async function removerAfk(userId) {
    await redis.del(`afk:${userId}`);
}

async function salvarVoiceState(guildId, channelId) {
    try {
        await VoiceState.findOneAndUpdate({ guildId }, { channelId }, { upsert: true });
    } catch (err) {
        console.error('--- Erro ao salvar voice state ---', err);
    }
}

async function removerVoiceState(guildId) {
    try {
        await VoiceState.deleteOne({ guildId });
    } catch (err) {
        console.error('--- Erro ao remover voice state ---', err);
    }
}

async function reconectarVoiceStates() {
    let docs;
    try {
        docs = await VoiceState.find();
    } catch (err) {
        console.error('--- Erro ao carregar voice states do banco ---', err);
        return;
    }

    console.log(`[Voice] ${docs.length} voice state(s) encontrado(s) no banco para reconectar.`);

    for (const { guildId, channelId } of docs) {
        console.log(`[Voice] Tentando reconectar guild ${guildId} no canal ${channelId}...`);
        try {
            const guild = await client.guilds.fetch(guildId);
            const canal = await guild.channels.fetch(channelId).catch(() => null);
            if (!canal) { await removerVoiceState(guildId); continue; }

            const connection = joinVoiceChannel({
                channelId: canal.id,
                guildId: guild.id,
                adapterCreator: guild.voiceAdapterCreator,
                selfDeaf: false,
                selfMute: false
            });

            try {
                await entersState(connection, VoiceConnectionStatus.Ready, 15000);
                monitorarDesconexaoBotCall(guild.id, connection);
                botCallDB.set(guild.id, { canalId: canal.id, conectado: true });
                console.log(`[Voice] Reconectado em ${canal.name} (${guild.name})`);
            } catch (errConexao) {
                connection.destroy();
                await removerVoiceState(guildId);
                botCallDB.set(guild.id, { canalId: canal.id, conectado: false });
                console.error(`--- Falha ao confirmar reconexão em ${guild.name} ---`, errConexao);
            }
        } catch (err) {
            console.error('--- Erro ao reconectar voice state ---', err);
        }
    }
}


function linkPermitido(url) {
    try {
        const { hostname, pathname } = new URL(url);
        const host = hostname.toLowerCase().replace(/^www\./, '');

        const listaDominios = [...DOMINIOS_MUSICA_PERMITIDOS, ...DOMINIOS_IMAGEM_CONFIAVEIS];
        if (listaDominios.some(d => host === d || host.endsWith(`.${d}`))) {
            return true;
        }

        if (EXTENSOES_IMAGEM.some(ext => pathname.toLowerCase().endsWith(ext))) {
            return true;
        }

        return false;
    } catch {
        return false;
    }
}

async function verificarCallTemp(interaction) {
    const canal = interaction.channel;
    const donoId = await getDonoCallTemp(canal.id);

    if (!donoId) {
        await interaction.reply({
            components: containerTexto('Esse painel só funciona dentro do chat de uma call temporária.'),
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
        return null;
    }

    if (donoId !== interaction.user.id) {
        await interaction.reply({
            components: containerTexto('Apenas o **dono** desta call pode usar este painel!'),
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
        return null;
    }

    return canal;
}

async function enviarWebhook(channel, options) {
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(wh => wh.name === 'Sistema Insta');
    if (!webhook) {
        webhook = await channel.createWebhook({ name: 'Sistema Insta' });
    }
    return await webhook.send(options);
}

async function obterPrimeiroCanalCategoria(categoriaId) {
    const categoria = await client.channels.fetch(categoriaId).catch(() => null);
    if (!categoria || categoria.type !== ChannelType.GuildCategory) return null;

    const canais = [...categoria.children.cache.values()]
        .filter(c => c.type === ChannelType.GuildText)
        .sort((a, b) => a.rawPosition - b.rawPosition);

    return canais[0] || null;
}

async function enviarEventoMoedas() {
    if (!eventoMoedasAtivo) return;

    try {
        const canal = await obterPrimeiroCanalCategoria(CATEGORIA_MOEDAS_BOASVINDAS);
        if (!canal) return;

        if (eventoMoedas.ativo && eventoMoedas.mensagem) {
            if (eventoMoedas.timeoutId) clearTimeout(eventoMoedas.timeoutId);
            await eventoMoedas.mensagem.delete().catch(() => null);
        }

        const embed = new EmbedBuilder()
            .setColor('#FFFFFF')
            .setDescription(`# <:crow:${EMOJI_CROW}> Tropa da **Onze**\n Digite \`sacar\` e tente sua sorte!\n* Utilize \`/carteira\` e visualize seu saldo`)
            .setImage(IMG_MOEDAS);

        const msg = await canal.send({ embeds: [embed] });

        eventoMoedas.ativo = true;
        eventoMoedas.mensagem = msg;
        eventoMoedas.ganho = false;
        eventoMoedas.sorteado = false;
        eventoMoedas.participantes = [];

        salvarEstadoEventoMoedas(msg.id, Date.now());

        eventoMoedas.timeoutId = setTimeout(async () => {
            if (eventoMoedas.ativo && eventoMoedas.mensagem?.id === msg.id) {
                await msg.delete().catch(() => null);
                eventoMoedas.ativo = false;
                eventoMoedas.mensagem = null;
                eventoMoedas.timeoutId = null;
                limparEstadoEventoMoedas();
            }
        }, 60 * 1000);
    } catch (err) {
        console.error('--- Erro ao enviar evento de moedas ---', err);
    }
}
// ============ FIM FUNCTIONs/ASYNCs ============


// ============ CRIADOR DE MENSAGENS ============

function montarButtonRows(botoes, modo = 'final') {
    const rows = [];

    for (let i = 0; i < botoes.length; i += 5) {
        const grupo = botoes.slice(i, i + 5);

        const row = new ActionRowBuilder().addComponents(
            grupo.map((b) => {
                const btn = new ButtonBuilder().setLabel(b.label);

                if (b.emoji) btn.setEmoji(b.emoji);

                if (b.url) {
                    btn
                        .setStyle(ButtonStyle.Link)
                        .setURL(b.url);
                } else {
                    const estilos = {
                        primary: ButtonStyle.Primary,
                        secondary: ButtonStyle.Secondary,
                        success: ButtonStyle.Success,
                        danger: ButtonStyle.Danger
                    };

                    btn.setStyle(estilos[b.cor] || ButtonStyle.Secondary);

                    if (modo === 'preview') {
                        btn.setCustomId(`msgcriador_preview_btn_${b.id}`);
                    } else {
                        btn.setCustomId(`msgcriador_btn_${b.id}`);
                    }
                }

                return btn;
            })
        );

        rows.push(row);
    }

    return rows;
}

function parseBlocosTexto(textoBruto) {
    return String(textoBruto ?? '')
        .split(/\[\s*separador\s*\]/i)
        .map(b => b.trim());
}

function montarPainelMsgCriadorInicial(draft) {
    const tipoTexto = draft.tipo === 'v2' ? 'Components V2' : draft.tipo === 'embed' ? 'Embed' : draft.tipo === 'texto' ? 'Texto normal (sem embeds)' : 'nenhum selecionado';
    const canalTexto = draft.canalId ? `<#${draft.canalId}>` : 'nenhum selecionado';

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **CRIADOR DE MENSAGENS**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            'Esse painel permite montar e enviar uma mensagem personalizada em qualquer canal de texto do servidor.\n\n' +
            '**Components V2:** visual mais elaborado, com texto formatado, separadores e imagem.\n' +
            '**Texto normal:** envia apenas texto puro, sem nenhum componente ou embed.\n\n' +
            'Selecione o tipo da mensagem e o canal de destino abaixo. Depois clique em **Criar** para montar o conteúdo.'
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Tipo selecionado:** \`${tipoTexto}\`\n**Canal selecionado:** ${canalTexto}`
        ))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('msgcriador_tipo')
                    .setPlaceholder('Selecione o tipo da mensagem')
                    .addOptions(
                        { label: 'Components V2', value: 'v2', description: 'Mensagem com visual elaborado', default: draft.tipo === 'v2' },

                       { label: 'Embed', value: 'embed', description: 'Embed tradicional com título, descrição e botões', default: draft.tipo === 'embed' },
                        { label: 'Texto normal (sem embeds)', value: 'texto', description: 'Mensagem apenas com texto puro', default: draft.tipo === 'texto' }
                    )
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ChannelSelectMenuBuilder()
                    .setCustomId('msgcriador_canal')
                    .setPlaceholder('Selecione o canal de destino')
                    .setChannelTypes(ChannelType.GuildText)
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('msgcriador_iniciar')
                    .setLabel('Criar')
                    .setStyle(ButtonStyle.Success)
            )
        );
}

function montarPreviewMsgCriador(draft) {
    const header = new TextDisplayBuilder().setContent(' Prévia da mensagem ↓');
    const botoes = draft.botoes || [];

    if (draft.tipo === 'v2') {
    const container = new ContainerBuilder();

    if (draft.cor && draft.cor !== 'nenhuma') {
        container.setAccentColor(parseInt(draft.cor, 16));
    }

    const botoesCima = botoes.filter(b => b.posicao === 'cima');
    const botoesEntre = botoes.filter(b => b.posicao === 'entre');
    const botoesFora = botoes.filter(b => b.posicao === 'fora');
    const botoesAbaixo = botoes.filter(b => !['cima', 'entre', 'fora'].includes(b.posicao));

    if (botoesCima.length) {
        montarButtonRows(botoesCima, 'preview').forEach(row => container.addActionRowComponents(row));
    }

    const houveTexto = String(draft.textoBruto ?? '').trim().length > 0;

    if (!houveTexto) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Nenhum texto adicionado ainda.'));
    } else {
        const blocos = parseBlocosTexto(draft.textoBruto);
        blocos.forEach((bloco, i) => {
            if (bloco.length > 0) {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bloco));
            }
            if (i < blocos.length - 1) {
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
            }
        });
    }

    if (botoesEntre.length) {
        montarButtonRows(botoesEntre, 'preview').forEach(row => container.addActionRowComponents(row));
    }

    if (draft.imagemUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(draft.imagemUrl))
        );
    }

    if (botoesAbaixo.length) {
        montarButtonRows(botoesAbaixo, 'preview').forEach(row => container.addActionRowComponents(row));
    }

    const componentesFinais = [header, container];
    if (botoesFora.length) {
        montarButtonRows(botoesFora, 'preview').forEach(row => componentesFinais.push(row));
    }

    return componentesFinais;
}

    if (draft.tipo === 'embed') {
        const componentes = [header];

        const titulo = draft.embedTitulo?.trim();
        const descricao = draft.embedDescricao?.trim();

        if (!titulo && !descricao) {
            componentes.push(new TextDisplayBuilder().setContent('Nenhum título/descrição adicionado ainda.'));
        } else {
            if (titulo) componentes.push(new TextDisplayBuilder().setContent(`# ${titulo}`));
            if (descricao) componentes.push(new TextDisplayBuilder().setContent(descricao));
        }

        if (draft.imagemUrl) {
            componentes.push(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(draft.imagemUrl))
            );
        }

        if (botoes.length) {
            componentes.push(new TextDisplayBuilder().setContent('Pré-visualização dos botões (serão enviados junto do embed):'));
            montarButtonRows(botoes, 'preview').forEach(row => componentes.push(row));
        }

        return componentes;
    }

    if (draft.tipo === 'texto') {
        const componentes = [header];

        componentes.push(new TextDisplayBuilder().setContent(
            draft.textoBruto ? draft.textoBruto : 'Nenhum texto adicionado ainda.'
        ));

        if (draft.imagemUrl) {
            componentes.push(
                new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(draft.imagemUrl))
            );
        }

        if (botoes.length) {
            componentes.push(new TextDisplayBuilder().setContent('Pré-visualização dos botões (serão enviados junto do texto puro, sem container):'));
            montarButtonRows(botoes, 'preview').forEach(row => componentes.push(row));
        }

        return componentes;
    }

    return [header, new TextDisplayBuilder().setContent('Selecione um tipo de mensagem antes de continuar.')];
}

function construirEmbedPreview(draft) {
    const embed = new EmbedBuilder().setColor('#2B2D31');
    const titulo = draft.embedTitulo?.trim();
    const descricao = draft.embedDescricao?.trim();
    const footer = draft.embedFooter?.trim();

    if (titulo) embed.setTitle(titulo);
    if (descricao) embed.setDescription(descricao);
    if (!titulo && !descricao) embed.setDescription('-# Nenhum título/descrição adicionado ainda.');
    if (draft.cor && draft.cor !== 'nenhuma') embed.setColor(parseInt(draft.cor, 16));
    if (draft.imagemUrl) embed.setImage(draft.imagemUrl);
    if (footer) embed.setFooter({ text: footer });

    return embed;
}

function montarControlesEmbedPlano(draft) {
    const rows = [];

    const opcoesMsgCriador = [
        { label: 'Título/Descrição/Footer', value: 'embedconteudo', description: 'Definir título, descrição e footer do embed', default: draft.opcaoAtual === 'embedconteudo' },
        { label: 'Imagem', value: 'imagem', description: 'Adicionar ou remover uma imagem', default: draft.opcaoAtual === 'imagem' },
        { label: 'Botões', value: 'botoes', description: 'Adicionar botões à mensagem', default: draft.opcaoAtual === 'botoes' },
        { label: 'Cor', value: 'cor', description: 'Definir a cor de destaque do embed', default: draft.opcaoAtual === 'cor' },
        { label: 'Enviar', value: 'enviar', description: 'Enviar a mensagem para o canal selecionado' }
    ];

    rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('msgcriador_opcao')
            .setPlaceholder('Selecione o que deseja editar')
            .addOptions(opcoesMsgCriador)
    ));

    if (draft.opcaoAtual === 'embedconteudo') {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('msgcriador_embed_editar').setLabel('Editar').setStyle(ButtonStyle.Secondary)
        ));
    }

    if (draft.opcaoAtual === 'imagem') {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('msgcriador_imagem_enviar').setLabel('Enviar').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('msgcriador_imagem_remover').setLabel('Remover').setStyle(ButtonStyle.Danger).setDisabled(!draft.imagemUrl)
        ));
    }

    if (draft.opcaoAtual === 'botoes') {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('msgcriador_botao_adicionar').setLabel('Adicionar').setStyle(ButtonStyle.Secondary)
        ));

        if (draft.botoes && draft.botoes.length > 0) {
            rows.push(new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('msgcriador_botao_remover')
                    .setPlaceholder('Remover um botão')
                    .addOptions(draft.botoes.slice(0, 25).map((b, i) => ({
                        label: b.label.slice(0, 100),
                        value: String(i),
                        description: b.url ? 'Link' : (POSICOES_BOTAO.find(p => p.value === b.posicao)?.label ?? 'Ação')
                    })))
            ));

            const botoesSemUrl = draft.botoes.map((b, i) => ({ b, i })).filter(({ b }) => !b.url);
            if (botoesSemUrl.length) {
                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('msgcriador_botao_resposta')
                        .setPlaceholder('Definir resposta ao clicar (efêmera)')
                        .addOptions(botoesSemUrl.slice(0, 25).map(({ b, i }) => ({
                            label: b.label.slice(0, 100),
                            value: String(i),
                            description: b.resposta ? 'Resposta já definida' : 'Sem resposta definida'
                        })))
                ));
            }
        }
    }

    if (draft.opcaoAtual === 'cor') {
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('msgcriador_cor_select')
                .setPlaceholder('Selecione a cor')
                .addOptions(CORES_MSG_CRIADOR.map(c => ({
                    label: c.label,
                    value: c.value,
                    default: (draft.cor ?? 'nenhuma') === c.value
                })))
        ));
    }

    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('msgcriador_atualizar').setEmoji(EMOJI_ATUALIZAR_PREVIEW).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('msgcriador_voltar').setEmoji(EMOJI_VOLTAR_PAINEL).setStyle(ButtonStyle.Secondary)
    ));

    return rows;
}

function montarPayloadPainelMsgCriador(draft) {
    if (draft.tipo === 'embed') {
        const canalTexto = draft.canalId ? `<#${draft.canalId}>` : '`nenhum selecionado`';
        return {
            content: `**MONTAR MENSAGEM (Embed)**\n**Canal de destino:** ${canalTexto}\n-# Prévia abaixo ↓`,
            embeds: [construirEmbedPreview(draft)],
            components: montarControlesEmbedPlano(draft),
            flags: []
        };
    }

    return {
        components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
        flags: [MessageFlags.IsComponentsV2]
    };
}

function montarPainelMsgCriadorBuilder(draft) {
    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **MONTAR MENSAGEM**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Canal de destino:** ${draft.canalId ? `<#${draft.canalId}>` : '\`nenhum selecionado\`'}\n**Tipo:** \`${draft.tipo === 'v2' ? 'Components V2' : draft.tipo === 'embed' ? 'Embed' : 'Texto normal'}\``
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
const opcoesMsgCriador = [];

if (draft.tipo === 'embed') {
    opcoesMsgCriador.push(
        { label: 'Título/Descrição', value: 'embedconteudo', description: 'Definir o título e a descrição do embed', default: draft.opcaoAtual === 'embedconteudo' }
    );
} else {
    opcoesMsgCriador.push(
        { label: 'Texto', value: 'texto', description: 'Definir o conteúdo de texto da mensagem', default: draft.opcaoAtual === 'texto' }
    );
}

opcoesMsgCriador.push(
    { label: 'Imagem', value: 'imagem', description: 'Adicionar ou remover uma imagem', default: draft.opcaoAtual === 'imagem' },
    { label: 'Botões', value: 'botoes', description: 'Adicionar botões à mensagem', default: draft.opcaoAtual === 'botoes' }
);

if (draft.botoes && draft.botoes.length > 0) {
    opcoesMsgCriador.push(
        { label: 'Editar botões', value: 'editar_botoes', description: 'Editar um botão já adicionado', default: draft.opcaoAtual === 'editar_botoes' }
    );
}

if (draft.tipo === 'v2' || draft.tipo === 'embed') {
    opcoesMsgCriador.push(
        { label: 'Cor', value: 'cor', description: 'Definir a cor de destaque da mensagem', default: draft.opcaoAtual === 'cor' }
    );
}

opcoesMsgCriador.push(
    { label: 'Enviar', value: 'enviar', description: 'Enviar a mensagem para o canal selecionado' }
);

container.addActionRowComponents(
    new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('msgcriador_opcao')
            .setPlaceholder('Selecione o que deseja editar')
            .addOptions(opcoesMsgCriador)
    )
);

    if (draft.opcaoAtual === 'texto') {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('msgcriador_texto_editar').setLabel('Editar').setStyle(ButtonStyle.Secondary)
            )
        );
    }

    if (draft.opcaoAtual === 'imagem') {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('msgcriador_imagem_enviar').setLabel('Enviar').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('msgcriador_imagem_remover').setLabel('Remover').setStyle(ButtonStyle.Danger).setDisabled(!draft.imagemUrl)
            )
        );
    }
    
    if (draft.opcaoAtual === 'embedconteudo') {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('msgcriador_embed_editar').setLabel('Editar').setStyle(ButtonStyle.Secondary)
            )
        );
    }
   

if (draft.opcaoAtual === 'botoes') {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('msgcriador_botao_adicionar').setLabel('Adicionar').setStyle(ButtonStyle.Secondary)
            )
        );

        if (draft.botoes && draft.botoes.length > 0) {
            container.addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('msgcriador_botao_remover')
                        .setPlaceholder('Remover um botão')
                        .addOptions(
                            draft.botoes.slice(0, 25).map((b, i) => ({
                                label: b.label.slice(0, 100),
                                value: String(i),
                                description: b.url ? 'Link' : (POSICOES_BOTAO.find(p => p.value === b.posicao)?.label ?? 'Ação')
                            }))
                        )
                )
            );

            const botoesSemUrl = draft.botoes
                .map((b, i) => ({ b, i }))
                .filter(({ b }) => !b.url);

            if (botoesSemUrl.length) {
                container.addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('msgcriador_botao_resposta')
                            .setPlaceholder('Definir resposta ao clicar (efêmera)')
                            .addOptions(
                                botoesSemUrl.slice(0, 25).map(({ b, i }) => ({
                                    label: b.label.slice(0, 100),
                                    value: String(i),
                                    description: b.resposta ? 'Resposta já definida' : 'Sem resposta definida'
                                }))
                            )
                    )
                );
            }
        }
    }
    
    if (draft.opcaoAtual === 'editar_botoes' && draft.botoes && draft.botoes.length > 0) {
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('msgcriador_botao_editar_select')
                .setPlaceholder('Selecione um botão para editar')
                .addOptions(
                    draft.botoes.slice(0, 25).map((b, i) => ({
                        label: b.label.slice(0, 100),
                        value: String(i),
                        description: b.url ? 'Link' : (POSICOES_BOTAO.find(p => p.value === b.posicao)?.label ?? 'Ação')
                    }))
                )
        )
    );
}
       

if (draft.tipo !== 'v2' && draft.tipo !== 'embed' && draft.opcaoAtual === 'cor') {
    draft.opcaoAtual = null;
    }

if (draft.opcaoAtual === 'cor') {
    const corEhPredefinida = CORES_MSG_CRIADOR.some(c => c.value === draft.cor);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Cor atual:** ${draft.cor && draft.cor !== 'nenhuma' ? `\`#${draft.cor.toUpperCase()}\`` : '\`nenhuma\`'}`
    ));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('msgcriador_cor_select')
                .setPlaceholder('Selecione a cor')
                .addOptions(
                    CORES_MSG_CRIADOR.map(c => ({
                        label: c.label,
                        value: c.value,
                        default: corEhPredefinida && (draft.cor ?? 'nenhuma') === c.value
                    }))
                )
        )
    );

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('msgcriador_cor_personalizada')
                .setLabel('Cor personalizada')
                .setStyle(ButtonStyle.Secondary)
        )
    );
}

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('msgcriador_atualizar').setEmoji(EMOJI_ATUALIZAR_PREVIEW).setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('msgcriador_voltar').setEmoji(EMOJI_VOLTAR_PAINEL).setStyle(ButtonStyle.Secondary)
        )
    );

    return container;
}

async function montarPayloadFinalMsgCriador(draft) {
    const botoes = draft.botoes || [];

if (draft.tipo === 'v2') {
    const blocos = parseBlocosTexto(draft.textoBruto);
    const houveTexto = String(draft.textoBruto ?? '').trim().length > 0;
    const container = new ContainerBuilder();

    if (draft.cor && draft.cor !== 'nenhuma') {
        container.setAccentColor(parseInt(draft.cor, 16));
    }

    const botoesCima = botoes.filter(b => b.posicao === 'cima');
    const botoesEntre = botoes.filter(b => b.posicao === 'entre');
    const botoesFora = botoes.filter(b => b.posicao === 'fora');
    const botoesAbaixo = botoes.filter(b => !['cima', 'entre', 'fora'].includes(b.posicao));

    if (botoesCima.length) {
        montarButtonRows(botoesCima).forEach(row => container.addActionRowComponents(row));
    }

    if (houveTexto) {
        blocos.forEach((bloco, i) => {
            if (bloco.length > 0) {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bloco));
            }
            if (i < blocos.length - 1) {
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
            }
        });
    }

    if (botoesEntre.length) {
        montarButtonRows(botoesEntre).forEach(row => container.addActionRowComponents(row));
    }

    if (draft.imagemUrl) {
        container.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(draft.imagemUrl))
        );
    }

    if (botoesAbaixo.length) {
        montarButtonRows(botoesAbaixo).forEach(row => container.addActionRowComponents(row));
    }

    const componentesFinais = [container];
    if (botoesFora.length) {
        montarButtonRows(botoesFora).forEach(row => componentesFinais.push(row));
    }

    return { components: componentesFinais, flags: [MessageFlags.IsComponentsV2] };
}

if (draft.tipo === 'embed') {
        const embed = new EmbedBuilder();
        if (draft.embedTitulo?.trim()) embed.setTitle(draft.embedTitulo.trim());
        if (draft.embedDescricao?.trim()) embed.setDescription(draft.embedDescricao.trim());
        if (draft.cor && draft.cor !== 'nenhuma') embed.setColor(parseInt(draft.cor, 16));
        if (draft.imagemUrl) embed.setImage(draft.imagemUrl);
        if (draft.embedFooter?.trim()) embed.setFooter({ text: draft.embedFooter.trim() });

        const payload = { embeds: [embed] };
        if (botoes.length) payload.components = montarButtonRows(botoes);
        return payload;
    }

    const payload = { content: draft.textoBruto || '' };
    if (draft.imagemUrl) payload.files = [draft.imagemUrl];
    if (botoes.length) payload.components = montarButtonRows(botoes);
    return payload;
}

// ============ USERINFO (userinfo / ui) ============
const EMOJIS_CONEXAO = {
    battlenet:       '<:19034:1542338134686302269>',
    bungie:          '<:19035:1542338162209198161>',
    bluesky:         '<:19036:1542338194161410208>',
    crunchyroll:     '<:19037:1542338218836369508>',
    domain:          '<:19038:1542338244358963200>',
    ebay:            '<:19061:1542340262129303603>',
    epicgames:       '<:19062:1542340594204934226>',
    facebook:        '<:19063:1542340761373384816>',
    github:          '<:19039:1542338276382220288>',
    instagram:       '<:19040:1542338299312480357>',
    leagueoflegends: '<:19064:1542341028080652288>',
    mastodon:        '<:19042:1542338352013910096>',
    paypal:          '<:19043:1542338421945536522>',
    playstation:     '<:19044:1542338468494057582>',
    reddit:          '<:19045:1542338493697622076>',
    riotgames:       '<:19046:1542338517726920805>',
    roblox:          '<:19047:1542338541290397767>',
    samsung:         '<:19049:1542338573506846720>',
    soundcloud:      '<:19050:1542338596512735263>',
    spotify:         '<:19041:1542338325023555741>',
    skype:           '<:19053:1542338665315967048>',
    steam:           '<:19054:1542338704251555861>',
    tiktok:          '<:19055:1542338726968033460>',
    twitch:          '<:19056:1542338744860942396>',
    twitter:         '<:19057:1542338760405164094>',
    xbox:            '<:19058:1542338774485176440>',
    youtube:         '<:19059:1542338788775428137>',
};

const NOMES_CONEXAO = {
    battlenet: 'Battle.net',
    bungie: 'Bungie.net',
    bluesky: 'Bluesky',
    crunchyroll: 'Crunchyroll',
    domain: 'Site',
    ebay: 'eBay',
    epicgames: 'Epic Games',
    facebook: 'Facebook',
    github: 'GitHub',
    instagram: 'Instagram',
    leagueoflegends: 'League of Legends',
    mastodon: 'Mastodon',
    paypal: 'PayPal',
    playstation: 'PlayStation Network',
    reddit: 'Reddit',
    riotgames: 'Riot Games',
    roblox: 'Roblox',
    samsung: 'Samsung Galaxy',
    soundcloud: 'SoundCloud',
    spotify: 'Spotify',
    skype: 'Skype',
    steam: 'Steam',
    tiktok: 'TikTok',
    twitch: 'Twitch',
    twitter: 'X',
    xbox: 'Xbox',
    youtube: 'YouTube',
};

function formatarLinhaConexao(conn) {
    const emoji = EMOJIS_CONEXAO[conn.type]; // sem fallback unicode
    const nomePlataforma = NOMES_CONEXAO[conn.type] || conn.type;
    const prefixo = emoji ? `${emoji} ` : '';
    return `${prefixo}**${nomePlataforma}** · ${conn.name}${conn.verified ? ' · verificada' : ''}`;
}

const NOMES_BADGES = {
    Staff: 'Funcionário Discord',
    Partner: 'Parceiro Discord',
    Hypesquad: 'HypeSquad Eventos',
    BugHunterLevel1: 'Caçador de Bugs',
    BugHunterLevel2: 'Caçador de Bugs (Ouro)',
    HypeSquadOnlineHouse1: 'HypeSquad Bravery',
    HypeSquadOnlineHouse2: 'HypeSquad Brilliance',
    HypeSquadOnlineHouse3: 'HypeSquad Balance',
    PremiumEarlySupporter: 'Apoiador Antigo do Nitro',
    VerifiedDeveloper: 'Dev Verificado de Bot',
    CertifiedModerator: 'Moderador Certificado',
    ActiveDeveloper: 'Desenvolvedor Ativo'
};

function formatarDataBR(timestamp) {
    return new Date(timestamp).toLocaleString('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function formatarTimestampDiscord(unix, formato) {
    if (formato === 'R') return formatarTempoRelativo(unix * 1000);

    const opcoesPorFormato = {
        t: { hour: '2-digit', minute: '2-digit' },
        T: { hour: '2-digit', minute: '2-digit', second: '2-digit' },
        d: { day: '2-digit', month: '2-digit', year: 'numeric' },
        D: { day: '2-digit', month: 'long', year: 'numeric' },
        f: { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
        F: { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
    };
    const opcoes = opcoesPorFormato[formato] || opcoesPorFormato.f;
    return new Date(unix * 1000).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', ...opcoes });
}

function formatarTempoRelativo(timestamp) {
    const diff = Date.now() - timestamp;
    if (diff < 0) return 'agora';
    const dias = Math.floor(diff / 86400000);
    if (dias > 0) return `há ${dias} dia${dias === 1 ? '' : 's'}`;
    const horas = Math.floor(diff / 3600000);
    if (horas > 0) return `há ${horas} hora${horas === 1 ? '' : 's'}`;
    const minutos = Math.floor(diff / 60000);
    return `há ${Math.max(minutos, 1)} minuto${minutos === 1 ? '' : 's'}`;
}

async function registrarUsernameSeNecessario(userId, username) {
    try {
        const atual = await HistoricoUsername.findOne({ userId, ate: null });
        if (atual) {
            if (atual.username === username) return;
            atual.ate = Date.now();
            await atual.save();
        }
        await HistoricoUsername.create({ userId, username, desde: Date.now(), ate: null });
    } catch (err) {
        console.error('--- Erro ao registrar histórico de username ---', err);
    }
}

function montarUrlAvatar(userId, hash, tamanho = 512) {
    if (!hash) return 'https://cdn.discordapp.com/embed/avatars/0.png';
    const ext = hash.startsWith('a_') ? 'gif' : 'png';
    return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${ext}?size=${tamanho}`;
}

async function registrarAvatarSeNecessario(userId, avatarUrl, avatarHash) {
    try {
        const ultimo = await HistoricoAvatar.findOne({ userId }).sort({ registradoEm: -1 });
        if (ultimo && ultimo.avatarHash === avatarHash) return;
        await HistoricoAvatar.create({ userId, avatarUrl, avatarHash, registradoEm: Date.now() });
    } catch (err) {
        console.error('--- Erro ao registrar histórico de avatar ---', err);
    }
}

async function registrarBannerSeNecessario(userId, bannerUrl, bannerHash) {
    try {
        const ultimo = await HistoricoBanner.findOne({ userId }).sort({ registradoEm: -1 });
        if (ultimo && ultimo.bannerHash === bannerHash) return;
        await HistoricoBanner.create({ userId, bannerUrl, bannerHash, registradoEm: Date.now() });
    } catch (err) {
        console.error('--- Erro ao registrar histórico de banner ---', err);
    }
}

async function garantirHistoricoInicial(user) {
    if (!user || user.bot) return;
    try {
        const existeUsername = await HistoricoUsername.exists({ userId: user.id });
        if (!existeUsername) {
            await HistoricoUsername.create({
                userId: user.id, username: user.username,
                desde: user.createdTimestamp, ate: null
            });
        }
        const existeAvatar = await HistoricoAvatar.exists({ userId: user.id });
        if (!existeAvatar) {
            await HistoricoAvatar.create({
                userId: user.id,
                avatarUrl: user.displayAvatarURL({ extension: 'png', size: 512 }),
                avatarHash: user.avatar,
                registradoEm: user.createdTimestamp
            });
        }
    } catch (err) {
        console.error('--- Erro ao garantir histórico inicial de usuário ---', err);
    }
}

function montarSelectUserInfo(alvoId, autorId, atual, expiraEm = 0) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`userinfo_menu_${alvoId}_${autorId}_${expiraEm}`)
            .setPlaceholder('Ver mais informações')
            .addOptions(
                { label: 'Perfil', value: 'perfil', description: 'Voltar para as informações principais', default: atual === 'perfil' },
                { label: 'Biografias anteriores', value: 'bios', description: 'Ver biografias anteriores', default: atual === 'bios' },
                { label: 'Usernames antigos', value: 'usernames', description: 'Ver nomes de usuário anteriores', default: atual === 'usernames' },
                { label: 'Avatares usados', value: 'avatares', description: 'Ver avatares anteriores', default: atual === 'avatares' },
                { label: 'Banners', value: 'banners', description: 'Ver banners anteriores', default: atual === 'banners' }
            )
    );
}

function rodapeExpiracao(container, expiraEm) {
    if (!expiraEm) return container;
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# Esse painel expira <t:${Math.floor(expiraEm / 1000)}:R>`
    ));
    return container;
}

async function montarPainelUserInfo(guild, alvoUser, autorId, expiraEm = 0) {
    const membro = await guild.members.fetch({ user: alvoUser.id, force: true }).catch(() => null);
    const avatarUrl = alvoUser.displayAvatarURL({ extension: 'png', size: 512 });
    const badges = (alvoUser.flags?.toArray() || []).map(f => NOMES_BADGES[f] || f);

    let bio = '';
    let connections = [];
    try {
    const perfil = await getUserPerfil(alvoUser.id, guild.id, { force: true });
    console.log('[DEBUG userinfo] perfil retornado para', alvoUser.id, ':', JSON.stringify(perfil));
    bio = perfil.bio || '';
    connections = perfil.connections || [];
} catch (err) {
        console.error('--- Erro ao buscar perfil (bio/conexões) para userinfo ---', err.message);
        if (String(err.message).includes('PERFIL_INACESSIVEL')) {
            bio = '__Perfil não acessível: nenhuma conta de consulta compartilha um servidor com esse usuário.__';
        }
    }

    const container = new ContainerBuilder();

    if (membro?.displayHexColor && membro.displayHexColor !== '#000000') {
        container.setAccentColor(parseInt(membro.displayHexColor.replace('#', ''), 16));
    }

    container.addSectionComponents(
        new SectionBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`# ${alvoUser.username}\n @${alvoUser.username} · \`${alvoUser.id}\``)
            )
            .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
    );

    if (bio.trim()) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bio));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Conta criada**\n${formatarDataBR(alvoUser.createdTimestamp)} · ${formatarTempoRelativo(alvoUser.createdTimestamp)}`
    ));

    if (membro) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        const cargos = membro.roles.cache.filter(r => r.id !== guild.id).sort((a, b) => b.position - a.position);
        const cargosTexto = cargos.size ? cargos.map(r => `<@&${r.id}>`).slice(0, 15).join(' ') : 'nenhum';

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Entrou no servidor**\n${formatarDataBR(membro.joinedTimestamp)} · ${formatarTempoRelativo(membro.joinedTimestamp)}\n\n` +
            `**Apelido:** ${membro.nickname || 'nenhum'}\n` +
            `**Cargos (${cargos.size}):** ${cargosTexto}`
        ));
    }

    if (badges.length) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Emblemas**\n${badges.join(' · ')}`));
    }

    if (connections.length) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        const linhasConexoes = connections.map(c => formatarLinhaConexao(c)).join('\n');
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Conexões**\n${linhasConexoes}`));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addActionRowComponents(montarSelectUserInfo(alvoUser.id, autorId, 'perfil', expiraEm));

    return rodapeExpiracao(container, expiraEm);
}

async function montarPainelUsernames(alvoUser, autorId, expiraEm = 0) {
    const historico = await HistoricoUsername.find({ userId: alvoUser.id }).sort({ desde: 1 }).catch(() => []);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Usernames antigos\n ${alvoUser.username}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (!historico.length) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(' Nenhum histórico de nome de usuário registrado ainda.'));
    } else {
        const linhas = historico.map((h, i) => {
            const duracao = h.ate ? formatarDuracaoMs(h.ate - h.desde) : `${formatarDuracaoMs(Date.now() - h.desde)} (atual)`;
            return `**${i + 1}.** \`${h.username}\`\n desde ${formatarDataBR(h.desde)} · ficou ${duracao}`;
        });
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(linhas.join('\n\n')));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addActionRowComponents(montarSelectUserInfo(alvoUser.id, autorId, 'usernames', expiraEm));
    return rodapeExpiracao(container, expiraEm);
}

async function montarPainelAvatares(alvoUser, autorId, indice = 0, expiraEm = 0) {
    let historico = await HistoricoAvatar.find({ userId: alvoUser.id }).sort({ registradoEm: -1 }).catch(() => []);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Avatares usados\n ${alvoUser.username}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (!historico.length) {
        container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(alvoUser.displayAvatarURL({ extension: 'png', size: 512 }))));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(' Avatar atual'));
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addActionRowComponents(montarSelectUserInfo(alvoUser.id, autorId, 'avatares', expiraEm));
        return rodapeExpiracao(container, expiraEm);
    }

    let idx = Math.max(0, Math.min(indice, historico.length - 1));

    // ---- Autolimpeza: verifica a URL atual, remove se estiver morta e tenta a próxima ----
    while (historico.length) {
        idx = Math.max(0, Math.min(idx, historico.length - 1));
        const item = historico[idx];

        const temHashValido = typeof item.avatarHash === 'string' && item.avatarHash.length > 0;
        const urlCandidata = temHashValido ? montarUrlAvatar(alvoUser.id, item.avatarHash) : item.avatarUrl;

        if (await urlValida(urlCandidata)) {
            // válida, monta o painel normalmente
            const ehAtual = idx === 0;

            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(urlCandidata)));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                ehAtual ? ' Avatar atual' : ` Registrado em ${formatarDataBR(item.registradoEm)} · ${idx + 1}/${historico.length}`
            ));

            container.addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`userinfo_avatar_${alvoUser.id}_${autorId}_${idx - 1}_${expiraEm}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(idx <= 0),
                    new ButtonBuilder().setCustomId(`userinfo_avatar_${alvoUser.id}_${autorId}_${idx + 1}_${expiraEm}`).setLabel('Próximo').setStyle(ButtonStyle.Secondary).setDisabled(idx >= historico.length - 1)
                )
            );

            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
            container.addActionRowComponents(montarSelectUserInfo(alvoUser.id, autorId, 'avatares', expiraEm));
            return rodapeExpiracao(container, expiraEm);
        }

        // morta -> apaga do banco e remove do array em memória, tenta de novo
        await HistoricoAvatar.deleteOne({ _id: item._id }).catch(() => null);
        historico.splice(idx, 1);
        // mantém o idx pra pegar o próximo item que ocupou essa posição (ou o anterior, se era o último)
    }

    // se limpou tudo e não sobrou nada válido
    container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(alvoUser.displayAvatarURL({ extension: 'png', size: 512 }))));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(' Avatar atual (histórico anterior estava indisponível e foi removido)'));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addActionRowComponents(montarSelectUserInfo(alvoUser.id, autorId, 'avatares', expiraEm));
    return rodapeExpiracao(container, expiraEm);
}

async function montarPainelBanners(alvoUser, autorId, indice = 0, expiraEm = 0) {

    const usuarioCompleto = await alvoUser.fetch(true).catch(() => null);
    const bannerHashAtual = usuarioCompleto?.banner ?? null;
    const bannerUrlAtual = bannerHashAtual
        ? `https://cdn.discordapp.com/banners/${alvoUser.id}/${bannerHashAtual}.${bannerHashAtual.startsWith('a_') ? 'gif' : 'png'}?size=1024`
        : null;

    if (bannerHashAtual) {
        await registrarBannerSeNecessario(alvoUser.id, bannerUrlAtual, bannerHashAtual);
    }

    let historico = await HistoricoBanner.find({ userId: alvoUser.id }).sort({ registradoEm: -1 }).catch(() => []);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Banners usados\n ${alvoUser.username}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    let totalSlots = 1 + historico.length; // 0 = atual real, 1+ = histórico
    let idx = Math.max(0, Math.min(indice, totalSlots - 1));

    // ---- Slot 0: banner atual, sem verificação (vem direto do Discord agora) ----
    if (idx === 0) {
        if (bannerUrlAtual) {
            container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrlAtual)));
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(' Banner atual'));
        } else {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(' Esse usuário não possui um banner no momento.'));
        }
    } else {
        // ---- Slots 1+: histórico -> verifica e autolimpa ----
        let encontrou = false;

        while (historico.length && (idx - 1) < historico.length) {
            const posHistorico = idx - 1;
            const item = historico[posHistorico];

            if (await urlValida(item.bannerUrl)) {
                container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(item.bannerUrl)));
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    ` Registrado em ${formatarDataBR(item.registradoEm)} · ${idx + 1}/${totalSlots}`
                ));
                encontrou = true;
                break;
            }

            // morta -> apaga do banco e do array em memória, ajusta totalSlots e tenta a próxima posição
            await HistoricoBanner.deleteOne({ _id: item._id }).catch(() => null);
            historico.splice(posHistorico, 1);
            totalSlots = 1 + historico.length;
            idx = Math.max(0, Math.min(idx, totalSlots - 1));

            // se depois de ajustar caiu no slot 0, sai do while e deixa o bloco de baixo tratar
            if (idx === 0) break;
        }

        if (!encontrou && idx === 0) {
            // caiu de volta pro banner atual depois de limpar tudo
            if (bannerUrlAtual) {
                container.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(bannerUrlAtual)));
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(' Banner atual'));
            } else {
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(' Esse usuário não possui um banner no momento.'));
            }
        } else if (!encontrou) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(' Nenhum banner disponível no histórico.'));
        }
    }

    if (totalSlots > 1) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`userinfo_banner_${alvoUser.id}_${autorId}_${idx - 1}_${expiraEm}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(idx <= 0),
                new ButtonBuilder().setCustomId(`userinfo_banner_${alvoUser.id}_${autorId}_${idx + 1}_${expiraEm}`).setLabel('Próximo').setStyle(ButtonStyle.Secondary).setDisabled(idx >= totalSlots - 1)
            )
        );
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addActionRowComponents(montarSelectUserInfo(alvoUser.id, autorId, 'banners', expiraEm));
    return rodapeExpiracao(container, expiraEm);
}

// ============ COMANDO HELP ============

const HELP_POR_PAGINA = 6;

const COMANDOS_SLASH = [
    { cmd: '/ban', desc: 'Bane usuários do servidor', categoria: 'Moderação' },
    { cmd: '/unban', desc: 'Retira o banimento de usuários', categoria: 'Moderação' },
    { cmd: '/kick', desc: 'Expulsa usuários do servidor', categoria: 'Moderação' },
    { cmd: '/mute', desc: 'Silencia usuários temporariamente', categoria: 'Moderação' },
    { cmd: '/unmute', desc: 'Remove o silenciamento de usuários', categoria: 'Moderação' },
    { cmd: '/limpar', desc: 'Apaga mensagens do canal', categoria: 'Moderação' },
    { cmd: '/msg', desc: 'Envia mensagens personalizadas em um canal', categoria: 'Utilidades' },
    { cmd: '/addemoji', desc: 'Adiciona um emoji ao servidor', categoria: 'Administração' },
    { cmd: '/pd', desc: 'Painel de Primeira Dama', categoria: 'Diversão' },
    { cmd: '/beijar', desc: 'Beija um usuário', categoria: 'Diversão' },
    { cmd: '/sorteio', desc: 'Cria e gerencia sorteios do servidor', categoria: 'Utilidades' },
    { cmd: '/carteira', desc: 'Mostra sua carteira de moedas', categoria: 'Economia' },
    { cmd: '/pix', desc: 'Transfere moedas', categoria: 'Economia' },
    { cmd: '/convite', desc: 'Mostra estatísticas de convites de um usuário', categoria: 'Utilidades' },
    { cmd: '/afk', desc: 'Marca você como ausente', categoria: 'Utilidades' },
    { cmd: '/botcall', desc: 'Envia o painel de controle da call do bot', categoria: 'Utilidades' },
    { cmd: '/avatar', desc: 'Mostra o avatar de um usuário', categoria: 'Utilidades' },
    { cmd: '/ui', desc: 'Mostra informações detalhadas de um usuário', categoria: 'Utilidades' },
    { cmd: '/help', desc: 'Lista de comandos', categoria: 'Ajuda' }
];

const COMANDOS_PREFIXO = [
    { cmd: `${PREFIXO}regras`, desc: 'Painel de regras', categoria: 'Administração' },
    { cmd: `${PREFIXO}tickets`, desc: 'Painel de atendimento', categoria: 'Administração' },
    { cmd: `${PREFIXO}painelcall`, desc: 'Painel de calls temporárias', categoria: 'Utilidades' },
    { cmd: `${PREFIXO}tellonym`, desc: 'Painel tellonym', categoria: 'Diversão' },
    { cmd: `${PREFIXO}loja`, desc: 'Painel da loja de cargos e convertor', categoria: 'Economia' },
    { cmd: `${PREFIXO}botcall`, desc: 'Envia o painel de controle da call do bot', categoria: 'Utilidades' },
    { cmd: `${PREFIXO}moedastp`, desc: 'Painel de controle do evento de moedas', categoria: 'Economia' },
    { cmd: `${PREFIXO}xpeditar`, desc: 'Edita XP de um usuário', categoria: 'Administração' },
    { cmd: `${PREFIXO}moedaseditar`, desc: 'Edita moedas de um usuário', categoria: 'Economia' },
    { cmd: `${PREFIXO}addcargo`, desc: 'Adiciona um cargo a um usuário', categoria: 'Administração' },
    { cmd: `${PREFIXO}remcargo`, desc: 'Remove um cargo de um usuário', categoria: 'Administração' },
    { cmd: `${PREFIXO}groles`, desc: 'Gerencia os cargos de um usuário (adicionar/remover pelo painel)', categoria: 'Administração' },
    { cmd: `${PREFIXO}roleall`, desc: 'Aplica um cargo em massa para todos os membros', categoria: 'Administração' },
    { cmd: `${PREFIXO}nuke`, desc: 'Reseta o canal', categoria: 'Moderação' },
    { cmd: `${PREFIXO}painelps`, desc: 'Painel de proteção do servidor', categoria: 'Moderação' },
    { cmd: `${PREFIXO}ban`, desc: 'Bane um usuário com confirmação', categoria: 'Moderação' },
    { cmd: `${PREFIXO}unban`, desc: 'Desbane um usuário pelo ID com confirmação', categoria: 'Moderação' },
    { cmd: `${PREFIXO}painelurl`, desc: 'Painel de verificação de link na bio', categoria: 'Administração' },
    { cmd: `${PREFIXO}info`, desc: 'Painel de hierarquia de cargos', categoria: 'Utilidades' },
    { cmd: `${PREFIXO}userinfo`, desc: 'Mostra informações detalhadas de um usuário', categoria: 'Utilidades' },
    { cmd: `${PREFIXO}tiktok`, desc: 'Baixa vídeos do TikTok sem marca d\'água', categoria: 'Diversão' },
    { cmd: 'cl', desc: 'Apaga mensagens do autor do comando', categoria: 'Moderação' },
    { cmd: `${PREFIXO}limpar`, desc: 'Apaga mensagens do canal', categoria: 'Moderação' }
];

const CATEGORIAS_HELP = {
    slash: { label: 'Comandos Slash', lista: COMANDOS_SLASH },
    prefixo: { label: 'Comandos com Prefixo', lista: COMANDOS_PREFIXO }
};

const INFO_COMANDOS = {
    '/ban': { descricao: 'Bane um usuário do servidor, removendo seu acesso permanentemente. Pode apagar mensagens recentes dele e pede confirmação antes de executar.', comoUsar: '/ban usuario:@usuário motivo:[opcional] dias_mensagens:[opcional]', exemplo: '/ban usuario:@Fulano motivo:Spam dias_mensagens:1', permissao: 'Banir Membros' },
    '/unban': { descricao: 'Remove o banimento de um usuário, permitindo que ele volte a entrar no servidor.', comoUsar: '/unban usuario_id:<ID> motivo:[opcional]', exemplo: '/unban usuario_id:123456789012345678', permissao: 'Banir Membros' },
    '/kick': { descricao: 'Expulsa um usuário do servidor. Diferente do ban, ele pode entrar novamente pelo convite.', comoUsar: '/kick usuario:@usuário motivo:[opcional]', exemplo: '/kick usuario:@Fulano motivo:Comportamento tóxico', permissao: 'Expulsar Membros' },
    '/mute': { descricao: 'Aplica um timeout no usuário, impedindo-o de enviar mensagens ou falar em call durante o tempo definido.', comoUsar: '/mute usuario:@usuário duracao:<minutos> motivo:[opcional]', exemplo: '/mute usuario:@Fulano duracao:60 motivo:Flood', permissao: 'Silenciar Membros' },
    '/unmute': { descricao: 'Remove o timeout de um usuário antes do tempo original acabar.', comoUsar: '/unmute usuario:@usuário motivo:[opcional]', exemplo: '/unmute usuario:@Fulano', permissao: 'Silenciar Membros' },
    '/limpar': { descricao: 'Apaga uma quantidade de mensagens do canal atual, mostrando o progresso em tempo real.', comoUsar: '/limpar quantidade:<número de 1 a 300>', exemplo: '/limpar quantidade:50', permissao: 'Gerenciar Mensagens' },
    '/msg': { descricao: 'Abre um painel interativo pra montar uma mensagem personalizada (com texto, imagem e botões) e enviá-la em qualquer canal de texto do servidor.', comoUsar: '/msg', exemplo: '/msg', permissao: 'Equipe' },
    '/addemoji': { descricao: 'Adiciona um emoji de outro servidor ao seu, colando o emoji ou apenas o ID numérico dele.', comoUsar: '/addemoji emoji:<emoji ou ID> nome:[opcional]', exemplo: '/addemoji emoji:<:exemplo:123456789012345678>', permissao: 'Administrador ou Equipe' },
    '/pd': { descricao: 'Abre o painel pra escolher e gerenciar suas Primeiras Damas no servidor, com limite configurado.', comoUsar: '/pd', exemplo: '/pd', permissao: 'Cargo específico' },
    '/sorteio': { descricao: 'Abre o painel de criação e gerenciamento de sorteios, permitindo configurar prêmio, duração, requisitos e canal de destino.', comoUsar: '/sorteio', exemplo: '/sorteio', permissao: 'Equipe' },
    '/carteira': { descricao: 'Mostra o saldo de moedas e a contagem de mensagens de você ou de outro usuário.', comoUsar: '/carteira usuario:[opcional]', exemplo: '/carteira usuario:@Fulano', permissao: 'Nenhuma' },
    '/pix': { descricao: 'Transfere uma quantidade de moedas do seu saldo diretamente para outro usuário.', comoUsar: '/pix usuario:@usuário quantidade:<número>', exemplo: '/pix usuario:@Fulano quantidade:100', permissao: 'Nenhuma' },
    '/convite': { descricao: 'Mostra quantos convites válidos, reais, fake e bônus um usuário possui no servidor.', comoUsar: '/convite usuario:[opcional]', exemplo: '/convite usuario:@Fulano', permissao: 'Nenhuma' },
    '/afk': { descricao: 'Marca você como ausente com um motivo opcional. O status é removido automaticamente assim que você enviar outra mensagem.', comoUsar: '/afk motivo:[opcional]', exemplo: '/afk motivo:Estudando', permissao: 'Nenhuma' },
    '/botcall': { descricao: 'Envia o painel de controle da call fixa do bot, permitindo conectar, trocar ou desconectar de um canal de voz.', comoUsar: '/botcall', exemplo: '/botcall', permissao: 'Equipe' },
    '/avatar': { descricao: 'Mostra o avatar em alta resolução de você ou de outro usuário, com link direto pra abrir no navegador.', comoUsar: '/avatar usuario:[opcional]', exemplo: '/avatar usuario:@Fulano', permissao: 'Nenhuma' },
    '/help': { descricao: 'Mostra a lista completa de comandos disponíveis, separados entre slash e prefixo.', comoUsar: '/help', exemplo: '/help', permissao: 'Nenhuma' },
    '/beijar': { descricao: 'Beija um usuário do servidor. Beijos consecutivos entre a mesma dupla acumulam um streak e ambos ganham XP.', comoUsar: '/beijar usuario:@usuário', exemplo: '/beijar usuario:@Fulano', permissao: 'Nenhuma' },
    '/ui': { descricao: 'Mostra informações detalhadas de você ou de outro usuário: bio, conexões, cargos, emblemas, histórico de nomes/avatares/banners.', comoUsar: '/ui usuario:[opcional]', exemplo: '/ui usuario:@Fulano', permissao: 'Nenhuma' },

    [`${PREFIXO}ban`]: { descricao: 'Bane um usuário mencionado do servidor, com uma etapa de confirmação antes de executar.', comoUsar: `${PREFIXO}ban @usuário [motivo]`, exemplo: `${PREFIXO}ban @Fulano Spam`, permissao: 'Banir Membros ou Equipe' },
    [`${PREFIXO}unban`]: { descricao: 'Remove o banimento de um usuário pelo ID, com uma etapa de confirmação antes de executar.', comoUsar: `${PREFIXO}unban <id> [motivo]`, exemplo: `${PREFIXO}unban 123456789012345678`, permissao: 'Banir Membros ou Equipe' },
    [`${PREFIXO}painelurl`]: { descricao: 'Envia um painel para o usuário verificar se colocou o link do servidor na bio ou nos pronomes, e recebe um cargo automaticamente se encontrado.', comoUsar: `${PREFIXO}painelurl`, exemplo: `${PREFIXO}painelurl`, permissao: 'Equipe' },
    [`${PREFIXO}info`]: { descricao: 'Envia o painel de hierarquia de cargos, permitindo consultar quem possui cada cargo do servidor.', comoUsar: `${PREFIXO}info`, exemplo: `${PREFIXO}info`, permissao: 'Nenhuma' },
    [`${PREFIXO}userinfo`]: { descricao: 'Mostra informações detalhadas de você ou de um usuário mencionado: bio, conexões, cargos, emblemas e históricos. Painel expira em 7 minutos.', comoUsar: `${PREFIXO}userinfo [@usuário]`, exemplo: `${PREFIXO}userinfo @Fulano`, permissao: 'Nenhuma' },
    [`${PREFIXO}tiktok`]: { descricao: 'Baixa e envia um vídeo do TikTok sem marca d\'água a partir do link enviado.', comoUsar: `${PREFIXO}tiktok <link do tiktok>`, exemplo: `${PREFIXO}tiktok https://www.tiktok.com/@usuario/video/123`, permissao: 'Nenhuma' },
    [`${PREFIXO}regras`]: { descricao: 'Envia o painel de regras do servidor no canal atual.', comoUsar: `${PREFIXO}regras`, exemplo: `${PREFIXO}regras`, permissao: 'Equipe' },
    [`${PREFIXO}tickets`]: { descricao: 'Envia o painel de abertura de atendimento (tickets) no canal atual.', comoUsar: `${PREFIXO}tickets`, exemplo: `${PREFIXO}tickets`, permissao: 'Equipe' },
    [`${PREFIXO}painelcall`]: { descricao: 'Envia o painel de gerenciamento das calls temporárias (privar, expulsar, banir, renomear etc).', comoUsar: `${PREFIXO}painelcall`, exemplo: `${PREFIXO}painelcall`, permissao: 'Equipe' },
    [`${PREFIXO}tellonym`]: { descricao: 'Envia o painel de envio de Tellonym (mensagens anônimas ou públicas).', comoUsar: `${PREFIXO}tellonym`, exemplo: `${PREFIXO}tellonym`, permissao: 'Equipe' },
    [`${PREFIXO}loja`]: { descricao: 'Envia o painel da loja de cargos, com opções de ver carteira e converter mensagens em moedas.', comoUsar: `${PREFIXO}loja`, exemplo: `${PREFIXO}loja`, permissao: 'Equipe' },
    [`${PREFIXO}botcall`]: { descricao: 'Envia o painel de controle da call fixa do bot no canal atual.', comoUsar: `${PREFIXO}botcall`, exemplo: `${PREFIXO}botcall`, permissao: 'Equipe' },
    [`${PREFIXO}moedastp`]: { descricao: 'Envia o painel que liga ou desliga o evento automático de moedas no canal configurado.', comoUsar: `${PREFIXO}moedastp`, exemplo: `${PREFIXO}moedastp`, permissao: 'Equipe' },
    [`${PREFIXO}xpeditar`]: { descricao: 'Adiciona ou remove uma quantidade de XP de um usuário, recalculando nível automaticamente.', comoUsar: `${PREFIXO}xpeditar <adicionar|remover> @usuário <quantidade>`, exemplo: `${PREFIXO}xpeditar adicionar @Fulano 500`, permissao: 'Equipe' },
    [`${PREFIXO}moedaseditar`]: { descricao: 'Adiciona ou remove uma quantidade de moedas do saldo de um usuário específico.', comoUsar: `${PREFIXO}moedaseditar <adicionar|remover> @usuário <quantidade>`, exemplo: `${PREFIXO}moedaseditar adicionar @Fulano 500`, permissao: 'Equipe' },
    [`${PREFIXO}addcargo`]: { descricao: 'Adiciona um cargo específico a um usuário do servidor.', comoUsar: `${PREFIXO}addcargo @cargo @usuário`, exemplo: `${PREFIXO}addcargo @Membro @Fulano`, permissao: 'Administrador ou Equipe' },
    [`${PREFIXO}remcargo`]: { descricao: 'Remove um cargo específico de um usuário do servidor.', comoUsar: `${PREFIXO}remcargo @cargo @usuário`, exemplo: `${PREFIXO}remcargo @Membro @Fulano`, permissao: 'Administrador ou Equipe' },
    [`${PREFIXO}groles`]: { descricao: 'Abre um painel para adicionar ou remover cargos de um usuário (ou de você mesmo), com busca, filtros e opção de criar/excluir cargos do servidor.', comoUsar: `${PREFIXO}groles [@usuário]`, exemplo: `${PREFIXO}groles @Fulano`, permissao: 'Cargo de atendente (Administrador/Equipe para criar ou excluir cargos)' },
    [`${PREFIXO}roleall`]: { descricao: 'Abre um painel efêmero pra aplicar um cargo escolhido em todos os membros do servidor de uma vez, mostrando o progresso em tempo real.', comoUsar: `${PREFIXO}roleall`, exemplo: `${PREFIXO}roleall`, permissao: 'Administrador ou Equipe' },
    [`${PREFIXO}nuke`]: { descricao: 'Apaga o canal e cria uma cópia idêntica — limpa o histórico inteiro sem perder permissões.', comoUsar: `${PREFIXO}nuke`, exemplo: `${PREFIXO}nuke`, permissao: 'Equipe' },
    [`${PREFIXO}painelps`]: { descricao: 'Envia o painel de proteção do servidor, com Anti-Spam, Anti-Link e Anti-Conta Nova configuráveis.', comoUsar: `${PREFIXO}painelps`, exemplo: `${PREFIXO}painelps`, permissao: 'Administrador ou Equipe' },
    'cl': { descricao: 'Apaga rapidamente as últimas mensagens enviadas por você mesmo no canal atual.', comoUsar: 'cl', exemplo: 'cl', permissao: 'Cargo de Limpar, Booster ou Equipe' },
    [`${PREFIXO}clear`]: { descricao: 'Apaga uma quantidade de mensagens do canal atual, mostrando o progresso em tempo real.', comoUsar: `${PREFIXO}clear <quantidade de 1 a 300>`, exemplo: `${PREFIXO}clear 50`, permissao: 'Gerenciar Mensagens ou cargo de Limpar' }
};

function montarPainelHelp(categoria = 'slash', pagina = 0) {
    const catInfo = CATEGORIAS_HELP[categoria] || CATEGORIAS_HELP.slash;
    const lista = catInfo.lista;
    const totalPaginas = Math.max(1, Math.ceil(lista.length / HELP_POR_PAGINA));
    const paginaAtual = Math.max(0, Math.min(pagina, totalPaginas - 1));

    const inicio = paginaAtual * HELP_POR_PAGINA;
    const itens = lista.slice(inicio, inicio + HELP_POR_PAGINA);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${catInfo.label}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    itens.forEach((c, idxLocal) => {
        const indiceGlobal = inicio + idxLocal;
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `${c.cmd}\n **${c.desc}**`
        ));
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`help_info_${categoria}_${indiceGlobal}`)
                    .setLabel('Detalhes')
                    .setStyle(ButtonStyle.Secondary)
            )
        );
    });

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('help_categoria_select')
                .setPlaceholder('Selecione a categoria de comandos')
                .addOptions(
                    { label: 'Comandos Slash', value: 'slash', default: categoria === 'slash' },
                    { label: 'Comandos com Prefixo', value: 'prefixo', default: categoria === 'prefixo' }
                )
        )
    );

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`help_pagina_${categoria}_${paginaAtual - 1}`)
                .setEmoji('1522620641168330853')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(paginaAtual === 0),
            new ButtonBuilder()
                .setCustomId('help_pagina_atual')
                .setLabel(`${paginaAtual + 1}/${totalPaginas}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`help_pagina_${categoria}_${paginaAtual + 1}`)
                .setEmoji('1522620603616596148')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(paginaAtual >= totalPaginas - 1)
        )
    );

    return container;
}

function montarPainelInstaInfo(postData, aba = 'curtidas') {
    const listaCurtidas = postData.curtidas.map(id => `<@${id}>`).join('\n') || 'Nenhuma curtida ainda.';
    const listaComentarios = postData.comentarios.map(c => `<@${c.id}>: ${c.texto}`).join('\n') || 'Nenhum comentário ainda.';

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Informações do post'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            aba === 'curtidas'
                ? `**Curtidas (${postData.curtidas.length})**\n${listaCurtidas}`
                : `**Comentários (${postData.comentarios.length})**\n${listaComentarios}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`insta_info_aba_curtidas_${postData.messageId}`)
                    .setLabel('Curtidas')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(aba === 'curtidas'),
                new ButtonBuilder()
                    .setCustomId(`insta_info_aba_comentarios_${postData.messageId}`)
                    .setLabel('Comentários')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(aba === 'comentarios')
            )
        );
}


function montarBotoesInsta(postData) {
    const botaoInsta = postData.instagramUser
        ? new ButtonBuilder()
            .setEmoji(EMOJI_INSTA_PERFIL)
            .setStyle(ButtonStyle.Link)
            .setURL(`https://instagram.com/${postData.instagramUser}`)
        : new ButtonBuilder()
            .setCustomId('insta_perfil')
            .setEmoji(EMOJI_INSTA_PERFIL)
            .setStyle(ButtonStyle.Secondary);

    const botoes = [
        new ButtonBuilder().setCustomId('insta_curtir').setEmoji(EMOJI_CURTIR).setLabel(`${postData.curtidas.length}`).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('insta_comentar').setEmoji(EMOJI_COMENTAR).setLabel(`${postData.comentarios.length}`).setStyle(ButtonStyle.Secondary),
        botaoInsta,
        new ButtonBuilder().setCustomId('insta_info').setEmoji(EMOJI_INFO).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('insta_lixeira').setEmoji(EMOJI_LIXEIRA).setStyle(ButtonStyle.Secondary)
    ];

    return new ActionRowBuilder().addComponents(botoes);
}

async function editarWebhook(channel, messageId) {
    const webhooks = await channel.fetchWebhooks();
    let webhook = webhooks.find(wh => wh.name === 'Sistema Insta');
    if (!webhook) return;

    const postData = await InstaPost.findOne({ messageId });
    if (!postData) return;

    const novoContainer = new ContainerBuilder()
        .setAccentColor(0xFFFFFF)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(postData.texto || ''))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://post.png')))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(montarBotoesInsta(postData));

    await comRetry(() => webhook.editMessage(messageId, {
        components: [novoContainer],
        flags: [MessageFlags.IsComponentsV2]
    }));
}


const { Options } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildModeration,   
    GatewayIntentBits.GuildWebhooks,    
  ],
  rest: { timeout: 30000, retries: 5 },
  makeCache: Options.cacheWithLimits({
    MessageManager: 50,
    GuildMemberManager: 200,
    UserManager: 200,
    ReactionManager: 0,
    PresenceManager: 0,
    GuildBanManager: 0,
    ThreadManager: 50,
    GuildInviteManager: 100,
  }),
  sweepers: {
    messages: { interval: 300, lifetime: 600 },
    users: {
      interval: 600,
      filter: () => (user) => user.id !== client.user.id
    },
    guildMembers: {
      interval: 900,
      filter: () => (member) => member.id !== client.user.id
    }
  }
});


// ============ COMANDOS SLASH ============

const LISTA_DE_COMANDOS = [
new SlashCommandBuilder()
    .setName('beijar')
    .setDescription('Beija um usuário')
    .addUserOption(o =>
        o.setName('usuario')
            .setDescription('Usuário que você quer beijar')
            .setRequired(true)
    ),
new SlashCommandBuilder()
    .setName('sorteio')
    .setDescription('Abre o painel de gerenciamento de sorteios'),
    new SlashCommandBuilder()
        .setName('msg')
        .setDescription('Cria e envia uma mensagem personalizada em um canal'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mostra a lista de comandos do bot'),
new SlashCommandBuilder()
        .setName('ui')
        .setDescription('Mostra informações detalhadas de um usuário')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário que deseja consultar').setRequired(false)),
];

client.on('channelDelete', async (canal) => {
    if (!protecaoConfig.antiRaid.nukeAtivo || !canal.guild) return;
    const executor = await obterExecutorAuditLog(canal.guild, AuditLogEvent.ChannelDelete, canal.id);
    if (!executor) return;
    const total = registrarAcaoNuke(nukeTracker.canais, executor.id);
    if (total >= limiteNukeAcao(executor, 'limiteCanais')) {
        nukeTracker.canais.delete(executor.id);
        await punirExecutorNuke(canal.guild, executor, `Deletou ${total} canais em menos de ${protecaoConfig.antiRaid.janelaMs / 1000}s`);
    }
});

client.on('roleDelete', async (cargo) => {
    if (!protecaoConfig.antiRaid.nukeAtivo) return;
    const executor = await obterExecutorAuditLog(cargo.guild, AuditLogEvent.RoleDelete, cargo.id);
    if (!executor) return;
    const total = registrarAcaoNuke(nukeTracker.cargos, executor.id);
    if (total >= limiteNukeAcao(executor, 'limiteCargos')) {
        nukeTracker.cargos.delete(executor.id);
        await punirExecutorNuke(cargo.guild, executor, `Deletou ${total} cargos em menos de ${protecaoConfig.antiRaid.janelaMs / 1000}s`);
    }
});

client.on('guildBanAdd', async (ban) => {
    const entries = await buscarAuditLogsComCache(ban.guild, AuditLogEvent.MemberBanAdd);
    const entrada = entries.find(e => (Date.now() - e.createdTimestamp) < 15000 && e.target?.id === ban.user.id);
    const executor = entrada?.executor ?? null;

    if (protecaoConfig.antiRaid.nukeAtivo && executor) {
        const total = registrarAcaoNuke(nukeTracker.bans, executor.id);
        if (total >= limiteNukeAcao(executor, 'limiteBans')) {
            nukeTracker.bans.delete(executor.id);
            await punirExecutorNuke(ban.guild, executor, `Baniu ${total} membros em menos de ${protecaoConfig.antiRaid.janelaMs / 1000}s`);
        }
    }

    // Loga apenas bans feitos manualmente (fora dos comandos do bot)
    if (executor && executor.id !== client.user.id) {
        await logarBanimento({
            guild: ban.guild,
            tipo: 'Banimento (Manual)',
            alvo: `${ban.user} (${ban.user.tag})`,
            alvoUser: ban.user,
            autor: executor,
            motivo: entrada?.reason || null
        }).catch(err => console.error('--- Erro ao logar ban manual ---', err));
    }
});

client.on('guildBanRemove', async (ban) => {
    const entries = await buscarAuditLogsComCache(ban.guild, AuditLogEvent.MemberBanRemove);
    const entrada = entries.find(e => (Date.now() - e.createdTimestamp) < 15000 && e.target?.id === ban.user.id);
    const executor = entrada?.executor ?? null;

    // Loga apenas unbans feitos manualmente (fora dos comandos do bot)
    if (executor && executor.id !== client.user.id) {
        await logarBanimento({
            guild: ban.guild,
            tipo: 'Unban (Manual)',
            alvo: `${ban.user.tag} (${ban.user.id})`,
            alvoUser: ban.user,
            autor: executor,
            motivo: entrada?.reason || null
        }).catch(err => console.error('--- Erro ao logar unban manual ---', err));
    }
});

client.on('webhooksUpdate', async (canal) => {
    if (!protecaoConfig.antiRaid.nukeAtivo) return;
    const guild = canal.guild;

    try {
        const [entriesCriacao, entriesDelecao] = await Promise.all([
            buscarAuditLogsComCache(guild, AuditLogEvent.WebhookCreate),
            buscarAuditLogsComCache(guild, AuditLogEvent.WebhookDelete)
        ]);

        const recentes = [...entriesCriacao, ...entriesDelecao]
            .filter(e => (Date.now() - e.createdTimestamp) < 15000);

        for (const entrada of recentes) {
            const executor = entrada.executor;
            if (!executor) continue;
            const total = registrarAcaoNuke(nukeTracker.webhooks, executor.id);
            if (total >= limiteNukeAcao(executor, 'limiteWebhooks')) {
                nukeTracker.webhooks.delete(executor.id);
                await punirExecutorNuke(guild, executor, `Criou/deletou ${total} webhooks em menos de ${protecaoConfig.antiRaid.janelaMs / 1000}s`);
            }
        }
    } catch (err) {
        console.error('--- Erro ao verificar webhooks no Anti-Nuke ---', err);
    }
});

// ============ PROTEÇÃO DE CARGOS (embutida no Anti-Nuke) ============
client.on('roleCreate', async (cargo) => {
    if (!protecaoConfig.antiRaid.nukeAtivo) return;
    const executor = await obterExecutorAuditLog(cargo.guild, AuditLogEvent.RoleCreate, cargo.id);
    if (!executor) return;
    const total = registrarAcaoNuke(nukeTracker.cargosCriados, executor.id);
    if (total >= limiteNukeAcaoExtra(executor, 'cargosCriados')) {
        nukeTracker.cargosCriados.delete(executor.id);
        await punirExecutorNuke(cargo.guild, executor, `Criou ${total} cargos em menos de ${protecaoConfig.antiRaid.janelaMs / 1000}s`);
    }
});

client.on('roleUpdate', async (cargoAntigo, cargoNovo) => {
    if (!protecaoConfig.antiRaid.nukeAtivo) return;

    const mudouPermissoes = !cargoAntigo.permissions.equals(cargoNovo.permissions);
    const mudouNome = cargoAntigo.name !== cargoNovo.name;
    const mudouCor = cargoAntigo.color !== cargoNovo.color;
    if (!mudouPermissoes && !mudouNome && !mudouCor) return;

    const executor = await obterExecutorAuditLog(cargoNovo.guild, AuditLogEvent.RoleUpdate, cargoNovo.id);
    if (!executor) return;

    const total = registrarAcaoNuke(nukeTracker.cargosEditados, executor.id);
    if (total >= limiteNukeAcaoExtra(executor, 'cargosEditados')) {
        nukeTracker.cargosEditados.delete(executor.id);
        await punirExecutorNuke(cargoNovo.guild, executor, `Editou ${total} cargos (permissões/nome/cor) em menos de ${protecaoConfig.antiRaid.janelaMs / 1000}s`);
    }
});

// ============ PROTEÇÃO DE CANAIS (embutida no Anti-Nuke) ============
client.on('channelCreate', async (canal) => {
    if (!protecaoConfig.antiRaid.nukeAtivo || !canal.guild) return;
    const executor = await obterExecutorAuditLog(canal.guild, AuditLogEvent.ChannelCreate, canal.id);
    if (!executor) return;
    const total = registrarAcaoNuke(nukeTracker.canaisCriados, executor.id);
    if (total >= limiteNukeAcaoExtra(executor, 'canaisCriados')) {
        nukeTracker.canaisCriados.delete(executor.id);
        await punirExecutorNuke(canal.guild, executor, `Criou ${total} canais em menos de ${protecaoConfig.antiRaid.janelaMs / 1000}s`);
    }
});

client.on('channelUpdate', async (canalAntigo, canalNovo) => {
    if (!protecaoConfig.antiRaid.nukeAtivo || !canalNovo.guild) return;

    const overwriteAntigo = canalAntigo.permissionOverwrites?.cache?.get(canalNovo.guild.id);
    const overwriteNovo = canalNovo.permissionOverwrites?.cache?.get(canalNovo.guild.id);
    const mudouPermissaoEveryone =
        (overwriteAntigo?.allow?.bitfield ?? 0n) !== (overwriteNovo?.allow?.bitfield ?? 0n) ||
        (overwriteAntigo?.deny?.bitfield ?? 0n) !== (overwriteNovo?.deny?.bitfield ?? 0n);
    const mudouCategoria = canalAntigo.parentId !== canalNovo.parentId;

    if (!mudouPermissaoEveryone && !mudouCategoria) return;

    const executor = await obterExecutorAuditLog(canalNovo.guild, AuditLogEvent.ChannelUpdate, canalNovo.id);
    if (!executor) return;

    const total = registrarAcaoNuke(nukeTracker.canaisEditados, executor.id);
    if (total >= limiteNukeAcaoExtra(executor, 'canaisEditados')) {
        nukeTracker.canaisEditados.delete(executor.id);
        await punirExecutorNuke(canalNovo.guild, executor, `Alterou permissões/categoria de ${total} canais em menos de ${protecaoConfig.antiRaid.janelaMs / 1000}s`);
    }
});

// ============ DEBUG DE CONEXÃO (temporário até achar a causa) ============
client.on('error', (err) => {
    console.error('[GATEWAY ERROR]', err);
});

client.on('warn', (info) => {
    console.warn('[GATEWAY WARN]', info);
});

client.on('shardError', (error, shardId) => {
    console.error(`[SHARD ${shardId} ERROR]`, error);
});

client.on('shardDisconnect', (event, shardId) => {
    console.error(`[SHARD ${shardId} DISCONNECT]`, event.code, event.reason);
});

client.on('shardReconnecting', (shardId) => {
    console.warn(`[SHARD ${shardId} RECONNECTING]`);
});

client.on('shardResume', (shardId, replayedEvents) => {
    console.log(`[SHARD ${shardId} RESUMED]`, replayedEvents, 'eventos reenviados');
});

client.on('invalidated', () => {
    console.error('[SESSÃO INVALIDADA] O client foi desconectado e precisa logar de novo.');
});

// Log de memória a cada 5 min pra ver se tá vazando RAM (não temos Metrics no plano free)
setInterval(() => {
    const mem = process.memoryUsage();
    console.log(`[MEMÓRIA] RSS: ${(mem.rss / 1024 / 1024).toFixed(1)}MB | Heap: ${(mem.heapUsed / 1024 / 1024).toFixed(1)}/${(mem.heapTotal / 1024 / 1024).toFixed(1)}MB`);
}, 5 * 60 * 1000);

// Log de ping do gateway a cada 5 min
setInterval(() => {
    console.log(`[PING] Latência do gateway: ${client.ws.ping}ms`);
}, 5 * 60 * 1000);

    client.once('clientReady', async () => {
    console.log(`Logado como ${client.user.tag}!`);
    client.user.setActivity(`Prefixo: ${PREFIXO}`, { type: ActivityType.Streaming, url: 'https://twitch.tv/discord' });

    
carregarTellonymPendentes();
    await carregarProtecao();
    await paineisProtecao.carregar();
    await carregarTickets();
    await respostasBotoesMsg.carregar();
    await canaisLockDB.carregar();
    
    try {
    const mutesPendentes = await MuteCargo.find();
    for (const m of mutesPendentes) agendarFimMuteCargo(m.guildId, m.userId, m.expiraEm);
    console.log(`[MuteCargo] ${mutesPendentes.length} mute(s) por cargo reagendado(s).`);
} catch (err) {
    console.error('--- Erro ao carregar mutes por cargo ---', err);
}
    
    try {
    const sorteiosAtivos = await Sorteio.find({ status: 'ativo' });
    for (const s of sorteiosAtivos) agendarEncerramentoSorteio(s._id, s.encerraEm);
    console.log(`[Sorteio] ${sorteiosAtivos.length} sorteio(s) ativo(s) reagendado(s).`);
} catch (err) {
    console.error('--- Erro ao carregar sorteios ativos ---', err);
}

for (const guild of client.guilds.cache.values()) {
    try {
        const invites = await guild.invites.fetch();
        invitesCache.set(guild.id, new Map(invites.map(inv => [inv.code, inv.uses])));
    } catch (err) {
        console.error(`--- Erro ao cachear convites de ${guild.name} ---`, err);
    }
}
inicializarSessoesVoiceSorteio();
setInterval(flushSessoesVoiceSorteio, INTERVALO_TICK_CALL_SORTEIO_MS);
    
    // Garante que o Mongo esteja de fato conectado ANTES de qualquer leitura de dados,
    // já que botcall e voice states dependem 100% do banco agora.
    const mongoOk = await mongoConectado;
    if (!mongoOk) {
        console.error('[BotCall] Mongo não conectou a tempo — reconexão de call e painéis NÃO serão carregados.');
    } else {
        console.log('[BotCall] Mongo confirmado, iniciando carregamento de painéis e reconexão de voice...');

        await carregarBotCallPaineis();
        console.log(`[BotCall] ${botCallPaineis.size} painel(is) em memória após carregamento.`);

        await reconectarVoiceStates();

        for (const guildId of botCallPaineis.keys()) {
            await atualizarPainelBotCallAuto(guildId);
        }
    }
    
    await carregarConfigMoedas();
    await verificarEventoMoedasAntigo();
    setInterval(enviarEventoMoedas, 7 * 60 * 1000);

    verificarCargosLojaExpirados();
    setInterval(verificarCargosLojaExpirados, INTERVALO_CHECAGEM_CARGOS_LOJA_MS);
    
    setInterval(limparInvitesCacheDesatualizado, INTERVALO_LIMPEZA_INVITES_MS);
   
setInterval(flushBufferMensagens, 30 * 1000);
    setInterval(limparNukeTrackerAntigo, 5 * 60 * 1000);

    client.application.commands.set([
    ...LISTA_DE_COMANDOS,
    ...[...comandos.values()].map(c => c.data)
]).then(cmds => {
    console.log(`[Comandos Globais] ${cmds.size} registrado(s):`, cmds.map(c => c.name).join(', '));
}).catch(err => console.error('--- Erro ao registrar comandos globais ---', err));
});

client.on('inviteCreate', invite => {
    const cache = invitesCache.get(invite.guild.id) || new Map();
    cache.set(invite.code, invite.uses || 0);
    invitesCache.set(invite.guild.id, cache);
});

client.on('inviteDelete', invite => {
    const cache = invitesCache.get(invite.guild.id);
    if (cache) cache.delete(invite.code);
});

client.on('guildMemberRemove', async (member) => {
    const tempoNoServidor = member.joinedTimestamp ? formatarDuracaoMs(Date.now() - member.joinedTimestamp) : 'desconhecido';
    await logarMembro({
        guild: member.guild,
        tipo: 'Saída',
        membro: member.user,
        extra: `**Estava no servidor há:** \`${tempoNoServidor}\``
    }).catch(() => null);

    // ============ EXPULSÃO — LOG + ANTI KICK EM MASSA (embutido no Anti-Nuke) ============
    const executorKick = await obterExecutorAuditLog(member.guild, AuditLogEvent.MemberKick, member.id);
    if (executorKick) {
        await logarExpulsao({
            guild: member.guild,
            alvo: `${member.user} (${member.user.tag})`,
            alvoUser: member.user,
            autor: executorKick,
            motivo: null
        }).catch(() => null);

        if (protecaoConfig.antiRaid.nukeAtivo) {
            const totalKicks = registrarAcaoNuke(nukeTracker.kicks, executorKick.id);
            if (totalKicks >= limiteNukeAcaoExtra(executorKick, 'kicks')) {
                nukeTracker.kicks.delete(executorKick.id);
                await punirExecutorNuke(member.guild, executorKick, `Expulsou ${totalKicks} membros em menos de ${protecaoConfig.antiRaid.janelaMs / 1000}s`);
            }
        }
    }

    try {
        const registro = await ConviteMembro.findOne({ guildId: member.guild.id, membroId: member.id });
        
        if (registro) {
            if (registro.tipo === 'real') {
                await incrementarConviteStats(member.guild.id, registro.inviterId, 'reais', -1);
                await incrementarConviteStats(member.guild.id, registro.inviterId, 'saiu', 1);
            }
            await ConviteMembro.deleteOne({ _id: registro._id }).catch(() => null);
        }
    } catch (err) {
        console.error('--- Erro ao processar saída para stats de convite ---', err);
    }

    try {
        await Carteira.deleteOne({ userId: member.id });
        await Mensagens.deleteOne({ userId: member.id });
        await XP.deleteOne({ userId: member.id });
        console.log(`[Saída] Moedas, mensagens e XP de ${member.id} foram apagados (saiu do servidor).`);
    } catch (err) {
        console.error('--- Erro ao apagar dados de usuário que saiu ---', err);
    }
});

client.on('userUpdate', async (oldUser, newUser) => {
    try {
        if (oldUser.username !== newUser.username) {
            await registrarUsernameSeNecessario(newUser.id, newUser.username);
        }
        if (oldUser.avatar !== newUser.avatar) {
            const avatarUrl = newUser.displayAvatarURL({ extension: 'png', size: 512 });
            await registrarAvatarSeNecessario(newUser.id, avatarUrl, newUser.avatar);
        }
        if (oldUser.banner !== newUser.banner) {
            const usuarioCompleto = await newUser.fetch(true).catch(() => newUser);
            if (usuarioCompleto.banner) {
                const bannerUrl = usuarioCompleto.bannerURL({ extension: 'png', size: 1024 });
                await registrarBannerSeNecessario(newUser.id, bannerUrl, usuarioCompleto.banner);
            }
        }
    } catch (err) {
        console.error('--- Erro ao processar userUpdate para histórico ---', err);
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    
    if (!oldMember.premiumSince && newMember.premiumSince) {
        for (const cargoId of CARGOS_BOOST) {
            await newMember.roles.add(cargoId).catch(() => null);
        }
    }

    
    if (oldMember.premiumSince && !newMember.premiumSince) {
        for (const cargoId of CARGOS_BOOST) {
            await newMember.roles.remove(cargoId).catch(() => null);
        }
    }
});

client.on('guildMemberAdd', async (member) => {
	// ============ ANTI BOT ============
	if (member.user.bot && protecaoConfig.antiBot.ativo) {
        const acaoBot = protecaoConfig.antiBot.acao;

        try {
            if (acaoBot === 'banir') {
                await member.ban({ reason: 'Anti-Bot: bots não são permitidos neste servidor' }).catch(() => null);
            } else {
                await member.kick('Anti-Bot: bots não são permitidos neste servidor').catch(() => null);
            }
        } catch (err) {
            console.error('--- Erro ao remover bot detectado pelo Anti-Bot ---', err);
        }

        await enviarAlertaProtecao(member.guild, 'BOT DETECTADO', [
            `**Bot:** ${member.user.tag} (${member.id})`,
            `**Ação aplicada:** \`${acaoBot === 'banir' ? 'banido' : 'expulso'}\``
        ], member.user.displayAvatarURL({ extension: 'png', size: 256 }));

        return;
    }
    
    // ============ LOG DE ENTRADA ============
    await logarMembro({
        guild: member.guild,
        tipo: 'Entrada',
        membro: member.user
    }).catch(() => null);

	garantirHistoricoInicial(member.user).catch(() => null);
	
	
	try {
    const invitesAtuais = await member.guild.invites.fetch();
    const cacheAntigo = invitesCache.get(member.guild.id) || new Map();
    const usado = invitesAtuais.find(inv => (cacheAntigo.get(inv.code) || 0) < inv.uses);
    invitesCache.set(member.guild.id, new Map(invitesAtuais.map(inv => [inv.code, inv.uses])));

    if (usado?.inviterId) {
        atualizarProgressoInviteSorteio(member.guild.id, usado.inviterId).catch(() => null);

        const idadeContaDiasConvite = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
        const tipoConvite = idadeContaDiasConvite < IDADE_MINIMA_CONVITE_DIAS ? 'fake' : 'real';

        await ConviteMembro.findOneAndUpdate(
            { guildId: member.guild.id, membroId: member.id },
            { inviterId: usado.inviterId, tipo: tipoConvite },
            { upsert: true }
        ).catch(err => console.error('--- Erro ao salvar registro de convite ---', err));

        await incrementarConviteStats(member.guild.id, usado.inviterId, tipoConvite === 'fake' ? 'fake' : 'reais');
    }
} catch (err) {
    console.error('--- Erro ao identificar convite usado ---', err);
}
	
if (protecaoConfig.antiFake.ativo) {
        const idadeContaMs = Date.now() - member.user.createdTimestamp;
        const idadeContaDias = idadeContaMs / (1000 * 60 * 60 * 24);

        if (idadeContaDias < protecaoConfig.antiFake.diasMinimos) {
            const acao = protecaoConfig.antiFake.acao;

            const titulosDM = { banir: 'VOCÊ FOI BANIDO', kick: 'VOCÊ FOI REMOVIDO', mutar: 'VOCÊ FOI SILENCIADO' };
            const descricoesDM = {
                banir: `Você foi **banido automaticamente** do servidor **${member.guild.name}**.`,
                kick: `Você foi **removido automaticamente** do servidor **${member.guild.name}**.`,
                mutar: `Você foi **silenciado automaticamente por 5 minutos** no servidor **${member.guild.name}**.`
            };

            const containerDM = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(` **${titulosDM[acao] ?? titulosDM.kick}**`))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(descricoesDM[acao] ?? descricoesDM.kick))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Motivo:** Conta muito recente`))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Idade mínima exigida:** \`${protecaoConfig.antiFake.diasMinimos}\` dia(s)`))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Idade da sua conta:** \`${idadeContaDias.toFixed(1)}\` dia(s)`));

            if (acao === 'kick') {
                containerDM.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(' Você pode tentar entrar novamente quando sua conta atingir a idade mínima.'));
            } else if (acao === 'mutar') {
                containerDM.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(' Você já pode continuar navegando pelo servidor normalmente após o tempo de silêncio.'));
            }

            await member.send({
                components: [containerDM],
                flags: [MessageFlags.IsComponentsV2]
            }).catch(() => null);

            if (acao === 'kick') {
                await member.kick('Anti-ContaNova: conta muito recente').catch(() => null);
            } else if (acao === 'banir') {
                await member.ban({ reason: 'Anti-ContaNova: conta muito recente' }).catch(() => null);
            } else if (acao === 'mutar') {
                if (member.moderatable) {
                    await member.timeout(5 * 60 * 1000, 'Anti-ContaNova: conta muito recente').catch(() => null);
                }
            }

          await enviarAlertaProtecao(member.guild, 'CONTA FAKE DETECTADA', [
                `**Usuário:** ${member.user.tag} (${member.id})`,
                `**Idade da conta:** \`${idadeContaDias.toFixed(1)}\` dia(s)`,
                `**Mínimo exigido:** \`${protecaoConfig.antiFake.diasMinimos}\` dia(s)`,
                `**Ação aplicada:** \`${acao}\``
          ], member.user.displayAvatarURL({ extension: 'png', size: 256 }));

            if (acao !== 'mutar') return;
        }
    }
    await member.roles.add(CARGO_AUTOMATICO).catch(err => console.error('--- Erro ao setar cargo automático ---', err));

    const canal = await obterPrimeiroCanalCategoria(CATEGORIA_MOEDAS_BOASVINDAS);
    const canalMoedas = member.guild.channels.cache.get('1542321889404264480');
    const canalTickets = member.guild.channels.cache.get('1542321889404264482');

    await Promise.all([
        canal
            ? canal.send(` **Seja bem-vindo(a) a Onze** <@${member.id}>\n <:21354:1545536854722351104> Veja todas as regras em <#1542321889404264480>`).catch(() => null)
            : Promise.resolve(),
        canalMoedas
            ? canalMoedas.send(`<@${member.id}>`).then(m => m.delete().catch(() => null)).catch(() => null)
            : Promise.resolve(),
        canalTickets
            ? canalTickets.send(`<@${member.id}>`).then(m => m.delete().catch(() => null)).catch(() => null)
            : Promise.resolve()
    ]);

    
    const containerDM = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Seja bem vindo(a)**'))
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('https://i.supaimg.com/001f5659-bb07-44c4-a79d-4338b59c3c1a/7cbd8a2d-f2bd-483c-8e0d-9f6379956c14.jpg')
            )
        );

    await member.send({
        components: [containerDM],
        flags: [MessageFlags.IsComponentsV2]
    }).catch(() => null); // catch pra não quebrar se o usuário tiver DM fechada
});

client.on('voiceStateUpdate', async (oldState, newState) => {

// ============ CANCELA DELEÇÃO DE CALL TEMP SE ALGUÉM ENTRAR DE VOLTA ============
if (newState.channelId && callTempDeleteTimeouts.has(newState.channelId)) {
    clearTimeout(callTempDeleteTimeouts.get(newState.channelId));
    callTempDeleteTimeouts.delete(newState.channelId);
}

if (newState.channelId === CANAL_GERADOR_ID) {
    
    const guild = newState.guild;
    const member = newState.member;

    const callExistenteId = await getCallTemp(member.id);
    if (callExistenteId) {
        const callExistente = guild.channels.cache.get(callExistenteId);
        if (callExistente) {
            await member.voice.setChannel(callExistente).catch(() => null);
            return;
        }
    }

    try {
        const novaCall = await guild.channels.create({
            name: `${member.displayName}`,
            type: ChannelType.GuildVoice,
            parent: newState.channel.parentId,
            permissionOverwrites: [
                { id: guild.id, allow: ['ViewChannel', 'Connect'] },
                { id: member.id, allow: ['ViewChannel', 'Connect', 'ManageChannels'] }
            ]
        });
        await setCallTemp(member.id, novaCall.id);
        await member.voice.setChannel(novaCall).catch(() => null);

        // ============ ENVIA O PAINEL DE CONTROLE NO CHAT DA CALL ============
        const containerPainelCall = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### Painel Call - ${guild.name}`)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`Iae ${member}, você é o dono desta call`)
            )
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('https://i.supaimg.com/001f5659-bb07-44c4-a79d-4338b59c3c1a/1beb5014-901c-4eb7-942c-e23ae7db7696.png')
                )
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('menu_painelcall')
                        .setPlaceholder('Selecione uma opção')
                        .addOptions([
                                 { label: 'Privar call', value: 'call_privada', emoji: { id: '1544877498276388895', name: '20992' } },
                                 { label: 'Abrir call', value: 'call_publica', emoji: { id: '1544877517356400781', name: '20993' } },
                                 { label: 'Banir', value: 'call_banir', emoji: { id: '1544877782977482875', name: '20997' } },
                                 { label: 'Expulsar', value: 'call_expulsar', emoji: { id: '1544883808099106906', name: '21009' } },
                                 { label: 'Alterar limite', value: 'call_limite', emoji: { id: '1544880984686862406', name: '21003' } },
                                 { label: 'Alterar nome', value: 'call_renomear', emoji: { id: '1544884537077534801', name: '21011' } },
                                 { label: 'Alterar status', value: 'call_status', emoji: { id: '1544885393143496704', name: '21016' } },
                                 { label: 'Permitir alguém', value: 'call_permitir', emoji: { id: '1544881580445667469', name: '21005' } }
                        ])
                )
            );

        await novaCall.send({
            components: [containerPainelCall],
            flags: [MessageFlags.IsComponentsV2]
        }).catch(err => console.error('--- Erro ao enviar painel de controle na call criada ---', err));

    } catch (err) {
        console.error('--- Erro ao criar call temp ---', err);
    }
}

    // ============ TRACKING DE CALL PARA SORTEIOS ============
    const membroVoice = newState.member ?? oldState.member;
    if (membroVoice && !membroVoice.user.bot) {
        const guild = newState.guild ?? oldState.guild;
        const antigoCanal = oldState.channelId;
        const novoCanal = newState.channelId;

        const estavaEmCallValida = antigoCanal && antigoCanal !== guild.afkChannelId;
        const estaEmCallValida = novoCanal && novoCanal !== guild.afkChannelId;

        if (!estavaEmCallValida && estaEmCallValida) {
            iniciarSessaoVoiceSorteio(guild.id, membroVoice.id);
        } else if (estavaEmCallValida && !estaEmCallValida) {
            await finalizarSessaoVoiceSorteio(guild.id, membroVoice.id).catch(() => null);
        }
        // se saiu de um canal válido pra outro canal válido (trocou de call), a sessão continua normalmente
    }

    if (newState.channelId === CANAL_GERADOR_ID) {
        const guild = newState.guild;
        const member = newState.member;

        const callExistenteId = await getCallTemp(member.id);
        if (callExistenteId) {
            const callExistente = guild.channels.cache.get(callExistenteId);
            if (callExistente) {
                await member.voice.setChannel(callExistente).catch(() => null);
                return;
            }
        }

        try {
            const novaCall = await guild.channels.create({
                name: `${member.displayName}`,
                type: ChannelType.GuildVoice,
                parent: newState.channel.parentId,
                permissionOverwrites: [
                    { id: guild.id, allow: ['ViewChannel', 'Connect'] },
                    { id: member.id, allow: ['ViewChannel', 'Connect', 'ManageChannels'] }
                ]
            });
            await setCallTemp(member.id, novaCall.id);
            await member.voice.setChannel(novaCall).catch(() => null);
        } catch (err) {
            console.error('--- Erro ao criar call temp ---', err);
        }
    }

    
if (oldState.channel && oldState.channelId !== CANAL_GERADOR_ID) {
        const canal = oldState.channel;
        if (canal.members.size === 0) {
            const donoId = await getDonoCallTemp(canal.id);
            if (donoId && !callTempDeleteTimeouts.has(canal.id)) {
                const timeoutId = setTimeout(async () => {
                    callTempDeleteTimeouts.delete(canal.id);
                    try {
                        const canalAtual = await client.channels.fetch(canal.id).catch(() => null);
                        if (!canalAtual) return;
                        if (canalAtual.members.size === 0) {
                            await delCallTempPorCanal(canalAtual.id);
                            await canalAtual.delete().catch(() => null);
                        }
                    } catch (err) {
                        console.error('--- Erro ao deletar call temp após expiração ---', err);
                    }
                }, 60 * 1000);
                callTempDeleteTimeouts.set(canal.id, timeoutId);
            }
        }
    }
    
    // ============ SINCRONIZAÇÃO AUTOMÁTICA DO PAINEL BOTCALL ============
    const ehOProprioBot = (oldState.member?.id === client.user.id) || (newState.member?.id === client.user.id);

    if (ehOProprioBot) {
        const guildId = newState.guild?.id || oldState.guild?.id;

        if (guildId) {
            const canalAtualId = newState.channelId;
            const dadosAtuais = botCallDB.get(guildId) || { canalId: null, conectado: false };

            if (!canalAtualId) {
                
                botCallDB.set(guildId, { canalId: dadosAtuais.canalId, conectado: false });
                await removerVoiceState(guildId);
                console.log(`[Voice] Bot saiu da call em ${guildId}, sincronizando painel.`);
            } else if (canalAtualId !== dadosAtuais.canalId || !dadosAtuais.conectado) {
                
                botCallDB.set(guildId, { canalId: canalAtualId, conectado: true });
                await salvarVoiceState(guildId, canalAtualId);
                console.log(`[Voice] Bot conectado/movido para ${canalAtualId} em ${guildId}, sincronizando painel.`);
            }

            await atualizarPainelBotCallAuto(guildId);
        }
    }
    
});

// ============ FUNÇÃO AUXILIAR: DETECÇÃO DE @everyone / @here ============
const REGEX_EVERYONE_HERE = /@(everyone|here)/i;

function contemEveryoneOuHere(texto) {
    return REGEX_EVERYONE_HERE.test(String(texto ?? ''));
}

client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (!newMessage.guild || !newMessage.channel) return;
    if (newMessage.author?.bot) return;
    if (newMessage.partial) {
        try { newMessage = await newMessage.fetch(); } catch { return; }
    }

    const membro = newMessage.member ?? await newMessage.guild.members.fetch(newMessage.author.id).catch(() => null);
    if (membro && contemEveryoneOuHere(newMessage.content) &&
        !membro.permissions.has('Administrator') &&
        !membro.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {

        await newMessage.delete().catch(() => null);
        await aplicarMuteCargo(newMessage.guild, membro, 'Menção não autorizada a @everyone/@here (edição)', client.user.id).catch(err =>
            console.error('--- Erro ao aplicar mute automático por everyone (edit) ---', err)
        );
        await enviarLogModeracao({
            guild: newMessage.guild, tipo: 'MUTE AUTOMÁTICO (MENÇÃO @everyone - EDITADA)',
            alvo: `${newMessage.author} (${newMessage.author.tag})`, alvoUser: newMessage.author,
            autor: client.user, motivo: 'Menção não autorizada a @everyone/@here (mensagem editada)',
            extra: '**Duração:** `5 minutos`'
        });
        return;
    }

    await verificarAntiLink(newMessage);
});


client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild || !message.channel) return;

if (ticketDB.has(message.channel.id)) {
        const dadosTicket = ticketDB.get(message.channel.id);

        if (dadosTicket && !dadosTicket.assumidoPor && message.author.id !== dadosTicket.autorId) {
            const membroStaff = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
            const ehStaff = membroStaff?.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));

            if (ehStaff) {
                assumirTicket(message.channel, dadosTicket, membroStaff).catch(err =>
                    console.error('--- Erro ao auto-assumir ticket por mensagem ---', err)
                );
            }
        }
    }

    // ============ DELEÇÃO AUTOMÁTICA DE COMANDOS COM PREFIXO ============
    const conteudoLower = message.content.toLowerCase();
    const ehComandoPrefixo = conteudoLower === 'cl' || conteudoLower.startsWith(PREFIXO.toLowerCase());
    if (ehComandoPrefixo) {
        message.delete().catch(() => null);
    }
    
    if (contemEveryoneOuHere(message.content) && !message.member.permissions.has('Administrator') && !message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
    await message.delete().catch(() => null);

    await aplicarMuteCargo(message.guild, message.member, 'Menção não autorizada a @everyone/@here', client.user.id).catch(err =>
        console.error('--- Erro ao aplicar mute automático por everyone ---', err)
    );

    await enviarLogModeracao({
        guild: message.guild, tipo: 'MUTE AUTOMÁTICO (MENÇÃO @everyone)',
        alvo: `${message.author} (${message.author.tag})`, alvoUser: message.author,
        autor: client.user, motivo: 'Menção não autorizada a @everyone/@here',
        extra: '**Duração:** `5 minutos`'
    });

    return;
}

if (message.content.toLowerCase() === `${PREFIXO}áreas` || message.content.toLowerCase() === `${PREFIXO}areas`) {
    const texto =
        `# Áreas disponíveis⬇\n\n` +
        `### <:21992:1546550258937495573> **Sup**\n` +
        `-# <:21354:1545536854722351104> Atende tickets e ajuda os membros da comunidade\n` +
        `### <:21992:1546550258937495573> **Mod**\n` +
        `-# <:21354:1545536854722351104> Modera o servidor de forma controlada com permissão para banir, mutar e expulsar\n` +
        `### <:21992:1546550258937495573> **Verify TELLONYM**\n` +
        `-# <:21354:1545536854722351104> Verifica tellonyms enviados para avaliação, ele decide se o tellonym vai ser enviado pro canal, ou não\n` +
        `### <:21992:1546550258937495573> **Verify INSTAGRAM**\n` +
        `-# <:21354:1545536854722351104> Verifica imagens enviadas para avaliação em tickets para cargo de instagram, ele decide se o usuário vai poder enviar o post pro canal ou não`;

    return message.channel.send({ content: texto });
}
    
    if (message.content.toLowerCase().startsWith(`${PREFIXO}groles`)) {
    if (message.member.roles.cache.some(r => CARGOS_BLOQUEADOS_GROLES.includes(r.id))) {
        return message.reply('Você não possui um cargo alto o suficiente')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    if (!ehAdminGRoles(message.member)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    await message.delete().catch(() => null);

    const alvoMencionado = message.mentions.members.first();
    const alvoId = alvoMencionado ? alvoMencionado.id : message.author.id;

    const draft = { autorId: message.author.id, alvoId, filtro: 'possui', busca: null, pagina: 0, modo: 'gerenciar', criarCargo: null, excluirPagina: 0 };
    const container = await montarPainelGRoles(message.guild, draft, message.author.id);
    const msgPainel = await message.channel.send({ components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });

    gerenciarCargosDB.set(msgPainel.id, draft);
    agendarExpiracaoGRoles(msgPainel.id, msgPainel.channel.id);
    return;
}
    
if (message.content.toLowerCase().startsWith(`${PREFIXO}moedaseditar`)) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    const temPermissao = message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (USUARIOS_BLOQUEADOS_EDICAO.includes(message.author.id)) {
        return message.reply('Você não tem permissão para usar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const args = message.content.trim().split(/\s+/);
    const funcao = args[1]?.toLowerCase();
    const alvo = message.mentions.users.first();
    const quantidade = parseInt(args[3]);

    if (!['adicionar', 'remover'].includes(funcao) || !alvo || isNaN(quantidade) || quantidade <= 0) {
        return message.reply(`Uso correto: \`${PREFIXO}moedaseditar <adicionar|remover> <@usuário> <quantidade>\``)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (alvo.bot) {
        return message.reply('Bots não possuem saldo!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const saldoAtual = await getSaldo(alvo.id);

    if (funcao === 'adicionar') {
        const novoSaldo = await somarSaldo(alvo.id, quantidade);

        await enviarLogModeracao({
            guild: message.guild,
            tipo: 'MOEDAS ADICIONADAS',
            alvo: `${alvo} (${alvo.tag})`,
            alvoUser: alvo,
            autor: message.author,
            motivo: null,
            extra: `**Quantidade:** \`${quantidade}\` moedas\n**Novo saldo:** \`${novoSaldo}\``
        });

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **MOEDAS ADICIONADAS**'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Quantidade adicionada:** \`${quantidade}\` moedas`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Saldo atual:** \`${novoSaldo}\``));

        return message.channel.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    if (funcao === 'remover') {
        const novoSaldo = await somarSaldo(alvo.id, -Math.min(quantidade, saldoAtual));

        await enviarLogModeracao({
            guild: message.guild,
            tipo: 'MOEDAS REMOVIDAS',
            alvo: `${alvo} (${alvo.tag})`,
            alvoUser: alvo,
            autor: message.author,
            motivo: null,
            extra: `**Quantidade:** \`${quantidade}\` moedas\n**Novo saldo:** \`${novoSaldo}\``
        });

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **MOEDAS REMOVIDAS**'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Quantidade removida:** \`${quantidade}\` moedas`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Saldo atual:** \`${novoSaldo}\``));

        return message.channel.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });
    }
}
    
    
if (message.content.toLowerCase() === `${PREFIXO}painelurl`) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    const temPermissao = message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    await message.delete().catch(() => null);

    const iconeServidor = message.guild.iconURL({ extension: 'png', size: 256 }) || IMG_DISCORD_LOGO;

    const container = new ContainerBuilder()
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    '# ONZE\n' +
                    'Coloque o link do servidor na sua **bio/pronomes** e receba o cargo <@&1542321888175456362>\n\n' +
                    '-# Após colocar o link, clique no botão abaixo para verificar automaticamente.'
                ))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconeServidor))
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('painelurl_verificar')
                    .setLabel('Verificar url')
                    .setEmoji({ id: '1545060681219580055', name: '21170' })
                    .setStyle(ButtonStyle.Secondary)
            )
        );

    return message.channel.send({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}
       
    
if (message.content.toLowerCase() === `${PREFIXO}info`) {
    return message.channel.send({
        components: [montarPainelInfoHierarquia(message.guild, message.author.id)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (message.content.toLowerCase().startsWith(`${PREFIXO}ban `) || message.content.toLowerCase() === `${PREFIXO}ban`) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para banir membros!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    if (!message.member.permissions.has('BanMembers') && !message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return message.reply('Você não tem permissão para banir membros!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const alvo = message.mentions.users.first();
    if (!alvo) {
        return message.reply(`Uso correto: \`${PREFIXO}ban @usuário [motivo]\``)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    if (alvo.id === message.author.id) {
        return message.reply('Você não pode se banir!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    if (alvo.id === client.user.id) {
        return message.reply('Eu não posso me banir!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const motivo = message.content.trim().split(/\s+/).slice(2).join(' ') || null;

    const membroAlvo = await message.guild.members.fetch({ user: alvo.id, force: true }).catch(() => null);
    if (membroAlvo && !membroAlvo.bannable) {
        return message.reply('Não consigo banir esse usuário. Verifique a hierarquia de cargos.')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const container = montarPainelConfirmacaoModeracao('ban', `${alvo}`, alvo.tag, motivo);
    const msgConfirmacao = await message.channel.send({ components: [container], flags: [MessageFlags.IsComponentsV2] });

confirmacaoModeracaoDB.set(msgConfirmacao.id, {
    tipo: 'ban', autorId: message.author.id, alvoId: alvo.id, alvoTag: alvo.tag, motivo
});
    setTimeout(() => confirmacaoModeracaoDB.delete(msgConfirmacao.id), 2 * 60 * 1000);
    return;
}

if (message.content.toLowerCase().startsWith(`${PREFIXO}unban `) || message.content.toLowerCase() === `${PREFIXO}unban`) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para desbanir membros!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    if (!message.member.permissions.has('BanMembers') && !message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return message.reply('Você não tem permissão para desbanir membros!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const args = message.content.trim().split(/\s+/);
    const usuarioId = args[1];
    const motivo = args.slice(2).join(' ') || null;

    if (!usuarioId || !/^\d{15,25}$/.test(usuarioId)) {
        return message.reply(`Uso correto: \`${PREFIXO}unban <id> [motivo]\``)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const banido = await message.guild.bans.fetch({ user: usuarioId, force: true }).catch(() => null);
    if (!banido) {
        return message.reply('Esse usuário não está banido, ou o ID é inválido.')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const container = montarPainelConfirmacaoModeracao('unban', `<@${usuarioId}>`, banido.user.tag, motivo);
    const msgConfirmacao = await message.channel.send({ components: [container], flags: [MessageFlags.IsComponentsV2] });

    confirmacaoModeracaoDB.set(msgConfirmacao.id, {
        tipo: 'unban', autorId: message.author.id, alvoId: usuarioId, alvoTag: banido.user.tag, motivo
    });
    setTimeout(() => confirmacaoModeracaoDB.delete(msgConfirmacao.id), 2 * 60 * 1000);
    return;
}
    
    if (message.content.toLowerCase().startsWith(`${PREFIXO}tiktok`)) {
    const args = message.content.trim().split(/\s+/);
    const link = args[1];

    const regexTikTok = /https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/\S+/i;
    if (!link || !regexTikTok.test(link)) {
        return message.reply(`Uso correto: \`${PREFIXO}tikv <link do tiktok>\``)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const containerCarregando = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('<a:21356:1545539483754037359> Baixando vídeo, aguarde...'));

    let msgCarregando;
    try {
        msgCarregando = await message.channel.send({
            components: [containerCarregando],
            flags: [MessageFlags.IsComponentsV2]
        });
    } catch (err) {
        console.error('--- Erro ao enviar mensagem de carregamento do tikv ---', err);
        return message.delete().catch(() => null);
    }

    try {
        const videoUrl = await baixarTikTok(link);
        if (!videoUrl) throw new Error('Não foi possível baixar esse vídeo em nenhum dos provedores disponíveis');

        const respostaVideo = await fetch(videoUrl);
        if (!respostaVideo.ok) throw new Error('Falha ao baixar o arquivo de vídeo');

        const arrayBuffer = await respostaVideo.arrayBuffer();
        const bufferVideo = Buffer.from(arrayBuffer);

        const LIMITE_TAMANHO = 25 * 1024 * 1024;
        if (bufferVideo.length > LIMITE_TAMANHO) {
            await msgCarregando.edit({
                components: containerTexto('O vídeo é muito grande para ser enviado aqui (limite de 25MB).'),
                flags: [MessageFlags.IsComponentsV2]
            }).catch(() => null);
            return message.delete().catch(() => null);
        }

        const anexoVideo = new AttachmentBuilder(bufferVideo, { name: 'tiktok.mp4' });

const containerFinal = new ContainerBuilder()
	.setAccentColor(0xFFFFFF) 
    .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`<:21362:1545540876447654008> **TIKTOK**・Enviado por ${message.author}`)
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('attachment://tiktok.mp4')
        )
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
        new TextDisplayBuilder().setContent('Será excluído em **3 minutos**')
    );

const msgFinalTikv = await comRetry(() => msgCarregando.edit({
    components: [containerFinal],
    files: [anexoVideo],
    flags: [MessageFlags.IsComponentsV2]
}));

setTimeout(() => {
    msgFinalTikv.delete().catch(() => null);
}, 3 * 60 * 1000); 

    } catch (err) {
        console.error('--- Erro ao baixar vídeo do TikTok ---', err);
        await msgCarregando.edit({
            components: containerTexto('Ocorreu um erro ao baixar o vídeo. Verifique se o link está correto e tente novamente.'),
            flags: [MessageFlags.IsComponentsV2]
        }).catch(() => null);
    }

    return message.delete().catch(() => null);
}
 
    if (message.attachments.size > 0 && REACOES_ANEXO[message.channel.id]) {
        message.react(REACOES_ANEXO[message.channel.id]).catch(() => null);
    }

    
   
    const travouSpam = await verificarSpamMensagem(message);
if (travouSpam) return;
  
  // PARTE 2 ANTLINK
    if (await verificarAntiLink(message)) return;
  // FIM
   
   // ============ STATUS VIA MENÇÃO NATURAL ============
    const conteudoStatusLower = message.content.toLowerCase();
    const mencionouNino = conteudoStatusLower.includes('nino') || message.mentions.has(client.user.id);
    const pediuStatus = /\bstatus\b/.test(conteudoStatusLower);

    if (mencionouNino && pediuStatus) {
        const ID_DONO_STATUS = '1521611786447487060';
        const podeVerStatus = message.author.id === ID_DONO_STATUS ||
            message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));

        if (!podeVerStatus) {
            return message.reply(`Apenas <@${ID_DONO_STATUS}> ou a equipe moderação pode ver meus status`)
                .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
        }

        try {
            const container = await montarPainelStatus(client);
            return message.reply({
                components: [container],
                flags: [MessageFlags.IsComponentsV2]
            });
        } catch (err) {
            console.error('--- Erro ao gerar painel de status ---', err);
            return message.reply('Ocorreu um erro ao verificar meu status.')
                .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
        }
    }
   
    if (message.content.toLowerCase() === 'cl') {
    const cargosPermitidos = [CARGO_LIMPAR, CARGO_BOOSTER, ...CARGOS_ATENDENTE];
    if (!message.member.roles.cache.some(r => cargosPermitidos.includes(r.id))) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    await message.delete().catch(() => null);

    const LIMITE_BUSCA = 200;
    const autorId = message.author.id;
    let ultimaId = null;
    let verificadas = 0;

    while (verificadas < LIMITE_BUSCA) {
        const opcoes = { limit: 100 };
        if (ultimaId) opcoes.before = ultimaId;

        const lote = await message.channel.messages.fetch(opcoes).catch(() => null);
        if (!lote || lote.size === 0) break;

        ultimaId = lote.last().id;
        verificadas += lote.size;

        const doAutor = lote.filter(m => m.author.id === autorId);
        if (doAutor.size > 0) {
             await comRetry(() => message.channel.bulkDelete(doAutor, true)).catch(() => null);
        }

        if (verificadas >= LIMITE_BUSCA) break;
    }

    return;
}

if (message.content.toLowerCase() === `${PREFIXO}roleall`) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    const temPermissao = message.member.permissions.has('Administrator') || message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **CARGOS EM MASSA**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Clique no botão abaixo para abrir o painel de aplicação de cargos em massa. Ele será exibido apenas para você.'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('roleall_abrir')
                    .setLabel('Abrir painel')
                    .setStyle(ButtonStyle.Secondary)
            )
        );

    return message.channel.send({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}
    
if (message.content.toLowerCase() === `${PREFIXO}botcall`) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    const temPermissao = message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (!botCallDB.has(message.guild.id)) {
        botCallDB.set(message.guild.id, { canalId: null, conectado: false });
    }

    const msgPainel = await message.channel.send({
        components: [montarPainelBotCall(message.guild.id)],
        flags: [MessageFlags.IsComponentsV2]
    });
    registrarPainelBotCall(message.guild.id, msgPainel.channel.id, msgPainel.id);
    return;
}

if (message.content.toLowerCase().startsWith(`${PREFIXO}userinfo`)) {
        flags: [MessageFlags.IsComponentsV2]
    });
    registrarPainelBotCall(message.guild.id, msgPainel.channel.id, msgPainel.id);
    return;
}

if (message.content.toLowerCase().startsWith(`${PREFIXO}userinfo`)) {
    try {
        const alvo = message.mentions.users.first() || message.author;
        const expiraEm = Date.now() + 7 * 60 * 1000;

        const painel = await montarPainelUserInfo(message.guild, alvo, message.author.id, expiraEm);
        const msgPainel = await message.channel.send({
            components: [painel],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: ['users'] }
        });

        setTimeout(async () => {
            await msgPainel.edit({
                components: containerTexto(' Esse painel de informações expirou.'),
                flags: [MessageFlags.IsComponentsV2]
            }).catch(() => null);
        }, 7 * 60 * 1000);

        return;
    } catch (err) {
        console.error('--- Erro no comando t!userinfo ---', err);
        return message.reply('Ocorreu um erro ao montar as informações do usuário.')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
}
    
 
if (message.content.toLowerCase() === `${PREFIXO}painelps`) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    if (!message.member.permissions.has('Administrator') && !message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const msgPainel = await message.channel.send({
        components: [montarPainelProtecao(message.guild.id)],
        flags: [MessageFlags.IsComponentsV2]
    });
    await registrarPainelProtecao(msgPainel.channel.id, msgPainel.id);
    return;
}
    
if (message.content.toLowerCase().startsWith(`${PREFIXO}xpeditar`)) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    const temPermissao = message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (USUARIOS_BLOQUEADOS_EDICAO.includes(message.author.id)) {
        return message.reply('Você não tem permissão para usar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const args = message.content.trim().split(/\s+/);
    const funcao = args[1]?.toLowerCase();
    const alvo = message.mentions.users.first();
    const quantidade = parseInt(args[3]);

    if (!['adicionar', 'remover'].includes(funcao) || !alvo || isNaN(quantidade) || quantidade <= 0) {
        return message.reply(`Uso correto: \`${PREFIXO}xped <adicionar|remover> <@usuário> <quantidade>\``)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const dados = await getXP(alvo.id);

    if (funcao === 'adicionar') {
        dados.xp += quantidade;

        while (dados.xp >= xpNecessario(dados.nivel)) {
            const necessario = xpNecessario(dados.nivel);
            const xpExcedente = dados.xp - necessario;

            dados.xp = xpExcedente;
            dados.nivel += 1;

            const bonusMoedas = Math.floor(xpExcedente * TAXA_MOEDA_XP_EXTRA);
            const moedasGanhas = MOEDAS_POR_NIVEL + bonusMoedas;
            await somarSaldo(alvo.id, moedasGanhas);

            const containerLevelUp = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Ei ${alvo}, você subiu para o nível **${dados.nivel}**!`));

        await message.channel.send({
            components: [containerLevelUp],
            flags: [MessageFlags.IsComponentsV2]
        }).catch(() => null);
    }

    await setXP(alvo.id, dados.xp, dados.nivel);
        
await enviarLogModeracao({
    guild: message.guild,
    tipo: 'XP ADICIONADO',
    alvo: `${alvo} (${alvo.tag})`,
    alvoUser: alvo,
    autor: message.author,
    motivo: null,
    extra: `**Quantidade:** \`${quantidade}\` XP\n**Nível atual:** \`${dados.nivel}\` | **XP atual:** \`${dados.xp}\``
});

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **XP ADICIONADO**'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Quantidade adicionada:** \`${quantidade}\` XP`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**XP atual:** \`${dados.xp}\``))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Nível atual:** \`${dados.nivel}\``));

        return message.channel.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    if (funcao === 'remover') {
        let restante = quantidade;

        while (restante > 0) {
            if (restante <= dados.xp) {
                dados.xp -= restante;
                restante = 0;
            } else if (dados.nivel <= 1) {
                // já está no nível mínimo, não dá pra descer mais
                restante -= dados.xp;
                dados.xp = 0;
                break;
            } else {
                restante -= dados.xp;
                dados.nivel -= 1;
                dados.xp = xpNecessario(dados.nivel); // enche a barra do nível anterior
            }
        }

        await setXP(alvo.id, dados.xp, dados.nivel);
        
await enviarLogModeracao({
    guild: message.guild,
    tipo: 'XP REMOVIDO',
    alvo: `${alvo} (${alvo.tag})`,
    alvoUser: alvo,
    autor: message.author,
    motivo: null,
    extra: `**Quantidade:** \`${quantidade}\` XP\n**Nível atual:** \`${dados.nivel}\` | **XP atual:** \`${dados.xp}\``
});

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **XP REMOVIDO**'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Quantidade removida:** \`${quantidade}\` XP`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**XP atual:** \`${dados.xp}\``))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Nível atual:** \`${dados.nivel}\``));

        return message.channel.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });
    }
}

if (message.content.toLowerCase() === `${PREFIXO}moedastp`) {
    const temPermissao = message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    return message.channel.send({
        components: [montarPainelMoedas()],
        flags: [MessageFlags.IsComponentsV2]
    });
}
    
if (message.content.toLowerCase() === `${PREFIXO}loja`) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    const temPermissao = message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const container = new ContainerBuilder()
        .setAccentColor(0xFFFFFF)
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('https://i.supaimg.com/001f5659-bb07-44c4-a79d-4338b59c3c1a/0f7d5033-7ffa-4e4a-be02-24a3d7b4cae9.png')
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('resgate_converter').setLabel('Converter').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('resgate_carteira').setLabel('Minha carteira').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('resgate_cargos').setLabel('Comprar').setStyle(ButtonStyle.Secondary)
            )
        );

    return message.channel.send({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (message.content.toLowerCase() === `${PREFIXO}tellonym`) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    const temPermissao = message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    await message.delete().catch(() => null);

    const container = new ContainerBuilder()
        .setAccentColor(0xFFFFFF)
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('https://i.supaimg.com/001f5659-bb07-44c4-a79d-4338b59c3c1a/7749f165-5c7e-4c19-9c64-d88dcdab4808.png')
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('tellonym_enviar')
                    .setLabel('Enviar tellonym')
                    .setStyle(ButtonStyle.Secondary)
            )
        );

    return message.channel.send({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}


if (message.content.toLowerCase() === `${PREFIXO}nuke`) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    const temPermissao = message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const canal = message.channel;
    const autor = message.author;

    if (nukeEmAndamento.has(canal.id)) return;
    nukeEmAndamento.add(canal.id);

    try {
        const posicaoOriginal = canal.rawPosition; 

        const [novoCanal] = await Promise.all([
            canal.clone({
                name: canal.name,
                reason: `Nuke executado por ${autor.tag}`
            }),
            canal.delete().catch(() => null)
        ]);

        if (!novoCanal) return;

        
        await novoCanal.setPosition(posicaoOriginal, { relative: false }).catch(err =>
            console.error('--- Erro ao reposicionar canal no nuke ---', err)
        );

        const agora = new Date();
        const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });

        const container = new ContainerBuilder()
           .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# <:21569:1546008405305458769> **Canal nukado**'))
           .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
           .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Canal **nukado** por ${autor} as **${horaFormatada}**`));

        await comRetry(() => novoCanal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        })).catch(err => console.error('--- Erro ao enviar mensagem de nuke ---', err));

    } catch (err) {
        console.error('--- Erro ao executar nuke ---', err);
    } finally {
        nukeEmAndamento.delete(canal.id);
    }
}

    bufferizarMensagem(message.author.id);
    darXP(message);
    
    
    atualizarProgressoMensagensSorteio(message.guild.id, message.author.id).catch(() => null);
    
    
garantirHistoricoInicial(message.author).catch(() => null);
    
const motivoAfkBruto = await getAfk(message.author.id);
    if (motivoAfkBruto) {
        await removerAfk(message.author.id);
        message.channel.send({
            content: `Bem-vindo(a) de volta ${message.author}! Seu **AFK** foi removido.`
        });
    }

    // ============ AVISO DE MENÇÃO/RESPOSTA A USUÁRIO(S) AFK ============
    async function obterDadosAfk(userId) {
        const bruto = await getAfk(userId);
        if (!bruto) return null;

        try {
            const parsed = JSON.parse(bruto);
            return { motivo: parsed.motivo || 'Não informado', desde: parsed.desde || null };
        } catch {
            return { motivo: bruto, desde: null }; // compatibilidade com formato antigo
        }
    }

    function montarAvisoAfk(usuario, dados) {
        const tempoTexto = dados.desde ? ` há <t:${Math.floor(dados.desde / 1000)}:R>` : '';
        return `${usuario} esta **ausente** no momento${tempoTexto}: \`${dados.motivo}\``;
    }

    const avisosAfk = [];
    const idsJaAvisados = new Set();

    
    for (const usuarioMencionado of message.mentions.users.values()) {
        if (usuarioMencionado.bot || usuarioMencionado.id === message.author.id) continue;
        if (idsJaAvisados.has(usuarioMencionado.id)) continue;

        const dadosAfk = await obterDadosAfk(usuarioMencionado.id);
        if (!dadosAfk) continue;

        avisosAfk.push(montarAvisoAfk(usuarioMencionado, dadosAfk));
        idsJaAvisados.add(usuarioMencionado.id);
    }

    
    if (message.reference) {
        const mensagemRespondida = await message.fetchReference().catch(() => null);
        const autorRespondido = mensagemRespondida?.author;

        if (autorRespondido && !autorRespondido.bot && autorRespondido.id !== message.author.id && !idsJaAvisados.has(autorRespondido.id)) {
            const dadosAfk = await obterDadosAfk(autorRespondido.id);
            if (dadosAfk) {
                avisosAfk.push(montarAvisoAfk(autorRespondido, dadosAfk));
                idsJaAvisados.add(autorRespondido.id);
            }
        }
    }

    if (avisosAfk.length) {
        message.reply({
            content: avisosAfk.join('\n'),
            allowedMentions: { parse: [] }
        }).catch(() => null);
    }
    
    if (message.channel.parentId === CATEGORIA_MOEDAS_BOASVINDAS && message.content.trim().toLowerCase() === 'sacar') {
    const canalMoedasAtual = await obterPrimeiroCanalCategoria(CATEGORIA_MOEDAS_BOASVINDAS);
    if (!canalMoedasAtual || message.channel.id !== canalMoedasAtual.id) return;
        if (!eventoMoedas.mensagem) return;
        if (eventoMoedas.sorteado) return;

        if (!eventoMoedas.participantes) eventoMoedas.participantes = [];

        const jaParticipou = eventoMoedas.participantes.some(m => m.author.id === message.author.id);
        if (jaParticipou) return;

        eventoMoedas.participantes.push(message);
        await message.react('💸').catch(() => null);

        if (eventoMoedas.ganho) return;

        eventoMoedas.ganho = true;

        setTimeout(async () => {
            if (!eventoMoedas.participantes.length) return;

            eventoMoedas.sorteado = true;

            const vencedor = eventoMoedas.participantes[
                Math.floor(Math.random() * eventoMoedas.participantes.length)
            ];

            await somarSaldo(vencedor.author.id, 200);

            await vencedor.channel.send(
                `${vencedor.author} **200 moedas** foram setadas na sua carteira!`
            ).catch(() => null);
        }, 7000);

        return;
    }
    
    if (CANAIS_INSTA.includes(message.channel.id)) {
        if (message.attachments.size > 0) {
            const foto = message.attachments.first();
            if (foto && (foto.contentType?.startsWith('image/') || foto.contentType?.startsWith('video/'))) {
                try {
                    const anexo = new AttachmentBuilder(foto.url, { name: 'post.png' });
                    const textoPost = `> <:19040:1542338299312480357> <@${message.author.id}>${message.content ? '\n' + message.content : ''}`;

                    const container = new ContainerBuilder()
                        .setAccentColor(0xFFFFFF)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(textoPost))
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://post.png')))
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                        .addActionRowComponents(
                            montarBotoesInsta({ curtidas: [], comentarios: [], instagramUser: null })
                        );

                    const postMsg = await comRetry(() => enviarWebhook(message.channel, {
                        username: message.member?.displayName || message.author.username,
                        avatarURL: message.author.displayAvatarURL({ dynamic: true }),
                        components: [container],
                        files: [anexo],
                        flags: [MessageFlags.IsComponentsV2]
                    }));

                    await InstaPost.create({
                             messageId: postMsg.id,
                             ownerId: message.author.id,
                             imagemUrl: postMsg.attachments?.first()?.url || foto.url,
                             texto: textoPost,
                             curtidas: [],
                             comentarios: []
                     });
                     

                    await message.delete().catch(() => {});
                } catch (err) {
                    console.error('--- Erro no Sistema Insta ---', err);
                }
            }
        }
        return;
    }
    
    
if (message.content.toLowerCase().startsWith(`${PREFIXO}addcargo`)) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    if (!message.member.permissions.has('Administrator') && !message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const cargo = message.mentions.roles.first();
    const alvo = message.mentions.members.first();

    if (!cargo || !alvo) {
        return message.reply(`Uso correto: \`${PREFIXO}addcargo @cargo @usuário\``)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (cargo.id === message.guild.id) {
        return message.reply('Não é possível gerenciar o cargo `@everyone`!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const cargoBotMaisAlto = message.guild.members.me.roles.highest;
    if (cargo.position >= cargoBotMaisAlto.position) {
        return message.reply(`Não consigo gerenciar o cargo **${cargo.name}** — ele está no mesmo nível ou acima do meu cargo mais alto.`)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (alvo.roles.cache.has(cargo.id)) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **CARGO JÁ POSSUÍDO**'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Cargo:** ${cargo}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Esse usuário já possui esse cargo.`));

        return message.channel.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    try {
        await alvo.roles.add(cargo);
    } catch (err) {
        console.error('--- Erro ao adicionar cargo ---', err);
        return message.reply('Ocorreu um erro ao adicionar o cargo. Verifique minhas permissões e a hierarquia de cargos.')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
await logarCargo({
    guild: message.guild,
    tipo: 'Cargo adicionado',
    alvo: `${alvo} (${alvo.user.tag})`,
    alvoUser: alvo.user,
    autor: message.author,
    cargo: `${cargo}`
});

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **CARGO ADICIONADO**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Cargo:** ${cargo}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Executado por:** ${message.author}`));

    return message.channel.send({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (message.content.toLowerCase().startsWith(`${PREFIXO}remcargo`)) {
    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    if (!message.member.permissions.has('Administrator') && !message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const cargo = message.mentions.roles.first();
    const alvo = message.mentions.members.first();

    if (!cargo || !alvo) {
        return message.reply(`Uso correto: \`${PREFIXO}remcargo @cargo @usuário\``)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (cargo.id === message.guild.id) {
        return message.reply('Não é possível gerenciar o cargo `@everyone`!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const cargoBotMaisAlto = message.guild.members.me.roles.highest;
    if (cargo.position >= cargoBotMaisAlto.position) {
        return message.reply(`Não consigo gerenciar o cargo **${cargo.name}** — ele está no mesmo nível ou acima do meu cargo mais alto.`)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (!alvo.roles.cache.has(cargo.id)) {
        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **CARGO NÃO POSSUÍDO**'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Cargo:** ${cargo}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Esse usuário não possui esse cargo.`));

        return message.channel.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    try {
        await alvo.roles.remove(cargo);
    } catch (err) {
        console.error('--- Erro ao remover cargo ---', err);
        return message.reply('Ocorreu um erro ao remover o cargo. Verifique minhas permissões e a hierarquia de cargos.')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
await logarCargo({
    guild: message.guild,
    tipo: 'Cargo removido',
    alvo: `${alvo} (${alvo.user.tag})`,
    alvoUser: alvo.user,
    autor: message.author,
    cargo: `${cargo}`
});

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **CARGO REMOVIDO**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Cargo:** ${cargo}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Executado por:** ${message.author}`));

    return message.channel.send({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}
    
if (message.content.toLowerCase().startsWith(`${PREFIXO}limpar`)) {
        if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
            return message.reply('Você não tem permissão para utilizar este comando!')
                .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
        }
        const temPermissao = message.member.permissions.has('ManageMessages') || message.member.roles.cache.has(CARGO_LIMPAR);
        if (!temPermissao) {
            return message.reply('Você não tem permissão para utilizar este comando!')
                .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
        }

        const args = message.content.trim().split(/\s+/);
        const quantidade = parseInt(args[1]);

        if (!quantidade || isNaN(quantidade) || quantidade < 1 || quantidade > 300) {
            return message.reply(`Uso correto: \`${PREFIXO}limpar <quantidade de 1 a 300>\``)
                .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
        }

        await message.delete().catch(() => null);

        const inicioUnix = Math.floor(Date.now() / 1000);
        let deletadas = 0;

        function montarPainelLimpeza(finalizado = false) {
            const container = new ContainerBuilder()
                .setAccentColor(0x000000)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    finalizado
                        ? '### <:21444:1545643785675874420> Limpeza concluída'
                        : '### <a:21355:1545539464984535100> Limpando canal...'
                ))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `**Progresso:** \`${deletadas}/${quantidade}\`\n` +
                    `**Iniciado:** <t:${inicioUnix}:R>${finalizado ? `\n**Por:** ${message.author}` : ''}`
                ));

            return container;
        }

        const msgProgresso = await message.channel.send({
            components: [montarPainelLimpeza(false)],
            flags: [MessageFlags.IsComponentsV2]
        });

        while (deletadas < quantidade) {
            const buscadas = await message.channel.messages.fetch({ limit: 5 }).catch(() => null);
            const alvo = buscadas?.find(m => m.id !== msgProgresso.id);
            if (!alvo || alvo.id === msgProgresso.id) break;

            const apagou = await alvo.delete().then(() => true).catch(() => false);
            if (!apagou) break;

            deletadas++;

            if (deletadas % 5 === 0 || deletadas === quantidade) {
                await msgProgresso.edit({
                    components: [montarPainelLimpeza(false)],
                    flags: [MessageFlags.IsComponentsV2]
                }).catch(() => null);
            }

            await esperar(350);
        }

        await msgProgresso.edit({
            components: [montarPainelLimpeza(true)],
            flags: [MessageFlags.IsComponentsV2]
        }).catch(() => null);

        return setTimeout(() => msgProgresso.delete().catch(() => null), 5000);
    }
    
if (message.content.toLowerCase() === `${PREFIXO}regras`) {
        if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
            return message.reply('Você não tem permissão para utilizar este comando!')
                .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
        }
        const temPermissao = message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
        if (!temPermissao) {
            return message.reply('Você não tem permissão para utilizar este comando!')
                .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
        }

        await message.delete().catch(() => null);

        const container = new ContainerBuilder()
    .addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL('https://i.supaimg.com/001f5659-bb07-44c4-a79d-4338b59c3c1a/fec183b3-d2a2-4330-a657-7630b1cc29a6.png')
        )
    )
    
    .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `**Vizão** uma comunidade dedicada a resenhar, fazer amizades, ir call com a tropa e bater um papo maroto com a famy! Neste **Servidor** você vai encontrar diversos amigos para socializar! 🇹🇷`
        )
    )
    .addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Regras')
                .setStyle(ButtonStyle.Link)
                .setURL('https://discord.com/terms')
        )
    );

        return message.channel.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });
    }


if (message.content.toLowerCase() === `${PREFIXO}tickets`) {
        if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
            return message.reply('Você não tem permissão para utilizar este comando!')
                .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
        }
        const temPermissao = message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
        if (!temPermissao) {
            return message.reply('Você não tem permissão para utilizar este comando!')
                .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
        }

        await message.delete().catch(() => null);

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('https://i.supaimg.com/001f5659-bb07-44c4-a79d-4338b59c3c1a/d7777c87-2c72-4294-a8bd-55071744ba1e.png')
                )
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_iniciar')
                        .setLabel('Iniciar atendimento')
                        .setStyle(ButtonStyle.Secondary)
                )
            );

        return message.channel.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });
    }
});


client.on('interactionCreate', async (interaction) => {
	
	if (interaction.isButton() && interaction.customId === 'mute_modo_timeout') {
    const draft = muteDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    draft.modo = 'timeout';
    return interaction.update({ components: [montarPainelMuteTimeout(draft)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'mute_modo_cargo') {
    const draft = muteDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    draft.modo = 'cargo';
    return interaction.update({ components: [montarPainelMuteCargo(draft)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'mute_voltar') {
    const draft = muteDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    return interaction.update({ components: [montarPainelMuteInicial(draft)], flags: [MessageFlags.IsComponentsV2] });
}

// ---- Tempo (timeout) ----
if (interaction.isButton() && interaction.customId === 'mute_timeout_tempo') {
    const draft = muteDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });

    const modal = new ModalBuilder().setCustomId(`mute_modal_tempo_${interaction.message.id}`).setTitle('Tempo de mute');
    const inputTempo = new TextInputBuilder().setCustomId('tempo').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(draft.duracaoTexto || '');
    modal.addLabelComponents(new LabelBuilder().setLabel('Duração').setDescription('Ex: 10m, 2h, 1d (máx. 28 dias)').setTextInputComponent(inputTempo));
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('mute_modal_tempo_')) {
    const painelId = interaction.customId.replace('mute_modal_tempo_', '');
    const draft = muteDraftDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });

    const tempoTexto = interaction.fields.getTextInputValue('tempo').trim();
    const tempoMs = parseDuracaoTexto(tempoTexto);
    if (!tempoMs || tempoMs > 28 * 24 * 60 * 60 * 1000) {
        return interaction.reply({ content: 'Duração inválida! Use um formato como `10m`, `2h` ou `1d` (máximo 28 dias).', flags: [MessageFlags.Ephemeral] });
    }

    draft.duracaoTexto = tempoTexto;
    draft.duracaoMs = tempoMs;
    return interaction.update({ components: [montarPainelMuteTimeout(draft)], flags: [MessageFlags.IsComponentsV2] });
}

// ---- Motivo (timeout) ----
if (interaction.isButton() && interaction.customId === 'mute_timeout_motivo') {
    const draft = muteDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });

    const modal = new ModalBuilder().setCustomId(`mute_modal_motivo_timeout_${interaction.message.id}`).setTitle('Motivo do mute');
    const inputMotivo = new TextInputBuilder().setCustomId('motivo').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(draft.motivo || '');
    modal.addLabelComponents(new LabelBuilder().setLabel('Motivo (opcional)').setTextInputComponent(inputMotivo));
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('mute_modal_motivo_timeout_')) {
    const painelId = interaction.customId.replace('mute_modal_motivo_timeout_', '');
    const draft = muteDraftDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });

    draft.motivo = interaction.fields.getTextInputValue('motivo').trim() || null;
    return interaction.update({ components: [montarPainelMuteTimeout(draft)], flags: [MessageFlags.IsComponentsV2] });
}

// ---- Confirmar (timeout) ----
if (interaction.isButton() && interaction.customId === 'mute_timeout_confirmar') {
    const draft = muteDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    if (!draft.duracaoMs) return interaction.reply({ content: 'Defina o tempo do mute antes de confirmar!', flags: [MessageFlags.Ephemeral] });

    await interaction.deferUpdate();

    const membroAlvo = await interaction.guild.members.fetch({ user: draft.alvoId, force: true }).catch(() => null);
    if (!membroAlvo) return interaction.editReply({ components: containerTexto('Esse usuário não está mais no servidor.'), flags: [MessageFlags.IsComponentsV2] });
    if (!membroAlvo.moderatable) return interaction.editReply({ components: containerTexto('Não consigo silenciar esse usuário. Verifique a hierarquia de cargos.'), flags: [MessageFlags.IsComponentsV2] });

    try {
        await membroAlvo.timeout(draft.duracaoMs, draft.motivo || 'Não informado');
    } catch (err) {
        console.error('--- Erro ao aplicar mute (timeout) ---', err);
        return interaction.editReply({ components: containerTexto('Ocorreu um erro ao aplicar o timeout nesse usuário.'), flags: [MessageFlags.IsComponentsV2] });
    }

await enviarLogModeracao({
        guild: interaction.guild, tipo: 'MUTE (TIMEOUT)',
        alvo: `${membroAlvo} (${membroAlvo.user.tag})`, alvoUser: membroAlvo.user,
        autor: interaction.user, motivo: draft.motivo, extra: `**Duração:** \`${draft.duracaoTexto}\``
    });

    muteDraftDB.delete(interaction.message.id);

    avisoSucessoModeracao(interaction.channel, `<:21444:1545643785675874420> · ${membroAlvo} foi mutado com sucesso!`);

    return interaction.editReply({
        components: containerTexto(`${membroAlvo} foi mutado por **${draft.duracaoTexto}**!${draft.motivo ? `\n**Motivo:** ${draft.motivo}` : ''}`),
        flags: [MessageFlags.IsComponentsV2]
    });
}

// ---- Motivo (cargo) ----
if (interaction.isButton() && interaction.customId === 'mute_cargo_motivo') {
    const draft = muteDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });

    const modal = new ModalBuilder().setCustomId(`mute_modal_motivo_cargo_${interaction.message.id}`).setTitle('Motivo do mute');
    const inputMotivo = new TextInputBuilder().setCustomId('motivo').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(draft.motivo || '');
    modal.addLabelComponents(new LabelBuilder().setLabel('Motivo (opcional)').setTextInputComponent(inputMotivo));
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('mute_modal_motivo_cargo_')) {
    const painelId = interaction.customId.replace('mute_modal_motivo_cargo_', '');
    const draft = muteDraftDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });

    draft.motivo = interaction.fields.getTextInputValue('motivo').trim() || null;
    return interaction.update({ components: [montarPainelMuteCargo(draft)], flags: [MessageFlags.IsComponentsV2] });
}

// ---- Aplicar (cargo) ----
if (interaction.isButton() && interaction.customId === 'mute_cargo_aplicar') {
    const draft = muteDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });

    const membroAlvo = await interaction.guild.members.fetch({ user: draft.alvoId, force: true }).catch(() => null);
    if (!membroAlvo) return interaction.update({ components: containerTexto('Esse usuário não está mais no servidor.'), flags: [MessageFlags.IsComponentsV2] });

    const cargoBotMaisAlto = interaction.guild.members.me.roles.highest;
    const cargoMutado = interaction.guild.roles.cache.get(CARGO_MUTADO);
    if (!cargoMutado || cargoMutado.position >= cargoBotMaisAlto.position) {
        return interaction.update({ components: containerTexto('Não consigo gerenciar o cargo de mutado. Verifique a hierarquia de cargos do bot.'), flags: [MessageFlags.IsComponentsV2] });
    }

    await interaction.deferUpdate();

    try {
        await aplicarMuteCargo(interaction.guild, membroAlvo, draft.motivo, interaction.user.id);
    } catch (err) {
        console.error('--- Erro ao aplicar mute por cargo ---', err);
        return interaction.editReply({ components: containerTexto('Ocorreu um erro ao aplicar o mute por cargo. Verifique a hierarquia de cargos do bot.'), flags: [MessageFlags.IsComponentsV2] });
    }

await enviarLogModeracao({
        guild: interaction.guild, tipo: 'MUTE POR CARGO',
        alvo: `${membroAlvo} (${membroAlvo.user.tag})`, alvoUser: membroAlvo.user,
        autor: interaction.user, motivo: draft.motivo,
        extra: '**Duração:** `5 minutos` (os cargos anteriores voltam automaticamente)'
    });

    muteDraftDB.delete(interaction.message.id);

    avisoSucessoModeracao(interaction.channel, `<:21444:1545643785675874420> · ${membroAlvo} foi mutado com sucesso!`);

    return interaction.editReply({
        components: containerTexto(`${membroAlvo} foi mutado por cargo por **5 minutos**!${draft.motivo ? `\n**Motivo:** ${draft.motivo}` : ''}`),
        flags: [MessageFlags.IsComponentsV2]
    });
}
	
if (interaction.isUserSelectMenu() && interaction.customId === 'groles_alvo_select') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft) return interaction.reply({ content: 'Esse painel expirou.', flags: [MessageFlags.Ephemeral] });
    if (interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);

    try {
        draft.alvoId = interaction.values[0];
        draft.filtro = 'removiveis';
        draft.busca = null;
        draft.pagina = 0;

        await interaction.deferUpdate();
        const container = await montarPainelGRoles(interaction.guild, draft, interaction.user.id);
        return interaction.editReply({ components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
    } catch (err) {
        console.error('--- Erro no groles_alvo_select ---', err);
        return interaction.followUp({ content: 'Ocorreu um erro ao atualizar o painel.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}

if (interaction.isButton() && interaction.customId.startsWith('groles_filtro_')) {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft) return interaction.reply({ content: 'Esse painel expirou.', flags: [MessageFlags.Ephemeral] });
    if (interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);

    try {
        draft.filtro = interaction.customId.replace('groles_filtro_', '');
        draft.pagina = 0;

        await interaction.deferUpdate();
        const container = await montarPainelGRoles(interaction.guild, draft, interaction.user.id);
        return interaction.editReply({ components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
    } catch (err) {
        console.error('--- Erro no groles_filtro ---', err);
        return interaction.followUp({ content: 'Ocorreu um erro ao atualizar o painel.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}

if (interaction.isButton() && (interaction.customId === 'groles_pagina_anterior' || interaction.customId === 'groles_pagina_proxima')) {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft) return interaction.reply({ content: 'Esse painel expirou.', flags: [MessageFlags.Ephemeral] });
    if (interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);

    try {
        draft.pagina += interaction.customId === 'groles_pagina_anterior' ? -1 : 1;

        await interaction.deferUpdate();
        const container = await montarPainelGRoles(interaction.guild, draft, interaction.user.id);
        return interaction.editReply({ components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
    } catch (err) {
        console.error('--- Erro na paginação groles ---', err);
        return interaction.followUp({ content: 'Ocorreu um erro ao atualizar o painel.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}

if (interaction.isButton() && interaction.customId === 'groles_buscar') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft) return interaction.reply({ content: 'Esse painel expirou.', flags: [MessageFlags.Ephemeral] });
    if (interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);

    try {
        const modal = new ModalBuilder()
            .setCustomId(`groles_modal_busca_${interaction.message.id}`)
            .setTitle('Buscar cargo');

        const inputBusca = new TextInputBuilder()
            .setCustomId('termo_busca')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(100)
            .setValue(draft.busca || '');

        const labelBusca = new LabelBuilder()
            .setLabel('Nome, menção ou ID do cargo')
            .setDescription('Busque como quiser. Deixe vazio para limpar a busca.')
            .setTextInputComponent(inputBusca);

        modal.addLabelComponents(labelBusca);
        return interaction.showModal(modal);
    } catch (err) {
        console.error('--- Erro ao abrir modal de busca groles ---', err);
        return interaction.reply({ content: 'Ocorreu um erro ao abrir a busca.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('groles_modal_busca_')) {
    const painelId = interaction.customId.replace('groles_modal_busca_', '');
    const draft = gerenciarCargosDB.get(painelId);
    if (!draft) return interaction.reply({ content: 'Esse painel expirou.', flags: [MessageFlags.Ephemeral] });
    if (interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(painelId, interaction.channel.id);

    try {
        const termo = interaction.fields.getTextInputValue('termo_busca').trim();
        draft.busca = termo || null;
        draft.pagina = 0;

        const container = await montarPainelGRoles(interaction.guild, draft, interaction.user.id);
        return interaction.update({ components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
    } catch (err) {
        console.error('--- Erro no modal de busca groles ---', err);
        return interaction.reply({ content: 'Ocorreu um erro ao buscar o cargo.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}

if (interaction.isButton() && interaction.customId.startsWith('groles_toggle_')) {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft) return interaction.reply({ content: 'Esse painel expirou.', flags: [MessageFlags.Ephemeral] });
    if (interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);

    const cargoId = interaction.customId.replace('groles_toggle_', '');
    const cargo = interaction.guild.roles.cache.get(cargoId);
    if (!cargo) return interaction.reply({ content: 'Esse cargo não existe mais.', flags: [MessageFlags.Ephemeral] });
    if (!cargo.editable) return interaction.reply({ content: 'Não consigo mais gerenciar esse cargo (hierarquia).', flags: [MessageFlags.Ephemeral] });

    if (interaction.member.roles.cache.has(CARGO_GERENCIADOR_LIMITADO) && CARGOS_RESTRITOS_GERENCIADOR_LIMITADO.includes(cargo.id)) {
        return interaction.reply({ content: 'Você não tem permissão para gerenciar esse cargo!', flags: [MessageFlags.Ephemeral] });
    }

    try {
        const alvoMembro = await interaction.guild.members.fetch({ user: draft.alvoId, force: true }).catch(() => null);
        if (!alvoMembro) return interaction.reply({ content: 'Não foi possível localizar o membro gerenciado.', flags: [MessageFlags.Ephemeral] });

        await interaction.deferUpdate();

        const possuiAgora = alvoMembro.roles.cache.has(cargo.id);
        if (possuiAgora) await alvoMembro.roles.remove(cargo, `Painel de cargos - ${interaction.user.tag}`);
        else await alvoMembro.roles.add(cargo, `Painel de cargos - ${interaction.user.tag}`);
        
        await logarCargo({
                guild: interaction.guild,
                tipo: possuiAgora ? 'Cargo removido' : 'Cargo adicionado',
                alvo: `${alvoMembro} (${alvoMembro.user.tag})`,
                alvoUser: alvoMembro.user,
                autor: interaction.user,
                cargo: `${cargo}`,
                extra: '-# Via painel de gerenciamento de cargos'
         }).catch(() => null);

        const container = await montarPainelGRoles(interaction.guild, draft, interaction.user.id);
        return interaction.editReply({ components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
    } catch (err) {
        console.error('--- Erro ao alternar cargo no painel groles ---', err);
        return interaction.followUp({ content: 'Ocorreu um erro ao atualizar esse cargo.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}

// ---- Abrir menu Editar ----
if (interaction.isButton() && interaction.customId === 'groles_editar_abrir') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft) return interaction.reply({ content: 'Esse painel expirou.', flags: [MessageFlags.Ephemeral] });
    if (interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }
    if (interaction.member.roles.cache.has(CARGO_GERENCIADOR_LIMITADO)) {
        return interaction.reply({ content: 'Você não tem permissão para criar ou editar cargos!', flags: [MessageFlags.Ephemeral] });
    }
    if (!temPermissaoEditarCargosGRoles(interaction.member)) {
        return interaction.reply({ content: 'Você não tem permissão para editar cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    draft.modo = 'editar';

    return interaction.update({ components: [montarPainelGRolesEditar()], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Voltar pro painel normal de gerenciamento ----
if (interaction.isButton() && interaction.customId === 'groles_editar_voltar') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft) return interaction.reply({ content: 'Esse painel expirou.', flags: [MessageFlags.Ephemeral] });
    if (interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    draft.modo = 'gerenciar';

    await interaction.deferUpdate();
    const container = await montarPainelGRoles(interaction.guild, draft, interaction.user.id);
    return interaction.editReply({ components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Voltar pro menu Editar (de dentro de Criar/Excluir) ----
if (interaction.isButton() && interaction.customId === 'groles_editar_voltar_menu') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft) return interaction.reply({ content: 'Esse painel expirou.', flags: [MessageFlags.Ephemeral] });
    if (interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    draft.modo = 'editar';

    return interaction.update({ components: [montarPainelGRolesEditar()], flags: [MessageFlags.IsComponentsV2] });
}

// ---- Abrir Criar cargo ----
if (interaction.isButton() && interaction.customId === 'groles_criar_abrir') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!temPermissaoEditarCargosGRoles(interaction.member)) {
        return interaction.reply({ content: 'Você não tem permissão para criar cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    draft.modo = 'criar';
    if (!draft.criarCargo) draft.criarCargo = { nome: null, corHex: null, corPredefinida: null, mostrarSeparadamente: false, permitirMencoes: false };

    return interaction.update({ components: [montarPainelGRolesCriar(draft)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Botão "Nome do cargo" -> abre modal ----
if (interaction.isButton() && interaction.customId === 'groles_criar_editar') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!temPermissaoEditarCargosGRoles(interaction.member)) {
        return interaction.reply({ content: 'Você não tem permissão para criar cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    const cc = draft.criarCargo || {};

    const modal = new ModalBuilder()
        .setCustomId(`groles_modal_criar_${interaction.message.id}`)
        .setTitle('Criar cargo');

    const inputNome = new TextInputBuilder()
        .setCustomId('nome_cargo')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setValue(cc.nome || '');
    const labelNome = new LabelBuilder().setLabel('Nome do cargo').setTextInputComponent(inputNome);

    const inputCor = new TextInputBuilder()
        .setCustomId('cor_cargo')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(7)
        .setPlaceholder('#FFFFFF')
        .setValue(cc.corHex ? `#${cc.corHex}` : '');
    const labelCor = new LabelBuilder()
        .setLabel('Cor do cargo (hexadecimal)')
        .setDescription('Ex: #FF0000. Deixe vazio pra usar a cor selecionada abaixo ou a padrão.')
        .setTextInputComponent(inputCor);

    const selectCorPredefinida = new StringSelectMenuBuilder()
        .setCustomId('cor_predefinida_cargo')
        .setRequired(false)
        .addOptions(
            CORES_CARGO_GROLES.map(c => ({ label: c.label, value: c.value, default: cc.corPredefinida === c.value }))
        );
    const labelCorPredefinida = new LabelBuilder()
        .setLabel('Ou selecione uma cor')
        .setStringSelectMenuComponent(selectCorPredefinida);

    const checkboxHoist = new LabelBuilder()
        .setLabel('Mostrar separadamente')
        .setDescription('Exibe os membros com este cargo separadamente na lista de membros.')
        .setCheckboxGroupComponent((group) =>
            group
                .setCustomId('opcao_hoist')
                .setMinValues(0)
                .setMaxValues(1)
                .setRequired(false)
                .addOptions([
                    { label: 'Ativar', value: 'ativo', default: cc.mostrarSeparadamente === true }
                ])
        );

    const checkboxMentionable = new LabelBuilder()
        .setLabel('Permitir menções de qualquer um')
        .setDescription('Qualquer pessoa poderá mencionar (@) este cargo.')
        .setCheckboxGroupComponent((group) =>
            group
                .setCustomId('opcao_mentionable')
                .setMinValues(0)
                .setMaxValues(1)
                .setRequired(false)
                .addOptions([
                    { label: 'Ativar', value: 'ativo', default: cc.permitirMencoes === true }
                ])
        );

    modal.addLabelComponents(labelNome, labelCor, labelCorPredefinida, checkboxHoist, checkboxMentionable);
    return interaction.showModal(modal);
}

// ---- Submit do modal de criar cargo ----
if (interaction.isModalSubmit() && interaction.customId.startsWith('groles_modal_criar_')) {
    const painelId = interaction.customId.replace('groles_modal_criar_', '');
    const draft = gerenciarCargosDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!temPermissaoEditarCargosGRoles(interaction.member)) {
        return interaction.reply({ content: 'Você não tem permissão para criar cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(painelId, interaction.channel.id);

    const nome = interaction.fields.getTextInputValue('nome_cargo').trim();
    const corBruta = interaction.fields.getTextInputValue('cor_cargo').trim().replace(/^#/, '');
    const corPredefinidaValores = interaction.fields.getStringSelectValues('cor_predefinida_cargo') || [];
    const corPredefinida = corPredefinidaValores[0] || null;
    const hoistValores = interaction.fields.getCheckboxGroup('opcao_hoist') || [];
    const mentionableValores = interaction.fields.getCheckboxGroup('opcao_mentionable') || [];
    const mostrarSeparadamente = hoistValores.includes('ativo');
    const permitirMencoes = mentionableValores.includes('ativo');

    if (!nome) {
        return interaction.reply({ content: 'O nome do cargo não pode ficar vazio.', flags: [MessageFlags.Ephemeral] });
    }
    if (corBruta && !/^[0-9A-Fa-f]{6}$/.test(corBruta)) {
        return interaction.reply({ content: 'Cor inválida! Use um hexadecimal válido, exemplo: `#FF0000`.', flags: [MessageFlags.Ephemeral] });
    }

    if (!draft.criarCargo) draft.criarCargo = {};
    draft.criarCargo.nome = nome;
    draft.criarCargo.corHex = corBruta ? corBruta.toUpperCase() : null;
    draft.criarCargo.corPredefinida = corBruta ? null : corPredefinida;
    draft.criarCargo.mostrarSeparadamente = !!mostrarSeparadamente;
    draft.criarCargo.permitirMencoes = !!permitirMencoes;

    return interaction.update({ components: [montarPainelGRolesCriar(draft)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Confirmar criação do cargo ----
if (interaction.isButton() && interaction.customId === 'groles_criar_confirmar') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!temPermissaoEditarCargosGRoles(interaction.member)) {
        return interaction.reply({ content: 'Você não tem permissão para criar cargos!', flags: [MessageFlags.Ephemeral] });
    }

    const cc = draft.criarCargo;
    if (!cc?.nome) {
        return interaction.reply({ content: 'Defina o nome do cargo antes de criar!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    await interaction.deferUpdate();

    const corFinal = cc.corHex || cc.corPredefinida || null;
    const nomeCriado = cc.nome;

    try {
        await interaction.guild.roles.create({
            name: cc.nome,
            color: corFinal ? parseInt(corFinal, 16) : undefined,
            hoist: !!cc.mostrarSeparadamente,
            mentionable: !!cc.permitirMencoes,
            reason: `Cargo criado via painel de gerenciamento por ${interaction.user.tag}`
        });
    } catch (err) {
        console.error('--- Erro ao criar cargo pelo painel groles ---', err);
        return interaction.editReply({ components: containerTexto('Ocorreu um erro ao criar o cargo. Verifique minhas permissões.'), flags: [MessageFlags.IsComponentsV2] });
    }

    draft.criarCargo = { nome: null, corHex: null, corPredefinida: null, mostrarSeparadamente: false, permitirMencoes: false };
    draft.modo = 'editar';

    await interaction.editReply({ components: containerTexto(`Cargo **${nomeCriado}** criado com sucesso!`), flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });

    setTimeout(async () => {
        await interaction.editReply({ components: [montarPainelGRolesEditar()], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } }).catch(() => null);
    }, 2500);
    return;
}

// ---- Abrir Excluir cargo ----
if (interaction.isButton() && interaction.customId === 'groles_excluir_abrir') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!temPermissaoEditarCargosGRoles(interaction.member)) {
        return interaction.reply({ content: 'Você não tem permissão para excluir cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    draft.modo = 'excluir';
    draft.excluirPagina = 0;

    return interaction.update({ components: [montarPainelGRolesExcluir(interaction.guild, 0)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Paginação da lista de exclusão ----
if (interaction.isButton() && interaction.customId.startsWith('groles_excluir_pagina_') && interaction.customId !== 'groles_excluir_pagina_atual') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!temPermissaoEditarCargosGRoles(interaction.member)) {
        return interaction.reply({ content: 'Você não tem permissão para excluir cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    const pagina = parseInt(interaction.customId.replace('groles_excluir_pagina_', ''));
    draft.excluirPagina = pagina;

    return interaction.update({ components: [montarPainelGRolesExcluir(interaction.guild, pagina)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Clique em Excluir de um cargo específico -> pede confirmação ----
if (interaction.isButton() && interaction.customId.startsWith('groles_excluir_cargo_')) {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!temPermissaoEditarCargosGRoles(interaction.member)) {
        return interaction.reply({ content: 'Você não tem permissão para excluir cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    const partes = interaction.customId.replace('groles_excluir_cargo_', '').split('_');
    const pagina = parseInt(partes.pop());
    const cargoId = partes.join('_');

    const cargo = interaction.guild.roles.cache.get(cargoId);
    if (!cargo) {
        return interaction.reply({ content: 'Esse cargo não existe mais.', flags: [MessageFlags.Ephemeral] });
    }
    if (!cargo.editable) {
        return interaction.reply({ content: 'Não consigo excluir esse cargo (hierarquia).', flags: [MessageFlags.Ephemeral] });
    }

    return interaction.update({ components: [montarPainelGRolesExcluirConfirmar(cargo, pagina)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Confirmar exclusão do cargo ----
if (interaction.isButton() && interaction.customId.startsWith('groles_excluir_confirmar_')) {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!temPermissaoEditarCargosGRoles(interaction.member)) {
        return interaction.reply({ content: 'Você não tem permissão para excluir cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    const partes = interaction.customId.replace('groles_excluir_confirmar_', '').split('_');
    const pagina = parseInt(partes.pop());
    const cargoId = partes.join('_');

    const cargo = interaction.guild.roles.cache.get(cargoId);
    if (!cargo) {
        return interaction.update({ components: [montarPainelGRolesExcluir(interaction.guild, pagina)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
    }
    if (!cargo.editable) {
        return interaction.reply({ content: 'Não consigo mais excluir esse cargo (hierarquia).', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferUpdate();

    try {
        await cargo.delete(`Cargo excluído via painel de gerenciamento por ${interaction.user.tag}`);
    } catch (err) {
        console.error('--- Erro ao excluir cargo pelo painel groles ---', err);
    }

    const totalPaginas = Math.max(1, Math.ceil(obterCargosExcluiveisGRoles(interaction.guild).length / EXCLUIR_CARGOS_POR_PAGINA));
    const paginaCorrigida = Math.max(0, Math.min(pagina, totalPaginas - 1));
    draft.excluirPagina = paginaCorrigida;

    return interaction.editReply({ components: [montarPainelGRolesExcluir(interaction.guild, paginaCorrigida)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Cancelar exclusão do cargo ----
if (interaction.isButton() && interaction.customId.startsWith('groles_excluir_cancelar_')) {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    const pagina = parseInt(interaction.customId.replace('groles_excluir_cancelar_', ''));

    return interaction.update({ components: [montarPainelGRolesExcluir(interaction.guild, pagina)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Abrir lista de cargos para editar permissões ----
if (interaction.isButton() && interaction.customId === 'groles_permeditar_abrir') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Apenas administradores podem editar permissões de cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    draft.modo = 'permeditar';

    return interaction.update({ components: [montarPainelGRolesPermLista(interaction.guild, 0)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Paginação da lista de cargos p/ permissões ----
if (interaction.isButton() && interaction.customId.startsWith('groles_permeditar_pagina_') && interaction.customId !== 'groles_permeditar_pagina_atual') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Apenas administradores podem editar permissões de cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    const pagina = parseInt(interaction.customId.replace('groles_permeditar_pagina_', ''));

    return interaction.update({ components: [montarPainelGRolesPermLista(interaction.guild, pagina)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Abrir painel de permissões de um cargo específico ----
if (interaction.isButton() && interaction.customId.startsWith('groles_permeditar_cargo_')) {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Apenas administradores podem editar permissões de cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    const partes = interaction.customId.replace('groles_permeditar_cargo_', '').split('_');
    const listaPagina = parseInt(partes.pop());
    const cargoId = partes.join('_');

    const cargo = interaction.guild.roles.cache.get(cargoId);
    if (!cargo) {
        return interaction.update({ components: [montarPainelGRolesPermLista(interaction.guild, listaPagina)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
    }
    if (!cargo.editable) {
        return interaction.reply({ content: 'Não consigo editar as permissões desse cargo (hierarquia).', flags: [MessageFlags.Ephemeral] });
    }
    
    draft.buscaPerm = null;

    return interaction.update({ components: [montarPainelGRolesPermissoes(cargo, 0, listaPagina)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Paginação das permissões do cargo ----
if (interaction.isButton() && interaction.customId.startsWith('groles_permeditar_perm_pagina_') && interaction.customId !== 'groles_permeditar_perm_pagina_atual') {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Apenas administradores podem editar permissões de cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    const partes = interaction.customId.replace('groles_permeditar_perm_pagina_', '').split('_');
    const listaPagina = parseInt(partes.pop());
    const pagina = parseInt(partes.pop());
    const cargoId = partes.join('_');

    const cargo = interaction.guild.roles.cache.get(cargoId);
    if (!cargo) {
        return interaction.update({ components: [montarPainelGRolesPermLista(interaction.guild, listaPagina)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
    }

    return interaction.update({ components: [montarPainelGRolesPermissoes(cargo, pagina, listaPagina, draft.buscaPerm)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Ativar/Desativar uma permissão específica ----
if (interaction.isButton() && interaction.customId.startsWith('groles_permtoggle_')) {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Apenas administradores podem editar permissões de cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    const partes = interaction.customId.replace('groles_permtoggle_', '').split('_');
    const listaPagina = parseInt(partes.pop());
    const pagina = parseInt(partes.pop());
    const permKey = partes.pop();
    const cargoId = partes.join('_');

    const cargo = interaction.guild.roles.cache.get(cargoId);
    if (!cargo) {
        return interaction.update({ components: [montarPainelGRolesPermLista(interaction.guild, listaPagina)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
    }
    if (!cargo.editable) {
        return interaction.reply({ content: 'Não consigo mais editar esse cargo (hierarquia).', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferUpdate();

    const flagsAtuais = cargo.permissions.toArray();
    const possuiAgora = flagsAtuais.includes(permKey);
    const novosFlags = possuiAgora ? flagsAtuais.filter(f => f !== permKey) : [...flagsAtuais, permKey];

    let cargoAtualizado;
    try {
        cargoAtualizado = await cargo.setPermissions(novosFlags, `Permissão editada via painel por ${interaction.user.tag}`);
    } catch (err) {
        console.error('--- Erro ao alternar permissão do cargo (groles) ---', err);
        return interaction.followUp({ content: 'Ocorreu um erro ao alterar essa permissão.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }

    return interaction.editReply({ components: [montarPainelGRolesPermissoes(cargoAtualizado, pagina, listaPagina, draft.buscaPerm)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Voltar da tela de permissões para a lista de cargos ----
if (interaction.isButton() && interaction.customId.startsWith('groles_permeditar_voltar_lista_')) {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    draft.buscaPerm = null; 
    const listaPagina = parseInt(interaction.customId.replace('groles_permeditar_voltar_lista_', ''));

    return interaction.update({ components: [montarPainelGRolesPermLista(interaction.guild, listaPagina)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

// ---- Abrir modal de busca de permissão ----
if (interaction.isButton() && interaction.customId.startsWith('groles_permbuscar_')) {
    const draft = gerenciarCargosDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Apenas administradores podem editar permissões de cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(interaction.message.id, interaction.channel.id);
    const partes = interaction.customId.replace('groles_permbuscar_', '').split('_');
    const listaPagina = partes.pop();
    const cargoId = partes.join('_');

    const modal = new ModalBuilder()
        .setCustomId(`groles_modal_permbuscar_${interaction.message.id}_${cargoId}_${listaPagina}`)
        .setTitle('Buscar permissão');

    const inputBusca = new TextInputBuilder()
        .setCustomId('termo_busca_perm')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(100)
        .setValue(draft.buscaPerm || '');

    const labelBusca = new LabelBuilder()
        .setLabel('Nome da permissão')
        .setDescription('Busque pelo nome (ex: banir, mensagens, cargos). Deixe vazio para limpar a busca.')
        .setTextInputComponent(inputBusca);

    modal.addLabelComponents(labelBusca);
    return interaction.showModal(modal);
}

// ---- Submit do modal de busca de permissão ----
if (interaction.isModalSubmit() && interaction.customId.startsWith('groles_modal_permbuscar_')) {
    const partes = interaction.customId.replace('groles_modal_permbuscar_', '').split('_');
    const listaPagina = parseInt(partes.pop());
    const cargoId = partes.pop();
    const painelId = partes.join('_');

    const draft = gerenciarCargosDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: 'Apenas administradores podem editar permissões de cargos!', flags: [MessageFlags.Ephemeral] });
    }

    agendarExpiracaoGRoles(painelId, interaction.channel.id);

    const cargo = interaction.guild.roles.cache.get(cargoId);
    if (!cargo) {
        return interaction.update({ components: [montarPainelGRolesPermLista(interaction.guild, listaPagina)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
    }

    const termo = interaction.fields.getTextInputValue('termo_busca_perm').trim();
    draft.buscaPerm = termo || null;

    return interaction.update({ components: [montarPainelGRolesPermissoes(cargo, 0, listaPagina, draft.buscaPerm)], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });
}

if (interaction.isChatInputCommand() && comandos.has(interaction.commandName)) {
    try {
        return await comandos.get(interaction.commandName).execute(interaction);
    } catch (err) {
        console.error(`--- Erro no comando /${interaction.commandName} ---`, err);
        const payload = { content: 'Ocorreu um erro ao executar esse comando.', flags: [MessageFlags.Ephemeral] };
        if (interaction.replied || interaction.deferred) return interaction.followUp(payload).catch(() => null);
        return interaction.reply(payload).catch(() => null);
    }
}

if (interaction.isStringSelectMenu() && interaction.customId === 'msgcriador_botao_editar_select') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const idx = parseInt(interaction.values[0]);
    const botao = draft.botoes?.[idx];
    if (!botao) {
        return interaction.reply({ content: 'Esse botão não foi encontrado.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder()
        .setCustomId(`msgcriador_modal_editar_botao_${interaction.message.id}_${idx}`)
        .setTitle('Editar botão');

    const inputLabel = new TextInputBuilder().setCustomId('botao_label').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true).setValue(botao.label);
    const labelLabel = new LabelBuilder().setLabel('Label do botão').setTextInputComponent(inputLabel);

    const inputUrl = new TextInputBuilder().setCustomId('botao_url').setStyle(TextInputStyle.Short).setRequired(false).setValue(botao.url || '');
    const labelUrl = new LabelBuilder().setLabel('URL do botão (opcional)').setDescription('Se preenchida, o botão vira um link e ignora a cor.').setTextInputComponent(inputUrl);

    const emojiValor = typeof botao.emoji === 'string' ? botao.emoji : (botao.emoji?.id ? `<:e:${botao.emoji.id}>` : '');
    const inputEmoji = new TextInputBuilder().setCustomId('botao_emoji').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(false).setValue(emojiValor);
    const labelEmoji = new LabelBuilder().setLabel('Emoji (opcional)').setTextInputComponent(inputEmoji);

    const selectCor = new StringSelectMenuBuilder().setCustomId('botao_cor').setRequired(true).addOptions(
        CORES_BOTAO.map(c => ({ ...c, default: c.value === botao.cor }))
    );
    const labelCor = new LabelBuilder().setLabel('Cor do botão').setStringSelectMenuComponent(selectCor);

    const labels = [labelLabel, labelUrl, labelEmoji, labelCor];

    if (draft.tipo === 'v2') {
        const selectPosicao = new StringSelectMenuBuilder().setCustomId('botao_posicao').setRequired(true).addOptions(
            POSICOES_BOTAO.map(p => ({ ...p, default: p.value === botao.posicao }))
        );
        const labelPosicao = new LabelBuilder().setLabel('Posição do botão').setStringSelectMenuComponent(selectPosicao);
        labels.push(labelPosicao);
    }

    modal.addLabelComponents(...labels);
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('msgcriador_modal_editar_botao_')) {
    const resto = interaction.customId.replace('msgcriador_modal_editar_botao_', '');
    const separador = resto.lastIndexOf('_');
    const painelId = resto.slice(0, separador);
    const idx = parseInt(resto.slice(separador + 1));

    const draft = msgCriadorDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    const botaoAtual = draft.botoes?.[idx];
    if (!botaoAtual) {
        return interaction.reply({ content: 'Esse botão não foi encontrado.', flags: [MessageFlags.Ephemeral] });
    }

    const label = interaction.fields.getTextInputValue('botao_label').trim();
    const url = interaction.fields.getTextInputValue('botao_url').trim();
    const emojiBruto = interaction.fields.getTextInputValue('botao_emoji').trim();
    const cor = interaction.fields.getStringSelectValues('botao_cor')[0];
    const posicao = draft.tipo === 'v2' ? interaction.fields.getStringSelectValues('botao_posicao')[0] : botaoAtual.posicao;

    if (!label) {
        return interaction.reply({ content: 'O label do botão não pode ficar vazio.', flags: [MessageFlags.Ephemeral] });
    }
    if (url && !/^https?:\/\//i.test(url)) {
        return interaction.reply({ content: 'A URL do botão precisa começar com http:// ou https://', flags: [MessageFlags.Ephemeral] });
    }

    let emoji = null;
    if (emojiBruto) {
        const matchEmoji = emojiBruto.match(/<a?:\w{2,32}:(\d+)>/);
        emoji = matchEmoji ? { id: matchEmoji[1] } : emojiBruto;
    }

    draft.botoes[idx] = { ...botaoAtual, label, url: url || null, emoji, cor, posicao };
    draft.opcaoAtual = 'botoes';

    return interaction.update({
        components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
        flags: [MessageFlags.IsComponentsV2]
    });
}
	
if (interaction.isButton() && interaction.customId.startsWith('help_info_')) {
    const partes = interaction.customId.replace('help_info_', '').split('_');
    const indice = parseInt(partes.pop());
    const categoria = partes.join('_');

    const lista = (CATEGORIAS_HELP[categoria] || CATEGORIAS_HELP.slash).lista;
    const item = lista[indice];
    if (!item) {
        return interaction.reply({ content: 'Comando não encontrado.', flags: [MessageFlags.Ephemeral] });
    }

    const info = INFO_COMANDOS[item.cmd] || {};
    const paginaOrigem = Math.floor(indice / HELP_POR_PAGINA);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### \`${item.cmd}\``))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Ajuda › ${item.categoria || 'Geral'} › \`${item.cmd}\``))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            info.descricao || item.desc
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Como usar**\n\`${info.comoUsar || item.cmd}\``
        ));

    if (info.exemplo && info.exemplo !== info.comoUsar) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Exemplo**\n\`${info.exemplo}\``
        ));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# Permissão necessária: ${info.permissao || 'Nenhuma'}`
    ));

    container.addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`help_voltar_${categoria}_${paginaOrigem}`)
                .setLabel('Voltar')
                .setStyle(ButtonStyle.Secondary)
        )
    );

    return interaction.update({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isButton() && interaction.customId.startsWith('help_voltar_')) {
    const partes = interaction.customId.replace('help_voltar_', '').split('_');
    const pagina = parseInt(partes.pop());
    const categoria = partes.join('_');

    return interaction.update({
        components: [montarPainelHelp(categoria, pagina)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isButton() && interaction.customId.startsWith('help_pagina_') && interaction.customId !== 'help_pagina_atual') {
    const partes = interaction.customId.replace('help_pagina_', '').split('_');
    const pagina = parseInt(partes.pop());
    const categoria = partes.join('_');

    return interaction.update({
        components: [montarPainelHelp(categoria, pagina)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isStringSelectMenu() && interaction.customId === 'help_categoria_select') {
    const categoria = interaction.values[0];
    return interaction.update({
        components: [montarPainelHelp(categoria, 0)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

	
	if (interaction.isButton() && interaction.customId === 'painelurl_verificar') {
    const CARGO_URL_TURQUIA = '1542321888175456362';

    let membroAtualizado;

    try {
        membroAtualizado = await interaction.guild.members.fetch(interaction.user.id);
    } catch (err) {
        console.error('--- Erro ao atualizar membro ---', err);

        return interaction.reply({
            components: containerTexto('Não foi possível verificar seus cargos. Tente novamente em alguns instantes.'),
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    if (membroAtualizado.roles.cache.has(CARGO_URL_TURQUIA)) {
        return interaction.reply({
            components: containerTexto('Você já possui o cargo de verificação!'),
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

let perfil;

    try {
        perfil = await getUserPerfil(interaction.user.id, interaction.guild.id, { force: true });
    } catch (err) {
        console.error('--- Erro ao verificar URL na bio/pronomes ---', err.message);

        return interaction.editReply({
            components: containerTexto(
                'Ocorreu um erro ao consultar seu perfil. Tente novamente em alguns instantes.'
            ),
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    const textoCompleto = `${perfil.bio || ''} ${perfil.pronouns || ''}`;
    const contemUrl = await contemConviteDoServidor(textoCompleto, interaction.guild.id);

    if (!contemUrl) {
        return interaction.editReply({
            components: containerTexto(
                'A url do servidor não foi econtrada na sua **bio/pronomes**'
            ),
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    try {
        await membroAtualizado.roles.add(CARGO_URL_TURQUIA);
    } catch (err) {
        console.error('--- Erro ao adicionar cargo de URL ---', err);

        return interaction.editReply({
            components: containerTexto(
                'O link foi encontrado, mas ocorreu um erro ao adicionar o cargo. Avise um administrador.'
            ),
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    return interaction.editReply({
        components: containerTexto(
            `Suas vantagens foram adcionadas com sucesso!`
        ),
        flags: [MessageFlags.IsComponentsV2]
    });
}


if (interaction.isButton() && interaction.customId === 'antinuke_toggle') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }
    protecaoConfig.antiRaid.nukeAtivo = !protecaoConfig.antiRaid.nukeAtivo;
    await salvarProtecao();
    return interaction.update({ components: [montarPainelAntiNuke()], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'antinuke_configurar') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder().setCustomId('modal_antinuke_config').setTitle('Configurar limites do Anti Nuke');

    const inputCanais = new TextInputBuilder().setCustomId('limiteCanais').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(protecaoConfig.antiRaid.limiteCanais));
    const inputCargos = new TextInputBuilder().setCustomId('limiteCargos').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(protecaoConfig.antiRaid.limiteCargos));
    const inputBans = new TextInputBuilder().setCustomId('limiteBans').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(protecaoConfig.antiRaid.limiteBans));
    const inputWebhooks = new TextInputBuilder().setCustomId('limiteWebhooks').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(protecaoConfig.antiRaid.limiteWebhooks));
    const inputJanela = new TextInputBuilder().setCustomId('janelaSegundos').setStyle(TextInputStyle.Short).setRequired(true).setValue(String(protecaoConfig.antiRaid.janelaMs / 1000));

    modal.addLabelComponents(
        new LabelBuilder().setLabel('Limite de canais deletados').setTextInputComponent(inputCanais),
        new LabelBuilder().setLabel('Limite de cargos deletados').setTextInputComponent(inputCargos),
        new LabelBuilder().setLabel('Limite de banimentos').setTextInputComponent(inputBans),
        new LabelBuilder().setLabel('Limite de webhooks criados/deletados').setTextInputComponent(inputWebhooks),
        new LabelBuilder().setLabel('Janela de tempo (segundos)').setTextInputComponent(inputJanela)
    );

    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId === 'modal_antinuke_config') {
    const canais = parseInt(interaction.fields.getTextInputValue('limiteCanais'));
    const cargos = parseInt(interaction.fields.getTextInputValue('limiteCargos'));
    const bans = parseInt(interaction.fields.getTextInputValue('limiteBans'));
    const webhooks = parseInt(interaction.fields.getTextInputValue('limiteWebhooks'));
    const janela = parseInt(interaction.fields.getTextInputValue('janelaSegundos'));

    if (!isNaN(canais) && canais > 0) protecaoConfig.antiRaid.limiteCanais = canais;
    if (!isNaN(cargos) && cargos > 0) protecaoConfig.antiRaid.limiteCargos = cargos;
    if (!isNaN(bans) && bans > 0) protecaoConfig.antiRaid.limiteBans = bans;
    if (!isNaN(webhooks) && webhooks > 0) protecaoConfig.antiRaid.limiteWebhooks = webhooks;
    if (!isNaN(janela) && janela > 0) protecaoConfig.antiRaid.janelaMs = janela * 1000;

    await salvarProtecao();

    if (interaction.message) {
        return interaction.update({ components: [montarPainelAntiNuke()], flags: [MessageFlags.IsComponentsV2] });
    }
    return interaction.deferUpdate();
}

if (interaction.isStringSelectMenu() && interaction.customId === 'antinuke_acao_select') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }
    protecaoConfig.antiRaid.acaoExecutor = interaction.values[0];
    await salvarProtecao();
    return interaction.update({ components: [montarPainelAntiNuke()], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isUserSelectMenu() && interaction.customId === 'antinuke_whitelist_select') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }
    protecaoConfig.antiRaid.whitelistIds = interaction.values;
    await salvarProtecao();
    return interaction.update({ components: [montarPainelAntiNuke()], flags: [MessageFlags.IsComponentsV2] });
}
	
	
if (interaction.isButton() && interaction.customId === 'antiraid_ativar') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    protecaoConfig.antiSpam.ativo = true;
    protecaoConfig.antiSpam.msgLimite = 3;
    protecaoConfig.antiSpam.janelaMs = 5000;
    protecaoConfig.antiSpam.muteMinutos = 1440;

    protecaoConfig.antiLink.ativo = true;
    protecaoConfig.antiLink.bloquearConvites = true;
    protecaoConfig.antiLink.cargosBypass = [];

    protecaoConfig.antiFake.ativo = true;
    protecaoConfig.antiFake.diasMinimos = 30;
    protecaoConfig.antiFake.acao = 'banir';

    await salvarProtecao();
    await atualizarTodosPaineisProtecao();

    return interaction.update({
        components: [montarPainelProtecao(interaction.guild.id)],
        flags: [MessageFlags.IsComponentsV2]
    });
}


if (interaction.isButton() && interaction.customId === 'antiraid_desativar') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    protecaoConfig.antiSpam.ativo = false;
    protecaoConfig.antiLink.ativo = false;
    protecaoConfig.antiFake.ativo = false;

    await salvarProtecao();
    await atualizarTodosPaineisProtecao();

    return interaction.update({
        components: [montarPainelProtecao(interaction.guild.id)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

	
	if (interaction.isButton() && interaction.customId === 'backup_remover_abrir') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const backups = await ServerBackup.find({ guildId: interaction.guild.id }).sort({ criadoEm: -1 }).catch(() => []);
    if (!backups.length) {
        return interaction.reply({ content: 'Não há nenhum backup salvo pra remover.', flags: [MessageFlags.Ephemeral] });
    }

    return interaction.update({
        components: [montarPainelRemoverSelect(backups)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isStringSelectMenu() && interaction.customId === 'backup_remover_select') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const backupId = interaction.values[0];
    const backup = await ServerBackup.findOne({ _id: backupId, guildId: interaction.guild.id }).catch(() => null);
    if (!backup) {
        return interaction.update({ components: containerTexto('Esse backup não existe mais.'), flags: [MessageFlags.IsComponentsV2] });
    }

    return interaction.update({
        components: [montarPainelRemoverConfirmacao(backup)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isButton() && interaction.customId.startsWith('backup_remover_confirmar_')) {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const backupId = interaction.customId.replace('backup_remover_confirmar_', '');
    await ServerBackup.deleteOne({ _id: backupId, guildId: interaction.guild.id }).catch(() => null);

    await interaction.update({
        components: containerTexto('Backup removido com sucesso!'),
        flags: [MessageFlags.IsComponentsV2]
    });

    setTimeout(async () => {
        const painel = await montarPainelBackup(interaction.guild.id);
        await interaction.editReply({ components: [painel], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
    }, 2500);
    return;
}

if (interaction.isButton() && interaction.customId === 'backup_remover_cancelar') {
    const painel = await montarPainelBackup(interaction.guild.id);
    return interaction.update({ components: [painel], flags: [MessageFlags.IsComponentsV2] });
}
	
if (interaction.isStringSelectMenu() && interaction.customId === 'protecao_menu_select') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const tipo = interaction.values[0];

    if (tipo === 'backup') {
        const painel = await montarPainelBackup(interaction.guild.id);
        return interaction.reply({
            components: [painel],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    if (tipo === 'antiraid') {
        return interaction.reply({
            components: [montarPainelAntiNuke()],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    if (tipo === 'lock') {
        return interaction.reply({
            components: [montarPainelLock(interaction.guild.id)],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    return interaction.reply({
        components: [montarPainelEfemeroProtecao(tipo)],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}


if (interaction.isStringSelectMenu() && interaction.customId === 'backup_selecionar') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const backupId = interaction.values[0];
    const backup = await ServerBackup.findOne({ _id: backupId, guildId: interaction.guild.id }).catch(() => null);
    if (!backup) {
        return interaction.update({ components: containerTexto('Esse backup não existe mais.'), flags: [MessageFlags.IsComponentsV2] });
    }

    return interaction.update({ components: [montarPainelBackupSelecionado(backup)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'backup_voltar_lista') {
    const painel = await montarPainelBackup(interaction.guild.id);
    return interaction.update({ components: [painel], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'backup_fazer') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const estado = { cancelado: false };
    processosBackup.set(interaction.guild.id, estado);
    const inicioProcesso = Date.now();

    await interaction.update({
        components: [montarPainelProgressoBackup('Iniciando...', [], [], false, true, inicioProcesso)],
        flags: [MessageFlags.IsComponentsV2]
    });

    let ultimaEdicao = Date.now();
    const INTERVALO_MIN_MS = 7000;

    const resultado = await fazerBackupServidor(interaction.guild, async (etapa, res) => {
        const agora = Date.now();
        if (agora - ultimaEdicao < INTERVALO_MIN_MS) return; // pula essa atualização
        ultimaEdicao = agora;

        await interaction.editReply({
            components: [montarPainelProgressoBackup(etapa, res.sucesso, res.erros, false, true, inicioProcesso)],
            flags: [MessageFlags.IsComponentsV2]
        }).catch(() => null);
    }, estado);

    processosBackup.delete(interaction.guild.id);

    await interaction.editReply({
        components: [montarPainelProgressoBackup('Backup concluído!', resultado.sucesso, resultado.erros, true, false, inicioProcesso)],
        flags: [MessageFlags.IsComponentsV2]
    });

    setTimeout(async () => {
        const painel = await montarPainelBackup(interaction.guild.id);
        await interaction.editReply({ components: [painel], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
    }, 4000);
    return;
}

if (interaction.isButton() && interaction.customId.startsWith('backup_restaurar_')) {
    const temPermissao = interaction.member.permissions.has('Administrator') || interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para restaurar o backup!', flags: [MessageFlags.Ephemeral] });
    }

    const backupId = interaction.customId.replace('backup_restaurar_', '');

    const estado = { cancelado: false };
    processosBackup.set(interaction.guild.id, estado);
    const inicioProcesso = Date.now();

    await interaction.update({
        components: [montarPainelProgressoBackup('Iniciando restauração...', [], [], false, true, inicioProcesso)],
        flags: [MessageFlags.IsComponentsV2]
    });

    let ultimaEdicao = Date.now();
    const INTERVALO_MIN_MS = 7000;

    let resultado;
    try {
        resultado = await restaurarBackupServidor(interaction.guild, backupId, async (etapa, res) => {
            const agora = Date.now();
            if (agora - ultimaEdicao < INTERVALO_MIN_MS) return; // pula essa atualização
            ultimaEdicao = agora;

            await interaction.editReply({
                components: [montarPainelProgressoBackup(etapa, res.sucesso, res.erros, false, true, inicioProcesso)],
                flags: [MessageFlags.IsComponentsV2]
            }).catch(() => null);
        }, estado);
    } catch (err) {
        console.error('--- Erro ao restaurar backup ---', err);
        processosBackup.delete(interaction.guild.id);
        return interaction.editReply({
            components: containerTexto('Ocorreu um erro inesperado durante a restauração. Veja o console.'),
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    processosBackup.delete(interaction.guild.id);

    return interaction.editReply({
        components: [montarPainelProgressoBackup('Restauração concluída!', resultado.sucesso, resultado.erros, true, false, inicioProcesso)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isButton() && interaction.customId.startsWith('backup_deletar_')) {
    const temPermissao = interaction.member.permissions.has('Administrator') || interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para deletar backups!', flags: [MessageFlags.Ephemeral] });
    }

    const backupId = interaction.customId.replace('backup_deletar_', '');
    await ServerBackup.deleteOne({ _id: backupId, guildId: interaction.guild.id }).catch(() => null);

    const painel = await montarPainelBackup(interaction.guild.id);
    return interaction.update({ components: [painel], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'backup_parar') {
    const estado = processosBackup.get(interaction.guild.id);
    if (!estado) {
        return interaction.reply({ content: 'Nenhum processo em andamento para parar.', flags: [MessageFlags.Ephemeral] });
    }

    estado.cancelado = true;

    return interaction.reply({ content: 'Parando o processo. Aguarde a etapa atual finalizar.', flags: [MessageFlags.Ephemeral] });
}

if (interaction.isButton() && interaction.customId.startsWith('userinfo_bios_ver_')) {
    try {
        const [alvoId, autorId, expiraTexto] = interaction.customId.replace('userinfo_bios_ver_', '').split('_');
        const expiraEm = parseInt(expiraTexto) || 0;

        if (interaction.user.id !== autorId) {
            return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
        }
        const alvoUser = await interaction.client.users.fetch(alvoId, { force: true }).catch(() => null);
        if (!alvoUser) return interaction.reply({ content: 'Usuário não encontrado.', flags: [MessageFlags.Ephemeral] });

        const painel = await montarPainelBiosLista(alvoUser, autorId, 0, expiraEm);
        return interaction.reply({
            components: [painel],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
            allowedMentions: { parse: ['users'] }
        });
    } catch (err) {
        console.error('--- Erro ao abrir lista de biografias ---', err);
        return interaction.reply({ content: 'Ocorreu um erro ao carregar as biografias.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}

if (interaction.isButton() && interaction.customId.startsWith('userinfo_bios_pagina_') && interaction.customId !== 'userinfo_bios_pagina_atual') {
    try {
        const partes = interaction.customId.replace('userinfo_bios_pagina_', '').split('_');
        const expiraEm = parseInt(partes.pop()) || 0;
        const pagina = parseInt(partes.pop());
        const autorId = partes.pop();
        const alvoId = partes.pop();

        if (interaction.user.id !== autorId) {
            return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
        }
        const alvoUser = await interaction.client.users.fetch(alvoId, { force: true }).catch(() => null);
        if (!alvoUser) return interaction.reply({ content: 'Usuário não encontrado.', flags: [MessageFlags.Ephemeral] });

        await interaction.deferUpdate();
        const painel = await montarPainelBiosLista(alvoUser, autorId, pagina, expiraEm);
        return interaction.editReply({
            components: [painel],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: ['users'] }
        });
    } catch (err) {
        console.error('--- Erro ao paginar biografias ---', err);
        return interaction.reply({ content: 'Ocorreu um erro ao navegar pelas biografias.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}
	
if (interaction.isButton() && interaction.customId.startsWith('info_hierarquia_verificar_')) {
    const autorId = interaction.customId.replace('info_hierarquia_verificar_', '');
    if (interaction.user.id !== autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }

    return interaction.reply({
        components: [montarPainelVerificacaoCargos()],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isRoleSelectMenu() && interaction.customId === 'info_hierarquia_cargo_select') {
    const cargo = interaction.roles.first();
    if (!cargo) {
        return interaction.reply({ content: 'Cargo inválido.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferUpdate();

    const container = await montarPainelListaCargo(interaction.guild, cargo);

    return interaction.editReply({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isRoleSelectMenu() && interaction.customId === 'info_hierarquia_cargo_select') {
    const cargo = interaction.roles.first();
    if (!cargo) {
        return interaction.reply({ content: 'Cargo inválido.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferUpdate();

    const container = await montarPainelListaCargo(interaction.guild, cargo, 0);

    return interaction.editReply({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isButton() && interaction.customId.startsWith('info_hierarquia_pagina_') && interaction.customId !== 'info_hierarquia_pagina_atual') {
    const partes = interaction.customId.replace('info_hierarquia_pagina_', '').split('_');
    const pagina = parseInt(partes.pop());
    const cargoId = partes.join('_');

    const cargo = interaction.guild.roles.cache.get(cargoId);
    if (!cargo) {
        return interaction.reply({ content: 'Esse cargo não existe mais.', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferUpdate();

    const container = await montarPainelListaCargo(interaction.guild, cargo, pagina);

    return interaction.editReply({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}
	
if (interaction.isButton() && interaction.customId === 'moderacao_confirmar') {
    const draft = confirmacaoModeracaoDB.get(interaction.message.id);
    if (!draft) {
        return interaction.update({ components: containerTexto('Essa confirmação expirou.'), flags: [MessageFlags.IsComponentsV2] });
    }
    if (interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferUpdate();
    confirmacaoModeracaoDB.delete(interaction.message.id);

    const alvoUserFetch = await interaction.client.users.fetch(draft.alvoId).catch(() => null);

if (draft.tipo === 'ban') {
        try {
            await interaction.guild.members.ban(draft.alvoId, {
                reason: draft.motivo || 'Não informado',
               deleteMessageSeconds: 7 * 24 * 60 * 60
            });
        } catch (err) {
            console.error('--- Erro ao banir (confirmação) ---', err);
            return interaction.editReply({ components: containerTexto('Ocorreu um erro ao banir esse usuário.'), flags: [MessageFlags.IsComponentsV2] });
        }

        await logarBanimento({
            guild: interaction.guild, tipo: 'Banimento',
            alvo: `<@${draft.alvoId}> (${draft.alvoTag})`,
            alvoUser: alvoUserFetch,
           autor: interaction.user, motivo: draft.motivo
       });

        avisoSucessoModeracao(interaction.channel, `<:21444:1545643785675874420> · <@${draft.alvoId}> foi banido com sucesso!`);

        return interaction.editReply({ components: containerTexto(`**${draft.alvoTag}** foi banido com sucesso!`), flags: [MessageFlags.IsComponentsV2] });
    }

    if (draft.tipo === 'unban') {
        try {
            await interaction.guild.members.unban(draft.alvoId, draft.motivo || 'Não informado');
        } catch (err) {
            console.error('--- Erro ao desbanir (confirmação) ---', err);
            return interaction.editReply({ components: containerTexto('Ocorreu um erro ao desbanir esse usuário.'), flags: [MessageFlags.IsComponentsV2] });
        }

        await logarBanimento({
            guild: interaction.guild, tipo: 'Unban',
            alvo: `${draft.alvoTag} (${draft.alvoId})`,
            alvoUser: alvoUserFetch,
            autor: interaction.user, motivo: draft.motivo
       });

        avisoSucessoModeracao(interaction.channel, `<:21444:1545643785675874420> · <@${draft.alvoId}> foi desbanido com sucesso!`);

        return interaction.editReply({ components: containerTexto(`**${draft.alvoTag}** foi desbanido com sucesso!`), flags: [MessageFlags.IsComponentsV2] });
    }
}

if (interaction.isButton() && interaction.customId === 'moderacao_cancelar') {
    const draft = confirmacaoModeracaoDB.get(interaction.message.id);
    if (draft && interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }
    confirmacaoModeracaoDB.delete(interaction.message.id);

    return interaction.update({ components: containerTexto('Ação cancelada.'), flags: [MessageFlags.IsComponentsV2] });
}

	if (interaction.isChatInputCommand() && interaction.commandName === 'beijar') {
    const alvo = interaction.options.getUser('usuario');

    if (alvo.id === interaction.user.id) {
        return interaction.reply({ content: 'Você não pode se beijar sozinho(a)!', flags: [MessageFlags.Ephemeral] });
    }
    if (alvo.bot) {
        return interaction.reply({ content: 'Você não pode beijar um bot!', flags: [MessageFlags.Ephemeral] });
    }

    const [streakAtual] = await Promise.all([
        incrementarBeijoStreak(interaction.guild.id, interaction.user.id, alvo.id),
        somarSaldo(interaction.user.id, XP_POR_BEIJO).catch(() => null),
        somarSaldo(alvo.id, XP_POR_BEIJO).catch(() => null)
    ]);

    return interaction.reply({
        components: [montarEmbedBeijo(interaction.user, alvo, streakAtual)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isButton() && interaction.customId.startsWith('beijar_retribuir_')) {
    const [, , autorOriginalId, alvoOriginalId, timestampTexto] = interaction.customId.split('_');

    if (interaction.user.id !== alvoOriginalId) {
        return interaction.reply({ content: 'Só quem recebeu o beijo pode retribuir!', flags: [MessageFlags.Ephemeral] });
    }

    const timestampCriacao = parseInt(timestampTexto);
    if (isNaN(timestampCriacao) || (Date.now() - timestampCriacao) > LIMITE_RETRIBUIR_MS) {
        return interaction.reply({
            components: containerTexto('Essa interação **expirou**! seu boboca'),
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    const autorOriginal = await interaction.client.users.fetch(autorOriginalId).catch(() => null);
    if (!autorOriginal) {
        return interaction.reply({ content: 'Não foi possível encontrar esse usuário.', flags: [MessageFlags.Ephemeral] });
    }

    const [streakAtual] = await Promise.all([
        incrementarBeijoStreak(interaction.guild.id, interaction.user.id, autorOriginal.id),
        somarSaldo(interaction.user.id, XP_POR_BEIJO).catch(() => null),
        somarSaldo(autorOriginal.id, XP_POR_BEIJO).catch(() => null)
    ]);

    return interaction.reply({
        components: [montarEmbedBeijo(interaction.user, autorOriginal, streakAtual, true)],
        flags: [MessageFlags.IsComponentsV2]
    });
}
	
if (interaction.isChatInputCommand() && interaction.commandName === 'ui') {
    try {
        let alvo = interaction.options.getUser('usuario');

        if (!alvo) alvo = interaction.user;

        const painel = await montarPainelUserInfo(interaction.guild, alvo, interaction.user.id);
        return interaction.reply({
            components: [painel],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
            allowedMentions: { parse: ['users'] }
        });
    } catch (err) {
        console.error('--- Erro no comando /ui ---', err);
        return interaction.reply({ content: 'Ocorreu um erro ao montar as informações do usuário.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}

if (interaction.isStringSelectMenu() && interaction.customId.startsWith('userinfo_menu_')) {
    try {
        const [, , alvoId, autorId, expiraTexto] = interaction.customId.split('_');
        const expiraEm = parseInt(expiraTexto) || 0;

        if (interaction.user.id !== autorId) {
            return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
        }
        const alvoUser = await interaction.client.users.fetch(alvoId, { force: true }).catch(() => null);
        if (!alvoUser) return interaction.reply({ content: 'Não foi possível encontrar esse usuário.', flags: [MessageFlags.Ephemeral] });

        const opcao = interaction.values[0];
        let painel;
        if (opcao === 'perfil') painel = await montarPainelUserInfo(interaction.guild, alvoUser, autorId, expiraEm);
        else if (opcao === 'bios') painel = await montarPainelBios(interaction.guild, alvoUser, autorId, expiraEm);
        else if (opcao === 'usernames') painel = await montarPainelUsernames(alvoUser, autorId, expiraEm);
        else if (opcao === 'avatares') painel = await montarPainelAvatares(alvoUser, autorId, 0, expiraEm);
        else if (opcao === 'banners') painel = await montarPainelBanners(alvoUser, autorId, 0, expiraEm);

        return interaction.update({
            components: [painel],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: ['users'] }
        });
    } catch (err) {
        console.error('--- Erro no select do userinfo ---', err);
        return interaction.reply({ content: 'Ocorreu um erro ao trocar de aba.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}

if (interaction.isButton() && interaction.customId.startsWith('userinfo_avatar_')) {
    try {
        const [alvoId, autorId, indiceTexto, expiraTexto] = interaction.customId.replace('userinfo_avatar_', '').split('_');
        const expiraEm = parseInt(expiraTexto) || 0;

        if (interaction.user.id !== autorId) {
            return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
        }
        const alvoUser = await interaction.client.users.fetch(alvoId, { force: true }).catch(() => null);
        if (!alvoUser) return interaction.reply({ content: 'Usuário não encontrado.', flags: [MessageFlags.Ephemeral] });

        const painel = await montarPainelAvatares(alvoUser, autorId, parseInt(indiceTexto), expiraEm);
        return interaction.update({
            components: [painel],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: ['users'] }
        });
    } catch (err) {
        console.error('--- Erro no botão de avatares do userinfo ---', err);
        return interaction.reply({ content: 'Ocorreu um erro ao navegar pelos avatares.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}

if (interaction.isButton() && interaction.customId.startsWith('userinfo_banner_')) {
    try {
        const [alvoId, autorId, indiceTexto, expiraTexto] = interaction.customId.replace('userinfo_banner_', '').split('_');
        const expiraEm = parseInt(expiraTexto) || 0;

        if (interaction.user.id !== autorId) {
            return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
        }
        const alvoUser = await interaction.client.users.fetch(alvoId, { force: true }).catch(() => null);
        if (!alvoUser) return interaction.reply({ content: 'Usuário não encontrado.', flags: [MessageFlags.Ephemeral] });

        const painel = await montarPainelBanners(alvoUser, autorId, parseInt(indiceTexto), expiraEm);
        return interaction.update({
            components: [painel],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: ['users'] }
        });
    } catch (err) {
        console.error('--- Erro no botão de banners do userinfo ---', err);
        return interaction.reply({ content: 'Ocorreu um erro ao navegar pelos banners.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
    }
}
	
	if (interaction.isChatInputCommand() && interaction.commandName === 'sorteio') {
    if (interaction.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
    }
    const temPermissao = interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
    }

    const container = await montarPainelSorteioInicial(interaction.guild.id, interaction.user.id);
    return interaction.reply({ components: [container], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
}


if (interaction.isButton() && interaction.customId === 'sorteio_criar_novo') {
    const draft = {
        id: null, autorId: interaction.user.id, guildId: interaction.guild.id,
        tag: null, premio: null, duracaoTexto: null, duracaoMs: null,
        canalId: null, imagemUrl: null,
        requisitoCallTexto: null, requisitoCallMs: 0,
        requisitoMensagens: 0, requisitoInvites: 0,
        requisitoTextoLivre: null,
        status: 'rascunho', timeoutId: null
    };

    await interaction.update({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });
    draft.timeoutId = setTimeout(() => sorteioDraftDB.delete(interaction.message.id), 15 * 60 * 1000);
    sorteioDraftDB.set(interaction.message.id, draft);
    return;
}

if (interaction.isStringSelectMenu() && interaction.customId === 'sorteio_gerenciar_encerrado_select') {
    const tag = interaction.values[0];
    const sorteioDoc = await Sorteio.findOne({ guildId: interaction.guild.id, criadorId: interaction.user.id, tag, status: 'encerrado' });
    if (!sorteioDoc) {
        return interaction.reply({ content: 'Esse sorteio não foi encontrado.', flags: [MessageFlags.Ephemeral] });
    }

    const draft = {
        id: sorteioDoc._id, autorId: interaction.user.id, guildId: interaction.guild.id,
        tag: sorteioDoc.tag, premio: sorteioDoc.premio,
        duracaoTexto: sorteioDoc.duracaoTexto, duracaoMs: sorteioDoc.duracaoMs,
        canalId: sorteioDoc.canalId, imagemUrl: sorteioDoc.imagemUrl,
        requisitoCallTexto: sorteioDoc.requisitoCallTexto, requisitoCallMs: sorteioDoc.requisitoCallMs,
        requisitoMensagens: sorteioDoc.requisitoMensagens, requisitoInvites: sorteioDoc.requisitoInvites,
        requisitoTextoLivre: sorteioDoc.requisitoTextoLivre,
        status: sorteioDoc.status, timeoutId: null
    };

    await interaction.update({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });
    draft.timeoutId = setTimeout(() => sorteioDraftDB.delete(interaction.message.id), 15 * 60 * 1000);
    sorteioDraftDB.set(interaction.message.id, draft);
    return;
}

if (interaction.isStringSelectMenu() && interaction.customId === 'sorteio_gerenciar_select') {
    const tag = interaction.values[0];
    const sorteioDoc = await Sorteio.findOne({ guildId: interaction.guild.id, criadorId: interaction.user.id, tag, status: 'ativo' });
    if (!sorteioDoc) {
        return interaction.reply({ content: 'Esse sorteio não foi encontrado ou não está mais ativo.', flags: [MessageFlags.Ephemeral] });
    }

    const draft = {
        id: sorteioDoc._id, autorId: interaction.user.id, guildId: interaction.guild.id,
        tag: sorteioDoc.tag, premio: sorteioDoc.premio,
        duracaoTexto: sorteioDoc.duracaoTexto, duracaoMs: sorteioDoc.duracaoMs,
        canalId: sorteioDoc.canalId, imagemUrl: sorteioDoc.imagemUrl,
        requisitoCallTexto: sorteioDoc.requisitoCallTexto, requisitoCallMs: sorteioDoc.requisitoCallMs,
        requisitoMensagens: sorteioDoc.requisitoMensagens, requisitoInvites: sorteioDoc.requisitoInvites,
        requisitoTextoLivre: sorteioDoc.requisitoTextoLivre,
        status: sorteioDoc.status, timeoutId: null
    };

    await interaction.update({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });
    draft.timeoutId = setTimeout(() => sorteioDraftDB.delete(interaction.message.id), 15 * 60 * 1000);
    sorteioDraftDB.set(interaction.message.id, draft);
    return;
}

// ---- Tag ----
if (interaction.isButton() && interaction.customId === 'sorteio_editar_tag') {
    const draft = sorteioDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder().setCustomId(`sorteio_modal_tag_${interaction.message.id}`).setTitle('Editar tag');
    const inputTag = new TextInputBuilder().setCustomId('tag').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32).setValue(draft.tag || '');
    modal.addLabelComponents(
        new LabelBuilder().setLabel('Tag interna').setDescription('Usada para localizar esse sorteio depois.').setTextInputComponent(inputTag)
    );
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('sorteio_modal_tag_')) {
    const painelId = interaction.customId.replace('sorteio_modal_tag_', '');
    const draft = sorteioDraftDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const tag = interaction.fields.getTextInputValue('tag').trim();
    if (!tag) {
        return interaction.reply({ content: 'A tag não pode ficar vazia.', flags: [MessageFlags.Ephemeral] });
    }

    const conflito = await Sorteio.findOne({ guildId: interaction.guild.id, criadorId: interaction.user.id, tag, status: 'ativo' });
    if (conflito && String(conflito._id) !== String(draft.id)) {
        return interaction.reply({ content: 'Você já possui um sorteio ativo com essa tag!', flags: [MessageFlags.Ephemeral] });
    }

    draft.tag = tag;
    return interaction.update({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });
}

// ---- Prêmio ----
if (interaction.isButton() && interaction.customId === 'sorteio_editar_premio') {
    const draft = sorteioDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder().setCustomId(`sorteio_modal_premio_${interaction.message.id}`).setTitle('Editar prêmio');
    const inputPremio = new TextInputBuilder().setCustomId('premio').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200).setValue(draft.premio || '');
    modal.addLabelComponents(new LabelBuilder().setLabel('Prêmio').setTextInputComponent(inputPremio));
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('sorteio_modal_premio_')) {
    const painelId = interaction.customId.replace('sorteio_modal_premio_', '');
    const draft = sorteioDraftDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const premio = interaction.fields.getTextInputValue('premio').trim();
    if (!premio) {
        return interaction.reply({ content: 'O prêmio não pode ficar vazio.', flags: [MessageFlags.Ephemeral] });
    }

    draft.premio = premio;
    return interaction.update({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });
}

// ---- Duração ----
if (interaction.isButton() && interaction.customId === 'sorteio_editar_duracao') {
    const draft = sorteioDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder().setCustomId(`sorteio_modal_duracao_${interaction.message.id}`).setTitle('Editar duração');
    const inputDuracao = new TextInputBuilder().setCustomId('duracao').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(10).setValue(draft.duracaoTexto || '');
    modal.addLabelComponents(new LabelBuilder().setLabel('Duração').setDescription('Ex: 1h, 2d, 30m').setTextInputComponent(inputDuracao));
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('sorteio_modal_duracao_')) {
    const painelId = interaction.customId.replace('sorteio_modal_duracao_', '');
    const draft = sorteioDraftDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const duracaoTexto = interaction.fields.getTextInputValue('duracao').trim();
    const duracaoMs = parseDuracaoTexto(duracaoTexto);
    if (!duracaoMs) {
        return interaction.reply({ content: 'Duração inválida! Use um formato como `1h`, `2d` ou `30m`.', flags: [MessageFlags.Ephemeral] });
    }

    draft.duracaoTexto = duracaoTexto;
    draft.duracaoMs = duracaoMs;
    return interaction.update({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'sorteio_requisito') {
    const draft = sorteioDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder().setCustomId(`sorteio_modal_requisito_${interaction.message.id}`).setTitle('Requisitos do sorteio');
    const inputCall = new TextInputBuilder().setCustomId('call').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setValue(draft.requisitoCallTexto || '');
    const inputMsg = new TextInputBuilder().setCustomId('mensagens').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setValue(draft.requisitoMensagens ? String(draft.requisitoMensagens) : '');
    const inputInvite = new TextInputBuilder().setCustomId('invites').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setValue(draft.requisitoInvites ? String(draft.requisitoInvites) : '');
    const inputLivre = new TextInputBuilder().setCustomId('texto_livre').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(draft.requisitoTextoLivre || '');

    modal.addLabelComponents(
        new LabelBuilder().setLabel('Tempo em call').setDescription('Ex: 1h, 2h, 1d. Vazio = não exige.').setTextInputComponent(inputCall),
        new LabelBuilder().setLabel('Mensagens').setDescription('Ex: 100. Vazio = não exige.').setTextInputComponent(inputMsg),
        new LabelBuilder().setLabel('Convites').setDescription('Ex: 3. Vazio = não exige.').setTextInputComponent(inputInvite),
        new LabelBuilder().setLabel('Outro requisito').setDescription('Escreva livremente qualquer outra regra do sorteio.').setTextInputComponent(inputLivre)
    );
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('sorteio_modal_requisito_')) {
    const painelId = interaction.customId.replace('sorteio_modal_requisito_', '');
    const draft = sorteioDraftDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const callTexto = interaction.fields.getTextInputValue('call').trim();
    const msgTexto = interaction.fields.getTextInputValue('mensagens').trim();
    const inviteTexto = interaction.fields.getTextInputValue('invites').trim();
    const livreTexto = interaction.fields.getTextInputValue('texto_livre').trim();

    draft.requisitoCallTexto = callTexto || null;
    draft.requisitoCallMs = callTexto ? (parseDuracaoTexto(callTexto) || 0) : 0;
    draft.requisitoMensagens = msgTexto ? parseQuantidadeTexto(msgTexto) : 0;
    draft.requisitoInvites = inviteTexto ? parseQuantidadeTexto(inviteTexto) : 0;
    draft.requisitoTextoLivre = livreTexto || null; // <- novo

    return interaction.update({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'sorteio_imagem') {
    const draft = sorteioDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder().setCustomId(`sorteio_modal_imagem_${interaction.message.id}`).setTitle('Imagem do sorteio');
    const upload = new FileUploadBuilder().setCustomId('imagem_arquivo').setRequired(true).setMaxValues(1);
    modal.addLabelComponents(new LabelBuilder().setLabel('Imagem').setDescription('Imagem que vai aparecer na embed do sorteio.').setFileUploadComponent(upload));
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('sorteio_modal_imagem_')) {
    const painelId = interaction.customId.replace('sorteio_modal_imagem_', '');
    const draft = sorteioDraftDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const arquivos = interaction.fields.getUploadedFiles('imagem_arquivo');
    const arquivo = arquivos?.first ? arquivos.first() : arquivos?.[0];
    if (!arquivo) return interaction.reply({ content: 'Nenhuma imagem foi enviada.', flags: [MessageFlags.Ephemeral] });

    draft.imagemUrl = arquivo.url;
    return interaction.update({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isChannelSelectMenu() && interaction.customId === 'sorteio_canal_select') {
    const draft = sorteioDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    draft.canalId = interaction.values[0];
    return interaction.update({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'sorteio_iniciar') {
    const draft = sorteioDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!draft.canalId) {
        return interaction.reply({ components: containerTexto('Você precisa selecionar um canal antes de iniciar o sorteio!'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }
    if (!draft.tag || !draft.premio || !draft.duracaoMs) {
        return interaction.reply({ components: containerTexto('Configure a tag, o prêmio e a duração antes de iniciar!'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }

    const canal = await interaction.guild.channels.fetch(draft.canalId).catch(() => null);
    if (!canal) {
        return interaction.reply({ components: containerTexto('O canal selecionado não foi encontrado.'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }

    await interaction.deferUpdate();

    const agora = Date.now();
    const encerraEm = agora + draft.duracaoMs;
    let sorteioDoc;
    try {
        sorteioDoc = await Sorteio.create({
            guildId: interaction.guild.id, criadorId: interaction.user.id, tag: draft.tag,
            premio: draft.premio, duracaoTexto: draft.duracaoTexto, duracaoMs: draft.duracaoMs,
            canalId: draft.canalId, imagemUrl: draft.imagemUrl,
            requisitoCallTexto: draft.requisitoCallTexto, requisitoCallMs: draft.requisitoCallMs,
            requisitoMensagens: draft.requisitoMensagens, requisitoInvites: draft.requisitoInvites,
            requisitoTextoLivre: draft.requisitoTextoLivre,
            status: 'ativo', iniciadoEm: agora, encerraEm
        });
    } catch (err) {
        console.error('--- Erro ao criar sorteio ---', err);
        return interaction.followUp({ components: containerTexto('Ocorreu um erro ao criar o sorteio (tag pode já estar em uso).'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }

    let msgSorteio;
    try {
        msgSorteio = await comRetry(() => canal.send({ components: [montarEmbedSorteioCanal(sorteioDoc)], flags: [MessageFlags.IsComponentsV2] }));
    } catch (err) {
        console.error('--- Erro ao enviar embed do sorteio ---', err);
        await Sorteio.deleteOne({ _id: sorteioDoc._id }).catch(() => null);
        return interaction.followUp({ components: containerTexto('Ocorreu um erro ao enviar a embed no canal. Verifique minhas permissões.'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }

    sorteioDoc.mensagemId = msgSorteio.id;
    await sorteioDoc.save();
    agendarEncerramentoSorteio(sorteioDoc._id, encerraEm);

    await atualizarStatusCallsSorteio();

    draft.id = sorteioDoc._id;
    draft.status = 'ativo';
    return interaction.editReply({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'sorteio_encerrar') {
    const draft = sorteioDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id || !draft.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    await interaction.deferUpdate();
    await encerrarSorteio(draft.id);
    draft.status = 'encerrado';
    return interaction.editReply({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'sorteio_resortear') {
    const draft = sorteioDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id || !draft.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    await interaction.deferUpdate();

    const sorteioDoc = await Sorteio.findById(draft.id).catch(() => null);
    if (!sorteioDoc) {
        return interaction.followUp({ components: containerTexto('Esse sorteio não foi encontrado.'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }

    // Reseta participantes e progresso — recomeça do zero
    sorteioDoc.participantes = [];
    sorteioDoc.progressoMensagens = {};
    sorteioDoc.progressoCallMs = {};
    sorteioDoc.progressoInvites = {};
    sorteioDoc.vencedorId = null;

    const novoEncerraEm = Date.now() + sorteioDoc.duracaoMs;
    sorteioDoc.encerraEm = novoEncerraEm;

    const canal = await client.channels.fetch(sorteioDoc.canalId).catch(() => null);

    // Apaga a embed antiga, se existir
    if (canal && sorteioDoc.mensagemId) {
        const msgAntiga = await canal.messages.fetch(sorteioDoc.mensagemId).catch(() => null);
        if (msgAntiga) await msgAntiga.delete().catch(() => null);
    }

    // Posta a embed nova, zerada
    if (canal) {
        try {
            const novaMsg = await comRetry(() => canal.send({ components: [montarEmbedSorteioCanal(sorteioDoc)], flags: [MessageFlags.IsComponentsV2] }));
            sorteioDoc.mensagemId = novaMsg.id;
        } catch (err) {
            console.error('--- Erro ao reenviar embed do sorteio no reroll ---', err);
        }
    }

    await sorteioDoc.save();
    agendarEncerramentoSorteio(sorteioDoc._id, novoEncerraEm);
    await atualizarStatusCallsSorteio();

    draft.status = 'ativo';
    draft.duracaoMs = sorteioDoc.duracaoMs;

    await interaction.editReply({ components: [montarPainelSorteioConfig(draft)], flags: [MessageFlags.IsComponentsV2] });

    return interaction.followUp({
        components: containerTexto('Sorteio reiniciado! A embed foi reenviada e o prazo foi renovado para novos participantes.'),
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isButton() && interaction.customId === 'sorteio_deletar') {
    const draft = sorteioDraftDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    await interaction.deferUpdate();

    if (draft.id) {
        const sorteioDoc = await Sorteio.findById(draft.id).catch(() => null);
        if (sorteioDoc) {
            if (sorteioDoc.status === 'ativo') {
                try {
                    const canal = await client.channels.fetch(sorteioDoc.canalId).catch(() => null);
                    if (canal && sorteioDoc.mensagemId) {
                        const msg = await canal.messages.fetch(sorteioDoc.mensagemId).catch(() => null);
                        if (msg) await msg.delete().catch(() => null);
                    }
                } catch (err) { console.error('--- Erro ao apagar embed do sorteio deletado ---', err); }
            }
            const timeoutId = sorteioTimeouts.get(String(sorteioDoc._id));
            if (timeoutId) { clearTimeout(timeoutId); sorteioTimeouts.delete(String(sorteioDoc._id)); }
            await Sorteio.deleteOne({ _id: sorteioDoc._id }).catch(() => null);
        }
    }

    if (draft.timeoutId) clearTimeout(draft.timeoutId);
    sorteioDraftDB.delete(interaction.message.id);

    const containerInicial = await montarPainelSorteioInicial(interaction.guild.id, interaction.user.id);
    return interaction.editReply({ components: [containerInicial], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId.startsWith('sorteio_participar_')) {
    const sorteioId = interaction.customId.replace('sorteio_participar_', '');
    const sorteioDoc = await Sorteio.findById(sorteioId).catch(() => null);

    if (!sorteioDoc || sorteioDoc.status !== 'ativo') {
        return interaction.reply({ components: containerTexto('Esse sorteio não está mais ativo.'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }

    const jaParticipa = sorteioDoc.participantes.includes(interaction.user.id);
    sorteioDoc.participantes = jaParticipa
        ? sorteioDoc.participantes.filter(id => id !== interaction.user.id)
        : [...sorteioDoc.participantes, interaction.user.id];
    await sorteioDoc.save();

    try {
        const canal = await client.channels.fetch(sorteioDoc.canalId).catch(() => null);
        const msg = canal ? await canal.messages.fetch(sorteioDoc.mensagemId).catch(() => null) : null;
        if (msg) await msg.edit({ components: [montarEmbedSorteioCanal(sorteioDoc)], flags: [MessageFlags.IsComponentsV2] });
    } catch (err) { console.error('--- Erro ao atualizar embed de participantes ---', err); }

    return interaction.reply({
        components: containerTexto(jaParticipa ? 'Você saiu do sorteio!' : 'Você entrou no sorteio! Boa sorte 🎉'),
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isButton() && interaction.customId.startsWith('sorteio_participantes_')) {
    const sorteioId = interaction.customId.replace('sorteio_participantes_', '');
    const sorteioDoc = await Sorteio.findById(sorteioId).catch(() => null);

    if (!sorteioDoc || !sorteioDoc.participantes.length) {
        return interaction.reply({ components: containerTexto('Ainda não há ninguém participando desse sorteio.'), flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }

    const lista = sorteioDoc.participantes.map((id, i) => `**${i + 1}.** <@${id}>`).join('\n');
    return interaction.reply({
        components: containerTexto(`**Participantes (${sorteioDoc.participantes.length}):**\n${lista}`),
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_insta_perfil_')) {
    const postId = interaction.customId.replace('modal_insta_perfil_', '');
    const postData = await InstaPost.findOne({ messageId: postId });

    if (!postData) {
        return interaction.reply({ content: 'Post não encontrado.', flags: [MessageFlags.Ephemeral] });
    }

    if (interaction.user.id !== postData.ownerId) {
        return interaction.reply({
            components: containerTexto('O autor deste post ainda não enviou o Instagram dele.'),
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    let usuarioInsta = interaction.fields.getTextInputValue('usuario_insta').trim();
    usuarioInsta = usuarioInsta.replace(/^@/, '').replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '');

    postData.instagramUser = usuarioInsta;
    await postData.save();

    await interaction.deferUpdate();

    try {
        await editarWebhook(interaction.channel, postId);
    } catch (err) {
        console.error('--- Erro ao atualizar botão de Instagram ---', err);
    }
}
	
	if (interaction.isButton() && interaction.customId === 'roleall_abrir') {
    const temPermissao = interaction.member.permissions.has('Administrator') || interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
    }

    return interaction.reply({
        components: [montarPainelRoleAllInicial()],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isRoleSelectMenu() && interaction.customId === 'roleall_select') {
    const cargo = interaction.roles.first();

    if (!cargo) {
        return interaction.reply({ content: 'Cargo inválido.', flags: [MessageFlags.Ephemeral] });
    }

    if (cargo.id === interaction.guild.id) {
        return interaction.reply({ content: 'Não é possível aplicar o cargo `@everyone` em massa!', flags: [MessageFlags.Ephemeral] });
    }

    const cargoBotMaisAlto = interaction.guild.members.me.roles.highest;
    if (cargo.position >= cargoBotMaisAlto.position) {
        return interaction.reply({ content: `Não consigo gerenciar o cargo **${cargo.name}** — ele está no mesmo nível ou acima do meu cargo mais alto.`, flags: [MessageFlags.Ephemeral] });
    }

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **CARGOS EM MASSA**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Cargo selecionado:** ${cargo}\n\n` +
            'Ao clicar em **Aplicar**, o bot vai adicionar esse cargo para todos os membros do servidor que ainda não o possuem (bots são ignorados). Esse painel vai atualizar o progresso em tempo real conforme os cargos forem aplicados.\n\n' +
            ' Essa ação não é desfeita automaticamente. Revise o cargo escolhido antes de confirmar.'
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`roleall_aplicar_${cargo.id}`)
                    .setLabel('Aplicar')
                    .setStyle(ButtonStyle.Success)
            )
        );

    return interaction.update({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isButton() && interaction.customId.startsWith('roleall_aplicar_')) {
    const cargoId = interaction.customId.replace('roleall_aplicar_', '');
    const cargo = interaction.guild.roles.cache.get(cargoId);

    if (!cargo) {
        return interaction.update({
            components: containerTexto('Esse cargo não existe mais.'),
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    const cargoBotMaisAlto = interaction.guild.members.me.roles.highest;
    if (cargo.position >= cargoBotMaisAlto.position) {
        return interaction.update({
            components: containerTexto(`Não consigo mais gerenciar o cargo **${cargo.name}**.`),
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    await interaction.deferUpdate();

    const membros = await interaction.guild.members.fetch();
    const jaTinham = membros.filter(m => !m.user.bot && m.roles.cache.has(cargo.id)).size;
    const alvos = [...membros.filter(m => !m.user.bot && !m.roles.cache.has(cargo.id)).values()];

    
    interaction.guild.members.cache.sweep(m => true);
    
    const total = alvos.length;
    let processados = 0;
    let sucesso = 0;
    let erros = 0;
    const inicio = Date.now();

function montarProgresso(finalizado = false) {
        const tempoDecorrido = Math.floor((Date.now() - inicio) / 1000);
        return new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(finalizado ? ' **APLICAÇÃO CONCLUÍDA**' : ' **APLICANDO CARGO...**'))
            
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Cargo:** ${cargo}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Progresso:** \`${processados}/${total}\``))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                `${EMOJI_ATIVADO} **Sucesso**\u2003\u2003\u2003${EMOJI_DESATIVADO} **Falhas**\n` +
                `${sucesso}\u2003\u2003\u2003\u2003\u2003\u2003\u2003${erros}`
            ))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Já possuíam o cargo:** \`${jaTinham}\``))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(` Tempo decorrido: ${tempoDecorrido}s${finalizado ? ' • Processo finalizado.' : ''}`));
    }

    await interaction.editReply({
        components: [montarProgresso()],
        flags: [MessageFlags.IsComponentsV2]
    });

    for (const membro of alvos) {
        try {
            await membro.roles.add(cargo);
            sucesso++;
        } catch (err) {
            erros++;
        }
        processados++;

        if (processados % 10 === 0 || processados === total) {
            await interaction.editReply({
                components: [montarProgresso(processados === total)],
                flags: [MessageFlags.IsComponentsV2]
            }).catch(() => null);
        }

        await esperar(150);
    }

    if (total === 0) {
        await interaction.editReply({
            components: [montarProgresso(true)],
            flags: [MessageFlags.IsComponentsV2]
        }).catch(() => null);
    }
}
	
	if (interaction.isButton() && interaction.customId === 'moedas_toggle') {
    const temPermissao = interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
    }

    eventoMoedasAtivo = !eventoMoedasAtivo;
await salvarConfigMoedas();

    if (!eventoMoedasAtivo && eventoMoedas.ativo && eventoMoedas.mensagem) {
        if (eventoMoedas.timeoutId) clearTimeout(eventoMoedas.timeoutId);
        await eventoMoedas.mensagem.delete().catch(() => null);
        eventoMoedas.ativo = false;
        eventoMoedas.mensagem = null;
        eventoMoedas.timeoutId = null;
        limparEstadoEventoMoedas();
    }

    return interaction.update({
        components: [montarPainelMoedas()],
        flags: [MessageFlags.IsComponentsV2]
    });
}
	
if (interaction.isButton() && interaction.customId === 'botcall_conectar') {
    const temPermissao = interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
    }

    const dados = botCallDB.get(interaction.guild.id) || { canalId: null, conectado: false };

    // Se JÁ tem canal salvo, conecta direto nele
    if (dados.canalId) {
        const canalObj = interaction.guild.channels.cache.get(dados.canalId);

        if (!canalObj) {
            const containerAviso = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('O canal salvo não existe mais. Selecione um novo canal.'));
            return interaction.reply({
                components: [containerAviso],
                flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
            });
        }

        await interaction.reply({
            components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Conectando...'))],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });

        const conexaoAtual = getVoiceConnection(interaction.guild.id);
        if (conexaoAtual) conexaoAtual.destroy();

        let connection;
    try {
        connection = joinVoiceChannel({
            channelId: canalObj.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });
        monitorarDesconexaoBotCall(interaction.guild.id, connection);
    } catch (err) {
        console.error('--- Erro ao conectar botcall ---', err);
        return interaction.editReply({
            components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Ocorreu um erro ao conectar na call.'))],
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    await salvarVoiceState(interaction.guild.id, canalObj.id);
        botCallDB.set(interaction.guild.id, { canalId: canalObj.id, conectado: true });

        await interaction.editReply({
            components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`Conectado com sucesso em ${canalObj}!`))],
            flags: [MessageFlags.IsComponentsV2]
        });

        try {
            await interaction.message.edit({
                components: [montarPainelBotCall(interaction.guild.id)],
                flags: [MessageFlags.IsComponentsV2]
            });
        } catch (err) {
            console.error('--- Erro ao atualizar painel botcall ---', err);
        }

        return;
    }

    // Sem canal salvo -> abre o seletor
    const selectCanal = new ChannelSelectMenuBuilder()
        .setCustomId(`botcall_select_${interaction.message.id}`)
        .setChannelTypes(ChannelType.GuildVoice)
        .setPlaceholder('Selecione o canal de voz');

    const containerSelect = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **CANAL**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Selecione o canal de voz que o bot vai entrar:'))
        .addActionRowComponents(new ActionRowBuilder().addComponents(selectCanal));

    return interaction.reply({
        components: [containerSelect],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isButton() && interaction.customId === 'botcall_trocar') {
    const temPermissao = interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
    }

    const selectCanal = new ChannelSelectMenuBuilder()
        .setCustomId(`botcall_select_${interaction.message.id}`)
        .setChannelTypes(ChannelType.GuildVoice)
        .setPlaceholder('Selecione o canal de voz');

    const containerSelect = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **Selecionar novo canal**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Selecione o novo canal de voz que o bot vai entrar:'))
        .addActionRowComponents(new ActionRowBuilder().addComponents(selectCanal));

    return interaction.reply({
        components: [containerSelect],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isChannelSelectMenu() && interaction.customId.startsWith('botcall_select_')) {
    const painelId = interaction.customId.replace('botcall_select_', '');
    const canalObj = interaction.guild.channels.cache.get(interaction.values[0]);

    if (!canalObj) {
        return interaction.update({
            components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Canal não encontrado.'))],
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    await interaction.update({
        components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Conectando...'))],
        flags: [MessageFlags.IsComponentsV2]
    });

    const conexaoAtual = getVoiceConnection(interaction.guild.id);
    if (conexaoAtual) conexaoAtual.destroy();

    let connection;
    try {
        connection = joinVoiceChannel({
            channelId: canalObj.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false
        });
        monitorarDesconexaoBotCall(interaction.guild.id, connection);
    } catch (err) {
        console.error('--- Erro ao conectar botcall ---', err);
        return interaction.editReply({
            components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('Ocorreu um erro ao conectar na call.'))],
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    await salvarVoiceState(interaction.guild.id, canalObj.id);
    botCallDB.set(interaction.guild.id, { canalId: canalObj.id, conectado: true });

    await interaction.editReply({
        components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`Conectado com sucesso em ${canalObj}!`))],
        flags: [MessageFlags.IsComponentsV2]
    });

    try {
        const msgPainel = await interaction.channel.messages.fetch(painelId);
        await msgPainel.edit({
            components: [montarPainelBotCall(interaction.guild.id)],
            flags: [MessageFlags.IsComponentsV2]
        });
    } catch (err) {
        console.error('--- Erro ao atualizar painel botcall ---', err);
    }
}

if (interaction.isButton() && interaction.customId === 'botcall_desconectar') {
    const temPermissao = interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
    }

    const conexao = getVoiceConnection(interaction.guild.id);
    if (conexao) conexao.destroy();

    await interaction.guild.members.me?.voice.disconnect().catch(() => null);

    await removerVoiceState(interaction.guild.id);

    const dadosAtuais = botCallDB.get(interaction.guild.id) || { canalId: null, conectado: false };
    botCallDB.set(interaction.guild.id, { canalId: dadosAtuais.canalId, conectado: false });

    await interaction.update({
        components: [montarPainelBotCall(interaction.guild.id)],
        flags: [MessageFlags.IsComponentsV2]
    });

    return interaction.followUp({
        components: [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent('O bot saiu da call com sucesso!'))],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isRoleSelectMenu() && interaction.customId === 'protecao_ef_bypass_select') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas **administradores** podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    protecaoConfig.antiLink.cargosBypass = interaction.values;
    await salvarProtecao();
    await atualizarTodosPaineisProtecao();

    return interaction.update({
        components: [montarPainelEfemeroProtecao('link')],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isButton() && interaction.customId.startsWith('protecao_ef_toggle_')) {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas **administradores** podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const tipo = interaction.customId.replace('protecao_ef_toggle_', '');

    if (tipo === 'spam') protecaoConfig.antiSpam.ativo = !protecaoConfig.antiSpam.ativo;
    if (tipo === 'link') protecaoConfig.antiLink.ativo = !protecaoConfig.antiLink.ativo;
    if (tipo === 'antifake') protecaoConfig.antiFake.ativo = !protecaoConfig.antiFake.ativo;
    if (tipo === 'antibot') protecaoConfig.antiBot.ativo = !protecaoConfig.antiBot.ativo;

    await salvarProtecao();
    await atualizarTodosPaineisProtecao();

    return interaction.update({
        components: [montarPainelEfemeroProtecao(tipo)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isButton() && interaction.customId === 'protecao_ef_config_spam') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas **administradores** podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder().setCustomId('modal_protecao_spam').setTitle('Configurar Anti-Spam');

    const inputLimite = new TextInputBuilder()
        .setCustomId('msgLimite').setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(String(protecaoConfig.antiSpam.msgLimite));
    const inputJanela = new TextInputBuilder()
        .setCustomId('janelaMs').setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(String(protecaoConfig.antiSpam.janelaMs / 1000));
    const inputMute = new TextInputBuilder()
        .setCustomId('muteMinutos').setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(String(protecaoConfig.antiSpam.muteMinutos));

    modal.addLabelComponents(
        new LabelBuilder().setLabel('Limite de mensagens').setTextInputComponent(inputLimite),
        new LabelBuilder().setLabel('Janela de tempo (segundos)').setTextInputComponent(inputJanela),
        new LabelBuilder().setLabel('Duração do mute (minutos)').setTextInputComponent(inputMute)
    );

    return interaction.showModal(modal);
}

if (interaction.isButton() && interaction.customId === 'protecao_ef_config_antifake') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas **administradores** podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder().setCustomId('modal_protecao_antifake').setTitle('Configurar Anti Fake');

    const inputDias = new TextInputBuilder()
        .setCustomId('diasMinimos').setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(String(protecaoConfig.antiFake.diasMinimos));

    const labelDias = new LabelBuilder()
        .setLabel('Idade mínima da conta (dias)')
        .setTextInputComponent(inputDias);

    const selectAcao = new StringSelectMenuBuilder()
        .setCustomId('acaoAntiFake')
        .setRequired(true)
        .addOptions(
            { label: 'Expulsar (Kick)', value: 'kick', description: 'Remove o usuário, ele pode tentar entrar de novo', default: protecaoConfig.antiFake.acao === 'kick' },
            { label: 'Banir', value: 'banir', description: 'Bane o usuário do servidor permanentemente', default: protecaoConfig.antiFake.acao === 'banir' },
            { label: 'Mutar (5 minutos)', value: 'mutar', description: 'Aplica timeout de 5 minutos e libera o acesso normalmente', default: protecaoConfig.antiFake.acao === 'mutar' }
        );

    const labelAcao = new LabelBuilder()
        .setLabel('Ação ao detectar conta fake')
        .setStringSelectMenuComponent(selectAcao);

    modal.addLabelComponents(labelDias, labelAcao);

    return interaction.showModal(modal);
}

if (interaction.isButton() && interaction.customId === 'lock_travar') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    if (canaisLockDB.get(interaction.guild.id)) {
        return interaction.update({ components: [montarPainelLock(interaction.guild.id)], flags: [MessageFlags.IsComponentsV2] });
    }

    await interaction.update({
        components: containerTexto(' **Travando servidor...** isso pode levar alguns instantes.'),
        flags: [MessageFlags.IsComponentsV2]
    });

    let ultimaEdicao = Date.now();
    await travarTodosCanais(interaction.guild, interaction.user.id, async (proc, total, suc, err) => {
        const agora = Date.now();
        if (agora - ultimaEdicao < 3000 && proc !== total) return;
        ultimaEdicao = agora;

        await interaction.editReply({
            components: containerTexto(` **Travando servidor...**\n**Progresso:** ${proc}/${total}\n${EMOJI_ATIVADO} \`${suc}\` · ${EMOJI_DESATIVADO} \`${err}\``),
            flags: [MessageFlags.IsComponentsV2]
        }).catch(() => null);
    });

    return interaction.editReply({ components: [montarPainelLock(interaction.guild.id)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'lock_destravar') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    if (!canaisLockDB.get(interaction.guild.id)) {
        return interaction.update({ components: [montarPainelLock(interaction.guild.id)], flags: [MessageFlags.IsComponentsV2] });
    }

    await interaction.update({
        components: containerTexto(' **Destravando servidor...** isso pode levar alguns instantes.'),
        flags: [MessageFlags.IsComponentsV2]
    });

    let ultimaEdicao = Date.now();
    await destravarTodosCanais(interaction.guild, async (proc, total, suc, err) => {
        const agora = Date.now();
        if (agora - ultimaEdicao < 3000 && proc !== total) return;
        ultimaEdicao = agora;

        await interaction.editReply({
            components: containerTexto(` **Destravando servidor...**\n**Progresso:** ${proc}/${total}\n${EMOJI_ATIVADO} \`${suc}\` · ${EMOJI_DESATIVADO} \`${err}\``),
            flags: [MessageFlags.IsComponentsV2]
        }).catch(() => null);
    });

    return interaction.editReply({ components: [montarPainelLock(interaction.guild.id)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'protecao_ef_config_antibot') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas **administradores** podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder().setCustomId('modal_protecao_antibot').setTitle('Configurar Anti Bot');

    const selectAcao = new StringSelectMenuBuilder()
        .setCustomId('acaoAntiBot')
        .setRequired(true)
        .addOptions(
            { label: 'Expulsar (Kick)', value: 'kick', description: 'Remove o bot assim que ele entrar no servidor', default: protecaoConfig.antiBot.acao === 'kick' },
            { label: 'Banir', value: 'banir', description: 'Bane o bot do servidor permanentemente', default: protecaoConfig.antiBot.acao === 'banir' }
        );

    const labelAcao = new LabelBuilder()
        .setLabel('Ação ao detectar um bot entrando')
        .setStringSelectMenuComponent(selectAcao);

    modal.addLabelComponents(labelAcao);

    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId === 'modal_protecao_spam') {
    const limite = parseInt(interaction.fields.getTextInputValue('msgLimite'));
    const janela = parseInt(interaction.fields.getTextInputValue('janelaMs'));
    const mute = parseInt(interaction.fields.getTextInputValue('muteMinutos'));

    if (!isNaN(limite) && limite > 0) protecaoConfig.antiSpam.msgLimite = limite;
    if (!isNaN(janela) && janela > 0) protecaoConfig.antiSpam.janelaMs = janela * 1000;
    if (!isNaN(mute) && mute > 0) protecaoConfig.antiSpam.muteMinutos = mute;

    await salvarProtecao();
    await atualizarTodosPaineisProtecao();

    if (interaction.message) {
        return interaction.update({
            components: [montarPainelEfemeroProtecao('spam')],
            flags: [MessageFlags.IsComponentsV2]
        });
    }
    return interaction.deferUpdate();
}

if (interaction.isModalSubmit() && interaction.customId === 'modal_protecao_antifake') {
    const dias = parseInt(interaction.fields.getTextInputValue('diasMinimos'));
    const acao = interaction.fields.getStringSelectValues('acaoAntiFake')[0];

    if (!isNaN(dias) && dias > 0) protecaoConfig.antiFake.diasMinimos = dias;
    if (['kick', 'banir', 'mutar'].includes(acao)) protecaoConfig.antiFake.acao = acao;

    await salvarProtecao();
    await atualizarTodosPaineisProtecao();

    if (interaction.message) {
        return interaction.update({
            components: [montarPainelEfemeroProtecao('antifake')],
            flags: [MessageFlags.IsComponentsV2]
        });
    }
    return interaction.deferUpdate();
}

if (interaction.isModalSubmit() && interaction.customId === 'modal_protecao_antibot') {
    const acao = interaction.fields.getStringSelectValues('acaoAntiBot')[0];

    if (['kick', 'banir'].includes(acao)) protecaoConfig.antiBot.acao = acao;

    await salvarProtecao();
    await atualizarTodosPaineisProtecao();

    if (interaction.message) {
        return interaction.update({
            components: [montarPainelEfemeroProtecao('antibot')],
            flags: [MessageFlags.IsComponentsV2]
        });
    }
    return interaction.deferUpdate();
}

	if (interaction.isButton() && interaction.customId === 'tellonym_enviar') {
    const modal = new ModalBuilder()
        .setCustomId('tellonym_modal')
        .setTitle('Enviar Tellonym');

    const selectModelo = new StringSelectMenuBuilder()
        .setCustomId('tellonym_modelo')
        .setRequired(true)
        .addOptions(
            { label: 'Público', value: 'publico', description: 'Todos saberão quem enviou essa mensagem' },
            { label: 'Anônima', value: 'anonimo', description: 'Ninguém saberá quem enviou essa mensagem' }
        );

    const labelModelo = new LabelBuilder()
        .setLabel('Selecione o modelo de envio')
        .setStringSelectMenuComponent(selectModelo);

    const selectMarcar = new UserSelectMenuBuilder()
        .setCustomId('tellonym_marcar')
        .setRequired(false);

    const labelMarcar = new LabelBuilder()
        .setLabel('Destinatário (opcional)')
        .setUserSelectMenuComponent(selectMarcar);

    const inputMensagem = new TextInputBuilder()
        .setCustomId('tellonym_mensagem')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(500);

    const labelMensagem = new LabelBuilder()
        .setLabel('Mensagem')
        .setTextInputComponent(inputMensagem);

    modal.addLabelComponents(labelModelo, labelMarcar, labelMensagem);

    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId === 'tellonym_modal') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const modelo = interaction.fields.getStringSelectValues('tellonym_modelo')[0];
    const anonimo = modelo === 'anonimo';

    const marcados = interaction.fields.getSelectedUsers('tellonym_marcar');
    const marcado = marcados?.first ? marcados.first() : marcados?.[0];

    const mensagem = interaction.fields.getTextInputValue('tellonym_mensagem');

    const canalMod = await interaction.guild.channels.fetch(CANAL_TELLONYM_MOD).catch(() => null);
    if (!canalMod) {
        return interaction.editReply({ content: 'Canal de moderação do Tellonym não configurado corretamente.' });
    }

const nome = anonimo ? 'Anônimo' : (interaction.member.displayName || interaction.user.username);
const handle = anonimo ? '' : `@${interaction.user.username}`;
const avatarUrl = interaction.user.displayAvatarURL({ extension: 'png', size: 128 });

const marcadoNomeCard = marcado ? marcado.username : null;
const marcadoAvatarUrlCard = marcado ? marcado.displayAvatarURL({ extension: 'png', size: 128 }) : null;

let imagemBuffer;
try {
    imagemBuffer = await gerarCardTellonym({
        nome, handle, avatarUrl, mensagem, anonimo,
        marcadoNome: marcadoNomeCard,
        marcadoAvatarUrl: marcadoAvatarUrlCard
    });
} catch (err) {
        console.error('--- Erro ao gerar card de Tellonym ---', err);
        return interaction.editReply({ content: 'Ocorreu um erro ao gerar sua mensagem.' });
    }

    const anexo = new AttachmentBuilder(imagemBuffer, { name: 'tellonym.png' });

    const linhaBotoesMod = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('tellonym_permitir')
            .setLabel('Permitir')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('tellonym_negar')
            .setLabel('Negar')
            .setStyle(ButtonStyle.Danger)
    );

    const containerMod = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **TELLONYM AGUARDANDO AVALIAÇÃO**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Autor:** <@${interaction.user.id}>${marcado ? `\n**Marcado:** ${marcado}` : ''}\n**Modelo:** ${anonimo ? 'Anônimo' : 'Público'}`))
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://tellonym.png')
            )
        )
        .addActionRowComponents(linhaBotoesMod);

let msgModeracao;
try {
    msgModeracao = await comRetry(() => canalMod.send({
        components: [containerMod],
        files: [anexo],
        flags: [MessageFlags.IsComponentsV2]
    }));
} catch (err) {
    console.error('--- Erro ao enviar Tellonym pra moderação ---', err);
    return interaction.editReply({ content: 'Ocorreu um erro ao enviar seu Tellonym pra avaliação.' });
}

const imagemUrl = extrairPrimeiraMediaUrl(msgModeracao.components?.map(c => c.toJSON?.() ?? c) ?? []);
console.log('[DEBUG Tellonym] imagemUrl extraída dos componentes:', imagemUrl);

tellonymPendentesDB.set(msgModeracao.id, {
    autorId: interaction.user.id,
    anonimo,
    marcadoId: marcado?.id || null,
    mensagem,
    imagemUrl
});
console.log('[DEBUG Tellonym] Salvo em memória:', msgModeracao.id);

await salvarTellonymPendenteUsuario(msgModeracao.id, {
    autorId: interaction.user.id,
    anonimo,
    marcadoId: marcado?.id || null,
    mensagem,
    imagemUrl
});

    const containerAviso = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **TELLONYM ENVIADO PARA ANÁLISE**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Seu Tellonym foi enviado para a equipe de moderação e está aguardando aprovação. Assim que for avaliado, você será notificado.'));

    return interaction.editReply({
        components: [containerAviso],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isButton() && interaction.customId === 'tellonym_comentar') {
    const modal = new ModalBuilder()
        .setCustomId(`tellonym_comentar_modal_${interaction.message.id}`)
        .setTitle('Comentar');

    const input = new TextInputBuilder()
        .setCustomId('texto_comentario')
        .setLabel('Seu comentário')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(300);

    modal.addComponents(new ActionRowBuilder().addComponents(input));
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('tellonym_comentar_modal_')) {
    const msgId = interaction.customId.replace('tellonym_comentar_modal_', '');
    const dados = await TellonymPost.findOne({ messageId: msgId });

    if (!dados) {
        return interaction.reply({ content: 'Esse Tellonym não foi encontrado.', flags: [MessageFlags.Ephemeral] });
    }

    const texto = interaction.fields.getTextInputValue('texto_comentario');
    dados.comentarios.push({ autorId: interaction.user.id, texto });
    await dados.save();

    await interaction.deferUpdate();

    try {
        const msg = await interaction.channel.messages.fetch(msgId);
        const novosComponents = msg.components.map(row => ActionRowBuilder.from(row));
        novosComponents[0].components[0].setLabel(`${dados.comentarios.length}`);
        await msg.edit({ components: novosComponents });
    } catch (err) {
        console.error('--- Erro ao atualizar contagem de comentários ---', err);
    }
}

if (interaction.isButton() && interaction.customId === 'tellonym_vercomentarios') {
    const dados = await TellonymPost.findOne({ messageId: interaction.message.id });

    if (!dados || dados.comentarios.length === 0) {
        return interaction.reply({ content: 'Ainda não há comentários neste Tellonym.', flags: [MessageFlags.Ephemeral] });
    }

    const lista = dados.comentarios
        .map((c, i) => `**${i + 1}.** <@${c.autorId}>: ${c.texto}`)
        .join('\n');

    const embed = new EmbedBuilder()
        .setColor('#2E3A50')
        .setTitle('Comentários')
        .setDescription(lista);

    return interaction.reply({ embeds: [embed], flags: [MessageFlags.Ephemeral] });
}

if (interaction.isButton() && interaction.customId === 'tellonym_permitir') {
    const CARGO_BLOQUEADO_TELLONYM = '1542321888309809212';
    const temPermissao = interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    const estaBloqueado = interaction.member.roles.cache.has(CARGO_BLOQUEADO_TELLONYM);

    if (!temPermissao || estaBloqueado) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar isso!', flags: [MessageFlags.Ephemeral] });
    }
    

    const pendente = tellonymPendentesDB.get(interaction.message.id);
    console.log('[DEBUG Tellonym] Pendente recuperado:', pendente);
    if (!pendente) {
        return interaction.reply({ content: 'Esse Tellonym já foi avaliado ou não foi encontrado.', flags: [MessageFlags.Ephemeral] });
    }

    // ---- Responde a interação AGORA, antes de qualquer coisa lenta ----
    await interaction.deferUpdate();

    const canalDestino = await interaction.guild.channels.fetch(CANAL_TELLONYM).catch(() => null);
    if (!canalDestino) {
        return interaction.followUp({ content: 'Canal de Tellonym não configurado corretamente.', flags: [MessageFlags.Ephemeral] });
    }

    const imagemUrl = pendente.imagemUrl || interaction.message.attachments.first()?.url;

    if (!imagemUrl) {
        return interaction.followUp({ content: 'Não encontrei a imagem desse Tellonym.', flags: [MessageFlags.Ephemeral] });
    }

    const marcado = pendente.marcadoId ? `<@${pendente.marcadoId}>` : null;
    const anexo = new AttachmentBuilder(imagemUrl, { name: 'tellonym.png' });

    const linhaBotoes = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
           .setCustomId('tellonym_comentar')
           .setLabel('0')
           .setEmoji('1526757381357436998')
           .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('tellonym_vercomentarios')
            .setLabel('Ver comentários')
            .setStyle(ButtonStyle.Secondary)
    );

    let msgEnviada;
    try {
        msgEnviada = await comRetry(() => canalDestino.send({
            content: marcado ? `> ${marcado}` : undefined,
            files: [anexo],
            components: [linhaBotoes]
        }));
    } catch (err) {
        console.error('--- Erro ao enviar Tellonym aprovado ---', err);
        return interaction.followUp({ content: 'Ocorreu um erro ao enviar o Tellonym pro canal.', flags: [MessageFlags.Ephemeral] });
    }

    await TellonymPost.create({
        messageId: msgEnviada.id,
        autorId: pendente.autorId,
        anonimo: pendente.anonimo,
        marcadoId: pendente.marcadoId,
        mensagem: pendente.mensagem,
        comentarios: []
    });

    tellonymPendentesDB.delete(interaction.message.id);
    await removerTellonymPendenteUsuario(interaction.message.id);

    const containerAprovado = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **TELLONYM AGUARDANDO AVALIAÇÃO**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Autor:** <@${pendente.autorId}>${pendente.marcadoId ? `\n**Marcado:** <@${pendente.marcadoId}>` : ''}\n**Modelo:** ${pendente.anonimo ? 'Anônimo' : 'Público'}`))
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(imagemUrl)
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Aprovado** por ${interaction.user}`))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('tellonym_permitir')
                    .setLabel('Permitir')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('tellonym_negar')
                    .setLabel('Negar')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            )
        );

    return interaction.editReply({
        components: [containerAprovado],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isButton() && interaction.customId === 'tellonym_negar') {
    const CARGO_BLOQUEADO_TELLONYM = '1542321888309809212';
    const temPermissao = interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    const estaBloqueado = interaction.member.roles.cache.has(CARGO_BLOQUEADO_TELLONYM);

    if (!temPermissao || estaBloqueado) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar isso!', flags: [MessageFlags.Ephemeral] });
    }
    

    const pendente = tellonymPendentesDB.get(interaction.message.id);
    if (!pendente) {
        return interaction.reply({ content: 'Esse Tellonym já foi avaliado ou não foi encontrado.', flags: [MessageFlags.Ephemeral] });
    }

    // ---- Responde a interação AGORA, antes de qualquer coisa lenta ----
    await interaction.deferUpdate();

    const imagemUrl = pendente.imagemUrl || interaction.message.attachments.first()?.url;

    const containerDM = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **TELLONYM NÃO APROVADO**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Seu Tellonym foi analisado pela equipe e **não foi aprovado** para publicação.'));

    const membroAutor = await interaction.guild.members.fetch(pendente.autorId).catch((err) => {
        console.error('--- Erro ao buscar membro autor do Tellonym negado ---', err);
        return null;
    });

    if (membroAutor) {
        await membroAutor.send({
            components: [containerDM],
            flags: [MessageFlags.IsComponentsV2]
        }).catch((err) => {
            console.error('--- Erro ao enviar DM de Tellonym negado ---', err);
        });
    } else {
        console.error('--- Membro autor do Tellonym negado não encontrado no servidor, autorId:', pendente.autorId);
    }

    tellonymPendentesDB.delete(interaction.message.id);
    await removerTellonymPendenteUsuario(interaction.message.id);

    const containerNegado = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **TELLONYM AGUARDANDO AVALIAÇÃO**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Autor:** <@${pendente.autorId}>${pendente.marcadoId ? `\n**Marcado:** <@${pendente.marcadoId}>` : ''}\n**Modelo:** ${pendente.anonimo ? 'Anônimo' : 'Público'}`));

    if (imagemUrl) {
        containerNegado.addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL(imagemUrl)
            )
        );
    }

    containerNegado
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Negado** por ${interaction.user}`))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('tellonym_permitir')
                    .setLabel('Permitir')
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('tellonym_negar')
                    .setLabel('Negar')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            )
        );

    return interaction.editReply({
        components: [containerNegado],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isStringSelectMenu() && interaction.customId === 'menu_painelcall') {
        const opcao = interaction.values[0];

        if (opcao === 'call_privada') {
            const canal = await verificarCallTemp(interaction);
            if (!canal) return;
            const permAtual = canal.permissionOverwrites.cache.get(interaction.guild.id);
            if (permAtual?.deny.has('Connect')) {
                return interaction.reply({ content: 'Sua call já está **privada**!', flags: [MessageFlags.Ephemeral] });
            }
            
            
            await logarCallTemp({ guild: interaction.guild, acao: 'Call privada', dono: interaction.user, canalVoz: canal }).catch(() => null);           
            await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: false });
            return interaction.reply({ content: 'Sua call agora está **privada**!', flags: [MessageFlags.Ephemeral] });
        }

        if (opcao === 'call_publica') {
            const canal = await verificarCallTemp(interaction);
            if (!canal) return;
            const permAtual = canal.permissionOverwrites.cache.get(interaction.guild.id);
            if (permAtual?.allow.has('Connect')) {
                return interaction.reply({ content: 'Sua call já está **pública**!', flags: [MessageFlags.Ephemeral] });
            }
            await canal.permissionOverwrites.edit(interaction.guild.id, { Connect: true });
            await logarCallTemp({ guild: interaction.guild, acao: 'Call aberta', dono: interaction.user, canalVoz: canal }).catch(() => null);
            return interaction.reply({ content: 'Sua call agora está **pública**!', flags: [MessageFlags.Ephemeral] });
        }
        
        if (opcao === 'call_limite') {
            const canal = await verificarCallTemp(interaction);
            if (!canal) return;

            const modal = new ModalBuilder()
                .setCustomId('modal_call_limite')
                .setTitle('Alterar limite de usuários');

            const input = new TextInputBuilder()
                .setCustomId('novo_limite')
                .setLabel('Digite o novo limite de usuários')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(2);
                
                
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }
        
        if (opcao === 'call_permitir') {
            const canal = await verificarCallTemp(interaction);
            if (!canal) return;

            const permAtual = canal.permissionOverwrites.cache.get(interaction.guild.id);
            const estaPrivada = permAtual?.deny.has('Connect');
            if (!estaPrivada) {
                return interaction.reply({ content: 'Sua call precisa estar **privada** pra usar isso.', flags: [MessageFlags.Ephemeral] });
            }

            const selectUser = new UserSelectMenuBuilder()
                .setCustomId('select_call_permitir')
                .setPlaceholder('Selecione o usuário')
                .setMaxValues(1);

            return interaction.reply({
                content: 'Quem você quer permitir na sua call?',
                components: [new ActionRowBuilder().addComponents(selectUser)],
                flags: [MessageFlags.Ephemeral]
            });
        }
        
        if (opcao === 'call_expulsar') {
            const canal = await verificarCallTemp(interaction);
            if (!canal) return;

            const selectUser = new UserSelectMenuBuilder()
                .setCustomId('select_call_expulsar')
                .setPlaceholder('Selecione o usuário')
                .setMaxValues(1);

            return interaction.reply({
                content: 'Quem você quer expulsar da sua call?',
                components: [new ActionRowBuilder().addComponents(selectUser)],
                flags: [MessageFlags.Ephemeral]
            });
        }
        
        if (opcao === 'call_banir') {
            const canal = await verificarCallTemp(interaction);
            if (!canal) return;

            const selectUser = new UserSelectMenuBuilder()
                .setCustomId('select_call_banir')
                .setPlaceholder('Selecione o usuário')
                .setMaxValues(1);

            return interaction.reply({
                content: 'Quem você quer banir da sua call?',
                components: [new ActionRowBuilder().addComponents(selectUser)],
                flags: [MessageFlags.Ephemeral]
            });
        }
        
if (opcao === 'call_renomear') {
            const canal = await verificarCallTemp(interaction);
            if (!canal) return;

            const modal = new ModalBuilder()
                .setCustomId('modal_call_renomear')
                .setTitle('Alterar nome da call');

            const input = new TextInputBuilder()
                .setCustomId('novo_nome')
                .setLabel('Digite o novo nome da call')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setMaxLength(100);
                
                
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        

        if (opcao === 'call_status') {
            const canal = await verificarCallTemp(interaction);
            if (!canal) return;

            const statusAtual = canal.status || '';

            const modal = new ModalBuilder()
                .setCustomId('modal_call_status')
                .setTitle('Alterar status da call');

            const input = new TextInputBuilder()
                .setCustomId('novo_status')
                .setLabel('Digite o novo status da call')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setMaxLength(500)
                .setValue(statusAtual);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

    } 
    
    if (interaction.isModalSubmit() && interaction.customId === 'modal_call_limite') {
    const canal = await verificarCallTemp(interaction);
    if (!canal) return;

    const valor = parseInt(interaction.fields.getTextInputValue('novo_limite'));
    if (isNaN(valor) || valor < 0 || valor > 99) {
        return interaction.reply({ content: 'Digite um número válido entre 0 e 99.', flags: [MessageFlags.Ephemeral] });
    }

    await canal.setUserLimit(valor);
    await logarCallTemp({
        guild: interaction.guild, acao: 'Limite alterado', dono: interaction.user, canalVoz: canal,
        extra: `**Novo limite:** \`${valor === 0 ? 'sem limite' : valor}\``
    }).catch(() => null);

    return interaction.reply({
        content: `Limite da call alterado para **${valor === 0 ? 'sem limite' : valor}**!`,
        flags: [MessageFlags.Ephemeral]
    });
}
    
if (interaction.isModalSubmit() && interaction.customId === 'modal_call_renomear') {
    const canal = await verificarCallTemp(interaction);
    if (!canal) return;

    const novoNome = interaction.fields.getTextInputValue('novo_nome');
    await canal.setName(novoNome).catch(() => null);
    await logarCallTemp({
        guild: interaction.guild, acao: 'Nome alterado', dono: interaction.user, canalVoz: canal,
        extra: `**Novo nome:** \`${novoNome}\``
    }).catch(() => null);

    return interaction.reply({
        content: `Nome da call alterado para **${novoNome}**!`,
        flags: [MessageFlags.Ephemeral]
    });
}
    
if (interaction.isModalSubmit() && interaction.customId === 'modal_call_status') {
    const canal = await verificarCallTemp(interaction);
    if (!canal) return;

    const novoStatus = interaction.fields.getTextInputValue('novo_status').trim();
    await definirStatusCanal(canal, novoStatus);
    await logarCallTemp({
        guild: interaction.guild, acao: 'Status alterado', dono: interaction.user, canalVoz: canal,
        extra: novoStatus ? `**Novo status:** \`${novoStatus}\`` : '**Status removido**'
    }).catch(() => null);

    return interaction.reply({
        content: novoStatus ? `Status da call alterado para: **${novoStatus}**` : 'Status da call removido!',
        flags: [MessageFlags.Ephemeral]
    });
}
    
    if (interaction.isUserSelectMenu() && interaction.customId === 'select_call_permitir') {
        const canal = await verificarCallTemp(interaction);
        if (!canal) return;

        const membro = interaction.values[0];
        await canal.permissionOverwrites.edit(membro, { Connect: true, ViewChannel: true });
        await logarCallTemp({
                guild: interaction.guild, acao: 'Membro permitido', dono: interaction.user, canalVoz: canal, alvo: `<@${membro}>`
        }).catch(() => null);

        return interaction.reply({
            content: `<@${membro}> agora pode entrar na sua call!`,
            flags: [MessageFlags.Ephemeral]
        });
    }
    
if (interaction.isUserSelectMenu() && interaction.customId === 'select_call_expulsar') {
    const canal = await verificarCallTemp(interaction);
    if (!canal) return;

    const membroId = interaction.values[0];
    const membro = canal.members.get(membroId);

    if (!membro) {
        return interaction.reply({
            content: `<@${membroId}> não está na sua call.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    await membro.voice.disconnect().catch(() => null);
    await logarCallTemp({
        guild: interaction.guild, acao: 'Membro expulso', dono: interaction.user, canalVoz: canal, alvo: `<@${membroId}>`
    }).catch(() => null);

    return interaction.reply({
        content: `<@${membroId}> foi expulso da sua call!`,
        flags: [MessageFlags.Ephemeral]
    });
}
    
    if (interaction.isUserSelectMenu() && interaction.customId === 'select_call_banir') {
        const canal = await verificarCallTemp(interaction);
        if (!canal) return;

        const membroId = interaction.values[0];
        const membro = canal.members.get(membroId);

        await canal.permissionOverwrites.edit(membroId, { Connect: false, ViewChannel: false });
        if (membro) await membro.voice.disconnect().catch(() => null);
        await logarCallTemp({
                guild: interaction.guild, acao: 'Membro banido da call', dono: interaction.user, canalVoz: canal, alvo: `<@${membroId}>`
        }).catch(() => null);

        if (membro) {
            await membro.voice.disconnect().catch(() => null);
        }

        return interaction.reply({
            content: membro
                ? `<@${membroId}> foi banido da sua call!`
                : `<@${membroId}> não estava na call, mas foi banido — não vai conseguir entrar mais.`,
            flags: [MessageFlags.Ephemeral]
        });
    }
    

if (interaction.isUserSelectMenu() && interaction.customId === 'pd_selecionar') {
    const temPermissao = interaction.member.roles.cache.has(CARGO_PD_PERMISSAO) || interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const alvoId = interaction.values[0];

    if (alvoId === interaction.user.id) {
        return interaction.reply({ content: 'Você não pode se selecionar como primeira dama!', flags: [MessageFlags.Ephemeral] });
    }

    const alvoMembro = await interaction.guild.members.fetch({ user: alvoId, force: true }).catch(() => null);
    if (!alvoMembro) {
        return interaction.reply({ content: 'Esse usuário não foi encontrado no servidor.', flags: [MessageFlags.Ephemeral] });
    }
    
    if (alvoMembro.user.bot) {
        return interaction.reply({ content: 'Você não pode definir um bot como primeira dama!', flags: [MessageFlags.Ephemeral] });
    }

    const jaExiste = await PrimeiraDama.findOne({ guildId: interaction.guild.id, setterId: interaction.user.id, targetId: alvoId });
    if (jaExiste) {
        return interaction.reply({ content: `${alvoMembro} já é uma das suas primeiras damas!`, flags: [MessageFlags.Ephemeral] });
    }

    const totalAtual = await PrimeiraDama.countDocuments({ guildId: interaction.guild.id, setterId: interaction.user.id });
    if (totalAtual >= LIMITE_PRIMEIRAS_DAMAS) {
        return interaction.reply({ content: `Você já atingiu o limite de **${LIMITE_PRIMEIRAS_DAMAS}** primeiras damas!`, flags: [MessageFlags.Ephemeral] });
    }

    try {
        await alvoMembro.roles.add(CARGO_PRIMEIRA_DAMA);
    } catch (err) {
        console.error('--- Erro ao adicionar cargo de primeira dama ---', err);
        return interaction.reply({ content: 'Ocorreu um erro ao adicionar o cargo. Verifique minhas permissões e a hierarquia de cargos.', flags: [MessageFlags.Ephemeral] });
    }

    try {
        await PrimeiraDama.create({ guildId: interaction.guild.id, setterId: interaction.user.id, targetId: alvoId });
    } catch (err) {
        console.error('--- Erro ao salvar primeira dama no banco ---', err);
        await alvoMembro.roles.remove(CARGO_PRIMEIRA_DAMA).catch(() => null);
        return interaction.reply({ content: 'Ocorreu um erro ao salvar. Tente novamente.', flags: [MessageFlags.Ephemeral] });
    }

await enviarLogModeracao({
    guild: interaction.guild,
    tipo: 'PRIMEIRA DAMA DEFINIDA',
    alvo: `${alvoMembro} (${alvoMembro.user.tag})`,
    alvoUser: alvoMembro.user,
    autor: interaction.user,
    motivo: null,
    extra: `**Definida por:** ${interaction.user}`
});

    const damasAtualizadas = await obterPrimeirasDamas(interaction.guild.id, interaction.user.id);
    const container = await montarPainelPD(interaction.guild, damasAtualizadas);

    return interaction.update({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isStringSelectMenu() && interaction.customId === 'pd_remover') {
    const temPermissao = interaction.member.roles.cache.has(CARGO_PD_PERMISSAO) || interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const alvoId = interaction.values[0];

    const registro = await PrimeiraDama.findOneAndDelete({ guildId: interaction.guild.id, setterId: interaction.user.id, targetId: alvoId });
    if (!registro) {
        return interaction.reply({ content: 'Esse registro não foi encontrado ou já foi removido.', flags: [MessageFlags.Ephemeral] });
    }

    const alvoMembro = await interaction.guild.members.fetch({ user: alvoId, force: true }).catch(() => null);

    const outrosRegistros = await PrimeiraDama.countDocuments({ guildId: interaction.guild.id, targetId: alvoId });
    if (outrosRegistros === 0 && alvoMembro) {
        await alvoMembro.roles.remove(CARGO_PRIMEIRA_DAMA).catch(() => null);
    }

await enviarLogModeracao({
    guild: interaction.guild,
    tipo: 'PRIMEIRA DAMA REMOVIDA',
    alvo: alvoMembro ? `${alvoMembro} (${alvoMembro.user.tag})` : `<@${alvoId}> (${alvoId})`,
    alvoUser: alvoMembro?.user ?? null,
    autor: interaction.user,
    motivo: null,
    extra: `**Removida por:** ${interaction.user}`
});

    const damasAtualizadas = await obterPrimeirasDamas(interaction.guild.id, interaction.user.id);
    const container = await montarPainelPD(interaction.guild, damasAtualizadas);

    return interaction.update({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}
    
    if (interaction.isChatInputCommand() && interaction.commandName === 'msg') {
    const temPermissao = interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
    }

const draft = {
    autorId: interaction.user.id,
    tipo: null,
    canalId: null,
    opcaoAtual: null,
    textoBruto: '',
    embedTitulo: '',
    embedDescricao: '',
    embedFooter: '',
    imagemUrl: null,
    cor: null,
    botoes: []
};

    const msgPainel = await interaction.reply({
        components: [montarPainelMsgCriadorInicial(draft)],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        fetchReply: true
    });

    msgCriadorDB.set(msgPainel.id, draft);
    return;
}

// ---- Botões: abrir modal ----
if (interaction.isButton() && interaction.customId === 'msgcriador_botao_adicionar') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if ((draft.botoes?.length || 0) >= 25) {
        return interaction.reply({ content: 'Limite de 25 botões atingido.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder()
        .setCustomId(`msgcriador_modal_botao_${interaction.message.id}`)
        .setTitle('Adicionar botão');

    const inputLabel = new TextInputBuilder().setCustomId('botao_label').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true);
    const labelLabel = new LabelBuilder().setLabel('Label do botão').setTextInputComponent(inputLabel);

    const inputUrl = new TextInputBuilder().setCustomId('botao_url').setStyle(TextInputStyle.Short).setRequired(false);
    const labelUrl = new LabelBuilder().setLabel('URL do botão (opcional)').setDescription('Se preenchida, o botão vira um link e ignora a cor.').setTextInputComponent(inputUrl);

    const inputEmoji = new TextInputBuilder().setCustomId('botao_emoji').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(false);
    const labelEmoji = new LabelBuilder().setLabel('Emoji (opcional)').setTextInputComponent(inputEmoji);

    const selectCor = new StringSelectMenuBuilder().setCustomId('botao_cor').setRequired(true).addOptions(CORES_BOTAO);
    const labelCor = new LabelBuilder().setLabel('Cor do botão').setStringSelectMenuComponent(selectCor);

    const labels = [labelLabel, labelUrl, labelEmoji, labelCor];

    if (draft.tipo === 'v2') {
        const selectPosicao = new StringSelectMenuBuilder().setCustomId('botao_posicao').setRequired(true).addOptions(POSICOES_BOTAO);
        const labelPosicao = new LabelBuilder().setLabel('Posição do botão').setStringSelectMenuComponent(selectPosicao);
        labels.push(labelPosicao);
    }

    modal.addLabelComponents(...labels);
    return interaction.showModal(modal);
}

// ---- Botões: submit do modal ----
if (interaction.isModalSubmit() && interaction.customId.startsWith('msgcriador_modal_botao_')) {
    const painelId = interaction.customId.replace('msgcriador_modal_botao_', '');
    const draft = msgCriadorDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const label = interaction.fields.getTextInputValue('botao_label').trim();
    const url = interaction.fields.getTextInputValue('botao_url').trim();
    const emojiBruto = interaction.fields.getTextInputValue('botao_emoji').trim();
    const cor = interaction.fields.getStringSelectValues('botao_cor')[0];
    const posicao = draft.tipo === 'v2' ? interaction.fields.getStringSelectValues('botao_posicao')[0] : null;

    if (!label) {
        return interaction.reply({ content: 'O label do botão não pode ficar vazio.', flags: [MessageFlags.Ephemeral] });
    }
    if (url && !/^https?:\/\//i.test(url)) {
        return interaction.reply({ content: 'A URL do botão precisa começar com http:// ou https://', flags: [MessageFlags.Ephemeral] });
    }

    let emoji = null;
    if (emojiBruto) {
        const matchEmoji = emojiBruto.match(/<a?:\w{2,32}:(\d+)>/);
        emoji = matchEmoji ? { id: matchEmoji[1] } : emojiBruto;
    }

if (!draft.botoes) draft.botoes = [];
    const idBotao = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    draft.botoes.push({ id: idBotao, label, url: url || null, emoji, cor, posicao, resposta: null, respostaTipo: null });

return interaction.update({
    components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
    flags: [MessageFlags.IsComponentsV2]
});
}

// ---- Botões: remover ----
if (interaction.isStringSelectMenu() && interaction.customId === 'msgcriador_botao_remover') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const idx = parseInt(interaction.values[0]);
    if (!isNaN(idx) && draft.botoes?.[idx]) draft.botoes.splice(idx, 1);

return interaction.update({
    components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
    flags: [MessageFlags.IsComponentsV2]
});
}

// ---- Painel inicial (tipo + canal) ----
if (interaction.isStringSelectMenu() && interaction.customId === 'msgcriador_tipo') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    draft.tipo = interaction.values[0];
    return interaction.update({ components: [montarPainelMsgCriadorInicial(draft)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isChannelSelectMenu() && interaction.customId === 'msgcriador_canal') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    draft.canalId = interaction.values[0];
    return interaction.update({ components: [montarPainelMsgCriadorInicial(draft)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'msgcriador_iniciar') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!draft.tipo) {
        return interaction.reply({ content: 'Selecione o tipo da mensagem antes de continuar!', flags: [MessageFlags.Ephemeral] });
    }
    return interaction.update({
    components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
    flags: [MessageFlags.IsComponentsV2]
});
}

// ---- Voltar / Atualizar preview ----
if (interaction.isButton() && interaction.customId === 'msgcriador_voltar') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    draft.opcaoAtual = null;
    return interaction.update({ components: [montarPainelMsgCriadorInicial(draft)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isButton() && interaction.customId === 'msgcriador_atualizar') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    return interaction.update({
    components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
    flags: [MessageFlags.IsComponentsV2]
});
}

// ---- Select de opção (texto/imagem/cor/enviar) ----
if (interaction.isStringSelectMenu() && interaction.customId === 'msgcriador_opcao') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const opcao = interaction.values[0];

    if (opcao === 'enviar') {
        if (!draft.canalId) {
            return interaction.reply({
                components: containerTexto('Você precisa selecionar um canal de destino antes de enviar a mensagem!'),
                flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
            });
        }

        const canalDestino = await interaction.guild.channels.fetch(draft.canalId).catch(() => null);
        if (!canalDestino) {
            return interaction.reply({
                components: containerTexto('O canal selecionado não foi encontrado. Selecione outro canal.'),
                flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
            });
        }

await interaction.deferUpdate();

        const payload = await montarPayloadFinalMsgCriador(draft);

        let msgEnviada;
        try {
            msgEnviada = await canalDestino.send(payload);
        } catch (err) {
            console.error('--- Erro ao enviar mensagem do criador ---', err);
            return interaction.followUp({
                components: containerTexto('Ocorreu um erro ao enviar a mensagem. Verifique minhas permissões nesse canal.'),
                flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
            });
        }

if (draft.botoes?.length) {
            for (const botao of draft.botoes) {
                if (botao.resposta && !botao.url && botao.id) {
                    await respostasBotoesMsg.definir(`${msgEnviada.id}_${botao.id}`, {
                        texto: botao.resposta,
                        tipo: botao.respostaTipo || 'texto'
                    });
                }
            }
        }

        msgCriadorDB.delete(interaction.message.id);

        return interaction.editReply({
            components: containerTexto(`Mensagem enviada com sucesso em ${canalDestino}!`),
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    draft.opcaoAtual = opcao;
    return interaction.update({
    components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
    flags: [MessageFlags.IsComponentsV2]
});
}

// ---- Texto ----
if (interaction.isButton() && interaction.customId === 'msgcriador_texto_editar') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder()
        .setCustomId(`msgcriador_modal_texto_${interaction.message.id}`)
        .setTitle('Editar texto da mensagem');

    const inputTexto = new TextInputBuilder()
        .setCustomId('texto_conteudo')
        .setStyle(TextInputStyle.Paragraph)
        .setMaxLength(4000)
        .setRequired(true)
        .setValue(draft.textoBruto || '');

    const labelTexto = new LabelBuilder()
        .setLabel('Texto da mensagem')
        .setDescription(draft.tipo === 'v2' ? 'Digite [separador] em qualquer parte pra criar uma divisória.' : 'Digite o texto que será enviado.')
        .setTextInputComponent(inputTexto);

    modal.addLabelComponents(labelTexto);
    return interaction.showModal(modal);
}

if (interaction.isButton() && interaction.customId === 'msgcriador_embed_editar') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder()
        .setCustomId(`msgcriador_modal_embed_${interaction.message.id}`)
        .setTitle('Editar embed');

    const inputTitulo = new TextInputBuilder()
        .setCustomId('embed_titulo').setStyle(TextInputStyle.Short).setMaxLength(256).setRequired(false)
        .setValue(draft.embedTitulo || '');
    const labelTitulo = new LabelBuilder().setLabel('Título').setTextInputComponent(inputTitulo);

    const inputDescricao = new TextInputBuilder()
        .setCustomId('embed_descricao').setStyle(TextInputStyle.Paragraph).setMaxLength(4000).setRequired(false)
        .setValue(draft.embedDescricao || '');
    const labelDescricao = new LabelBuilder().setLabel('Descrição').setTextInputComponent(inputDescricao);

    const inputFooter = new TextInputBuilder()
        .setCustomId('embed_footer').setStyle(TextInputStyle.Short).setMaxLength(2048).setRequired(false)
        .setValue(draft.embedFooter || '');
    const labelFooter = new LabelBuilder().setLabel('Footer').setTextInputComponent(inputFooter);

    modal.addLabelComponents(labelTitulo, labelDescricao, labelFooter);
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('msgcriador_modal_embed_')) {
    const painelId = interaction.customId.replace('msgcriador_modal_embed_', '');
    const draft = msgCriadorDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

draft.embedTitulo = interaction.fields.getTextInputValue('embed_titulo').trim();
    draft.embedDescricao = interaction.fields.getTextInputValue('embed_descricao').trim();
    draft.embedFooter = interaction.fields.getTextInputValue('embed_footer').trim();

    return interaction.update({
    components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
    flags: [MessageFlags.IsComponentsV2]
});
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('msgcriador_modal_texto_')) {
    const painelId = interaction.customId.replace('msgcriador_modal_texto_', '');
    const draft = msgCriadorDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    draft.textoBruto = interaction.fields.getTextInputValue('texto_conteudo');

    return interaction.update({
    components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
    flags: [MessageFlags.IsComponentsV2]
});
}

// ---- Imagem ----
if (interaction.isButton() && interaction.customId === 'msgcriador_imagem_enviar') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder()
        .setCustomId(`msgcriador_modal_imagem_${interaction.message.id}`)
        .setTitle('Adicionar imagem');

    const uploadImagem = new FileUploadBuilder()
        .setCustomId('imagem_arquivo')
        .setRequired(true)
        .setMaxValues(1);

    const labelImagem = new LabelBuilder()
        .setLabel('Imagem')
        .setDescription('Selecione a imagem que vai aparecer na mensagem.')
        .setFileUploadComponent(uploadImagem);

    modal.addLabelComponents(labelImagem);
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('msgcriador_modal_imagem_')) {
    const painelId = interaction.customId.replace('msgcriador_modal_imagem_', '');
    const draft = msgCriadorDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const arquivosEnviados = interaction.fields.getUploadedFiles('imagem_arquivo');
    const arquivo = arquivosEnviados?.first ? arquivosEnviados.first() : arquivosEnviados?.[0];

    if (!arquivo) {
        return interaction.reply({ content: 'Nenhuma imagem foi enviada.', flags: [MessageFlags.Ephemeral] });
    }

    draft.imagemUrl = arquivo.url;

    return interaction.update({
    components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
    flags: [MessageFlags.IsComponentsV2]
});
}

if (interaction.isButton() && interaction.customId === 'msgcriador_imagem_remover') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!draft.imagemUrl) {
        return interaction.reply({ content: 'Não há nenhuma imagem para remover.', flags: [MessageFlags.Ephemeral] });
    }

    draft.imagemUrl = null;

    return interaction.update({
    components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
    flags: [MessageFlags.IsComponentsV2]
});
}

if (interaction.isButton() && interaction.customId === 'msgcriador_cor_personalizada') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder()
        .setCustomId(`msgcriador_modal_cor_${interaction.message.id}`)
        .setTitle('Cor personalizada');

    const inputCor = new TextInputBuilder()
        .setCustomId('cor_hex')
        .setStyle(TextInputStyle.Short)
        .setMaxLength(7)
        .setRequired(true)
        .setPlaceholder('#0028FF')
        .setValue(draft.cor && draft.cor !== 'nenhuma' ? `#${draft.cor}` : '');

    const labelCor = new LabelBuilder()
        .setLabel('Código hexadecimal da cor')
        .setDescription('Ex: #0028FF')
        .setTextInputComponent(inputCor);

    modal.addLabelComponents(labelCor);
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('msgcriador_modal_cor_')) {
    const painelId = interaction.customId.replace('msgcriador_modal_cor_', '');
    const draft = msgCriadorDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const bruto = interaction.fields.getTextInputValue('cor_hex').trim().replace(/^#/, '');

    if (!/^[0-9A-Fa-f]{6}$/.test(bruto)) {
        return interaction.reply({
            content: 'Cor inválida! Use um código hexadecimal válido, exemplo: `#0028FF`.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    draft.cor = bruto.toUpperCase();

    return interaction.update({
        components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

// ---- Cor ----
if (interaction.isStringSelectMenu() && interaction.customId === 'msgcriador_cor_select') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    draft.cor = interaction.values[0];

    return interaction.update({
    components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
    flags: [MessageFlags.IsComponentsV2]
});
}

// ---- Resposta do botão (efêmera ao clicar) ----
if (interaction.isStringSelectMenu() && interaction.customId === 'msgcriador_botao_resposta') {
    const draft = msgCriadorDB.get(interaction.message.id);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }

    const idx = parseInt(interaction.values[0]);
    const botao = draft.botoes?.[idx];
    if (!botao) {
        return interaction.reply({ content: 'Esse botão não foi encontrado.', flags: [MessageFlags.Ephemeral] });
    }

    const modal = new ModalBuilder()
        .setCustomId(`msgcriador_modal_resposta_${interaction.message.id}_${idx}`)
        .setTitle('Resposta do botão');

    const inputResposta = new TextInputBuilder()
        .setCustomId('resposta_texto')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setMaxLength(2000)
        .setValue(botao.resposta || '');

    const labelResposta = new LabelBuilder()
        .setLabel('Mensagem enviada ao clicar')
        .setDescription('Efêmera, só quem clicar vê. Use [separador] p/ divisórias (formato V2). Vazio remove.')
        .setTextInputComponent(inputResposta);

    const selectTipo = new StringSelectMenuBuilder()
        .setCustomId('resposta_tipo')
        .setRequired(true)
        .addOptions(
            { label: 'Texto normal', value: 'texto', description: 'Mensagem simples, sem formatação especial', default: (botao.respostaTipo ?? 'texto') === 'texto' },
            { label: 'Components V2', value: 'v2', description: 'Visual elaborado, igual o resto das mensagens do bot', default: botao.respostaTipo === 'v2' }
        );

    const labelTipo = new LabelBuilder()
        .setLabel('Formato da resposta')
        .setStringSelectMenuComponent(selectTipo);

    modal.addLabelComponents(labelResposta, labelTipo);
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId.startsWith('msgcriador_modal_resposta_')) {
    const resto = interaction.customId.replace('msgcriador_modal_resposta_', '');
    const separador = resto.lastIndexOf('_');
    const painelId = resto.slice(0, separador);
    const idx = parseInt(resto.slice(separador + 1));

    const draft = msgCriadorDB.get(painelId);
    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({ content: 'Esse painel não pertence a você ou expirou.', flags: [MessageFlags.Ephemeral] });
    }
    if (!draft.botoes?.[idx]) {
        return interaction.reply({ content: 'Esse botão não foi encontrado.', flags: [MessageFlags.Ephemeral] });
    }

    const texto = interaction.fields.getTextInputValue('resposta_texto').trim();
    const tipo = interaction.fields.getStringSelectValues('resposta_tipo')[0];

    draft.botoes[idx].resposta = texto || null;
    draft.botoes[idx].respostaTipo = tipo;

    return interaction.update({
    components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
    flags: [MessageFlags.IsComponentsV2]
});
}

// ---- Clique no botão da PRÉVIA do criador ----
if ( interaction.isButton() && interaction.customId.startsWith('msgcriador_preview_btn_')) {

    const idBotao = interaction.customId.replace(
        'msgcriador_preview_btn_',
        ''
    );    
    const draft = msgCriadorDB.get(interaction.message.id);


    if (!draft || draft.autorId !== interaction.user.id) {
        return interaction.reply({
            content: 'Esse painel não pertence a você ou expirou.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const botao = draft.botoes?.find(b => b.id === idBotao);

    if (!botao) {
        return interaction.reply({
            content: 'Esse botão não foi encontrado no criador.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    if (!botao.resposta?.trim()) {
        return interaction.reply({
            content: 'Esse botão não possui uma resposta configurada.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    if (botao.respostaTipo === 'v2') {
    const container = new ContainerBuilder();
    const blocos = parseBlocosTexto(botao.resposta);
    blocos.forEach((bloco, i) => {
        if (bloco.length > 0) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bloco));
        if (i < blocos.length - 1) container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    });

    return interaction.reply({
        components: [container],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

return interaction.reply({
    content: `**Prévia da mensagem ↓**\n\n${botao.resposta}`,
    flags: [MessageFlags.Ephemeral]
});
}

// ---- Clique no botão já enviado: responde com a mensagem configurada ----
if (interaction.isButton() && interaction.customId.startsWith('msgcriador_btn_')) {
    const idBotao = interaction.customId.replace('msgcriador_btn_', '');
    const registro = respostasBotoesMsg.get(`${interaction.message.id}_${idBotao}`);

    if (!registro) {
        return interaction.reply({ content: 'Esse botão não possui uma resposta configurada.', flags: [MessageFlags.Ephemeral] });
    }

    if (registro.tipo === 'v2') {
    const container = new ContainerBuilder();
    const blocos = parseBlocosTexto(registro.texto);
    blocos.forEach((bloco, i) => {
        if (bloco.length > 0) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(bloco));
        if (i < blocos.length - 1) container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    });

    return interaction.reply({
        components: [container],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

return interaction.reply({ content: registro.texto, flags: [MessageFlags.Ephemeral] });
}
    
    
if (interaction.isButton() && interaction.customId === 'resgate_converter') {
    await flushBufferMensagens();
    const mensagens = await getMensagens(interaction.user.id);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **Converter mensagens em moedas**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `Você possui \`${mensagens}\` mensagens disponíveis para conversão (1 mensagem = 1 moeda).\n\nEscolha como deseja converter:`
        ))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('resgate_converter_tudo').setLabel('Converter tudo').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('resgate_converter_quantidade').setLabel('Informe a quantidade').setStyle(ButtonStyle.Secondary)
            )
        );

    return interaction.reply({
        components: [container],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isButton() && interaction.customId === 'resgate_converter_tudo') {
    await flushBufferMensagens();
    const mensagens = await getMensagens(interaction.user.id);

    if (mensagens < 50) {
        return interaction.reply({
            components: containerTexto('Você não possui mensagens suficientes para converter! O mínimo é **50 mensagens**.'),
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    await setMensagens(interaction.user.id, 0);
    const novoSaldo = await somarSaldo(interaction.user.id, mensagens);

    return interaction.reply({
        components: containerTexto(`Conversão realizada! Você trocou **${mensagens} mensagens** por **${mensagens} moedas**. Saldo atual: **${novoSaldo}**`),
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isButton() && interaction.customId === 'resgate_converter_quantidade') {
    const modal = new ModalBuilder()
        .setCustomId('modal_resgate_converter_quantidade')
        .setTitle('Converter mensagens');

    const inputQuantidade = new TextInputBuilder()
        .setCustomId('quantidade')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);

    const labelQuantidade = new LabelBuilder()
        .setLabel('Quantidade de mensagens')
        .setDescription('Digite quantas mensagens deseja converter (mínimo 50).')
        .setTextInputComponent(inputQuantidade);

    modal.addLabelComponents(labelQuantidade);
    return interaction.showModal(modal);
}

if (interaction.isModalSubmit() && interaction.customId === 'modal_resgate_converter_quantidade') {
    const valorTexto = interaction.fields.getTextInputValue('quantidade').trim();
    const quantidade = parseInt(valorTexto);

    if (isNaN(quantidade) || quantidade <= 0) {
        return interaction.reply({
            components: containerTexto('Digite um número válido!'),
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    if (quantidade < 50) {
        return interaction.reply({
            components: containerTexto('Quantidade muito baixa! O mínimo para converter é **50 mensagens**.'),
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    await flushBufferMensagens();
    const mensagens = await getMensagens(interaction.user.id);

    if (quantidade > mensagens) {
        return interaction.reply({
            components: containerTexto(`Você não possui mensagens suficientes! Você tem apenas \`${mensagens}\` mensagens disponíveis.`),
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    const mensagensRestantes = mensagens - quantidade;
    await setMensagens(interaction.user.id, mensagensRestantes);
    const novoSaldo = await somarSaldo(interaction.user.id, quantidade);

    return interaction.reply({
        components: containerTexto(`Conversão realizada! Você trocou **${quantidade} mensagens** por **${quantidade} moedas**. Saldo atual: **${novoSaldo}**`),
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

    if (interaction.isButton() && interaction.customId === 'resgate_carteira') {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const saldo = await getSaldo(interaction.user.id);
    const mensagens = await getMensagens(interaction.user.id);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(` **Carteria de - ${interaction.user.username}**`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Saldo:** \`${saldo}\``))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Mensagens:** \`${mensagens}\``));

    return interaction.editReply({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}
    
    if (interaction.isButton() && interaction.customId === 'resgate_cargos') {
    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **Loja de cargos**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Utilize suas moedas para comprar um cargo abaixo.'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('loja_cargos_select')
                    .setPlaceholder('Selecione o cargo que deseja comprar')
                    .addOptions(
                            CARGOS_LOJA.map(c => ({
                                       label: c.nome,
                                       description: `${c.preco} moedas${c.duracaoDias ? ` • dura ${c.duracaoDias} dias` : ''}`,
                                       value: c.id,
                                       emoji: c.emoji
                             }))
                     )
            )
        );

    return interaction.reply({
        components: [container],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isStringSelectMenu() && interaction.customId === 'loja_cargos_select') {
    const cargoId = interaction.values[0];
    const cargoInfo = CARGOS_LOJA.find(c => c.id === cargoId);

    if (!cargoInfo) {
        return interaction.reply({ content: 'Cargo não encontrado na loja.', flags: [MessageFlags.Ephemeral] });
    }

    const membro = interaction.member;

    if (membro.roles.cache.has(cargoId)) {
        return interaction.reply({
            content: `Você já possui o cargo **${cargoInfo.nome}**!`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    const saldoAtual = await getSaldo(interaction.user.id);

    if (saldoAtual < cargoInfo.preco) {
        return interaction.reply({
            content: `Saldo insuficiente! O cargo **${cargoInfo.nome}** custa **${cargoInfo.preco} moedas**, e você tem **${saldoAtual}**.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    try {
        await membro.roles.add(cargoId);
    } catch (err) {
        console.error('--- Erro ao adicionar cargo comprado ---', err);
        return interaction.reply({
            content: 'Ocorreu um erro ao adicionar o cargo. avise algum adm ver  as permissões do bot.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const novoSaldo = await somarSaldo(interaction.user.id, -cargoInfo.preco);

    const diasExpiracao = cargoInfo.duracaoDias || DURACAO_CARGO_LOJA_DIAS;
const expiraEm = Date.now() + (diasExpiracao * 24 * 60 * 60 * 1000);

await CargoLoja.findOneAndUpdate(
    { userId: interaction.user.id, cargoId, guildId: interaction.guild.id },
    { expiraEm },
    { upsert: true }
).catch(err => console.error('--- Erro ao salvar expiração do cargo da loja ---', err));

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **CARGO COMPRADO**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Cargo:** ${cargoInfo.nome}`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Valor pago:** \`${cargoInfo.preco}\` moedas`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Saldo restante:** \`${novoSaldo}\``));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(` Esse cargo será removido automaticamente em **${diasExpiracao} dias**.`));

    return interaction.reply({
        components: [container],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}
    
    
if (interaction.isChatInputCommand() && interaction.commandName === 'help') {
        return interaction.reply({
            components: [montarPainelHelp('slash', 0)],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }
    
    if (interaction.isButton() && interaction.customId.startsWith('daily_')) {
    const donoId = interaction.customId.replace('daily_', '');

    if (interaction.user.id !== donoId) {
        return interaction.reply({
            content: 'Você não possui autoridade sobre esse comando!',
            flags: [MessageFlags.Ephemeral]
        });
    }

    const chave = `daily:${donoId}`;
    const ttlRestante = await redis.ttl(chave);

    if (ttlRestante > 0) {
        const horas = Math.floor(ttlRestante / 3600);
        const minutos = Math.floor((ttlRestante % 3600) / 60);
        return interaction.reply({
            content: `Você já resgatou seu **Daily** de hoje! Volte em **${horas}h ${minutos}m**.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    await redis.set(chave, Date.now(), 'EX', Math.floor(COOLDOWN_DAILY_MS / 1000));

    const novoSaldo = await somarSaldo(donoId, MOEDAS_DAILY);

    return interaction.reply({
        content: `Daily resgatado! Total: ${MOEDAS_DAILY} moedas! Saldo atual: **${novoSaldo}**`,
        flags: [MessageFlags.Ephemeral]
    });
}

if (interaction.isButton() && interaction.customId.startsWith('carteira_atualizar_')) {
    try {
        const partes = interaction.customId.replace('carteira_atualizar_', '').split('_');
        const autorId = partes[0];
        const alvoId = partes[1];

        if (interaction.user.id !== autorId) {
            return interaction.reply({
                content: 'Você não possui autoridade sobre esse comando!',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const alvo = await interaction.client.users.fetch(alvoId, { force: true }).catch(() => null);

        if (!alvo) {
            return interaction.reply({ content: 'Não foi possível encontrar esse usuário.', flags: [MessageFlags.Ephemeral] });
        }

        const saldo = await getSaldo(alvo.id);
        const mensagens = await getMensagens(alvo.id);
        const ehPropriaCarteira = alvo.id === interaction.user.id;

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(` **Carteira de - ${alvo.username}**`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Saldo:** \`${saldo}\``))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Mensagens:** \`${mensagens}\``));

        const botoes = [
    new ButtonBuilder()
        .setCustomId(`carteira_atualizar_${interaction.user.id}_${alvo.id}`)
        .setEmoji('1526757661142679653')
        .setStyle(ButtonStyle.Secondary)
];

        if (ehPropriaCarteira) {
    botoes.push(
        new ButtonBuilder()
            .setCustomId(`daily_${autorId}`)
            .setLabel('Daily')
            .setStyle(ButtonStyle.Success)
    );
}

        container.addActionRowComponents(new ActionRowBuilder().addComponents(botoes));

        return await interaction.update({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });
    } catch (err) {
        console.error('--- Erro no botão carteira_atualizar ---', err);
        if (!interaction.replied && !interaction.deferred) {
            return interaction.reply({ content: 'Ocorreu um erro ao atualizar a carteira.', flags: [MessageFlags.Ephemeral] }).catch(() => null);
        }
    }
}

if (interaction.isButton() && interaction.customId.startsWith('insta_')) {

    if (interaction.customId === 'insta_curtir') {
        const postData = await InstaPost.findOne({ messageId: interaction.message.id });
        if (!postData) return interaction.reply({ content: 'Post não encontrado.', flags: [MessageFlags.Ephemeral] });

        await interaction.deferUpdate(); // reconhece a interação IMEDIATAMENTE

        const idx = postData.curtidas.indexOf(interaction.user.id);
        if (idx >= 0) postData.curtidas.splice(idx, 1);
        else postData.curtidas.push(interaction.user.id);
        await postData.save();

        try {
            await editarWebhook(interaction.channel, interaction.message.id);
        } catch (err) {
            console.error('--- Erro ao atualizar curtidas ---', err);
        }
        return;
    }

    if (interaction.customId === 'insta_comentar') {
        const modal = new ModalBuilder().setCustomId(`modal_comentario_${interaction.message.id}`).setTitle('Comentar');
        const input = new TextInputBuilder()
            .setCustomId('texto_comentario')
            .setLabel('Digite seu comentário')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

if (interaction.customId === 'insta_info') {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] }); // reconhece antes de qualquer coisa lenta

        const postData = await InstaPost.findOne({ messageId: interaction.message.id });
        if (!postData) return interaction.editReply({ content: 'Post não encontrado.' });

        return interaction.editReply({
            components: [montarPainelInstaInfo(postData, 'curtidas')],
            flags: [MessageFlags.IsComponentsV2]
        });
    }
    
    if (interaction.isButton() && interaction.customId.startsWith('insta_info_aba_')) {
    const resto = interaction.customId.replace('insta_info_aba_', '');
    const separador = resto.indexOf('_');
    const aba = resto.slice(0, separador);
    const postMessageId = resto.slice(separador + 1);

    const postData = await InstaPost.findOne({ messageId: postMessageId });
    if (!postData) {
        return interaction.update({
            components: containerTexto('Post não encontrado.'),
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    return interaction.update({
        components: [montarPainelInstaInfo(postData, aba)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

    if (interaction.customId === 'insta_perfil') {
        const postData = await InstaPost.findOne({ messageId: interaction.message.id });
        if (!postData) return interaction.reply({ content: 'Post não encontrado.', flags: [MessageFlags.Ephemeral] });

        if (interaction.user.id !== postData.ownerId) {
            return interaction.reply({
                components: containerTexto('Apenas o autor deste post pode vincular o Instagram.'),
                flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
            });
        }

        const modal = new ModalBuilder()
            .setCustomId(`modal_insta_perfil_${interaction.message.id}`)
            .setTitle('Vincular Instagram');

        const input = new TextInputBuilder()
            .setCustomId('usuario_insta')
            .setLabel('Seu usuário do Instagram')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMaxLength(60);

        modal.addComponents(new ActionRowBuilder().addComponents(input));
        return interaction.showModal(modal);
    }

    if (interaction.customId === 'insta_lixeira') {
        const postData = await InstaPost.findOne({ messageId: interaction.message.id });
        if (!postData) return interaction.reply({ content: 'Post não encontrado.', flags: [MessageFlags.Ephemeral] });
        if (interaction.user.id !== postData.ownerId) {
            return interaction.reply({ content: 'Apenas o dono do post pode excluí-lo.', flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferUpdate(); // reconhece antes de deletar

        await interaction.message.delete().catch(() => {});
        await InstaPost.deleteOne({ messageId: interaction.message.id });
        return;
    }
}

    if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_comentario_')) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
    const postId = interaction.customId.replace('modal_comentario_', '');
    const postData = await InstaPost.findOne({ messageId: postId });
    if (!postData) return interaction.editReply({ content: 'Post não encontrado.' });

    postData.comentarios.push({ id: interaction.user.id, texto: interaction.fields.getTextInputValue('texto_comentario') });
    await postData.save();

    try {
        await editarWebhook(interaction.channel, postId);
    } catch (err) {
        console.error('--- Erro ao atualizar comentários ---', err);
    }
    return interaction.editReply({ content: 'Comentário adicionado!' });
}
    
     // ============ SISTEMA DE TICKETS============
    if (interaction.isButton() && interaction.customId === 'ticket_iniciar') {
    
    const ticketExistente = [...ticketDB.entries()].find(([, dados]) => dados.autorId === interaction.user.id);

    if (ticketExistente) {
        const [threadId] = ticketExistente;
        const threadAtiva = interaction.guild.channels.cache.get(threadId);

        if (threadAtiva) {
            const embed = new EmbedBuilder()
                .setColor('#000000')
                .setDescription(`${interaction.user} Você já possui um ticket aberto em: <#${threadId}>. Finalize-o antes de abrir um novo!`);

            return interaction.reply({
                embeds: [embed],
                flags: [MessageFlags.Ephemeral]
            });
        } else {
            
            ticketDB.delete(threadId);
        }
    }

    const modal = new ModalBuilder()
        .setCustomId('ticket_modal')
        .setTitle('Atendimento');

    const motivoInput = new TextInputBuilder()
        .setCustomId('motivo')
        .setLabel('Insira o motivo do seu atendimento')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true)
        .setMaxLength(1000);

    modal.addComponents(new ActionRowBuilder().addComponents(motivoInput));
    return interaction.showModal(modal);
}

    if (interaction.isModalSubmit() && interaction.customId === 'ticket_modal') {
    const motivo = interaction.fields.getTextInputValue('motivo');

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    let canalBase;
    try {
        canalBase = await interaction.guild.channels.fetch(CANAL_TICKETS);
    } catch (err) {
        console.error('--- Erro ao buscar CANAL_TICKETS ---', err);
        return interaction.editReply({ content: 'Erro: CANAL_TICKETS inválido ou o bot não consegue ver esse canal.' });
    }

    if (!canalBase) {
        return interaction.editReply({ content: 'Erro: CANAL_TICKETS não encontrado. Confira o ID.' });
    }

    let ticketThread;
    let numeroTicket;
    try {
        numeroTicket = await proximoNumeroTicket();

ticketThread = await canalBase.threads.create({
    name: `\u{1F4CC}・${interaction.user.username}・N°${numeroTicket}`,
    type: ChannelType.PrivateThread,
    invitable: false,
    reason: `Ticket aberto por ${interaction.user.tag}`
});
    } catch (err) {
        console.error('--- Erro ao criar o tópico ---', err);
        return interaction.editReply({ content: 'Erro ao criar o tópico. Verifique as permissões do bot no canal (Criar Tópicos Privados) e veja o console pro erro completo.' });
    }

    ticketDB.set(ticketThread.id, {
        autorId: interaction.user.id,
        motivo: motivo,
        assumidoPor: null,
        numero: numeroTicket,
        painelMessageId: null
    });
    await TicketData.create({
        threadId: ticketThread.id,
        autorId: interaction.user.id,
        motivo,
        assumidoPor: null,
        numero: numeroTicket
    }).catch(err => console.error('--- Erro ao salvar ticket no banco ---', err));

    
    await ticketThread.send({
        content:`<@${interaction.user.id}>, <@&1542321888355684456>, <@&1542321888355684454>, <@&1542321888309809210>, <@&1542321888309809212>, <@&1542321888355684455>`

    });

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## Ticket - ${interaction.user.username}`)
        )
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**Assumido por:** \`ninguém\``)
                )
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(`**Motivo:**\n\`\`\`${motivo}\`\`\``)
                )
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(interaction.user.displayAvatarURL({ extension: 'png', size: 256 }))
                )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`## SUPORTE\n Aguarde ser atendido pela equipe responsável.`)
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_assumir')
                    .setLabel('Assumir')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId('ticket_finalizar')
                    .setLabel('Finalizar')
                    .setStyle(ButtonStyle.Danger)
            )
        );

    const painelMsg = await ticketThread.send({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });

    const dadosCriados = ticketDB.get(ticketThread.id);
    if (dadosCriados) dadosCriados.painelMessageId = painelMsg.id;

    const containerAviso = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`<@${interaction.user.id}>`)
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`Seu atendimento foi iniciado com sucesso!`)
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('Ir para o ticket')
                    .setStyle(ButtonStyle.Link)
                    .setURL(`https://discord.com/channels/${interaction.guild.id}/${ticketThread.id}`)
            )
        );

    return interaction.editReply({
        components: [containerAviso],
        flags: [MessageFlags.IsComponentsV2]
    });
}

    if (interaction.isButton() && interaction.customId === 'ticket_assumir') {
    if (!interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        const embedSemPermissao = new EmbedBuilder()
            .setColor('#000000')
            .setDescription(`${interaction.user} Você não tem permissão para assumir tickets`);

        return interaction.reply({ embeds: [embedSemPermissao], flags: [MessageFlags.Ephemeral] });
    }

    let data = ticketDB.get(interaction.channel.id);
    if (!data) {
        const doc = await TicketData.findOne({ threadId: interaction.channel.id }).catch(() => null);
        if (doc) {
            data = { autorId: doc.autorId, motivo: doc.motivo, assumidoPor: doc.assumidoPor, numero: doc.numero, painelMessageId: interaction.message.id };
            ticketDB.set(interaction.channel.id, data);
        }
    }

    if (!data) {
        return interaction.reply({ content: 'Não foi possível encontrar os dados desse ticket.', flags: [MessageFlags.Ephemeral] });
    }

    if (data.assumidoPor) {
        return interaction.reply({ content: 'Esse ticket já foi assumido.', flags: [MessageFlags.Ephemeral] });
    }

    if (!data.painelMessageId) data.painelMessageId = interaction.message.id;

    await interaction.deferUpdate();

    await assumirTicket(interaction.channel, data, interaction.member);
}

    if (interaction.isButton() && interaction.customId === 'ticket_finalizar') {
    if (!interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        const embedSemPermissao = new EmbedBuilder()
            .setColor('#000000')
            .setDescription(`${interaction.user} Você não tem permissão para finalizar tickets`);
        return interaction.reply({ embeds: [embedSemPermissao], flags: [MessageFlags.Ephemeral] });
    }

    await interaction.deferUpdate();

    const canalTicket = interaction.channel;
    const threadIdAtual = canalTicket?.id ?? interaction.channelId;
    let data = ticketDB.get(threadIdAtual);
    if (!data) {
        data = await TicketData.findOne({ threadId: threadIdAtual }).catch(() => null);
    }
    const guild = interaction.guild;
    const finalizadoPor = interaction.user;

    
let transcriptId = null;
    try {
        transcriptId = crypto.randomUUID();
        const htmlTranscript = await Promise.race([
            gerarTranscriptHTML(canalTicket, transcriptId),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout ao gerar transcript')), 30000))
        ]);

        await TranscriptModel.create({ _id: transcriptId, html: htmlTranscript, criadoEm: Date.now() });
    } catch (err) {
        console.error('--- Erro ao gerar/salvar transcript ---', err);
        transcriptId = null;
    }

    
    const abertoEmTimestamp = canalTicket?.createdTimestamp ?? null;

    if (canalTicket) {
        ticketDB.delete(canalTicket.id);
        await TicketData.deleteOne({ threadId: canalTicket.id }).catch(() => null);
        await canalTicket.delete().catch(() => null);
    } else {
        ticketDB.delete(interaction.channelId);
        await TicketData.deleteOne({ threadId: interaction.channelId }).catch(() => null);
    }
    
    if (transcriptId && data?.autorId) {
        try {
            const autorUser = await client.users.fetch(data.autorId).catch(() => null);
            if (autorUser) {
                const fechadoEmUnix = Math.floor(Date.now() / 1000);
                const abertoEmUnix = abertoEmTimestamp ? Math.floor(abertoEmTimestamp / 1000) : null;

                const containerDM = new ContainerBuilder()
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `## Ticket finalizado\nSeu atendimento em **${guild.name}** foi encerrado.`
                    ))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `**Ticket:** N°${data.numero ?? '?'}\n` +
                        `**Fechado por:** ${finalizadoPor}`
                    ))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                        `**Aberto em:** ${abertoEmUnix ? `<t:${abertoEmUnix}:f>` : '\`não registrado\`'}\n` +
                        `**Fechado em:** <t:${fechadoEmUnix}:f>`
                    ))
                    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                    .addActionRowComponents(
                        new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setLabel('Ver conversa completa').setStyle(ButtonStyle.Link).setURL(`${PUBLIC_BASE_URL}/transcript/${transcriptId}`)
                        )
                    );
                await autorUser.send({ components: [containerDM], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
            }
        } catch (err) {
            console.error('--- Erro ao enviar transcript por DM ---', err);
        }
    }

    (async () => {
        try {
            const canalLogs = await guild.channels.fetch(CANAL_LOGS_TICKETS).catch(() => null);
            if (!canalLogs) return;

            const autorId = data?.autorId ?? null;
            const motivo = data?.motivo ?? 'Não informado';
            const assumidoPor = data?.assumidoPor ?? null;
            const numero = data?.numero ?? '?';

            const urlHtml = transcriptId ? `${PUBLIC_BASE_URL}/transcript/${transcriptId}` : null;

            const autorUserLog = autorId ? await client.users.fetch(autorId).catch(() => null) : null;
            const avatarLogTicket = autorUserLog?.displayAvatarURL({ extension: 'png', size: 256 }) ?? IMG_DISCORD_LOGO;

            const container = new ContainerBuilder()
                .addSectionComponents(
                    new SectionBuilder()
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### TICKET FINALIZADO'))
                        .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarLogTicket))
                )
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Aberto por:** <@${autorId}>`))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Assumido por:** ${assumidoPor ? `<@${assumidoPor}>` : '\`ninguém\`'}`))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Motivo:**\n\`\`\`${motivo}\`\`\``))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Ticket:** N°${numero}`))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Finalizado por:** ${finalizadoPor}`));

            if (urlHtml) {
                container.addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setLabel('Abrir conversa').setStyle(ButtonStyle.Link).setURL(urlHtml)
                    )
                );
            }

            await canalLogs.send({
                components: [container],
                flags: [MessageFlags.IsComponentsV2],
                allowedMentions: { parse: ['users'] }
            }).catch(err => {
                console.error('--- Erro ao enviar log de ticket ---', err);
            });
        } catch (err) {
            console.error('--- Erro ao enviar log de ticket ---', err);
        }
    })();
}
});

// ============ LOGIN DO DISCORD ============

console.log('[DISCORD] Iniciando conexão com o Gateway...');

client.once(Events.ClientReady, async (c) => {
    console.log('========================================');
    console.log(`[DISCORD] BOT ONLINE: ${c.user.tag}`);
    console.log(`[DISCORD] ID: ${c.user.id}`);
    console.log(`[DISCORD] SERVIDORES: ${c.guilds.cache.size}`);
    console.log(`[DISCORD] PING: ${c.ws.ping}ms`);
    console.log('========================================');
});

client.on('error', (err) => {
    console.error('[DISCORD ERROR]', err);
});

client.on('shardError', (error, shardId) => {
    console.error(`[DISCORD SHARD ${shardId} ERROR]`, error);
});

client.on('shardDisconnect', (event, shardId) => {
    console.error(
        `[DISCORD SHARD ${shardId} DISCONNECT]`,
        event?.code,
        event?.reason
    );
});

client.on('shardReconnecting', (shardId) => {
    console.warn(`[DISCORD SHARD ${shardId}] Reconectando...`);
});

client.on('shardResume', (shardId, replayedEvents) => {
    console.log(
        `[DISCORD SHARD ${shardId}] Reconectado! Eventos: ${replayedEvents}`
    );
});

client.on('invalidated', () => {
    console.error('[DISCORD] Sessão invalidada!');
});

process.on('unhandledRejection', (reason) => {
    console.error('[UNHANDLED REJECTION]', reason);
});

process.on('uncaughtException', (err) => {
    console.error('[UNCAUGHT EXCEPTION]', err);
});

if (!TOKEN) {
    console.error('[DISCORD] DISCORD_TOKEN está vazio!');
    process.exit(1);
}

client.login(TOKEN)
    .then(() => {
        console.log('[DISCORD] Login autenticado, aguardando READY...');
    })
    .catch((err) => {
        console.error('[DISCORD] FALHA AO CONECTAR:', err);
        process.exit(1);
    }); 