
// =========== IMPORTS ============
const {
    MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder,
    SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ThumbnailBuilder, SectionBuilder,
    ChannelType, EmbedBuilder, SlashCommandBuilder, StringSelectMenuBuilder, UserSelectMenuBuilder,
    ChannelSelectMenuBuilder, RoleSelectMenuBuilder, Routes, PermissionFlagsBits, AuditLogEvent, OverwriteType
} = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { getUserPerfil } = require('./bio_fetcher.js');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require("path");
const os = require('os');
const crypto = require('crypto');
const { comandos, montarPainelBotCall } = require('./commands');
const { botCallDB, botCallPaineis, msgCriadorDB } = require('./state');
const { esperar, containerTexto, comRetry, xpNecessario, somarSaldo, getXP, setXP, urlValida } = require('./helpers');
const { logarAntiLink, logarAntiSpam, logarPunicaoCargosStaff, logarAntiNukeCanais } = require('./logger');
const redis = require('./redis');
const { supabase } = require('./supabase');
const {
    ServerBackup, Mensagens, CargoLoja, VoiceState,
    ContadorTicket, TicketData, ConviteStats, Sorteio, InstaPost, HistoricoUsername,
    HistoricoAvatar, HistoricoBanner, TellonymPendente, MapaPersistenteEntry, HistoricoBio, MuteCargo,
    TranscriptMedia
} = require('./models');
const {
    EMOJI_ATIVADO, EMOJI_DESATIVADO, CANAL_LOGS_MOD, CATEGORIA_MOEDAS_BOASVINDAS, CORES_MSG_CRIADOR,
    POSICOES_BOTAO, CARGOS_ATENDENTE, CARGO_BOOSTER, EMOJI_CROW, EMOJI_CURTIR, EMOJI_COMENTAR, EMOJI_INFO,
    EMOJI_LIXEIRA, EMOJI_INSTA_PERFIL, EMOJI_ATUALIZAR_PREVIEW, EMOJI_VOLTAR_PAINEL, IMG_MOEDAS,
    IMG_DISCORD_LOGO, XP_MIN_POR_MENSAGEM, XP_MAX_POR_MENSAGEM, MOEDAS_POR_NIVEL, TAXA_MOEDA_XP_EXTRA,
    DOMINIOS_MUSICA_PERMITIDOS, DOMINIOS_IMAGEM_CONFIAVEIS, BLACKLIST_DOMINIOS, DOMINIOS_CONVITE,
    EXTENSOES_IMAGEM, CACHE_MEMBROS_MS, CATEGORIA_STATUS_SORTEIO, CARGO_MUTADO, CARGO_RESTRITO_UNICO
} = require('./constants');

// ============ CLIENT (injetado pelo index.js) ============
let client = null;
function setClient(c) {
    client = c;
}

// ============ ESTADO E CONSTANTES ============

const PREFIXO = 'o!';

const PUBLIC_BASE_URL = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;

const eventoMoedas = { ativo: false, mensagem: null, ganho: false, timeoutId: null };

// ============ LET ============
let cacheMembros = null;
let cacheMembrosTimestamp = 0;
let eventoMoedasAtivo = true;

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

const ticketDB = new Map();
const gerenciarCargosDB = new Map();
const sorteioVoiceSessions = new Map();

const sorteioTimeouts = new Map();
const invitesCache = new Map();
const paineisProtecao = new MapaPersistente('paineis_protecao');

const canaisLockDB = new MapaPersistente('canais_lock');

// ============ CARD TELLONYM ============
GlobalFonts.registerFromPath(
    path.join(__dirname, "ARIAL.TTF"),
    "Arial"
);

GlobalFonts.registerFromPath(
    path.join(__dirname, "ARIALBD.TTF"),
    "Arial Bold"
);

// Fontes usadas nas formatações estilo Discord (itálico, negrito+itálico, código).
// Se os arquivos não existirem no servidor, cai de volta para a fonte normal/negrito
// já registrada acima (o texto ainda aparece, só sem o efeito visual extra).
const FONTE_REGULAR = "Arial";
const FONTE_BOLD = "Arial Bold";
let FONTE_ITALIC = "Arial";
let FONTE_BOLD_ITALIC = "Arial Bold";
let FONTE_CODE = "Arial";

const CAMINHO_FONTE_ITALIC = path.join(__dirname, "ARIALI.TTF");
if (fs.existsSync(CAMINHO_FONTE_ITALIC)) {
    GlobalFonts.registerFromPath(CAMINHO_FONTE_ITALIC, "Arial Italic Tellonym");
    FONTE_ITALIC = "Arial Italic Tellonym";
}

const CAMINHO_FONTE_BOLD_ITALIC = path.join(__dirname, "ARIALBI.TTF");
if (fs.existsSync(CAMINHO_FONTE_BOLD_ITALIC)) {
    GlobalFonts.registerFromPath(CAMINHO_FONTE_BOLD_ITALIC, "Arial Bold Italic Tellonym");
    FONTE_BOLD_ITALIC = "Arial Bold Italic Tellonym";
}

const CAMINHO_FONTE_CODE = path.join(__dirname, "COUR.TTF");
if (fs.existsSync(CAMINHO_FONTE_CODE)) {
    GlobalFonts.registerFromPath(CAMINHO_FONTE_CODE, "Consolas Tellonym");
    FONTE_CODE = "Consolas Tellonym";
}

// Tamanho de fonte e altura de linha por tipo de bloco (títulos, subtexto, citação)
const TAMANHOS_BLOCO = {
    normal: null, // usa MESSAGE_SIZE
    h1: 34,
    h2: 30,
    h3: 27,
    subtext: 18,
    quote: null
};

const QUOTE_INDENT = 18;

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

// Altura de cada linha renderizada no card, por tipo de bloco (formatação estilo Discord)
const ALTURA_LINHA_BLOCO = {
    normal: MESSAGE_LINE_HEIGHT,
    h1: MESSAGE_LINE_HEIGHT + 12,
    h2: MESSAGE_LINE_HEIGHT + 8,
    h3: MESSAGE_LINE_HEIGHT + 4,
    subtext: MESSAGE_LINE_HEIGHT - 8,
    quote: MESSAGE_LINE_HEIGHT
};

const DIVIDER_BOTTOM = 50;
const EMOJI_SIZE = 30;
const EMOJI_SIZE_CUSTOM = 32;

const REGEX_EMOJI_INTERNO = /<a?:\w{2,32}:\d{15,21}>|[#*0-9]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|(?:\p{Extended_Pictographic}\uFE0F?)(?:\u200D(?:\p{Extended_Pictographic}\uFE0F?))*/gu;

// ============ FUNCTIONS/ACTIONS============

const msgCriadorTimeouts = new Map();

// ============ GERENCIAMENTO DE CARGOS (o!groles) ============
const GROLES_POR_PAGINA = 5;
const PERMS_POR_PAGINA = 5;

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
    '1542321888234045546',
    '1542321888355684453',
    '1546329251219771512',
    '1542321888309809211',
    '1546329417062686820'
];

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

const grolesTimeouts = new Map();

// ============ EDITAR CARGOS (Criar/Excluir) ============
const EXCLUIR_CARGOS_POR_PAGINA = 4;

const REGEX_URL_SERVIDOR = /(\/onze\b)|(discord\.gg\/onze\b)/i;
const REGEX_CONVITE_GENERICO = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/([a-zA-Z0-9-]+)/gi;

// Último status que o bot definiu em cada canal (evita reenviar o mesmo status / remover status já vazio a cada tick)
const statusCanalAplicado = new Map();

const muteCargoTimeouts = new Map();

const EXT_AUDIO = ['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.opus', '.weba', '.aac'];
const EXT_IMAGEM = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

const LIMITE_MEDIA_TRANSCRIPT = 20 * 1024 * 1024; // 20MB

const bufferMensagens = new Map();

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
        janelaMs: 10000,
        antiNukeCanais: { ativo: false, bypassIds: [] }
    },
    antiSpam: { ativo: false, msgLimite: 6, janelaMs: 7000, duplicadoLimite: 3, muteMinutos: 10 },
    antiLink: { ativo: false, bloquearConvites: true, cargosBypass: [] },
    antiFake: { ativo: false, diasMinimos: 7, acao: 'kick' },
    antiBot: { ativo: false, acao: 'kick' }
};

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
    webhooks: new Map(),
    canaisProtegidos: new Map()
};

const LIMITES_ANTINUKE_EXTRA = {
    canaisCriados: 4,
    canaisEditados: 5,
    cargosCriados: 4,
    cargosEditados: 4,
    kicks: 5
};

const CACHE_AUDIT_MS = 800;
const auditLogCache = new Map();

// ============ ANTI-ABUSO: REMOÇÃO TEMPORÁRIA DE CARGOS POR BAN EM MASSA (STAFF) ============
const staffBanTracker = new Map();       // executorId -> [timestamps]
const staffPunicaoCargos = new Map();    // executorId -> { idsCargos }

const JANELA_BAN_STAFF_MS = 30 * 60 * 1000; // 30 minutos
const LIMITE_BANS_STAFF = 3;
const DURACAO_PUNICAO_STAFF_MS = 2 * 60 * 1000; // 2 minutos

const CARGO_ISENTO_BAN_STAFF = '1542321888355684456'; // pode banir à vontade, sem punição do Anti-Abuso

const spamPunicaoEmAndamento = new Set();

const DESCRICOES_PROTECAO = {
    spam: 'Detecta flood ou mensagens repetidas e aplica timeout automático.',
    link: 'Bloqueia links e convites de fora. Booster, Atendente e Links Livres têm bypass.',
    antifake: 'Age sobre contas muito recentes ao entrar (kick, ban ou mute).',
    antibot: 'Expulsa ou bane automaticamente qualquer bot que entrar no servidor.'
};

