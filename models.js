const mongoose = require('mongoose');

const carteiraSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    saldo: { type: Number, default: 0 }
});
const Carteira = mongoose.model('Carteira', carteiraSchema);

const xpSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    xp: { type: Number, default: 0 },
    nivel: { type: Number, default: 1 }
});
const XP = mongoose.model('XP', xpSchema);

const mensagensSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    quantidade: { type: Number, default: 0 }
});
const Mensagens = mongoose.model('Mensagens', mensagensSchema);


const cargoLojaSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    cargoId: { type: String, required: true },
    guildId: { type: String, required: true },
    expiraEm: { type: Number, required: true }
});
cargoLojaSchema.index({ userId: 1, cargoId: 1, guildId: 1 }, { unique: true });
const CargoLoja = mongoose.model('CargoLoja', cargoLojaSchema);

const voiceStateSchema = new mongoose.Schema({
    guildId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true }
});
const VoiceState = mongoose.model('VoiceState', voiceStateSchema);


const contadorTicketSchema = new mongoose.Schema({
    _id: { type: String, default: 'contador_ticket' },
    valor: { type: Number, default: 0 }
});
const ContadorTicket = mongoose.model('ContadorTicket', contadorTicketSchema);

const ticketDataSchema = new mongoose.Schema({
    threadId: { type: String, required: true, unique: true },
    autorId: { type: String, required: true },
    motivo: { type: String, default: 'Não informado' },
    assumidoPor: { type: String, default: null },
    numero: { type: Number, required: true },
    callId: { type: String, default: null }
});
const TicketData = mongoose.model('TicketData', ticketDataSchema);

const conviteStatsSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    userId: { type: String, required: true },
    reais: { type: Number, default: 0 },
    saiu: { type: Number, default: 0 },
    fake: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 }
});
conviteStatsSchema.index({ guildId: 1, userId: 1 }, { unique: true });
const ConviteStats = mongoose.model('ConviteStats', conviteStatsSchema);

const conviteMembroSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    membroId: { type: String, required: true },
    inviterId: { type: String, required: true },
    tipo: { type: String, enum: ['real', 'fake'], required: true }
});
conviteMembroSchema.index({ guildId: 1, membroId: 1 }, { unique: true });
const ConviteMembro = mongoose.model('ConviteMembro', conviteMembroSchema);

const sorteioSchema = new mongoose.Schema({
    requisitoTextoLivre: { type: String, default: null },
    guildId: { type: String, required: true },
    criadorId: { type: String, required: true },
    tag: { type: String, required: true },
    premio: { type: String, default: null },
    duracaoTexto: { type: String, default: null },
    duracaoMs: { type: Number, default: null },
    canalId: { type: String, default: null },
    mensagemId: { type: String, default: null },
    imagemUrl: { type: String, default: null },
    requisitoCallTexto: { type: String, default: null },
    requisitoCallMs: { type: Number, default: 0 },
    requisitoMensagens: { type: Number, default: 0 },
    requisitoInvites: { type: Number, default: 0 },
    participantes: { type: [String], default: [] },
    progressoMensagens: { type: mongoose.Schema.Types.Mixed, default: {} },
    progressoCallMs: { type: mongoose.Schema.Types.Mixed, default: {} },
    progressoInvites: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: { type: String, default: 'rascunho' },
    vencedorId: { type: String, default: null },
    iniciadoEm: { type: Number, default: null },
    encerraEm: { type: Number, default: null },
    criadoEm: { type: Date, default: Date.now }
});
sorteioSchema.index({ guildId: 1, criadorId: 1, tag: 1 }, { unique: true });
const Sorteio = mongoose.model('Sorteio', sorteioSchema);

const tellonymPostSchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    autorId: { type: String, required: true },
    anonimo: { type: Boolean, default: false },
    marcadoId: { type: String, default: null },
    mensagem: String,
    comentarios: [{
        autorId: String,
        texto: String,
        criadoEm: { type: Date, default: Date.now }
    }]
});
const TellonymPost = mongoose.model('TellonymPost', tellonymPostSchema);

const instaPostSchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    ownerId: { type: String, required: true },
    imagemUrl: String,
    texto: String,
    instagramUser: { type: String, default: null },
    curtidas: { type: [String], default: [] },
    comentarios: [{
        id: String,
        texto: String,
        criadoEm: { type: Date, default: Date.now }
    }]
});
const InstaPost = mongoose.model('InstaPost', instaPostSchema);

// ============ HISTÓRICO DE PERFIL (userinfo / ui) ============

const HistoricoUsernameSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    username: { type: String, required: true },
    desde: { type: Number, required: true },
    ate: { type: Number, default: null }
});
const HistoricoUsername = mongoose.model('HistoricoUsername', HistoricoUsernameSchema);

const HistoricoAvatarSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    avatarUrl: { type: String, required: true },
    avatarHash: { type: String, default: null },
    registradoEm: { type: Number, required: true }
});
const HistoricoAvatar = mongoose.model('HistoricoAvatar', HistoricoAvatarSchema);

const HistoricoBannerSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    bannerUrl: { type: String, required: true },
    bannerHash: { type: String, default: null },
    registradoEm: { type: Number, required: true }
});
const HistoricoBanner = mongoose.model('HistoricoBanner', HistoricoBannerSchema);

const AfkSchema = new mongoose.Schema({ _id: String, motivo: String });
const Afk = mongoose.model('Afk', AfkSchema);

const TellonymPendenteSchema = new mongoose.Schema({
    _id: String, autorId: String, anonimo: Boolean, marcadoId: String, mensagem: String, imagemUrl: String
});
const TellonymPendente = mongoose.model('TellonymPendente', TellonymPendenteSchema);

const mapaPersistenteSchema = new mongoose.Schema({
    _id: String,
    namespace: String,
    chave: String,
    valor: mongoose.Schema.Types.Mixed
});
const MapaPersistenteEntry = mongoose.model('MapaPersistenteEntry', mapaPersistenteSchema);

const HistoricoBioSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    bio: { type: String, default: '' },
    registradoEm: { type: Number, required: true }
});
const HistoricoBio = mongoose.model('HistoricoBio', HistoricoBioSchema);

const serverBackupSchema = new mongoose.Schema({
    guildId: { type: String, required: true },
    nome: { type: String, default: null },
    nomeServidor: String,
    iconeUrl: String,
    criadoEm: { type: Date, default: Date.now },
    cargos: [{
        id: String,
        nome: String,
        cor: Number,
        hoist: Boolean,
        mentionable: Boolean,
        permissions: String,
        posicao: Number
    }],
    categorias: [{
        id: String,
        nome: String,
        posicao: Number,
        permissionOverwrites: [{
            id: String,
            type: { type: Number },
            allow: String,
            deny: String
        }]
    }],
    canais: [{
        id: String,
        nome: String,
        tipo: Number,
        categoriaId: String,
        posicao: Number,
        topic: String,
        nsfw: Boolean,
        rateLimitPerUser: Number,
        bitrate: Number,
        userLimit: Number,
        permissionOverwrites: [{
            id: String,
            type: { type: Number },
            allow: String,
            deny: String
        }]
    }]
});
const ServerBackup = mongoose.model('ServerBackup', serverBackupSchema);

const MuteCargoSchema = new mongoose.Schema({
    _id: String,
    guildId: String,
    userId: String,
    cargosAnteriores: [String],
    expiraEm: Number,
    motivo: String,
    autorId: String
});
const MuteCargo = mongoose.model('MuteCargo', MuteCargoSchema);

const transcriptSchema = new mongoose.Schema({
    _id: { type: String },
    html: { type: String, required: true },
    criadoEm: { type: Date, default: Date.now, expires: 60 * 24 * 60 * 60 } // expira em 60 dias
});
const TranscriptModel = mongoose.model('Transcript', transcriptSchema);

const transcriptMediaSchema = new mongoose.Schema({
    _id: { type: String },
    data: { type: Buffer, required: true },
    contentType: { type: String, default: 'application/octet-stream' },
    criadoEm: { type: Date, default: Date.now, expires: 60 * 24 * 60 * 60 }
});
const TranscriptMedia = mongoose.model('TranscriptMedia', transcriptMediaSchema);

const mensagemCriadorSchema = new mongoose.Schema({
    _id: { type: String, required: true }, // ID da mensagem enviada no Discord
    guildId: String,
    canalId: String,
    autorId: String,
    tipo: String, // 'v2' | 'embed' | 'texto'
    textoBruto: String,
    embedTitulo: String,
    embedDescricao: String,
    embedFooter: String,
    imagemUrl: String,
    cor: String,
    botoes: { type: Array, default: [] },
    criadoEm: { type: Number, default: () => Date.now() },
    atualizadoEm: { type: Number, default: () => Date.now() }
});

const MensagemCriador = mongoose.model('MensagemCriador', mensagemCriadorSchema);

const conversaAnaSchema = new mongoose.Schema({
    _id: { type: String }, // userId
    historico: [{
        role: String,
        content: String,
        _id: false
    }],
    atualizadoEm: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 2 }
});
const ConversaAna = mongoose.model('ConversaAna', conversaAnaSchema);

module.exports = {
    ServerBackup,
    Carteira,
    XP,
    Mensagens,
    CargoLoja,
    VoiceState,
    ContadorTicket,
    TicketData,
    ConviteStats,
    ConviteMembro,
    Sorteio,
    TellonymPost,
    InstaPost,
    HistoricoUsername,
    HistoricoAvatar,
    HistoricoBanner,
    Afk,
    TellonymPendente,
    MapaPersistenteEntry,
    HistoricoBio,
    MuteCargo,
    TranscriptModel,
    TranscriptMedia,
    MensagemCriador,
    ConversaAna
};