// ============ USERINFO (userinfo / ui) ============
const EMOJIS_CONEXAO = {
    battlenet:       '<:battlenet:1548555662001176688>',
    bungie:          '<:bungie:1548555961638326302>',
    bluesky:         '<:bluesky:1548556057234776204>',
    crunchyroll:     '<:crunchyroll:1548556177338535946>',
    domain:          '<:domain:1548556229872320573>',
    ebay:            '<:ebay:1548557792024068127>',
    epicgames:       '<:epicgames:1548557748852097125>',
    facebook:        '<:facebook:1548557702219960420>',
    github:          '<:github:1548556275300835488>',
    instagram:       '<:instagram2:1548561559373217792>',
    leagueoflegends: '<:LOL:1548557912039882843>',
    mastodon:        '<:mastodon:1548556572689432646>',
    paypal:          '<:paypal:1548556521888153720>',
    playstation:     '<:playstation:1548556466686791761>',
    reddit:          '<:reddit:1548556355571548270>',
    riotgames:       '<:riotgames:1548557065549512774>',
    roblox:          '<:roblox:1548557024961237015>',
    samsung:         '<:samsung:1548556971735781386>',
    soundcloud:      '<:soundcloud:1548556928014229524>',
    spotify:         '<:spotify:1548556760531603538>',
    skype:           '<:skype:1548556807671250944>',
    steam:           '<:steam:1548557662969528381>',
    tiktok:          '<:tiktok:1548557613896302724>',
    twitch:          '<:twitch:1548557548309712958>',
    twitter:         '<:X_:1548557498376654938>',
    xbox:            '<:xbox:1548557362795778088>',
    youtube:         '<:youtube:1548557827185053806>',
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

// ============ COMANDO HELP ============

const HELP_POR_PAGINA = 6;

// ---------- HELP DINÂMICO ----------
// A lista do /help é montada sozinha:
//  - Slash: lê tudo o que está registrado no Discord (LISTA_DE_COMANDOS + pasta de comandos).
//  - Prefixo: lê os .js do projeto procurando os comandos tratados em message.content.
// INFO_COMANDOS é opcional: se o comando tiver entrada lá, o texto manual sobrescreve o automático.

const HELP_OCULTOS = new Set([]);            // nomes (sem "/" e sem prefixo) que não devem aparecer no help
const HELP_PREFIXO_EXTRAS = ['painelcall'];  // comandos de prefixo tratados fora dos .js lidos (se houver)

const HELP_DESCRICAO_PADRAO = 'Comando de prefixo do servidor.'; // usado por comando de prefixo novo, sem descrição

// Descrição curta de cada comando de prefixo (chave = nome sem prefixo e sem acento)
const HELP_PREFIXO_DESCRICOES = {
    regras: 'Painel de regras',
    tickets: 'Painel de atendimento',
    painelcall: 'Painel de calls temporárias',
    tellonym: 'Painel tellonym',
    loja: 'Painel da loja de cargos e convertor',
    botcall: 'Envia o painel de controle da call do bot',
    moedastp: 'Painel de controle do evento de moedas',
    xpeditar: 'Edita XP de um usuário',
    moedaseditar: 'Edita moedas de um usuário',
    addcargo: 'Adiciona um cargo a um usuário',
    remcargo: 'Remove um cargo de um usuário',
    groles: 'Gerencia os cargos de um usuário (adicionar/remover pelo painel)',
    roleall: 'Aplica um cargo em massa para todos os membros',
    nuke: 'Reseta o canal',
    painelps: 'Painel de proteção do servidor',
    ban: 'Bane um usuário com confirmação',
    unban: 'Desbane um usuário pelo ID com confirmação',
    painelurl: 'Painel de verificação de link na bio',
    info: 'Painel de hierarquia de cargos',
    userinfo: 'Mostra informações detalhadas de um usuário',
    tiktok: 'Baixa vídeos do TikTok sem marca d\'água',
    msg: 'Cria e envia uma mensagem personalizada em um canal',
    cl: 'Apaga mensagens do autor do comando',
    limpar: 'Apaga mensagens do canal',
    areas: 'Mostra as áreas disponíveis da equipe'
};

// Só pra preencher o "Ajuda › Categoria › comando". Comando fora daqui cai em "Geral".
const HELP_CATEGORIAS = {
    'Moderação': ['ban', 'unban', 'kick', 'mute', 'unmute', 'limpar', 'nuke', 'painelps', 'cl'],
    'Administração': ['addemoji', 'regras', 'tickets', 'xpeditar', 'addcargo', 'remcargo', 'groles', 'roleall', 'painelurl'],
    'Economia': ['carteira', 'pix', 'loja', 'moedastp', 'moedaseditar'],
    'Diversão': ['pd', 'tellonym', 'tiktok'],
    'Utilidades': ['sorteio', 'convite', 'afk', 'botcall', 'avatar', 'ui', 'painelcall', 'info', 'userinfo', 'msg'],
    'Ajuda': ['help']
};
const HELP_CATEGORIA_POR_NOME = new Map(
    Object.entries(HELP_CATEGORIAS).flatMap(([categoria, nomes]) => nomes.map(nome => [nome, categoria]))
);

const HELP_TIPOS_OPCAO = { 3: 'texto', 4: 'número', 5: 'sim/não', 6: '@usuário', 7: '#canal', 8: '@cargo', 9: '@menção', 10: 'número', 11: 'anexo' };
const RE_HELP_PREFIXO = /(?:startsWith\(\s*|={2,3}\s*)`\$\{PREFIXO\}([\p{L}\d_-]+)/giu;
const RE_HELP_SEM_PREFIXO = /content\.toLowerCase\(\)(?:\.trim\(\))?\s*===?\s*'([\p{L}\d_-]+)'/giu;

const helpSemAcento = texto => String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

let cacheListasHelp = null;

const CATEGORIAS_HELP = {
    slash: { label: 'Comandos Slash', get lista() { return gerarListasHelp().slash; } },
    prefixo: { label: 'Comandos com Prefixo', get lista() { return gerarListasHelp().prefixo; } }
};

const INFO_COMANDOS = {
    '/ban': { descricao: 'Bane um usuário do servidor, removendo seu acesso permanentemente. Pode apagar mensagens recentes dele e pede confirmação antes de executar.', comoUsar: '/ban usuario:@usuário motivo:[opcional] dias_mensagens:[opcional]', exemplo: '/ban usuario:@Fulano motivo:Spam dias_mensagens:1', permissao: 'Banir Membros' },
    '/unban': { descricao: 'Remove o banimento de um usuário, permitindo que ele volte a entrar no servidor.', comoUsar: '/unban usuario_id:<ID> motivo:[opcional]', exemplo: '/unban usuario_id:123456789012345678', permissao: 'Banir Membros' },
    '/kick': { descricao: 'Expulsa um usuário do servidor. Diferente do ban, ele pode entrar novamente pelo convite.', comoUsar: '/kick usuario:@usuário motivo:[opcional]', exemplo: '/kick usuario:@Fulano motivo:Comportamento tóxico', permissao: 'Expulsar Membros' },
    '/mute': { descricao: 'Aplica um timeout no usuário, impedindo-o de enviar mensagens ou falar em call durante o tempo definido.', comoUsar: '/mute usuario:@usuário duracao:<minutos> motivo:[opcional]', exemplo: '/mute usuario:@Fulano duracao:60 motivo:Flood', permissao: 'Silenciar Membros' },
    '/unmute': { descricao: 'Remove o timeout de um usuário antes do tempo original acabar.', comoUsar: '/unmute usuario:@usuário motivo:[opcional]', exemplo: '/unmute usuario:@Fulano', permissao: 'Silenciar Membros' },
    '/limpar': { descricao: 'Apaga uma quantidade de mensagens do canal atual, mostrando o progresso em tempo real.', comoUsar: '/limpar quantidade:<número de 1 a 300>', exemplo: '/limpar quantidade:50', permissao: 'Gerenciar Mensagens' },
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
    '/ui': { descricao: 'Mostra informações detalhadas de você ou de outro usuário: bio, conexões, cargos, emblemas, histórico de nomes/avatares/banners.', comoUsar: '/ui usuario:[opcional]', exemplo: '/ui usuario:@Fulano', permissao: 'Nenhuma' },
    [`${PREFIXO}msg`]: { descricao: 'Abre um painel interativo pra montar uma mensagem personalizada (com texto, imagem e botões) e enviá-la em qualquer canal de texto do servidor. O painel expira e é apagado após 20 minutos.', comoUsar: `${PREFIXO}msg`, exemplo: `${PREFIXO}msg`, permissao: 'Equipe' },
    [`${PREFIXO}ban`]: { descricao: 'Bane um usuário mencionado do servidor, com uma etapa de confirmação antes de executar.', comoUsar: `${PREFIXO}ban @usuário [motivo]`, exemplo: `${PREFIXO}ban @Fulano Spam`, permissao: 'Banir Membros ou Equipe' },
    [`${PREFIXO}unban`]: { descricao: 'Remove o banimento de um usuário pelo ID, com uma etapa de confirmação antes de executar.', comoUsar: `${PREFIXO}unban <id> [motivo]`, exemplo: `${PREFIXO}unban 123456789012345678`, permissao: 'Banir Membros ou Equipe' },
    [`${PREFIXO}painelurl`]: { descricao: 'Envia um painel para o usuário verificar se colocou o link do servidor na bio ou nos pronomes, e recebe um cargo automaticamente se encontrado.', comoUsar: `${PREFIXO}painelurl`, exemplo: `${PREFIXO}painelurl`, permissao: 'Equipe' },
    [`${PREFIXO}info`]: { descricao: 'Envia o painel de hierarquia de cargos, permitindo consultar quem possui cada cargo do servidor.', comoUsar: `${PREFIXO}info`, exemplo: `${PREFIXO}info`, permissao: 'Nenhuma' },
    [`${PREFIXO}userinfo`]: { descricao: 'Mostra informações detalhadas de você ou de um usuário mencionado: bio, conexões, cargos, emblemas e históricos. Painel expira em 7 minutos.', comoUsar: `${PREFIXO}userinfo [@usuário]`, exemplo: `${PREFIXO}userinfo @Fulano`, permissao: 'Nenhuma' },
    [`${PREFIXO}tiktok`]: { descricao: 'Baixa e envia um vídeo do TikTok sem marca d\'água a partir do link enviado.', comoUsar: `${PREFIXO}tiktok <link do tiktok>`, exemplo: `${PREFIXO}tiktok https://www.tiktok.com/@usuario/video/123`, permissao: 'Nenhuma' },
    [`${PREFIXO}msg`]: { descricao: 'Abre um painel interativo pra montar uma mensagem personalizada (com texto, imagem e botões) e enviá-la em qualquer canal de texto do servidor. O painel expira e é apagado após 20 minutos.', comoUsar: `${PREFIXO}msg`, exemplo: `${PREFIXO}msg`, permissao: 'Equipe' },
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
    [`${PREFIXO}limpar`]: { descricao: 'Apaga uma quantidade de mensagens do canal atual, mostrando o progresso em tempo real.', comoUsar: `${PREFIXO}limpar <quantidade de 1 a 300>`, exemplo: `${PREFIXO}limpar 50`, permissao: 'Gerenciar Mensagens ou cargo de Limpar' }
};

// ============ COMANDOS SLASH ============

const LISTA_DE_COMANDOS = [
new SlashCommandBuilder()
    .setName('sorteio')
    .setDescription('Abre o painel de gerenciamento de sorteios'),
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Mostra a lista de comandos do bot'),
new SlashCommandBuilder()
        .setName('ui')
        .setDescription('Mostra informações detalhadas de um usuário')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário que deseja consultar').setRequired(false)),
];

// ============ LOGS DE CANAIS (criação, exclusão, edição) ============
const CANAL_LOGS_CANAIS_TEXTO = '1548501950964834464';
const CANAL_LOGS_CANAIS_VOZ = '1548380755804029090';

// ============ FUNÇÃO AUXILIAR: DETECÇÃO DE @everyone / @here ============
const REGEX_EVERYONE_HERE = /@(everyone|here)/i;

// ============ FUNÇÕES ============

async function salvarConfigMoedas() {
    try {
        const { error } = await supabase
            .from('config_moedas')
            .upsert({ id: 'config_moedas', ativo: eventoMoedasAtivo });
        if (error) throw error;
    } catch (err) {
        console.error('--- Erro ao salvar config do evento de moedas ---', err);
    }
}

async function carregarConfigMoedas() {
    try {
        const { data: doc, error } = await supabase
            .from('config_moedas')
            .select('*')
            .eq('id', 'config_moedas')
            .maybeSingle();
        if (error) throw error;
        if (doc && typeof doc.ativo === 'boolean') eventoMoedasAtivo = doc.ativo;
        console.log(`[Moedas] Evento automático carregado: ${eventoMoedasAtivo ? 'ativo' : 'desativado'}.`);
    } catch (err) {
        console.error('--- Erro ao carregar config do evento de moedas ---', err);
    }
}

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

// ============ FORMATAÇÃO ESTILO DISCORD (CARD DE TELLONYM) ============

// Detecta marcações de bloco (aplicadas no início da linha): títulos (#, ##, ###),
// subtexto (-#) e citação (>). O restante da linha continua sendo parseado normalmente.
function analisarEstiloLinha(linha) {
    let m;

    if ((m = linha.match(/^### (.+)$/))) return { tipo: 'h3', conteudo: m[1] };
    if ((m = linha.match(/^## (.+)$/))) return { tipo: 'h2', conteudo: m[1] };
    if ((m = linha.match(/^# (.+)$/))) return { tipo: 'h1', conteudo: m[1] };
    if ((m = linha.match(/^-# (.+)$/))) return { tipo: 'subtext', conteudo: m[1] };
    if ((m = linha.match(/^> ?(.*)$/))) return { tipo: 'quote', conteudo: m[1] };

    return { tipo: 'normal', conteudo: linha };
}

// Faz o parsing das marcações inline do Discord (**negrito**, *itálico*/_itálico_,
// __sublinhado__, ~~riscado~~, ||spoiler|| e `código`) e devolve uma lista de
// segmentos de texto, cada um já com as flags de estilo aplicadas.
function analisarEstilosInline(texto) {
    const segmentos = [];
    let i = 0;
    let negrito = false, italico = false, sublinhado = false, riscado = false, spoiler = false;
    let bufer = '';

    const emitir = () => {
        if (bufer) {
            segmentos.push({ texto: bufer, negrito, italico, sublinhado, riscado, spoiler, codigo: false });
            bufer = '';
        }
    };

    const charEm = (idx) => (idx >= 0 && idx < texto.length) ? texto[idx] : '';

    // Um marcador só é considerado válido se, ao abrir, não houver espaço logo
    // depois dele, e ao fechar, não houver espaço logo antes (igual ao Discord).
    // Para o "_" simples, exige-se também borda de palavra, para não confundir
    // nome_de_variavel com itálico.
    const ehLetraOuNumero = (c) => /[A-Za-z0-9À-ÿ]/.test(c);
    const tentarAlternar = (marcador, ativo, exigirLimitePalavra = false) => {
        if (!ativo) {
            const depois = charEm(i + marcador.length);
            if (!depois || depois === ' ') return false;
            if (exigirLimitePalavra) {
                const antes = charEm(i - 1);
                if (antes && ehLetraOuNumero(antes)) return false;
            }
            return true;
        }
        const antes = charEm(i - 1);
        if (!antes || antes === ' ') return false;
        if (exigirLimitePalavra) {
            const depois = charEm(i + marcador.length);
            if (depois && ehLetraOuNumero(depois)) return false;
        }
        return true;
    };

    while (i < texto.length) {
        const ch = texto[i];

        if (ch === '`') {
            const fechamento = texto.indexOf('`', i + 1);
            if (fechamento !== -1 && fechamento > i + 1) {
                emitir();
                segmentos.push({
                    texto: texto.slice(i + 1, fechamento),
                    negrito: false, italico: false, sublinhado: false, riscado: false,
                    spoiler, codigo: true
                });
                i = fechamento + 1;
                continue;
            }
        } else if (ch === '|' && texto[i + 1] === '|') {
            if (tentarAlternar('||', spoiler)) {
                emitir(); spoiler = !spoiler; i += 2; continue;
            }
        } else if (ch === '~' && texto[i + 1] === '~') {
            if (tentarAlternar('~~', riscado)) {
                emitir(); riscado = !riscado; i += 2; continue;
            }
        } else if (ch === '*') {
            let j = i;
            while (texto[j] === '*') j++;
            const tamanho = j - i;

            if (tamanho >= 3 && tentarAlternar('***', negrito && italico)) {
                emitir(); negrito = !negrito; italico = !italico; i += 3; continue;
            }
            if (tamanho >= 2 && tentarAlternar('**', negrito)) {
                emitir(); negrito = !negrito; i += 2; continue;
            }
            if (tamanho === 1 && tentarAlternar('*', italico)) {
                emitir(); italico = !italico; i += 1; continue;
            }
        } else if (ch === '_') {
            let j = i;
            while (texto[j] === '_') j++;
            const tamanho = j - i;

            if (tamanho >= 2 && tentarAlternar('__', sublinhado)) {
                emitir(); sublinhado = !sublinhado; i += 2; continue;
            }
            if (tamanho === 1 && tentarAlternar('_', italico, true)) {
                emitir(); italico = !italico; i += 1; continue;
            }
        }

        bufer += ch;
        i += 1;
    }

    emitir();
    return segmentos;
}

// Monta a string de font() do canvas de acordo com o tipo de bloco da linha
// (título/subtexto/normal) combinado com os estilos inline do átomo (negrito/itálico/código).
function fontePorAtom(atom, tipoLinha = 'normal') {
    const tamanhoBase = TAMANHOS_BLOCO[tipoLinha] ?? MESSAGE_SIZE;

    if (atom?.codigo) return `${Math.max(tamanhoBase - 2, 12)}px "${FONTE_CODE}"`;

    const negrito = !!atom?.negrito || tipoLinha === 'h1' || tipoLinha === 'h2' || tipoLinha === 'h3';
    const italico = !!atom?.italico;

    if (negrito && italico) return `${tamanhoBase}px "${FONTE_BOLD_ITALIC}"`;
    if (negrito) return `${tamanhoBase}px "${FONTE_BOLD}"`;
    if (italico) return `${tamanhoBase}px "${FONTE_ITALIC}"`;
    return `${tamanhoBase}px "${FONTE_REGULAR}"`;
}

// Calcula a largura de um átomo (texto, emoji ou espaço) já aplicando a fonte correta
// no contexto — usada tanto na quebra de linha quanto no desenho final, para os dois
// baterem exatamente.
function larguraDoAtom(ctx, atom, tipoLinha = 'normal') {
    if (atom.type === 'space') {
        ctx.font = fontePorAtom(atom, tipoLinha);
        return ctx.measureText(' ').width;
    }
    if (atom.type === 'emoji') {
        return atom.custom ? EMOJI_SIZE_CUSTOM : EMOJI_SIZE;
    }
    ctx.font = fontePorAtom(atom, tipoLinha);
    return ctx.measureText(atom.value).width;
}

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
    const segmentos = analisarEstilosInline(paragrafo);
    const atoms = [];

    for (const segmento of segmentos) {
        const partes = segmento.texto.split(/(\s+)/).filter(p => p.length > 0);
        const estilo = {
            negrito: segmento.negrito,
            italico: segmento.italico,
            sublinhado: segmento.sublinhado,
            riscado: segmento.riscado,
            spoiler: segmento.spoiler,
            codigo: segmento.codigo
        };

        for (const parte of partes) {
            if (/^\s+$/.test(parte)) {
                atoms.push({ type: 'space', ...estilo });
                continue;
            }

            // Dentro de um trecho de código, o conteúdo é tratado como texto puro
            // (sem interpretar emojis), igual ao Discord.
            const subAtoms = segmento.codigo
                ? [{ type: 'text', value: parte }]
                : tokenizarPalavraComEmoji(parte);

            for (const sub of subAtoms) {
                atoms.push({ ...sub, ...estilo });
            }
        }
    }

    return atoms;
}

function quebrarLinhasComEmoji(ctx, atoms, maxWidth, tipoLinha = 'normal') {
    const linhas = [];
    let atualLine = [];
    let atualWidth = 0;

    ctx.font = fontePorAtom({}, tipoLinha);
    const espacoLargura = ctx.measureText(' ').width;

    for (const atom of atoms) {
        if (atom.type === 'space') {
            if (atualLine.length && atualWidth + espacoLargura <= maxWidth) {
                atualLine.push(atom);
                atualWidth += espacoLargura;
            }
            continue;
        }

        const largura = larguraDoAtom(ctx, atom, tipoLinha);

        if (atualWidth + largura > maxWidth && atualLine.length > 0) {
            while (atualLine.length && atualLine[atualLine.length - 1].type === 'space') atualLine.pop();
            linhas.push(atualLine);
            atualLine = [];
            atualWidth = 0;
        }

        // palavra de texto maior que a largura máxima sozinha -> quebra por caractere
        if (largura > maxWidth && atom.type === 'text') {
            ctx.font = fontePorAtom(atom, tipoLinha);
            let parte = '';
            for (const char of atom.value) {
                const teste = parte + char;
                if (ctx.measureText(teste).width > maxWidth && parte) {
                    atualLine.push({ ...atom, value: parte });
                    linhas.push(atualLine);
                    atualLine = [];
                    atualWidth = 0;
                    parte = '';
                }
                parte += char;
            }
            if (parte) {
                atualLine.push({ ...atom, value: parte });
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

// Cada linha do resultado agora é { tipo, atoms }, onde "tipo" indica o bloco
// (normal, h1, h2, h3, subtext ou quote) detectado no início do parágrafo original.
function montarLinhasComEmoji(ctx, mensagem, maxWidth) {
    const paragrafos = String(mensagem ?? "").replace(/\r/g, "").split("\n");
    const todasLinhas = [];

    for (const paragrafo of paragrafos) {
        const { tipo, conteudo } = analisarEstiloLinha(paragrafo);
        const larguraDisponivel = tipo === 'quote' ? maxWidth - QUOTE_INDENT : maxWidth;

        const atoms = tokenizarLinhaComEmoji(conteudo);
        const linhasQuebradas = quebrarLinhasComEmoji(ctx, atoms, larguraDisponivel, tipo);

        for (const linhaAtoms of linhasQuebradas) {
            todasLinhas.push({ tipo, atoms: linhaAtoms });
        }
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

function calculateHeight(linhasOuContagem) {

    const HEADER =
    PADDING_TOP +
    AVATAR_SIZE +
    14;

    const MESSAGE = Array.isArray(linhasOuContagem)
        ? linhasOuContagem.reduce((soma, linha) => soma + (ALTURA_LINHA_BLOCO[linha?.tipo] ?? MESSAGE_LINE_HEIGHT), 0)
        : (linhasOuContagem || 0) * MESSAGE_LINE_HEIGHT;

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
        for (const atom of linha.atoms) {
            if (atom.type === 'emoji' && !atom.spoiler) urlsEmoji.add(atom.url);
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

    const cardHeight = calculateHeight(linhas);
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
    ctx.font = `${MESSAGE_SIZE}px "${FONTE_REGULAR}"`;

    let textY = PADDING_TOP + AVATAR_SIZE + 18;

    for (const linha of linhas) {
        const altura = ALTURA_LINHA_BLOCO[linha.tipo] ?? MESSAGE_LINE_HEIGHT;
        const baseX = linha.tipo === 'quote' ? PADDING_X + QUOTE_INDENT : PADDING_X;
        const tamanhoFonte = TAMANHOS_BLOCO[linha.tipo] ?? MESSAGE_SIZE;

        // ---- pré-calcula a posição/largura de cada átomo da linha ----
        const posicoes = [];
        let cursorMedida = baseX;
        for (const atom of linha.atoms) {
            const largura = larguraDoAtom(ctx, atom, linha.tipo);
            posicoes.push({ atom, x: cursorMedida, largura });
            cursorMedida += largura;
        }

        // ---- barra lateral da citação (estilo Discord) ----
        if (linha.tipo === 'quote') {
            ctx.fillStyle = "#D9DCE0";
            roundedRect(ctx, PADDING_X, textY + 2, 3, Math.max(altura - 6, 4), 1.5);
            ctx.fill();
        }

        // ---- fundos de código/spoiler, agrupando átomos vizinhos do mesmo tipo ----
        let idx = 0;
        while (idx < posicoes.length) {
            const atomAtual = posicoes[idx].atom;
            if (atomAtual.type !== 'space' && (atomAtual.codigo || atomAtual.spoiler)) {
                let fim = idx;
                while (
                    fim < posicoes.length &&
                    !!posicoes[fim].atom.codigo === !!atomAtual.codigo &&
                    !!posicoes[fim].atom.spoiler === !!atomAtual.spoiler
                ) fim++;

                const inicioX = posicoes[idx].x;
                const fimX = posicoes[fim - 1].x + posicoes[fim - 1].largura;

                if (atomAtual.spoiler) {
                    ctx.fillStyle = "#585C63";
                    roundedRect(ctx, inicioX - 3, textY - 2, (fimX - inicioX) + 6, altura - 4, 4);
                    ctx.fill();
                } else if (atomAtual.codigo) {
                    ctx.fillStyle = "#EEF0F2";
                    roundedRect(ctx, inicioX - 3, textY - 2, (fimX - inicioX) + 6, altura - 4, 4);
                    ctx.fill();
                }

                idx = fim;
            } else {
                idx++;
            }
        }

        // ---- desenha texto/emoji e decorações (sublinhado/riscado) ----
        for (const { atom, x, largura } of posicoes) {
            if (atom.type === 'emoji') {
                if (!atom.spoiler) {
                    const img = imagensEmoji.get(atom.url);
                    const tam = atom.custom ? EMOJI_SIZE_CUSTOM : EMOJI_SIZE;
                    if (img) {
                        ctx.drawImage(img, x, textY + (altura - tam) / 2 - 4, tam, tam);
                    }
                }
            } else if (atom.type === 'text' && !atom.spoiler) {
                ctx.font = fontePorAtom(atom, linha.tipo);
                ctx.fillStyle =
                    linha.tipo === 'subtext' ? "#9CA2AB" :
                    atom.codigo ? "#B3435B" :
                    "#090b0b";

                ctx.fillText(atom.value, x, textY);

                if (atom.sublinhado || atom.riscado) {
                    const linhaY = atom.riscado
                        ? textY + tamanhoFonte * 0.55
                        : textY + tamanhoFonte + 2;
                    ctx.strokeStyle = ctx.fillStyle;
                    ctx.lineWidth = 1.5;
                    ctx.beginPath();
                    ctx.moveTo(x, linhaY);
                    ctx.lineTo(x + largura, linhaY);
                    ctx.stroke();
                }
            }
        }

        textY += altura;
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

function agendarExpiracaoMsgCriador(painelId, channelId) {
    const antigo = msgCriadorTimeouts.get(painelId);
    if (antigo) clearTimeout(antigo);

    const timeoutId = setTimeout(async () => {
        msgCriadorDB.delete(painelId);
        msgCriadorTimeouts.delete(painelId);

        try {
            const canal = await client.channels.fetch(channelId).catch(() => null);
            if (!canal) return;
            const msg = await canal.messages.fetch(painelId).catch(() => null);
            if (msg) await msg.delete().catch(() => null);
        } catch (err) {
            console.error('--- Erro ao expirar painel do criador de mensagens por inatividade ---', err);
        }
    }, 20 * 60 * 1000);

    msgCriadorTimeouts.set(painelId, timeoutId);
}

async function aguardarEBuscarAuditLog(guild, tipoEvento, delayMs = 1200) {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    try {
        const logs = await guild.fetchAuditLogs({ type: tipoEvento, limit: 10 });
        return [...logs.entries.values()];
    } catch (err) {
        console.error('--- Erro ao buscar audit log fresco ---', err);
        return [];
    }
}

function ehAdminGRoles(member) {
    return member.permissions.has('Administrator') || member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
}

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
        `<@&${cargo.id}>\n<:pessoa:1548558766230872224> **${cargo.members.size}** membro(s)`
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
            `<@&${cargo.id}>\n<:lista:1548558969860132864> **Permissões atuais:** ${montarPermissoesTextoGRoles(cargo)}`
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
    const semPermissao = (adminEhLimitado && CARGOS_RESTRITOS_GERENCIADOR_LIMITADO.includes(cargo.id)) ||
        (cargo.id === CARGO_RESTRITO_UNICO && !(adminMembro?.roles.cache.has(CARGO_RESTRITO_UNICO)));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `<@&${cargo.id}>\n<:pessoa:1548558766230872224> **${cargo.members.size}** membro(s)\n <:lista:1548558969860132864> **Permissões:** ${montarPermissoesTextoGRoles(cargo)}`
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
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## <:23310:1548566772700024882> Hierarquia de Cargos'))
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
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## <:23310:1548566772700024882> Hierarquia de Cargos'))
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

    const usuarios = botClient.guilds.cache.reduce((acc, g) => acc + (g.memberCount || 0), 0);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Status da aninha`))
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

function montarEmbedSorteioCanal(sorteio, desativado = false) {
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
            new ButtonBuilder().setCustomId(`sorteio_participar_${sorteio._id}`).setLabel('Participar').setStyle(ButtonStyle.Success).setDisabled(desativado),
            new ButtonBuilder().setCustomId(`sorteio_participantes_${sorteio._id}`).setLabel('Participantes').setStyle(ButtonStyle.Secondary).setDisabled(desativado)
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
            if (msg) {
                await msg.edit({ components: [montarEmbedSorteioCanal(sorteio, true)], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
            }
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
    const EMOJI_COROA_SORTEIO = '<:crown:1542328746147713094>';

    const partes = ranking.map(([userId, ms], i) => {
        const membro = guild.members.cache.get(userId);
        const nome = membro ? membro.displayName : 'Usuário';
        const prefixo = i === 0 ? `${EMOJI_COROA_SORTEIO} ` : '';
        return `${prefixo}${posicoes[i]} ${nome} ${formatarTempoCurto(ms)}`;
    });

    return partes.join(' · ');
}

async function definirStatusCanal(canal, texto) {
    const novoStatus = texto || '';
    try {
        await client.rest.put(`/channels/${canal.id}/voice-status`, {
            body: { status: novoStatus }
        });
        statusCanalAplicado.set(canal.id, novoStatus);
    } catch (err) {
        console.error(`--- Erro ao setar status do canal ${canal.id} (REST) ---`, err);
    }
}

async function atualizarStatusCallsSorteio() {
    for (const guild of client.guilds.cache.values()) {
        try {
            const top3 = await obterTop3CallSorteio(guild.id);
            const textoStatus = top3 ? formatarTop3Texto(top3, guild) : '';

            const canaisDaCategoria = guild.channels.cache
                .filter(c =>
                    (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) &&
                    c.parentId === CATEGORIA_STATUS_SORTEIO
                )
                .sort((a, b) => a.rawPosition - b.rawPosition);

            const primeiroCanal = canaisDaCategoria.first();

            for (const canal of canaisDaCategoria.values()) {
                const textoAlvo = canal.id === primeiroCanal?.id ? textoStatus : '';

                // o que o canal tem agora: o que o bot aplicou por último, ou (se ainda não aplicou nada) o status do cache
                const atual = statusCanalAplicado.has(canal.id)
                    ? statusCanalAplicado.get(canal.id)
                    : (canal.status || '');

                if (atual === textoAlvo) continue;
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
                new ButtonBuilder().setCustomId('ticket_painelstaff').setLabel('Painel staff').setStyle(ButtonStyle.Secondary),
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

function extrairLinksDoTexto(texto) {
    if (!texto) return [];
    const regex = /(https?:\/\/[^\s<>"')]+)/gi;
    return [...String(texto).matchAll(regex)].map(m => m[0]);
}

function classificarAnexoTranscript(nome) {
    const lower = (nome || '').toLowerCase();
    if (EXT_IMAGEM.some(ext => lower.endsWith(ext))) return 'imagem';
    if (EXT_AUDIO.some(ext => lower.endsWith(ext))) return 'audio';
    return 'arquivo';
}

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

async function salvarProtecao() {
    try {
        const { error } = await supabase
            .from('protecao_config')
            .upsert({
                id: 'protecao_config',
                anti_spam: protecaoConfig.antiSpam,
                anti_link: protecaoConfig.antiLink,
                anti_fake: protecaoConfig.antiFake,
                anti_bot: protecaoConfig.antiBot,
                anti_raid: protecaoConfig.antiRaid
            });
        if (error) throw error;
    } catch (err) {
        console.error('--- Erro ao salvar config de proteção ---', err);
    }
}

async function carregarProtecao() {
    try {
        const { data: doc, error } = await supabase
            .from('protecao_config')
            .select('*')
            .eq('id', 'protecao_config')
            .maybeSingle();
        if (error) throw error;
        if (doc) {
            Object.assign(protecaoConfig.antiSpam, doc.anti_spam ?? {});
            Object.assign(protecaoConfig.antiLink, doc.anti_link ?? {});
            Object.assign(protecaoConfig.antiFake, doc.anti_fake ?? {});
            Object.assign(protecaoConfig.antiBot, doc.anti_bot ?? {});
            Object.assign(protecaoConfig.antiRaid, doc.anti_raid ?? {});
            console.log('[Proteção] Configuração carregada do Supabase.');
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
    const conviteDetectado = message.content.match(regexConvite);

    if (conviteDetectado) {
        await message.delete().catch(() => null);
        message.channel.send(`${message.author} Sem links aqui, seu trouxa!`)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));

        await logarAntiLink({
            guild: message.guild,
            usuario: message.author,
            motivo: 'Convite de outro servidor detectado',
            link: conviteDetectado[0],
            canal: message.channel
        }).catch(() => null);

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

    await logarAntiLink({
        guild: message.guild,
        usuario: message.author,
        motivo: `Domínio bloqueado: \`${host}\``,
        link,
        canal: message.channel
    }).catch(() => null);

    return true;
}

if (!linkPermitido(link)) {
    await message.delete().catch(() => null);
    message.channel.send(`${message.author} Sem links aqui, seu trouxa!!`)
        .then(m => setTimeout(() => m.delete().catch(() => null), 5000));

    await logarAntiLink({
        guild: message.guild,
        usuario: message.author,
        motivo: 'Link fora da whitelist',
        link,
        canal: message.channel
    }).catch(() => null);

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

function limparNukeTrackerAntigo() {
    const agora = Date.now();
    const janela = protecaoConfig.antiRaid.janelaMs;
    for (const [canalId, marca] of acoesPropriasCanais) {
        if (marca.ate < agora) acoesPropriasCanais.delete(canalId);
    }
    for (const [entradaId, usadaEm] of entradasAuditConsumidas) {
        if (agora - usadaEm > 2 * 60 * 1000) entradasAuditConsumidas.delete(entradaId);
    }
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

function limiteNukeAcaoExtra(executor, chave) {
    return executor?.bot ? protecaoConfig.antiRaid.limiteBots : LIMITES_ANTINUKE_EXTRA[chave];
}

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

async function verificarBanEmMassaStaff(guild, executor) {
    if (!executor || executor.bot) return;
    if (executor.id === guild.ownerId) return;
    if (protecaoConfig.antiRaid.whitelistIds.includes(executor.id)) return;
    if (staffPunicaoCargos.has(executor.id)) return; // já está sendo punido, ignora

    const membro = await guild.members.fetch(executor.id).catch(() => null);
    if (membro?.roles.cache.has(CARGO_ISENTO_BAN_STAFF)) return; // cargo liberado, pode banir à vontade

    const agora = Date.now();
    const lista = (staffBanTracker.get(executor.id) || []).filter(t => agora - t < JANELA_BAN_STAFF_MS);
    lista.push(agora);
    staffBanTracker.set(executor.id, lista);

    if (lista.length < LIMITE_BANS_STAFF) return;
    staffBanTracker.delete(executor.id);

    if (!membro) return;

    const cargosRemover = membro.roles.cache.filter(r => r.id !== guild.id && !r.managed && r.editable);
    if (cargosRemover.size === 0) return;

    const idsCargos = [...cargosRemover.keys()];
    const nomesCargos = cargosRemover.map(r => r.name);

    staffPunicaoCargos.set(executor.id, { idsCargos });

    try {
        await membro.roles.remove(idsCargos, `Anti-Abuso: ${lista.length} bans em menos de ${JANELA_BAN_STAFF_MS / 60000} minutos`);
    } catch (err) {
        console.error('--- Erro ao remover cargos (Anti-Abuso: ban em massa) ---', err);
        staffPunicaoCargos.delete(executor.id);
        return;
    }

    await logarPunicaoCargosStaff({
        guild,
        tipo: 'Cargos removidos temporariamente (Anti-Abuso)',
        membro,
        cargos: nomesCargos,
        extra: `**Motivo:** baniu ${lista.length} membros em menos de ${JANELA_BAN_STAFF_MS / 60000} minutos\n**Duração:** 2 minutos`
    }).catch(() => null);

    setTimeout(async () => {
        staffPunicaoCargos.delete(executor.id);
        try {
            const membroAtual = await guild.members.fetch(executor.id).catch(() => null);
            if (!membroAtual) return;
            await membroAtual.roles.add(idsCargos, 'Anti-Abuso: devolução dos cargos após 2 minutos');
            await logarPunicaoCargosStaff({
                guild,
                tipo: 'Cargos devolvidos (Anti-Abuso)',
                membro: membroAtual,
                cargos: nomesCargos
            }).catch(() => null);
        } catch (err) {
            console.error('--- Erro ao devolver cargos (Anti-Abuso: ban em massa) ---', err);
        }
    }, DURACAO_PUNICAO_STAFF_MS);
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

    // Evita punir/logar mais de uma vez se várias mensagens do flood chegarem quase juntas
    if (spamPunicaoEmAndamento.has(userId)) return false;
    spamPunicaoEmAndamento.add(userId);

    const ehBot = !!message.author.bot;

    try {
        try {
            const buscadas = await message.channel.messages.fetch({ limit: 50 });
            const doUsuario = buscadas.filter(m => m.author.id === userId);
            await message.channel.bulkDelete(doUsuario, true).catch(() => null);
        } catch (err) {
            console.error('--- Erro ao apagar mensagens de spam ---', err);
        }

        try {
            const membro = await message.guild.members.fetch(userId).catch(() => null);

            if (ehBot) {
                if (membro && membro.kickable) {
                    await membro.kick('Anti-Spam: bot detectado floodando mensagens');
                }
            } else if (membro && membro.moderatable) {
                await membro.timeout(cfg.muteMinutos * 60 * 1000, 'Anti-Spam: flood/mensagens duplicadas');
            }
        } catch (err) {
            console.error('--- Erro ao punir spam ---', err);
        }

        await redis.del(chave);

        await logarAntiSpam({
            guild: message.guild,
            usuario: message.author,
            motivo: flood ? 'Flood de mensagens' : 'Mensagens duplicadas',
            canal: message.channel,
            muteMinutos: ehBot ? null : cfg.muteMinutos,
            acao: ehBot ? 'kick' : 'mute'
        }).catch(() => null);

        return true;
    } finally {
        spamPunicaoEmAndamento.delete(userId);
    }
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
            marcarAcaoPropriaCanal(canal.id);
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
                marcarAcaoPropriaCanal(canal.id);
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

// ============ ANTI NUKE DE CANAIS (devolve canais apagados ou editados) ============
const TIPOS_CANAL_PROTEGIDOS = new Set([
    ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildCategory,
    ChannelType.GuildAnnouncement, ChannelType.GuildStageVoice, ChannelType.GuildForum, ChannelType.GuildMedia
]);
const TIPOS_CANAL_TEXTO_ANTINUKE = [ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia];
const TIPOS_CANAL_VOZ_ANTINUKE = [ChannelType.GuildVoice, ChannelType.GuildStageVoice];
const TIPOS_AUDIT_EDICAO_CANAL = [
    AuditLogEvent.ChannelUpdate, AuditLogEvent.ChannelOverwriteCreate,
    AuditLogEvent.ChannelOverwriteUpdate, AuditLogEvent.ChannelOverwriteDelete
];
const ESPERAS_AUDIT_CANAL_MS = [0, 300, 700];   // o audit log às vezes demora alguns ms pra registrar
const JANELA_MARCA_PROPRIA_MS = 6000;

const snapshotsCanais = new Map();              // guildId -> Map(canalId -> estado confiável do canal)
const canaisTemporarios = new Set();            // calls temporárias e call privada de ticket (não são protegidas)
const acoesPropriasCanais = new Map();          // canalId -> { n, ate } (edições feitas pelo próprio bot)
const restauracoesCanais = new Map();           // canalIdAntigo -> Promise do canal restaurado (ou null)
const idsCanaisRestaurados = new Map();         // canalIdAntigo -> canalIdNovo
const punidosAntiNukeCanais = new Set();        // guildId:executorId punido há pouco (evita punir/avisar em duplicidade)
const auditRapidoCanais = new Map();            // guildId -> { inicio, promessa } (um fetch atende vários eventos)
const posicoesPendentesCanais = new Map();      // guildId -> { timer, mapa: Map(canalId -> posicao) }
const relatoriosAntiNukeCanais = new Map();     // guildId -> resumo aguardando envio pro canal de logs
const revertsEmAndamentoCanais = new Map();     // canalId -> Promise (uma reversão por vez em cada canal)
const entradasAuditConsumidas = new Map();      // idDaEntradaDoAudit -> quando foi usada
let antiNukeCanaisPausas = 0;

function cfgAntiNukeCanais() {
    const raid = protecaoConfig.antiRaid;
    if (!raid.antiNukeCanais || typeof raid.antiNukeCanais !== 'object') raid.antiNukeCanais = { ativo: false, bypassIds: [] };
    if (!Array.isArray(raid.antiNukeCanais.bypassIds)) raid.antiNukeCanais.bypassIds = [];
    return raid.antiNukeCanais;
}

function obterMapaSnapshotsCanais(guildId) {
    let mapa = snapshotsCanais.get(guildId);
    if (!mapa) {
        mapa = new Map();
        snapshotsCanais.set(guildId, mapa);
    }
    return mapa;
}

function serializarCanalAntiNuke(canal) {
    const overwrites = [];
    for (const o of canal.permissionOverwrites?.cache?.values() ?? []) {
        overwrites.push({ id: o.id, type: o.type, allow: o.allow.bitfield.toString(), deny: o.deny.bitfield.toString() });
    }
    return {
        id: canal.id,
        tipo: canal.type,
        nome: canal.name,
        parentId: canal.parentId ?? null,
        posicao: canal.rawPosition ?? 0,
        topico: canal.topic ?? null,
        nsfw: !!canal.nsfw,
        slowmode: canal.rateLimitPerUser ?? 0,
        bitrate: canal.bitrate ?? null,
        limiteUsuarios: canal.userLimit ?? 0,
        regiao: canal.rtcRegion ?? null,
        qualidadeVideo: canal.videoQualityMode ?? null,
        autoArchive: canal.defaultAutoArchiveDuration ?? null,
        slowmodeThreads: canal.defaultThreadRateLimitPerUser ?? null,
        tags: canal.availableTags?.map(t => ({
            name: t.name,
            moderated: !!t.moderated,
            emoji: t.emoji ? { id: t.emoji.id ?? null, name: t.emoji.name ?? null } : null
        })) ?? null,
        emojiPadrao: canal.defaultReactionEmoji ?? null,
        ordenacao: canal.defaultSortOrder ?? null,
        layout: canal.defaultForumLayout ?? null,
        overwrites
    };
}

// Ignora overwrites de cargos que já foram apagados (o Discord remove sozinho, não é edição de ninguém)
function overwritesValidosAntiNuke(guild, lista) {
    return lista.filter(o => o.type !== OverwriteType.Role || o.id === guild.id || guild.roles.cache.has(o.id));
}

async function overwritesExistentesAntiNuke(guild, lista) {
    const resultado = [];
    for (const o of lista) {
        if (o.type === OverwriteType.Role) {
            if (o.id === guild.id || guild.roles.cache.has(o.id)) resultado.push(o);
            continue;
        }
        const existe = guild.members.cache.has(o.id) || await guild.members.fetch(o.id).then(() => true).catch(() => false);
        if (existe) resultado.push(o);
    }
    return resultado;
}

function montarOverwritesAntiNuke(lista) {
    return lista.map(o => ({ id: o.id, type: o.type, allow: BigInt(o.allow), deny: BigInt(o.deny) }));
}

function chaveOverwritesAntiNuke(lista) {
    return lista.map(o => `${o.id}:${o.type}:${o.allow}:${o.deny}`).sort().join('|');
}

function camposAlteradosAntiNuke(guild, snap, atual) {
    const campos = [];
    if (snap.nome !== atual.nome) campos.push('nome');
    if (snap.topico !== atual.topico) campos.push('topico');
    if (snap.nsfw !== atual.nsfw) campos.push('nsfw');
    if (snap.slowmode !== atual.slowmode) campos.push('slowmode');
    if (snap.bitrate !== atual.bitrate) campos.push('bitrate');
    if (snap.limiteUsuarios !== atual.limiteUsuarios) campos.push('limiteUsuarios');
    if (snap.regiao !== atual.regiao) campos.push('regiao');
    if (snap.qualidadeVideo !== atual.qualidadeVideo) campos.push('qualidadeVideo');
    if (snap.tipo !== atual.tipo) campos.push('tipo');
    // Categoria apagada faz os canais dela ficarem sem categoria: isso é cascata, quem cuida é a restauração da categoria
    if (snap.parentId !== atual.parentId && (!snap.parentId || guild.channels.cache.has(snap.parentId))) campos.push('parentId');
    if (chaveOverwritesAntiNuke(overwritesValidosAntiNuke(guild, snap.overwrites)) !== chaveOverwritesAntiNuke(overwritesValidosAntiNuke(guild, atual.overwrites))) {
        campos.push('overwrites');
    }
    return campos;
}

// ---- marcas de ações do próprio bot (lock all, !nuke, etc.) ----
function marcarAcaoPropriaCanal(canalId) {
    const agora = Date.now();
    const marca = acoesPropriasCanais.get(canalId);
    if (marca && marca.ate > agora) {
        marca.n++;
        marca.ate = agora + JANELA_MARCA_PROPRIA_MS;
    } else {
        acoesPropriasCanais.set(canalId, { n: 1, ate: agora + JANELA_MARCA_PROPRIA_MS });
    }
}

function consumirAcaoPropriaCanal(canalId) {
    const marca = acoesPropriasCanais.get(canalId);
    if (!marca) return false;
    if (marca.ate < Date.now()) {
        acoesPropriasCanais.delete(canalId);
        return false;
    }
    if (--marca.n <= 0) acoesPropriasCanais.delete(canalId);
    return true;
}

// ---- canais temporários (calls temp, call privada de ticket) ----
async function marcarCanalTemporarioAntiNuke(canalId) {
    canaisTemporarios.add(canalId);
    for (const mapa of snapshotsCanais.values()) mapa.delete(canalId);
    try { await redis.set(`antinuke_temp:${canalId}`, '1'); } catch { /* sem redis, fica só na memória */ }
}

function desmarcarCanalTemporarioAntiNuke(canalId) {
    canaisTemporarios.delete(canalId);
    Promise.resolve().then(() => redis.del(`antinuke_temp:${canalId}`)).catch(() => null);
}

async function marcarTemporariosGuildAntiNuke(guild) {
    const canaisVoz = guild.channels.cache.filter(c => TIPOS_CANAL_VOZ_ANTINUKE.includes(c.type));
    await Promise.all([...canaisVoz.values()].map(async (canal) => {
        try {
            const [dono, marca] = await Promise.all([getDonoCallTemp(canal.id), redis.get(`antinuke_temp:${canal.id}`)]);
            if (dono || marca) {
                canaisTemporarios.add(canal.id);
                snapshotsCanais.get(guild.id)?.delete(canal.id);
            }
        } catch { /* ignora */ }
    }));
}

// ---- snapshots ----
function capturarSnapshotsGuildAntiNuke(guild) {
    const mapa = new Map();
    for (const canal of guild.channels.cache.values()) {
        if (!TIPOS_CANAL_PROTEGIDOS.has(canal.type) || canaisTemporarios.has(canal.id)) continue;
        mapa.set(canal.id, serializarCanalAntiNuke(canal));
    }
    snapshotsCanais.set(guild.id, mapa);
}

async function inicializarAntiNukeCanais() {
    if (!cfgAntiNukeCanais().ativo) return;
    for (const guild of client.guilds.cache.values()) {
        await guild.channels.fetch().catch(() => null);
        capturarSnapshotsGuildAntiNuke(guild);
        await marcarTemporariosGuildAntiNuke(guild);
        console.log(`[Anti Nuke] ${snapshotsCanais.get(guild.id)?.size ?? 0} canal(is) protegido(s) em ${guild.name}.`);
    }
}

async function alternarAntiNukeCanais() {
    const cfg = cfgAntiNukeCanais();
    cfg.ativo = !cfg.ativo;
    if (cfg.ativo) {
        for (const guild of client.guilds.cache.values()) {
            capturarSnapshotsGuildAntiNuke(guild);
            marcarTemporariosGuildAntiNuke(guild).catch(() => null);
        }
    } else {
        snapshotsCanais.clear();
    }
    await salvarProtecao();
    return cfg.ativo;
}

async function definirBypassAntiNukeCanais(ids) {
    cfgAntiNukeCanais().bypassIds = [...new Set(ids)];
    await salvarProtecao();
}

function pausarAntiNukeCanais() {
    antiNukeCanaisPausas++;
}

async function retomarAntiNukeCanais(guild) {
    antiNukeCanaisPausas = Math.max(0, antiNukeCanaisPausas - 1);
    if (antiNukeCanaisPausas > 0 || !cfgAntiNukeCanais().ativo) return;
    capturarSnapshotsGuildAntiNuke(guild);
    await marcarTemporariosGuildAntiNuke(guild);
}

// ---- identificação do executor (um único fetch atende vários eventos de uma raid) ----
function buscarAuditRapidoCanais(guild, marco) {
    const atual = auditRapidoCanais.get(guild.id);
    if (atual && marco - atual.inicio <= 100) return atual.promessa;
    const promessa = guild.fetchAuditLogs({ limit: 50 })
        .then(logs => [...logs.entries.values()])
        .catch(err => {
            console.error('--- Erro ao buscar audit log (Anti Nuke de canais) ---', err.message);
            return [];
        });
    auditRapidoCanais.set(guild.id, { inicio: Date.now(), promessa });
    return promessa;
}

async function identificarExecutorCanal(guild, canalId, tipos) {
    const chegada = Date.now();
    for (const espera of ESPERAS_AUDIT_CANAL_MS) {
        if (espera) await esperar(espera);
        const entradas = await buscarAuditRapidoCanais(guild, Date.now());

        // Cada entrada do audit log vale pra um evento só; entre as livres, pega a mais próxima do momento em que o evento chegou
        let escolhida = null;
        let menorDistancia = Infinity;
        for (const e of entradas) {
            if (e.targetId !== canalId || !tipos.includes(e.action) || entradasAuditConsumidas.has(e.id)) continue;
            if (e.createdTimestamp < chegada - 8000 || e.createdTimestamp > chegada + 5000) continue;
            const distancia = Math.abs(chegada - e.createdTimestamp);
            if (distancia < menorDistancia) {
                menorDistancia = distancia;
                escolhida = e;
            }
        }
        if (!escolhida?.executorId) continue;

        entradasAuditConsumidas.set(escolhida.id, Date.now());
        const user = escolhida.executor ?? await client.users.fetch(escolhida.executorId).catch(() => null);
        return { id: escolhida.executorId, bot: !!user?.bot, user };
    }
    return null;
}

function executorPermitidoCanais(guild, executor) {
    if (!executor) return false;
    return executor.id === client.user.id
        || executor.id === guild.ownerId
        || cfgAntiNukeCanais().bypassIds.includes(executor.id);
}

// ---- punição: bot é banido na hora, humano só passa do limite de infrações ----
function punirInfratorCanais(guild, executor, motivo) {
    const usuario = executor.user ?? { id: executor.id, bot: executor.bot, tag: executor.id, displayAvatarURL: () => null };
    const chave = `${guild.id}:${usuario.id}`;

    if (!usuario.bot) {
        const total = registrarAcaoNuke(nukeTracker.canaisProtegidos, usuario.id);
        if (total < Math.max(1, protecaoConfig.antiRaid.limiteCanais)) return;
        nukeTracker.canaisProtegidos.delete(usuario.id);
        motivo = `${total} canais apagados/editados sem bypass em menos de ${protecaoConfig.antiRaid.janelaMs / 1000}s (${motivo})`;
    }

    if (punidosAntiNukeCanais.has(chave)) return;
    punidosAntiNukeCanais.add(chave);
    setTimeout(() => punidosAntiNukeCanais.delete(chave), 60 * 1000);

    punirExecutorNuke(guild, usuario, `Anti Nuke de canais: ${motivo}`)
        .catch(err => console.error('--- Erro ao punir infrator (Anti Nuke de canais) ---', err));
}

// ---- relatório agrupado (uma mensagem por rajada, não uma por canal) ----
function registrarRelatorioAntiNukeCanais(guild, tipo, texto, executor) {
    let r = relatoriosAntiNukeCanais.get(guild.id);
    if (!r) {
        r = { restaurados: [], revertidos: [], falhas: [], executores: new Map(), timer: null };
        relatoriosAntiNukeCanais.set(guild.id, r);
        r.timer = setTimeout(() => {
            relatoriosAntiNukeCanais.delete(guild.id);
            enviarRelatorioAntiNukeCanais(guild, r).catch(() => null);
        }, 2500);
    }
    r[tipo].push(texto);
    if (executor) r.executores.set(executor.id, executor);
}

async function enviarRelatorioAntiNukeCanais(guild, r) {
    if (!r.restaurados.length && !r.revertidos.length && !r.falhas.length) return;

    // Mesmo formato/estilo dos outros logs (Executado por, Motivo, timestamp) — antes isso
    // caía num alerta genérico sem essas informações, por isso destoava do resto dos logs.
    const executores = [...r.executores.values()].map(e => ({ ...e, acao: e.acao || 'nenhuma' }));

    await logarAntiNukeCanais({
        guild,
        executores,
        restaurados: r.restaurados,
        revertidos: r.revertidos,
        falhas: r.falhas
    });
}

// ---- restauração de canal apagado ----
async function resolverPaiAntiNuke(guild, parentId) {
    if (!parentId) return null;
    if (guild.channels.cache.has(parentId)) return parentId;
    const pendente = restauracoesCanais.get(parentId);
    if (pendente) await pendente.catch(() => null);
    const novoId = idsCanaisRestaurados.get(parentId);
    return novoId && guild.channels.cache.has(novoId) ? novoId : null;
}

function montarOpcoesCriacaoAntiNuke(guild, snap, parentId, overwrites) {
    const op = { name: snap.nome, type: snap.tipo, reason: 'Anti Nuke: canal restaurado', permissionOverwrites: montarOverwritesAntiNuke(overwrites) };
    if (snap.tipo !== ChannelType.GuildCategory && parentId) op.parent = parentId;

    if (TIPOS_CANAL_TEXTO_ANTINUKE.includes(snap.tipo)) {
        if (snap.topico) op.topic = snap.topico;
        op.nsfw = snap.nsfw;
        op.rateLimitPerUser = snap.slowmode;
        if (snap.autoArchive) op.defaultAutoArchiveDuration = snap.autoArchive;
    }
    if (TIPOS_CANAL_VOZ_ANTINUKE.includes(snap.tipo)) {
        if (snap.bitrate) op.bitrate = Math.min(snap.bitrate, guild.maximumBitrate);
        op.userLimit = snap.limiteUsuarios;
        if (snap.regiao) op.rtcRegion = snap.regiao;
    }
    if (snap.tipo === ChannelType.GuildVoice) {
        if (snap.qualidadeVideo) op.videoQualityMode = snap.qualidadeVideo;
        op.nsfw = snap.nsfw;
        op.rateLimitPerUser = snap.slowmode;
    }
    if (snap.tipo === ChannelType.GuildForum || snap.tipo === ChannelType.GuildMedia) {
        if (snap.tags?.length) op.availableTags = snap.tags.map(t => ({ name: t.name, moderated: t.moderated, emoji: t.emoji ?? undefined }));
        if (snap.emojiPadrao) op.defaultReactionEmoji = snap.emojiPadrao;
        if (snap.ordenacao !== null) op.defaultSortOrder = snap.ordenacao;
        if (snap.layout !== null) op.defaultForumLayout = snap.layout;
        if (snap.slowmodeThreads) op.defaultThreadRateLimitPerUser = snap.slowmodeThreads;
    }
    return op;
}

function agendarAjustePosicoesAntiNuke(guild, canalId, posicao) {
    let pend = posicoesPendentesCanais.get(guild.id);
    if (!pend) {
        pend = { mapa: new Map(), timer: null };
        posicoesPendentesCanais.set(guild.id, pend);
    }
    pend.mapa.set(canalId, posicao);
    clearTimeout(pend.timer);
    pend.timer = setTimeout(async () => {
        posicoesPendentesCanais.delete(guild.id);
        const lista = [...pend.mapa]
            .filter(([id]) => guild.channels.cache.has(id))
            .sort((a, b) => a[1] - b[1])
            .map(([channel, position]) => ({ channel, position }));
        if (!lista.length) return;
        await guild.channels.setPositions(lista).catch(err => console.error('--- Erro ao reposicionar canais (Anti Nuke) ---', err.message));
    }, 1500);
}

async function restaurarCanalAntiNuke(guild, snap) {
    let novo = null;
    let ultimoErro = null;

    for (let tentativa = 0; tentativa < 3 && !novo; tentativa++) {
        try {
            if (tentativa) await esperar(500 * tentativa);
            const parentId = await resolverPaiAntiNuke(guild, snap.parentId);
            const overwrites = tentativa === 0
                ? overwritesValidosAntiNuke(guild, snap.overwrites)
                : await overwritesExistentesAntiNuke(guild, snap.overwrites);
            novo = await guild.channels.create(montarOpcoesCriacaoAntiNuke(guild, snap, parentId, overwrites));
        } catch (err) {
            ultimoErro = err;
        }
    }
    if (!novo) throw ultimoErro;

    idsCanaisRestaurados.set(snap.id, novo.id);
    setTimeout(() => idsCanaisRestaurados.delete(snap.id), 10 * 60 * 1000);

    const mapa = obterMapaSnapshotsCanais(guild.id);
    mapa.set(novo.id, { ...snap, id: novo.id, parentId: novo.parentId ?? null });
    agendarAjustePosicoesAntiNuke(guild, novo.id, snap.posicao);

    // Categoria restaurada: devolve os canais que estavam nela
    if (snap.tipo === ChannelType.GuildCategory) {
        for (const filho of mapa.values()) {
            if (filho.parentId !== snap.id) continue;
            filho.parentId = novo.id;
            const vivo = guild.channels.cache.get(filho.id);
            if (vivo && vivo.parentId !== novo.id) {
                vivo.setParent(novo.id, { lockPermissions: false })
                    .then(() => agendarAjustePosicoesAntiNuke(guild, filho.id, filho.posicao))
                    .catch(err => console.error('--- Erro ao devolver canal pra categoria (Anti Nuke) ---', err.message));
            }
        }
    }
    return novo;
}

// ---- reversão de canal editado ----
async function reverterCanalAntiNuke(canal, snap, campos) {
    const guild = canal.guild;
    const dados = { reason: 'Anti Nuke: edição não autorizada revertida' };

    if (campos.includes('nome')) dados.name = snap.nome;
    if (campos.includes('topico')) dados.topic = snap.topico;
    if (campos.includes('nsfw')) dados.nsfw = snap.nsfw;
    if (campos.includes('slowmode')) dados.rateLimitPerUser = snap.slowmode;
    if (campos.includes('bitrate') && snap.bitrate) dados.bitrate = Math.min(snap.bitrate, guild.maximumBitrate);
    if (campos.includes('limiteUsuarios')) dados.userLimit = snap.limiteUsuarios;
    if (campos.includes('regiao')) dados.rtcRegion = snap.regiao;
    if (campos.includes('qualidadeVideo') && snap.qualidadeVideo) dados.videoQualityMode = snap.qualidadeVideo;
    if (campos.includes('tipo')
        && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(snap.tipo)
        && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(canal.type)) {
        dados.type = snap.tipo;
    }
    if (campos.includes('parentId')) {
        dados.parent = snap.parentId && guild.channels.cache.has(snap.parentId) ? snap.parentId : null;
        dados.lockPermissions = false;
    }
    if (campos.includes('overwrites')) {
        dados.permissionOverwrites = montarOverwritesAntiNuke(overwritesValidosAntiNuke(guild, snap.overwrites));
    }

    try {
        await canal.edit(dados);
    } catch (err) {
        if (!dados.permissionOverwrites) throw err;
        dados.permissionOverwrites = montarOverwritesAntiNuke(await overwritesExistentesAntiNuke(guild, snap.overwrites));
        await canal.edit(dados);
    }

    if (campos.includes('parentId')) agendarAjustePosicoesAntiNuke(guild, canal.id, snap.posicao);
}

// Uma reversão por vez em cada canal; cada uma reavalia o estado atual, então rajadas de edições viram uma correção só
function reverterCanalSeguroAntiNuke(guild, canalId, snapReserva) {
    const anterior = revertsEmAndamentoCanais.get(canalId) ?? Promise.resolve();
    const atual = anterior.catch(() => null).then(async () => {
        const vivo = guild.channels.cache.get(canalId);
        if (!vivo) return false;
        const snap = obterMapaSnapshotsCanais(guild.id).get(canalId) ?? snapReserva;
        const campos = camposAlteradosAntiNuke(guild, snap, serializarCanalAntiNuke(vivo));
        if (!campos.length) return false;
        await reverterCanalAntiNuke(vivo, snap, campos);
        return true;
    });
    revertsEmAndamentoCanais.set(canalId, atual);
    atual.then(() => null, () => null).then(() => {
        if (revertsEmAndamentoCanais.get(canalId) === atual) revertsEmAndamentoCanais.delete(canalId);
    });
    return atual;
}

// ---- eventos ----
function antiNukeCanalCriado(canal) {
    if (!canal.guild || !cfgAntiNukeCanais().ativo) return;
    if (!TIPOS_CANAL_PROTEGIDOS.has(canal.type) || canaisTemporarios.has(canal.id)) return;
    obterMapaSnapshotsCanais(canal.guild.id).set(canal.id, serializarCanalAntiNuke(canal));
}

async function antiNukeCanalDeletado(canal) {
    const guild = canal.guild;
    if (!guild || !cfgAntiNukeCanais().ativo || !TIPOS_CANAL_PROTEGIDOS.has(canal.type)) return;

    const mapa = obterMapaSnapshotsCanais(guild.id);
    const snap = mapa.get(canal.id) ?? serializarCanalAntiNuke(canal);
    mapa.delete(canal.id);

    if (canaisTemporarios.has(canal.id)) {
        desmarcarCanalTemporarioAntiNuke(canal.id);
        return;
    }
    if (consumirAcaoPropriaCanal(canal.id)) return;

    let resolverRestauracao;
    restauracoesCanais.set(canal.id, new Promise(r => { resolverRestauracao = r; }));
    let novo = null;

    try {
        const executor = await identificarExecutorCanal(guild, canal.id, [AuditLogEvent.ChannelDelete]);
        if (executorPermitidoCanais(guild, executor)) return;
        if (!executor && antiNukeCanaisPausas > 0) return;

        if (executor) punirInfratorCanais(guild, executor, `apagou o canal ${snap.nome}`);

        try {
            novo = await restaurarCanalAntiNuke(guild, snap);
            registrarRelatorioAntiNukeCanais(guild, 'restaurados', snap.nome, executor);
        } catch (err) {
            console.error(`--- Anti Nuke: falha ao restaurar o canal ${snap.nome} ---`, err.message);
            registrarRelatorioAntiNukeCanais(guild, 'falhas', snap.nome, executor);
        }
    } catch (err) {
        console.error('--- Erro no Anti Nuke (canal apagado) ---', err);
    } finally {
        resolverRestauracao(novo);
        setTimeout(() => restauracoesCanais.delete(canal.id), 60 * 1000);
    }
}

async function antiNukeCanalEditado(antigo, novo) {
    const guild = novo.guild;
    if (!guild || !cfgAntiNukeCanais().ativo) return;
    if (!TIPOS_CANAL_PROTEGIDOS.has(novo.type) || canaisTemporarios.has(novo.id)) return;

    // Tudo até o primeiro await é síncrono: captura o estado exato deste evento antes de qualquer outra edição
    const mapa = obterMapaSnapshotsCanais(guild.id);
    const snap = mapa.get(novo.id);
    const atual = serializarCanalAntiNuke(novo);
    if (!snap) {
        mapa.set(novo.id, atual);
        return;
    }

    const campos = camposAlteradosAntiNuke(guild, snap, atual);
    if (!campos.length) {
        // só mudou algo que não é revertido (posição, por exemplo): atualiza o registro sem consultar audit log
        Object.assign(snap, atual, { parentId: snap.parentId });
        return;
    }
    if (consumirAcaoPropriaCanal(novo.id)) {
        mapa.set(novo.id, atual);
        return;
    }

    const executor = await identificarExecutorCanal(guild, novo.id, TIPOS_AUDIT_EDICAO_CANAL);
    if (executorPermitidoCanais(guild, executor) || (!executor && antiNukeCanaisPausas > 0)) {
        obterMapaSnapshotsCanais(guild.id).set(novo.id, atual);
        return;
    }

    if (executor) punirInfratorCanais(guild, executor, `editou o canal ${snap.nome}`);

    try {
        const reverteu = await reverterCanalSeguroAntiNuke(guild, novo.id, snap);
        if (reverteu) registrarRelatorioAntiNukeCanais(guild, 'revertidos', snap.nome, executor);
    } catch (err) {
        console.error(`--- Anti Nuke: falha ao reverter o canal ${snap.nome} ---`, err.message);
        registrarRelatorioAntiNukeCanais(guild, 'falhas', snap.nome, executor);
    }
}

// ---- painel ----
function montarPainelAntiNukeCanais(guildId) {
    const cfg = cfgAntiNukeCanais();
    const protegidos = cfg.ativo ? (snapshotsCanais.get(guildId)?.size ?? 0) : 0;

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${cfg.ativo ? EMOJI_ATIVADO : EMOJI_DESATIVADO} Anti Nuke`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Painel > Lock all > Anti Nuke'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            'Protege todos os canais de texto e voz do servidor. Quem não tem bypass não consegue apagar nem editar nada.'
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            '**Apagou um canal?** Ele volta com nome, categoria, permissões e cargos.\n' +
            '**Editou um canal?** Nome, permissões e o resto voltam como estavam.\n' +
            '**Foi um bot?** Banido na hora.'
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Status:** \`${cfg.ativo ? 'ativo' : 'inativo'}\` · **Canais protegidos:** \`${protegidos}\` · **Bypass:** \`${cfg.bypassIds.length}\``
        ))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Tópicos de ticket e calls temporárias não são afetados.'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('antinukecanais_toggle')
                    .setLabel(cfg.ativo ? 'Desativar' : 'Ativar')
                    .setStyle(cfg.ativo ? ButtonStyle.Danger : ButtonStyle.Success)
            )
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Quem estiver aqui pode mexer nos canais sem ser revertido.'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('antinukecanais_bypass_select')
                    .setPlaceholder('Usuários com bypass')
                    .setMinValues(0)
                    .setMaxValues(25)
                    .setDefaultUsers(cfg.bypassIds.slice(0, 25))
            )
        );
}

function montarPainelProtecao(guildId) {
    const emoji = (ativo) => ativo ? EMOJI_ATIVADO : EMOJI_DESATIVADO;

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## <:coroa:1548555601204744323> Painel de proteção do servidor'))
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
                .setStyle(travado ? ButtonStyle.Success : ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('lock_antinuke')
                .setLabel('Anti Nuke')
                .setStyle(ButtonStyle.Secondary)
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
        const { data: docs, error } = await supabase
            .from('bot_call_painel')
            .select('*');
        if (error) throw error;
        for (const doc of docs) {
            botCallPaineis.set(doc.guild_id, { channelId: doc.channel_id, messageId: doc.message_id });
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
        const { error } = await supabase
            .from('evento_moedas_state')
            .upsert({ id: 'evento_moedas', mensagem_id: mensagemId, enviado_em: enviadoEm });
        if (error) throw error;
    } catch (err) {
        console.error('--- Erro ao salvar estado do evento de moedas ---', err);
    }
}

async function limparEstadoEventoMoedas() {
    try {
        const { error } = await supabase
            .from('evento_moedas_state')
            .delete()
            .eq('id', 'evento_moedas');
        if (error) throw error;
    } catch (err) {
        console.error('--- Erro ao limpar estado do evento de moedas ---', err);
    }
}

async function verificarEventoMoedasAntigo() {
    try {
        const { data: estado } = await supabase
            .from('evento_moedas_state')
            .select('*')
            .eq('id', 'evento_moedas')
            .maybeSingle();
        if (!estado) return;

        const canal = await obterPrimeiroCanalCategoria(CATEGORIA_MOEDAS_BOASVINDAS);
        if (!canal) { await limparEstadoEventoMoedas(); return; }

        const msg = await canal.messages.fetch(estado.mensagem_id).catch(() => null);
        if (!msg) { await limparEstadoEventoMoedas(); return; }

        const tempoPassado = Date.now() - estado.enviado_em;
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
                assumidoPor: doc.assumidoPor, numero: doc.numero,
                membrosAdicionados: []
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

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# <:crow:${EMOJI_CROW}> Tropa da **Onze**\n Digite \`sacar\` e tente sua sorte!\n* Utilize \`/carteira\` e visualize seu saldo`))
            .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(IMG_MOEDAS)));

        const msg = await canal.send({ components: [container], flags: [MessageFlags.IsComponentsV2] });

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

function montarButtonRows(botoes, modo = 'final', empilhado = false) {
    const rows = [];
    const tamanhoGrupo = empilhado ? 1 : 5;

    for (let i = 0; i < botoes.length; i += tamanhoGrupo) {
        const grupo = botoes.slice(i, i + tamanhoGrupo);

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
    const tipoTexto = draft.tipo === 'v2' ? 'Components V2'
        : draft.tipo === 'embed' ? 'Embed'
        : draft.tipo === 'texto' ? 'Texto normal'
        : draft.tipo === 'editar' ? 'Editar mensagem existente'
        : 'nenhum selecionado';
    const canalTexto = draft.canalId ? `<#${draft.canalId}>` : 'nenhum selecionado';

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **CRIADOR DE MENSAGENS**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Tipo:** \`${tipoTexto}\`\n**Canal:** ${canalTexto}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('msgcriador_tipo')
                    .setPlaceholder('Selecione o tipo da mensagem')
                    .addOptions(
                        { label: 'Components V2', value: 'v2', description: 'Visual elaborado, com texto e imagem', default: draft.tipo === 'v2' },
                        { label: 'Embed', value: 'embed', description: 'Embed tradicional com título e descrição', default: draft.tipo === 'embed' },
                        { label: 'Texto normal', value: 'texto', description: 'Mensagem apenas com texto puro', default: draft.tipo === 'texto' },
                        { label: 'Editar mensagem existente', value: 'editar', description: 'Editar uma mensagem já enviada por este painel' }
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
    const botoesEmpilhados = botoes.filter(b => b.posicao === 'empilhados');
    const botoesAbaixo = botoes.filter(b => !['cima', 'entre', 'fora', 'empilhados'].includes(b.posicao));

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

    if (botoesEmpilhados.length) {
        montarButtonRows(botoesEmpilhados, 'preview', true).forEach(row => container.addActionRowComponents(row));
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
    draft.editando
        ? { label: 'Salvar edição', value: 'enviar', description: 'Salvar as alterações na mensagem existente' }
        : { label: 'Enviar', value: 'enviar', description: 'Enviar a mensagem para o canal selecionado' }
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
    const botoesEmpilhados = botoes.filter(b => b.posicao === 'empilhados');
    const botoesAbaixo = botoes.filter(b => !['cima', 'entre', 'fora', 'empilhados'].includes(b.posicao));

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

    if (botoesEmpilhados.length) {
        montarButtonRows(botoesEmpilhados, 'final', true).forEach(row => container.addActionRowComponents(row));
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

function formatarLinhaConexao(conn) {
    const emoji = EMOJIS_CONEXAO[conn.type]; // sem fallback unicode
    const nomePlataforma = NOMES_CONEXAO[conn.type] || conn.type;
    const prefixo = emoji ? `${emoji} ` : '';
    return `${prefixo}**${nomePlataforma}** · ${conn.name}${conn.verified ? ' · verificada' : ''}`;
}

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

function helpPrimeiraFrase(texto) {
    const frase = String(texto || '').split(/(?<=[.!?])\s/)[0].trim();
    return frase.length > 110 ? `${frase.slice(0, 107)}...` : frase;
}

function helpPermissaoSlash(permissoes) {
    if (permissoes === undefined || permissoes === null) return 'Nenhuma';
    const bits = BigInt(permissoes);
    if (bits === 0n) return 'Somente administradores';
    const nomes = Object.entries(PermissionFlagsBits)
        .filter(([nome, bit]) => nome !== 'ManageEmojisAndStickers' && (bits & bit) === bit)
        .map(([nome]) => PERM_LABELS_GROLES[nome] || nome);
    return nomes.join(', ') || 'Nenhuma';
}

function helpUsoOpcoes(opcoes = []) {
    return opcoes
        .filter(o => o.type > 2)
        .map(o => {
            const tipo = HELP_TIPOS_OPCAO[o.type] || 'valor';
            return o.required ? `${o.name}:<${tipo}>` : `${o.name}:[${tipo}]`;
        })
        .join(' ');
}

function coletarComandosSlashHelp() {
    const builders = [...LISTA_DE_COMANDOS, ...[...comandos.values()].map(c => c.data)];
    const vistos = new Set();
    const itens = [];

    for (const builder of builders) {
        const json = typeof builder?.toJSON === 'function' ? builder.toJSON() : builder;
        if (!json?.name || (json.type && json.type !== 1) || vistos.has(json.name)) continue; // ignora menus de contexto
        vistos.add(json.name);
        if (HELP_OCULTOS.has(json.name)) continue;

        const cmd = `/${json.name}`;
        const opcoes = json.options || [];
        const descCurta = json.description || 'Sem descrição';

        // subcomandos e grupos de subcomandos, achatados ("grupo sub")
        const subs = opcoes.flatMap(o => {
            if (o.type === 1) return [{ nome: o.name, desc: o.description }];
            if (o.type === 2) return (o.options || []).map(s => ({ nome: `${o.name} ${s.name}`, desc: s.description }));
            return [];
        });

        let descricao = descCurta;
        let comoUsar;
        if (subs.length) {
            comoUsar = `${cmd} <${subs.map(s => s.nome).join(' | ')}>`;
            descricao += `\n\n**Subcomandos**\n${subs.map(s => `\`${s.nome}\` — ${s.desc}`).join('\n')}`;
        } else {
            comoUsar = `${cmd} ${helpUsoOpcoes(opcoes)}`.trim();
        }

        itens.push({
            cmd,
            desc: descCurta,
            categoria: HELP_CATEGORIA_POR_NOME.get(json.name) || 'Geral',
            documentado: true,
            info: { descricao, comoUsar, permissao: helpPermissaoSlash(json.default_member_permissions) },
            ordem: helpSemAcento(json.name)
        });
    }
    return itens;
}

function coletarComandosPrefixoHelp() {
    const encontrados = new Map(); // chave sem acento -> { nome, prefixado }
    const adicionar = (nome, prefixado = true) => {
        const chave = helpSemAcento(nome);
        if (!encontrados.has(chave)) encontrados.set(chave, { nome: nome.toLowerCase(), prefixado });
    };

    let arquivos = [];
    try { arquivos = fs.readdirSync(__dirname).filter(f => f.endsWith('.js')); } catch (err) {
        console.error('--- [Help] Não consegui listar os arquivos do projeto ---', err);
    }
    for (const arquivo of arquivos) {
        let codigo;
        try { codigo = fs.readFileSync(path.join(__dirname, arquivo), 'utf8'); } catch { continue; }
        for (const m of codigo.matchAll(RE_HELP_PREFIXO)) adicionar(m[1]);
        // comandos sem prefixo (ex.: "cl") só entram se estiverem documentados em INFO_COMANDOS
        for (const m of codigo.matchAll(RE_HELP_SEM_PREFIXO)) {
            if (INFO_COMANDOS[m[1].toLowerCase()]) adicionar(m[1], false);
        }
    }
    HELP_PREFIXO_EXTRAS.forEach(nome => adicionar(nome));

    return [...encontrados.entries()]
        .filter(([chave]) => !HELP_OCULTOS.has(chave))
        .map(([chave, { nome, prefixado }]) => {
            const cmd = prefixado ? `${PREFIXO}${nome}` : nome;
            const doc = INFO_COMANDOS[cmd];
            const desc = HELP_PREFIXO_DESCRICOES[chave] || (doc ? helpPrimeiraFrase(doc.descricao) : HELP_DESCRICAO_PADRAO);
            return {
                cmd,
                desc,
                categoria: HELP_CATEGORIA_POR_NOME.get(chave) || 'Geral',
                documentado: !!doc,
                info: doc || { descricao: desc, comoUsar: cmd, permissao: 'Não informada' },
                ordem: chave
            };
        });
}

function gerarListasHelp(recarregar = false) {
    if (cacheListasHelp && !recarregar) return cacheListasHelp;

    const ordenar = (a, b) => a.ordem.localeCompare(b.ordem);
    const slash = coletarComandosSlashHelp().sort(ordenar);
    const prefixo = coletarComandosPrefixoHelp().sort(ordenar);

    // deixa o painel de "Detalhes" achar o texto automático (o manual de INFO_COMANDOS sempre tem prioridade)
    for (const item of [...slash, ...prefixo]) {
        if (!INFO_COMANDOS[item.cmd]) INFO_COMANDOS[item.cmd] = item.info;
    }

    const semDescricao = prefixo.filter(i => !i.documentado).map(i => i.cmd);
    console.log(`[Help] ${slash.length} slash e ${prefixo.length} de prefixo carregados.`);
    if (semDescricao.length) console.log(`[Help] Sem descrição em INFO_COMANDOS: ${semDescricao.join(', ')}`);

    cacheListasHelp = { slash, prefixo };
    return cacheListasHelp;
}

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
                .setLabel('Voltar')
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(paginaAtual === 0),
            new ButtonBuilder()
                .setCustomId('help_pagina_atual')
                .setLabel(`${paginaAtual + 1}/${totalPaginas}`)
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId(`help_pagina_${categoria}_${paginaAtual + 1}`)
                .setLabel('Avançar')
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

function nomeTipoCanalLog(tipo) {
    switch (tipo) {
        case ChannelType.GuildText: return 'Texto';
        case ChannelType.GuildVoice: return 'Voz';
        case ChannelType.GuildCategory: return 'Categoria';
        case ChannelType.GuildAnnouncement: return 'Anúncios';
        case ChannelType.GuildStageVoice: return 'Palco';
        case ChannelType.GuildForum: return 'Fórum';
        case ChannelType.GuildMedia: return 'Mídia';
        default: return 'Desconhecido';
    }
}

function canalDeLogParaTipo(tipo) {
    return (tipo === ChannelType.GuildVoice || tipo === ChannelType.GuildStageVoice)
        ? CANAL_LOGS_CANAIS_VOZ
        : CANAL_LOGS_CANAIS_TEXTO;
}

function contemEveryoneOuHere(texto) {
    return REGEX_EVERYONE_HERE.test(String(texto ?? ''));
}

// ============ HELPERS QUE ESTAVAM DENTRO DE HANDLERS (não usam variáveis locais deles) ============

const listarMembros = (canal) => {
    if (!canal) return '`ninguém`';
    const lista = canal.members.filter(m => !m.user.bot).map(m => `${m}`).join(', ');
    return lista || '`ninguém`';
};

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

function montarCardComentarioTellonym(dados, pagina) {
    const totalPaginas = dados.comentarios.length;
    const paginaSegura = Math.min(Math.max(pagina, 1), totalPaginas);
    const comentario = dados.comentarios[paginaSegura - 1];

    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `## ${EMOJI_COMENTAR} Tellonym\n<@${comentario.autorId}>: ${comentario.texto}\n-# página ${paginaSegura}/${totalPaginas}`
            )
        );

    if (totalPaginas > 1) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`tellonym_comentario_voltar_${dados.messageId}_${paginaSegura}`)
                    .setLabel('Voltar')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(paginaSegura <= 1),
                new ButtonBuilder()
                    .setCustomId('tellonym_comentario_pagina')
                    .setLabel(`${paginaSegura}/${totalPaginas}`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId(`tellonym_comentario_avancar_${dados.messageId}_${paginaSegura}`)
                    .setLabel('Avançar')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(paginaSegura >= totalPaginas)
            )
        );
    }

    return [container];
}

// ============ ACESSO AO "eventoMoedasAtivo" (variável reatribuída) ============

function getEventoMoedasAtivo() {
    return eventoMoedasAtivo;
}

function setEventoMoedasAtivo(valor) {
    eventoMoedasAtivo = valor;
}

// ============================================================
// ============ SISTEMA DE MÚSICA (/play) ============
// ============================================================
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');

// Resolve links do Spotify (track, album, playlist) pra "artista - música"
// usando só as páginas públicas do open.spotify.com — sem API oficial, sem
// client credentials, sem conta Premium. As páginas trazem meta tags (og:title,
// music:musician_description) que dão nome da faixa e artista de graça.
//
// Limitação: pra album/playlist só conseguimos o título do próprio recurso
// (não a lista de faixas dentro dele, que só vem via API paga/JS renderizado),
// então esses casos tocam como uma busca única pelo nome da playlist/álbum.

function extrairMetaTag(html, propriedade) {
    const regex = new RegExp(`<meta[^>]+property=["']${propriedade}["'][^>]+content=["']([^"']*)["']`, 'i');
    const m = html.match(regex);
    return m ? m[1] : null;
}

async function buscarPaginaSpotify(url) {
    const resp = await fetch(url, {
        headers: {
            // Spotify só manda a página pré-renderizada com as meta tags certas
            // pra user-agents de bots de preview de link (Facebook, WhatsApp,
            // Slack...). Pra navegadores normais ele manda a casca do app React
            // sem o título, que só é preenchido via JS no cliente.
            'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
        }
    });
    if (!resp.ok) throw new Error(`Falha ao acessar a página do Spotify (status ${resp.status})`);
    return resp.text();
}

// Recebe uma URL do Spotify (track, album ou playlist) e devolve um array de
// strings prontas pra serem usadas como busca no DisTube.
// Retorna null se a URL não for do Spotify.
async function resolverSpotifyParaQuery(url) {
    const match = url.match(/spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (!match) return null;
    const [, tipo, id] = match;

    const html = await buscarPaginaSpotify(`https://open.spotify.com/${tipo}/${id}`);
    const titulo = extrairMetaTag(html, 'og:title');
    if (!titulo) {
        // Loga um pedaço do HTML recebido pra diagnosticar se o Spotify está
        // bloqueando/redirecionando a requisição do servidor (comum com IPs
        // de datacenter tipo Render/AWS).
        console.error('--- HTML recebido do Spotify não tinha og:title. Trecho recebido: ---', html.slice(0, 800));
        throw new Error('Não consegui extrair o título dessa página do Spotify (formato da página pode ter mudado).');
    }

    if (tipo === 'track') {
        const artistas = extrairMetaTag(html, 'music:musician_description');
        return [artistas ? `${artistas} - ${titulo}` : titulo];
    }

    // Álbum/playlist: só temos o nome do recurso, então tocamos isso como
    // uma única busca (ex: "NOME DA PLAYLIST playlist").
    return [titulo];
}

const VOLUME_PADRAO_MUSICA = 45;

const EMOJI_MUSICA_VOLTAR = '1551792590431715328';
const EMOJI_MUSICA_PAUSE = '1551794465000136755';
const EMOJI_MUSICA_PLAY = '1551794618381639782';
const EMOJI_MUSICA_AVANCAR = '1551792510810984569';
const EMOJI_MUSICA_SAIR = '1551796338365300786';

// guildId -> { channelId, messageId } do painel de controle (não efêmero) atual
const painelMusicaDB = new Map();

// guildId -> array de músicas tocadas nesta sessão (mais recente primeiro)
const historicoMusicaDB = new Map();
const HISTORICO_MUSICA_MAX = 15;

// guildId -> boolean (fila contínua: busca música parecida quando a fila acaba)
const filaContinuaDB = new Map();

const MUSICAS_POR_PAGINA_FILA = 10;

function registrarHistoricoMusica(guildId, song) {
    const lista = historicoMusicaDB.get(guildId) || [];
    lista.unshift({ nome: song.name, uploader: song.uploader?.name || 'Desconhecido' });
    if (lista.length > HISTORICO_MUSICA_MAX) lista.length = HISTORICO_MUSICA_MAX;
    historicoMusicaDB.set(guildId, lista);
}

// O YouTube costuma bloquear/limitar requisições vindas de IPs de datacenter
// (Render, AWS, etc.), tanto pra busca de texto quanto pra extração de vídeos
// específicos. A forma gratuita de contornar isso é usando cookies de uma
// sessão real do YouTube. Aqui a gente escreve o conteúdo de YOUTUBE_COOKIES
// (uma env var com o cookies.txt exportado do navegador) em disco, e o
// patch-ytdlp.js injeta o caminho na configuração do yt-dlp via
// YTDLP_COOKIES_PATH (ver scripts/patch-ytdlp.js).
function atualizarYtDlp() {
    try {
        const versaoAntes = execSync('yt-dlp --version').toString().trim();
        execSync('yt-dlp -U', { stdio: 'inherit' });
        const versaoDepois = execSync('yt-dlp --version').toString().trim();
        console.log(`[YT-DLP] versão antes: ${versaoAntes} | depois: ${versaoDepois}`);
    } catch (e) {
        console.error('--- Erro ao atualizar yt-dlp ---', e.message);
    }
}

function prepararCookiesYoutube() {
    if (!process.env.YOUTUBE_COOKIES) {
        console.log('[YT-DLP] YOUTUBE_COOKIES não configurada — seguindo sem cookies (mais chance de bloqueio do YouTube).');
        return;
    }
    const caminho = path.join(__dirname, 'cookies.txt');
    try {
        fs.writeFileSync(caminho, process.env.YOUTUBE_COOKIES, 'utf8');
        process.env.YTDLP_COOKIES_PATH = caminho;
        console.log('[YT-DLP] cookies.txt escrito em', caminho);
    } catch (e) {
        console.error('--- Erro ao escrever cookies.txt para o yt-dlp ---', e);
    }
}

// Cria a instância do DisTube, registra os plugins (YouTube, Spotify, SoundCloud)
// e os listeners que mantêm o painel público sincronizado com a fila.
// Chame isso UMA vez no index.js, logo depois de criar o client, e guarde o
// resultado em client.distube.
function inicializarMusica(clienteDiscord) {
    atualizarYtDlp();
    prepararCookiesYoutube();

    const distube = new DisTube(clienteDiscord, {
        emitNewSongOnly: true,
        // SpotifyPlugin e SoundCloudPlugin foram removidos daqui:
        // - Links do Spotify agora são resolvidos manualmente via API oficial
        //   (resolverSpotifyParaQuery) antes de chegar no distube.play, e viram
        //   uma busca de texto que o YtDlpPlugin resolve no YouTube.
        // - Links do SoundCloud ficam a cargo do YtDlpPlugin também, que usa o
        //   extractor do yt-dlp em vez do pipeline HLS/AAC do @distube/soundcloud
        //   (que estava corrompendo o áudio e derrubando o FFmpeg com SIGKILL).
        plugins: [
            new YtDlpPlugin({ update: true })
        ]
    });
    
    distube.on('ffmpegDebug', (debug) => {
    console.log('[FFMPEG_DEBUG]', debug);
});

distube.on('debug', (debug) => {
    console.log('[DISTUBE_DEBUG]', debug);
});

    // Toda fila nova começa no volume padrão (45%), sem autoplay automático do DisTube
    // (o botão "avançar" cuida disso manualmente quando a fila está vazia) e com o
    // histórico/fila contínua zerados para essa nova sessão.
    distube.on('initQueue', (queue) => {
        queue.setVolume(VOLUME_PADRAO_MUSICA);
        queue.autoplay = false;
        filaContinuaDB.delete(queue.id);
        historicoMusicaDB.delete(queue.id);
    });

    // Sempre que uma música começa a tocar (primeira vez, skip, voltar, próxima
    // automática, música parecida...), registra no histórico e recria o painel público
    // (apaga o antigo e manda um novo, pra ele sempre ficar como a última mensagem do canal).
    distube.on('playSong', (queue) => {
        registrarHistoricoMusica(queue.id, queue.songs[0]);
        atualizarPainelMusica(clienteDiscord, queue).catch(err => console.error('--- Erro ao atualizar painel de música ---', err));
    });

    // Quando a fila é destruída por qualquer motivo, esquece o painel salvo
    // (a próxima /play vai criar um painel novo em vez de tentar editar um antigo).
    distube.on('deleteQueue', (queue) => {
        painelMusicaDB.delete(queue.id);
    });

    // Quando a fila acaba naturalmente: se "fila contínua" estiver ativa, busca uma
    // música parecida pra continuar tocando; senão, sai da call como antes.
    distube.on('finish', async (queue) => {
        if (filaContinuaDB.get(queue.id)) {
            try {
                await queue.addRelatedSong();
                return;
            } catch (err) {
                console.error('--- Erro ao buscar música parecida (fila contínua) ---', err);
            }
        }
        queue.voice.leave();
    });

    distube.on('error', (err, queue) => {
        console.error('--- Erro no sistema de música ---', err);
        if (queue?.textChannel) {
            queue.textChannel.send({ content: 'Ocorreu um erro ao tocar essa música. Tente novamente.' }).catch(() => null);
        }
    });

    return distube;
}

function montarPainelTocandoAgoraEfemero(song) {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### Tocando agora\n**Tocando ${song.name} — (${song.uploader?.name || 'Desconhecido'}) agora**`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# **${song.formattedDuration}**`))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('musica_abrir_modal_add').setLabel('Adicionar música').setStyle(ButtonStyle.Secondary)
            )
        );
}

function montarPainelAdicionadaEfemero(song, posicao) {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${song.name} adicionada com sucesso!`))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            posicao === 1
                ? `**Assim que a música atual acabar, ${song.name} irá começar.**`
                : `**${song.name} foi adicionada à fila!**`
        ))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# **Posição: ${posicao}**\n-# **Duração: ${song.formattedDuration}**`
        ));
}

function montarSelectOpcoesMusica(queue, buscando = false) {
    const filaContinuaAtiva = !!filaContinuaDB.get(queue.id);
    const loopAtivo = queue.repeatMode === 1;

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('musica_select_opcoes')
            .setPlaceholder('Mais opções')
            .setDisabled(buscando)
            .addOptions(
                { label: 'Histórico', value: 'historico', description: 'Veja as últimas músicas tocadas', emoji: '📜' },
                { label: `Fila contínua (${filaContinuaAtiva ? '✅️ Ativo' : 'Desativado'})`, value: 'fila_continua', description: 'Busca músicas parecidas quando a fila acabar', emoji: '🔁' },
                { label: `Loop (${loopAtivo ? '✅️ Ativo' : 'Desativado'})`, value: 'loop', description: 'Repete a música atual sem parar', emoji: '🔂' },
                { label: 'Adicionar à fila', value: 'adicionar', description: 'Adiciona uma nova música à fila', emoji: '➕' },
                { label: 'Fila', value: 'fila', description: 'Veja as músicas que estão na fila', emoji: '📋' }
            )
    );
}

function montarPainelControleMusica(queue, buscando = false) {
    const song = queue.songs[0];
    const pausado = queue.paused;

    return new ContainerBuilder()
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `### Tocando agora\n-# **${song.formattedDuration}**\n**${song.name}** — **${song.uploader?.name || 'Desconhecido'}**`
                ))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(song.thumbnail || IMG_DISCORD_LOGO))
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('musica_voltar').setEmoji(EMOJI_MUSICA_VOLTAR).setStyle(ButtonStyle.Secondary).setDisabled(buscando || queue.previousSongs.length === 0),
                new ButtonBuilder().setCustomId('musica_pause').setEmoji(pausado ? EMOJI_MUSICA_PLAY : EMOJI_MUSICA_PAUSE).setStyle(ButtonStyle.Secondary).setDisabled(buscando),
                new ButtonBuilder().setCustomId('musica_avancar').setEmoji(EMOJI_MUSICA_AVANCAR).setStyle(ButtonStyle.Secondary).setDisabled(buscando)
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('musica_volume_abrir').setLabel(`Volume ${queue.volume}%`).setStyle(ButtonStyle.Secondary).setDisabled(buscando),
                new ButtonBuilder().setCustomId('musica_sair').setEmoji(EMOJI_MUSICA_SAIR).setStyle(ButtonStyle.Danger).setDisabled(buscando)
            )
        )
        .addActionRowComponents(montarSelectOpcoesMusica(queue, buscando));
}

function montarPainelControleMusicaDesabilitado(queue) {
    const song = queue.songs[0];
    return new ContainerBuilder()
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `### Tocando agora\n-# **${song.formattedDuration}**\n**${song.name}** — **${song.uploader?.name || 'Desconhecido'}**`
                ))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(song.thumbnail || IMG_DISCORD_LOGO))
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('musica_voltar').setEmoji(EMOJI_MUSICA_VOLTAR).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('musica_pause').setEmoji(queue.paused ? EMOJI_MUSICA_PLAY : EMOJI_MUSICA_PAUSE).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('musica_avancar').setEmoji(EMOJI_MUSICA_AVANCAR).setStyle(ButtonStyle.Secondary).setDisabled(true)
            )
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('musica_volume_abrir').setLabel(`Volume ${queue.volume}%`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('musica_sair').setEmoji(EMOJI_MUSICA_SAIR).setStyle(ButtonStyle.Danger).setDisabled(true)
            )
        )
        .addActionRowComponents(montarSelectOpcoesMusica(queue, true));
}

function montarPainelTchauMusica() {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Tchau tchau'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Você encerrou esta sessão!**'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# **até mais**'));
}

function montarPainelHistoricoEfemero(guildId) {
    const lista = historicoMusicaDB.get(guildId) || [];
    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Últimas tocadas'));

    if (lista.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# **Nenhuma música tocada ainda nesta sessão.**'));
    } else {
        const linhas = lista.map((item, i) => `${i + 1}. **${item.nome}**`).join('\n');
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(linhas));
    }

    return container;
}

// Painel efêmero da fila, com paginação e (se houver músicas além da que está tocando)
// um select menu pra remover uma delas.
function montarPainelFilaEfemero(queue, pagina = 0) {
    const totalMusicas = queue.songs.length;
    const totalPaginas = Math.max(1, Math.ceil(totalMusicas / MUSICAS_POR_PAGINA_FILA));
    pagina = Math.min(Math.max(pagina, 0), totalPaginas - 1);

    const inicio = pagina * MUSICAS_POR_PAGINA_FILA;
    const musicasPagina = queue.songs.slice(inicio, inicio + MUSICAS_POR_PAGINA_FILA);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('### Fila de músicas'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# ${totalMusicas} música(s) na fila  •  -# página: ${pagina + 1}/${totalPaginas}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (musicasPagina.length === 0) {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent('-# **Nenhuma música na fila.**'));
    } else {
        const linhas = musicasPagina.map((song, i) => {
            const posicaoGlobal = inicio + i + 1;
            const quemPediu = song.user?.tag || song.member?.user?.tag || 'Desconhecido';
            return `**${posicaoGlobal}.** ${song.name} • ${song.formattedDuration} • ${quemPediu}`;
        }).join('\n');
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(linhas));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    if (totalPaginas > 1) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`musica_fila_pag_${pagina - 1}`).setLabel('Anterior').setStyle(ButtonStyle.Secondary).setDisabled(pagina === 0),
                new ButtonBuilder().setCustomId(`musica_fila_pag_${pagina + 1}`).setLabel('Próxima').setStyle(ButtonStyle.Secondary).setDisabled(pagina >= totalPaginas - 1)
            )
        );
    }

    // Só entram no select de remoção as músicas que ainda não estão tocando (posição > 0).
    const removiveis = musicasPagina
        .map((song, i) => ({ song, indexGlobal: inicio + i }))
        .filter(({ indexGlobal }) => indexGlobal > 0);

    if (removiveis.length > 0) {
        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('musica_remover_da_fila')
                    .setPlaceholder('Remover uma música da fila')
                    .addOptions(
                        removiveis.map(({ song, indexGlobal }) => ({
                            label: song.name.slice(0, 100),
                            description: `Posição ${indexGlobal + 1} • ${song.formattedDuration}`.slice(0, 100),
                            value: String(indexGlobal)
                        }))
                    )
            )
        );
    }

    return container;
}

// Cria o painel público de controle no canal de texto da fila. Sempre que uma música
// nova começa, apaga o painel anterior (se existir) e manda um novo — assim a embed
// principal fica sempre como a última mensagem do canal.
async function atualizarPainelMusica(clienteDiscord, queue) {
    const guildId = queue.id;
    const container = montarPainelControleMusica(queue);
    const payload = { components: [container], flags: [MessageFlags.IsComponentsV2] };

    const dados = painelMusicaDB.get(guildId);
    if (dados) {
        painelMusicaDB.delete(guildId);
        try {
            const canal = await clienteDiscord.channels.fetch(dados.channelId);
            const msgAntiga = await canal.messages.fetch(dados.messageId);
            await msgAntiga.delete().catch(() => null);
        } catch (err) {
            // painel antigo já não existe (canal ou mensagem apagada) — ignora
        }
    }

    const canalTexto = queue.textChannel;
    if (!canalTexto) return;
    const novaMsg = await canalTexto.send(payload);
    painelMusicaDB.set(guildId, { channelId: novaMsg.channel.id, messageId: novaMsg.id });
}

// Função central usada tanto pelo /play quanto pelo botão "Adicionar música".
// Pressupõe que a interaction já foi deferida (deferReply ou deferUpdate) antes de chamar.
async function processarAdicaoMusica(interaction, canalVoz, query) {
    const distube = interaction.client.distube;
    const guildId = interaction.guild.id;
    const filaExistiaAntes = !!distube.getQueue(guildId);

    // Se o BotCall (ou outra função) deixou uma conexão de voz "crua" (fora do controle
    // do DisTube) nesse servidor, ela bloqueia distube.play com VOICE_ALREADY_CREATED.
    // Só destruímos se o DisTube ainda não tiver fila/conexão própria aqui.
    if (!filaExistiaAntes) {
        const conexaoCrua = getVoiceConnection(guildId);
        if (conexaoCrua) {
            conexaoCrua.destroy();
        }
    }

    try {
        let queries = [query];

        // Link do Spotify: resolve pra "artista - música" via API oficial e
        // toca isso como busca de texto (o Spotify em si nunca é usado pra
        // extrair áudio, só pra descobrir nome da faixa).
        if (/open\.spotify\.com/.test(query)) {
            const resolvido = await resolverSpotifyParaQuery(query).catch(err => {
                console.error('--- Erro ao resolver link do Spotify ---', err);
                return null;
            });
            // Links do Spotify nunca funcionam direto no YtDlpPlugin (DRM), então
            // se a resolução via API oficial falhar, é melhor avisar o usuário
            // com uma mensagem clara do que deixar cair na URL crua e o yt-dlp
            // estourar um erro de DRM sem explicação.
            if (!resolvido || !resolvido.length) {
                throw new Error('Não foi possível resolver o link do Spotify (ver log acima para o motivo exato).');
            }
            queries = resolvido;
        }

        for (const q of queries) {
            await distube.play(canalVoz, q, {
                member: interaction.member,
                textChannel: interaction.channel
            });
        }
    } catch (err) {
        console.error('--- Erro ao processar /play ---', err);
        return interaction.editReply({
            content: 'Não consegui encontrar ou tocar essa música. Verifique o nome/link e tente novamente.',
            components: []
        });
    }

    const queue = distube.getQueue(guildId);
    if (!queue) {
        return interaction.editReply({ content: 'Não consegui tocar essa música.', components: [] });
    }

    let container;
    if (!filaExistiaAntes) {
        container = montarPainelTocandoAgoraEfemero(queue.songs[0]);
    } else {
        const posicao = queue.songs.length - 1;
        container = montarPainelAdicionadaEfemero(queue.songs[posicao], posicao);
    }

    return interaction.editReply({ components: [container], flags: [MessageFlags.IsComponentsV2] });
}

async function musicaVoltar(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guild.id);
    if (!queue) return interaction.reply({ content: 'Não há nada tocando no momento.', flags: [MessageFlags.Ephemeral] });
    if (!queue.previousSongs.length) return interaction.reply({ content: 'Não há uma música anterior para voltar.', flags: [MessageFlags.Ephemeral] });

    await interaction.deferUpdate();
    await queue.previous().catch(err => console.error('--- Erro ao voltar música ---', err));
}

async function musicaPausarRetomar(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guild.id);
    if (!queue) return interaction.reply({ content: 'Não há nada tocando no momento.', flags: [MessageFlags.Ephemeral] });

    if (queue.paused) await queue.resume(); else await queue.pause();
    return interaction.update({ components: [montarPainelControleMusica(queue)], flags: [MessageFlags.IsComponentsV2] });
}

async function musicaAvancar(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guild.id);
    if (!queue) return interaction.reply({ content: 'Não há nada tocando no momento.', flags: [MessageFlags.Ephemeral] });

    if (queue.songs.length > 1) {
        await interaction.deferUpdate();
        await queue.skip().catch(err => console.error('--- Erro ao avançar música ---', err));
        return;
    }

    // Não há próxima música na fila: desativa os botões enquanto busca uma parecida.
    await interaction.update({ components: [montarPainelControleMusica(queue, true)], flags: [MessageFlags.IsComponentsV2] });

    try {
        await queue.addRelatedSong();
        await queue.skip();
    } catch (err) {
        console.error('--- Erro ao buscar música parecida ---', err);
        await interaction.editReply({ components: [montarPainelControleMusica(queue)], flags: [MessageFlags.IsComponentsV2] }).catch(() => null);
        if (queue.textChannel) queue.textChannel.send({ content: 'Não encontrei nenhuma música parecida para tocar.' }).catch(() => null);
    }
}

// Chamada pelo select menu 'musica_select_opcoes' (exceto a opção 'adicionar', que
// abre um modal e é tratada direto no index.js, já que precisa de ModalBuilder).
async function musicaSelecionarOpcao(interaction, opcao) {
    const queue = interaction.client.distube.getQueue(interaction.guild.id);
    if (!queue) return interaction.reply({ content: 'Não há nada tocando no momento.', flags: [MessageFlags.Ephemeral] });

    if (opcao === 'historico') {
        return interaction.reply({ components: [montarPainelHistoricoEfemero(interaction.guild.id)], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }

    if (opcao === 'fila_continua') {
        filaContinuaDB.set(queue.id, !filaContinuaDB.get(queue.id));
        return interaction.update({ components: [montarPainelControleMusica(queue)], flags: [MessageFlags.IsComponentsV2] });
    }

    if (opcao === 'loop') {
        queue.setRepeatMode(queue.repeatMode === 1 ? 0 : 1);
        return interaction.update({ components: [montarPainelControleMusica(queue)], flags: [MessageFlags.IsComponentsV2] });
    }

    if (opcao === 'fila') {
        return interaction.reply({ components: [montarPainelFilaEfemero(queue, 0)], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }
}

// Botões 'Anterior'/'Próxima' do painel efêmero da fila.
async function musicaMostrarFila(interaction, pagina) {
    const queue = interaction.client.distube.getQueue(interaction.guild.id);
    if (!queue) return interaction.reply({ content: 'Não há nada tocando no momento.', flags: [MessageFlags.Ephemeral] });
    return interaction.update({ components: [montarPainelFilaEfemero(queue, pagina)], flags: [MessageFlags.IsComponentsV2] });
}

// Select menu 'musica_remover_da_fila' dentro do painel efêmero da fila.
async function musicaRemoverDaFila(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guild.id);
    if (!queue) return interaction.reply({ content: 'Não há nada tocando no momento.', flags: [MessageFlags.Ephemeral] });

    const index = parseInt(interaction.values[0], 10);
    const song = queue.songs[index];
    if (!song || index === 0) {
        return interaction.reply({ content: 'Essa música não está mais na fila.', flags: [MessageFlags.Ephemeral] });
    }

    queue.songs.splice(index, 1);

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Música removida'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${song.name}** foi removida.`));

    return interaction.reply({ components: [container], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
}

// Chamada a partir do submit do modal de volume (musica_modal_volume).
async function musicaDefinirVolume(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guild.id);
    if (!queue) return interaction.reply({ content: 'Não há nada tocando no momento.', flags: [MessageFlags.Ephemeral] });

    const valor = parseInt(interaction.fields.getTextInputValue('volume').trim(), 10);
    if (isNaN(valor) || valor < 1 || valor > 100) {
        return interaction.reply({ content: 'Digite um número válido entre 1 e 100.', flags: [MessageFlags.Ephemeral] });
    }

    queue.setVolume(valor);
    return interaction.update({ components: [montarPainelControleMusica(queue)], flags: [MessageFlags.IsComponentsV2] });
}

async function musicaSair(interaction) {
    const queue = interaction.client.distube.getQueue(interaction.guild.id);
    if (!queue) return interaction.reply({ content: 'Não há nada tocando no momento.', flags: [MessageFlags.Ephemeral] });

    await interaction.update({ components: [montarPainelControleMusicaDesabilitado(queue)], flags: [MessageFlags.IsComponentsV2] });

    await queue.stop().catch(() => null);
    queue.voice.leave();

    const msgTchau = await interaction.followUp({ components: [montarPainelTchauMusica()], flags: [MessageFlags.IsComponentsV2] });
    setTimeout(() => msgTchau.delete().catch(() => null), 2 * 60 * 1000);
}

// ============ EXPORTS ============

module.exports = {
    // --- controle ---
    setClient,
    getEventoMoedasAtivo,
    setEventoMoedasAtivo,

    // --- sistema de música ---
    inicializarMusica,
    processarAdicaoMusica,
    musicaVoltar,
    musicaPausarRetomar,
    musicaAvancar,
    musicaDefinirVolume,
    musicaSair,
    musicaSelecionarOpcao,
    musicaMostrarFila,
    musicaRemoverDaFila,

    // --- anti nuke de canais ---
    alternarAntiNukeCanais,
    antiNukeCanalCriado,
    antiNukeCanalDeletado,
    antiNukeCanalEditado,
    definirBypassAntiNukeCanais,
    inicializarAntiNukeCanais,
    marcarAcaoPropriaCanal,
    marcarCanalTemporarioAntiNuke,
    montarPainelAntiNukeCanais,
    pausarAntiNukeCanais,
    retomarAntiNukeCanais,

    // --- estado e constantes compartilhados ---
    auditLogCache,
    AVATAR_SIZE,
    bufferMensagens,
    CACHE_AUDIT_MS,
    canaisLockDB,
    CANAL_LOGS_CANAIS_TEXTO,
    CANAL_LOGS_CANAIS_VOZ,
    CARD_RADIUS,
    CARD_WIDTH,
    CARGO_GERENCIADOR_LIMITADO,
    CARGOS_RESTRITOS_GERENCIADOR_LIMITADO,
    CATEGORIAS_HELP,
    DESCRICOES_PROTECAO,
    DIVIDER_BOTTOM,
    DURACAO_PUNICAO_STAFF_MS,
    EMOJI_SIZE,
    EMOJI_SIZE_CUSTOM,
    EMOJIS_CONEXAO,
    eventoMoedas,
    EXCLUIR_CARGOS_POR_PAGINA,
    EXT_AUDIO,
    EXT_IMAGEM,
    gerenciarCargosDB,
    GROLES_POR_PAGINA,
    grolesTimeouts,
    HANDLE_SIZE,
    HELP_CATEGORIA_POR_NOME,
    HELP_CATEGORIAS,
    HELP_DESCRICAO_PADRAO,
    HELP_OCULTOS,
    HELP_POR_PAGINA,
    HELP_PREFIXO_DESCRICOES,
    HELP_PREFIXO_EXTRAS,
    HELP_TIPOS_OPCAO,
    INFO_COMANDOS,
    invitesCache,
    JANELA_BAN_STAFF_MS,
    LIMITE_BANS_STAFF,
    LIMITE_MEDIA_TRANSCRIPT,
    LIMITES_ANTINUKE_EXTRA,
    LISTA_DE_COMANDOS,
    LISTA_PERMS_EDITAVEIS_GROLES,
    MESSAGE_LINE_HEIGHT,
    MESSAGE_SIZE,
    msgCriadorTimeouts,
    muteCargoTimeouts,
    NAME_SIZE,
    NOMES_BADGES,
    NOMES_CONEXAO,
    nukeTracker,
    PADDING_TOP,
    PADDING_X,
    paineisProtecao,
    PERM_LABELS_GROLES,
    PERMS_POR_PAGINA,
    PREFIXO,
    protecaoConfig,
    PUBLIC_BASE_URL,
    RE_HELP_PREFIXO,
    RE_HELP_SEM_PREFIXO,
    REGEX_CONVITE_GENERICO,
    REGEX_EMOJI_INTERNO,
    REGEX_EVERYONE_HERE,
    REGEX_URL_SERVIDOR,
    SCALE,
    sorteioTimeouts,
    sorteioVoiceSessions,
    spamPunicaoEmAndamento,
    staffBanTracker,
    staffPunicaoCargos,
    statusCanalAplicado,
    tellonymPendentesDB,
    ticketDB,
    TIME_SIZE,

    // --- funções ---
    agendarEncerramentoSorteio,
    agendarExpiracaoGRoles,
    agendarExpiracaoMsgCriador,
    agendarFimMuteCargo,
    aguardarEBuscarAuditLog,
    analisarEstiloLinha,
    analisarEstilosInline,
    aplicarMuteCargo,
    assumirTicket,
    atualizarPainelBotCallAuto,
    atualizarProgressoCallSorteio,
    atualizarProgressoInviteSorteio,
    atualizarProgressoMensagensSorteio,
    atualizarStatusCallsSorteio,
    atualizarTodosPaineisProtecao,
    baixarTikTok,
    breakText,
    bufferizarMensagem,
    buscarAuditLogsComCache,
    calculateHeight,
    canalDeLogParaTipo,
    carregarBotCallPaineis,
    carregarConfigMoedas,
    carregarProtecao,
    carregarTellonymPendentes,
    carregarTickets,
    classificarAnexoTranscript,
    coletarComandosPrefixoHelp,
    coletarComandosSlashHelp,
    construirEmbedPreview,
    contemConviteDoServidor,
    contemEveryoneOuHere,
    darXP,
    definirStatusCanal,
    delCallTempPorCanal,
    destravarTodosCanais,
    drawAvatar,
    editarWebhook,
    ehAdminGRoles,
    encerrarSorteio,
    enviarAlertaProtecao,
    enviarEventoMoedas,
    enviarWebhook,
    escapeHTML,
    extrairDadosComponente,
    extrairLinksDoTexto,
    extrairPrimeiraMediaUrl,
    fazerBackupServidor,
    filtrarCargosGRoles,
    filtrarPermsGRoles,
    finalizarSessaoVoiceSorteio,
    flushBufferMensagens,
    flushSessoesVoiceSorteio,
    fontePorAtom,
    formatarBytes,
    formatarConteudoComMencoes,
    formatarDataBR,
    formatarDuracaoMs,
    formatarHorarioRelativo,
    formatarLinhaConexao,
    formatarMarkdownDiscord,
    formatarTempoCurto,
    formatarTempoRelativo,
    formatarTimestampDiscord,
    formatarTop3Texto,
    garantirHistoricoInicial,
    gerarBarraProgresso,
    gerarCardTellonym,
    gerarListasHelp,
    gerarTranscriptHTML,
    getAfk,
    getCallTemp,
    getDonoCallTemp,
    helpPermissaoSlash,
    helpPrimeiraFrase,
    helpSemAcento,
    helpUsoOpcoes,
    hospedarMidiaTranscript,
    incrementarConviteStats,
    inicializarSessoesVoiceSorteio,
    iniciarSessaoVoiceSorteio,
    larguraDoAtom,
    limitarCache,
    limiteNukeAcao,
    limiteNukeAcaoExtra,
    limparEstadoEventoMoedas,
    limparInvitesCacheDesatualizado,
    limparNukeTrackerAntigo,
    linkPermitido,
    listarMembros,
    loadAvatar,
    localizarMensagemPainelTicket,
    MapaPersistente,
    monitorarDesconexaoBotCall,
    montarAvisoAfk,
    montarBotoesInsta,
    montarButtonRows,
    montarCardComentarioTellonym,
    montarControlesEmbedPlano,
    montarEmbedSorteioCanal,
    montarLinhasComEmoji,
    montarOverwritesRestauracao,
    montarPainelAntiNuke,
    montarPainelAvatares,
    montarPainelBackup,
    montarPainelBackupSelecionado,
    montarPainelBanners,
    montarPainelBios,
    montarPainelBiosLista,
    montarPainelEfemeroProtecao,
    montarPainelGRoles,
    montarPainelGRolesCriar,
    montarPainelGRolesEditar,
    montarPainelGRolesExcluir,
    montarPainelGRolesExcluirConfirmar,
    montarPainelGRolesPermissoes,
    montarPainelGRolesPermLista,
    montarPainelHelp,
    montarPainelInfoHierarquia,
    montarPainelInstaInfo,
    montarPainelListaCargo,
    montarPainelLock,
    montarPainelMoedas,
    montarPainelMsgCriadorBuilder,
    montarPainelMsgCriadorInicial,
    montarPainelProgressoBackup,
    montarPainelProtecao,
    montarPainelRemoverConfirmacao,
    montarPainelRemoverSelect,
    montarPainelRoleAllInicial,
    montarPainelSorteioConfig,
    montarPainelSorteioInicial,
    montarPainelStatus,
    montarPainelUserInfo,
    montarPainelUsernames,
    montarPainelVerificacaoCargos,
    montarPayloadFinalMsgCriador,
    montarPayloadPainelMsgCriador,
    montarPermissoesTextoGRoles,
    montarPreviewMsgCriador,
    montarSelectUserInfo,
    montarUrlAvatar,
    nomeTipoCanalLog,
    obterCargosExcluiveisGRoles,
    obterCargosGerenciaveisGRoles,
    obterDadosAfk,
    obterExecutorAuditLog,
    obterMembrosCache,
    obterMemoriaContainer,
    obterPrimeiroCanalCategoria,
    obterTop3CallSorteio,
    obterUsoCPU,
    parseBlocosTexto,
    parseDuracaoTexto,
    parseQuantidadeTexto,
    participantesElegiveis,
    proximoNumeroTicket,
    punirExecutorNuke,
    quebrarLinhasComEmoji,
    reconectarVoiceStates,
    registrarAcaoNuke,
    registrarAvatarSeNecessario,
    registrarBannerSeNecessario,
    registrarBioSeNecessario,
    registrarPainelProtecao,
    registrarUsernameSeNecessario,
    removerAfk,
    removerMuteCargo,
    removerTellonymPendenteUsuario,
    removerVoiceState,
    renderComponentesV2,
    renderComponenteV2,
    restaurarBackupServidor,
    rodapeExpiracao,
    roundedRect,
    salvarConfigMoedas,
    salvarEstadoEventoMoedas,
    salvarProtecao,
    salvarTellonymPendenteUsuario,
    salvarVoiceState,
    setAfk,
    setCallTemp,
    somarMensagens,
    sortearGanhadorSorteio,
    temPermissaoEditarCargosGRoles,
    tokenizarLinhaComEmoji,
    tokenizarPalavraComEmoji,
    travarTodosCanais,
    verificarAntiLink,
    verificarBanEmMassaStaff,
    verificarCallTemp,
    verificarCargosLojaExpirados,
    verificarEventoMoedasAntigo,
    verificarSpamMensagem,
    verificarUrlNaBio,
};
