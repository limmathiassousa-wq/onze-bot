require('dotenv').config();
process.env.PATH = `${process.env.HOME || '/opt/render'}/.deno/bin:${process.env.PATH}`;

const express = require('express');
const app = express();
app.get('/', (req, res) => res.send('Bot Online!'));
app.listen(process.env.PORT || 3000, () => console.log('Servidor web do bot iniciado!'));

// ============ BOT ============
const TOKEN = process.env.DISCORD_TOKEN;
const MONGO_URI = process.env.MONGO_URI;


const { Client, GatewayIntentBits, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, ThumbnailBuilder, SectionBuilder, ChannelType, ActivityType, AttachmentBuilder, EmbedBuilder, SlashCommandBuilder, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, UserSelectMenuBuilder, ChannelSelectMenuBuilder, LabelBuilder, FileUploadBuilder, RoleSelectMenuBuilder, Events, Routes, AuditLogEvent,
ContextMenuCommandBuilder, ApplicationCommandType, StickerFormatType, PermissionFlagsBits, OverwriteType } = require('discord.js');
const { joinVoiceChannel, getVoiceConnection, VoiceConnectionStatus, entersState } = require('@discordjs/voice');
const { createCanvas, loadImage, GlobalFonts } = require("@napi-rs/canvas");
const { getUserBio, getUserPerfil, removerUsuarioDoCache } = require('./bio_fetcher.js');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require("path");
const os = require('os');
const crypto = require('crypto');

const { comandos, montarPainelBotCall, registrarPainelBotCall, montarPainelPD, montarSelectAdicionarPD, montarSelectRemoverPD, atualizarPainelPD, obterPrimeirasDamas, montarPainelMuteInicial, montarPainelMuteTimeout, montarPainelMuteCargo } = require('./commands');
const { botCallDB, botCallPaineis, confirmacaoModeracaoDB, msgCriadorDB, sorteioDraftDB, muteDraftDB } = require('./state');

const {
    esperar, containerTexto, comRetry, xpNecessario,
    montarPainelConfirmacaoModeracao,
    getSaldo, somarSaldo, getXP, setXP, getMensagens, setMensagens,
    urlValida, avisoSucessoModeracao
} = require('./helpers');

const { linhaCampo, enviarEmbedDetalhada, enviarSucessoModeracao, apagarInteracaoApos, apagarMensagemApos, montarPainelConfirmacaoMute } = require('./logger');
const { logar, enviarLogModeracao, logarBanimento, logarMembro, logarCargo, logarCallTemp, logarExpulsao, logarMute, logarAntiLink, logarAntiSpam, logarAntiBot, logarMensagemApagada, logarMensagemEditada, logarVoz, logarCastigo, logarCargoServidor, logarCanalServidor, logarPunicaoCargosStaff } = require('./logger');

const { Message: MessageClass } = require('discord.js');
const mensagensApagadasPeloBot = new Set();
const _messageDeleteOriginal = MessageClass.prototype.delete;
MessageClass.prototype.delete = function (...args) {
    mensagensApagadasPeloBot.add(this.id);
    setTimeout(() => mensagensApagadasPeloBot.delete(this.id), 15000);
    return _messageDeleteOriginal.apply(this, args);
};

// Retry pra queda de conexão (undici/fetch). O undici às vezes joga o código do erro
// dentro de err.cause ("fetch failed") e o comRetry só olha err.code — aqui a gente
// copia o código pra fora antes de deixar o comRetry decidir se tenta de novo.
function comRetryRede(fn, tentativas = 5, delayBase = 1000) {
    return comRetry(async () => {
        try {
            return await fn();
        } catch (err) {
            if (err && !err.code && err.cause?.code) err.code = err.cause.code;
            if (err && !err.code && /other side closed|fetch failed|socket hang up/i.test(err.message || '')) err.code = 'ECONNRESET';
            throw err;
        }
    }, tentativas, delayBase);
}

// Keep-alive curto: o "other side closed" vem de conexão parada que o Discord/Cloudflare
// já fechou e o undici tenta reaproveitar. Com timeout curto ele abre conexão nova.
try {
    const { Agent, setGlobalDispatcher } = require('undici');
    setGlobalDispatcher(new Agent({ keepAliveTimeout: 2000, keepAliveMaxTimeout: 5000 }));
} catch (e) {
    console.error('[undici] não consegui ajustar o keep-alive:', e.message);
}

const { anaResponderComAudio, DONO_ID: DONO_ID_ANA } = require('./ana_voz');
const CANAIS_VOZ_ANA = ['1548489854038581308', '1548578896054718474'];


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
const { supabase } = require('./supabase');

const {
    ServerBackup, Carteira, XP, Mensagens,
    CargoLoja, VoiceState, ContadorTicket, TicketData,
    ConviteStats,
    ConviteMembro, Sorteio, TellonymPost, InstaPost,
    HistoricoUsername, HistoricoAvatar, HistoricoBanner,
    Afk, TellonymPendente,
    MapaPersistenteEntry, HistoricoBio, MuteCargo, TranscriptModel, TranscriptMedia,
    MensagemCriador
} = require('./models');


const { 
    EMOJI_ATIVADO, EMOJI_DESATIVADO,
    CANAL_TELLONYM_MOD, CANAL_TELLONYM, CANAL_TICKETS,
    CANAL_LOGS_MOD, CANAL_LOGS_TICKETS, CATEGORIA_MOEDAS_BOASVINDAS, CANAL_LOGS_AUTOMOD,
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
    DOMINIOS_IMAGEM_CONFIAVEIS, BLACKLIST_DOMINIOS,
    DOMINIOS_CONVITE, EXTENSOES_IMAGEM,
    CACHE_MEMBROS_MS,
    INTERVALO_LIMPEZA_INVITES_MS,
    CATEGORIA_STATUS_SORTEIO, CARGOS_BOOST, CARGO_MUTADO, CANAL_LOGS_BANS, CANAL_LOGS_MEMBROS, CANAL_LOGS_CARGOS, CANAL_LOGS_CALLTEMP, CARGO_BLOQUEADO_MODERACAO, CARGO_RESTRITO_UNICO
} = require('./constants');

const {
    AVATAR_SIZE, CACHE_AUDIT_MS, CANAL_LOGS_CANAIS_TEXTO, CANAL_LOGS_CANAIS_VOZ,
    CARD_RADIUS, CARD_WIDTH, CARGOS_RESTRITOS_GERENCIADOR_LIMITADO, CARGO_GERENCIADOR_LIMITADO,
    CATEGORIAS_HELP, DESCRICOES_PROTECAO, DIVIDER_BOTTOM, DURACAO_PUNICAO_STAFF_MS,
    EMOJIS_CONEXAO, EMOJI_SIZE, EMOJI_SIZE_CUSTOM, EXCLUIR_CARGOS_POR_PAGINA,
    EXT_AUDIO, EXT_IMAGEM, GROLES_POR_PAGINA, HANDLE_SIZE,
    HELP_CATEGORIAS, HELP_CATEGORIA_POR_NOME, HELP_DESCRICAO_PADRAO, HELP_OCULTOS,
    HELP_POR_PAGINA, HELP_PREFIXO_DESCRICOES, HELP_PREFIXO_EXTRAS, HELP_TIPOS_OPCAO,
    INFO_COMANDOS, JANELA_BAN_STAFF_MS, LIMITES_ANTINUKE_EXTRA, LIMITE_BANS_STAFF,
    LIMITE_MEDIA_TRANSCRIPT, LISTA_DE_COMANDOS,
    LISTA_PERMS_EDITAVEIS_GROLES, MESSAGE_LINE_HEIGHT, MESSAGE_SIZE, MapaPersistente,
    NAME_SIZE, NOMES_BADGES, NOMES_CONEXAO, PADDING_TOP,
    PADDING_X, PERMS_POR_PAGINA, PERM_LABELS_GROLES, PREFIXO,
    PUBLIC_BASE_URL, REGEX_CONVITE_GENERICO, REGEX_EMOJI_INTERNO, REGEX_EVERYONE_HERE,
    REGEX_URL_SERVIDOR, RE_HELP_PREFIXO, RE_HELP_SEM_PREFIXO, SCALE,
    TIME_SIZE, agendarEncerramentoSorteio, agendarExpiracaoGRoles, agendarExpiracaoMsgCriador,
    agendarFimMuteCargo, aguardarEBuscarAuditLog, aplicarMuteCargo, assumirTicket,
    atualizarPainelBotCallAuto, atualizarProgressoCallSorteio, atualizarProgressoInviteSorteio, atualizarProgressoMensagensSorteio,
    atualizarStatusCallsSorteio, atualizarTodosPaineisProtecao, auditLogCache, baixarTikTok,
    breakText, bufferMensagens, bufferizarMensagem, buscarAuditLogsComCache,
    calculateHeight, canaisLockDB, canalDeLogParaTipo, carregarBotCallPaineis,
    carregarConfigMoedas, carregarProtecao, carregarTellonymPendentes, carregarTickets,
    classificarAnexoTranscript, coletarComandosPrefixoHelp, coletarComandosSlashHelp, construirEmbedPreview,
    contemConviteDoServidor, contemEveryoneOuHere, darXP, definirStatusCanal,
    delCallTempPorCanal, destravarTodosCanais, drawAvatar, editarWebhook,
    ehAdminGRoles, encerrarSorteio, enviarAlertaProtecao, enviarEventoMoedas,
    enviarWebhook, escapeHTML, eventoMoedas, extrairDadosComponente,
    extrairLinksDoTexto, extrairPrimeiraMediaUrl, fazerBackupServidor, filtrarCargosGRoles,
    filtrarPermsGRoles, finalizarSessaoVoiceSorteio, flushBufferMensagens, flushSessoesVoiceSorteio,
    formatarBytes, formatarConteudoComMencoes, formatarDataBR, formatarDuracaoMs,
    formatarHorarioRelativo, formatarLinhaConexao, formatarMarkdownDiscord, formatarTempoCurto,
    formatarTempoRelativo, formatarTimestampDiscord, formatarTop3Texto, garantirHistoricoInicial,
    gerarBarraProgresso, gerarCardTellonym, gerarListasHelp, gerarTranscriptHTML,
    gerenciarCargosDB, getAfk, getCallTemp, getDonoCallTemp,
    getEventoMoedasAtivo, grolesTimeouts, helpPermissaoSlash, helpPrimeiraFrase,
    helpSemAcento, helpUsoOpcoes, hospedarMidiaTranscript, incrementarConviteStats,
    inicializarSessoesVoiceSorteio, iniciarSessaoVoiceSorteio, invitesCache, limitarCache,
    limiteNukeAcao, limiteNukeAcaoExtra, limparEstadoEventoMoedas, limparInvitesCacheDesatualizado,
    limparNukeTrackerAntigo, linkPermitido, listarMembros, loadAvatar,
    localizarMensagemPainelTicket, monitorarDesconexaoBotCall, montarAvisoAfk, montarBotoesInsta,
    montarButtonRows, montarCardComentarioTellonym, montarControlesEmbedPlano, montarEmbedSorteioCanal,
    montarLinhasComEmoji, montarOverwritesRestauracao, montarPainelAntiNuke, montarPainelAvatares,
    montarPainelBackup, montarPainelBackupSelecionado, montarPainelBanners, montarPainelBios,
    montarPainelBiosLista, montarPainelEfemeroProtecao, montarPainelGRoles,
    montarPainelGRolesCriar, montarPainelGRolesEditar, montarPainelGRolesExcluir, montarPainelGRolesExcluirConfirmar,
    montarPainelGRolesPermLista, montarPainelGRolesPermissoes, montarPainelHelp, montarPainelInfoHierarquia,
    montarPainelInstaInfo, montarPainelListaCargo, montarPainelLock,
    montarPainelMoedas, montarPainelMsgCriadorBuilder, montarPainelMsgCriadorInicial, montarPainelProgressoBackup,
    montarPainelProtecao, montarPainelRemoverConfirmacao, montarPainelRemoverSelect, montarPainelRoleAllInicial,
    montarPainelSorteioConfig, montarPainelSorteioInicial, montarPainelStatus, montarPainelUserInfo,
    montarPainelUsernames, montarPainelVerificacaoCargos, montarPayloadFinalMsgCriador, montarPayloadPainelMsgCriador,
    montarPermissoesTextoGRoles, montarPreviewMsgCriador, montarSelectUserInfo, montarUrlAvatar, msgCriadorTimeouts, muteCargoTimeouts, nomeTipoCanalLog,
    nukeTracker, obterCargosExcluiveisGRoles, obterCargosGerenciaveisGRoles, obterDadosAfk,
    obterExecutorAuditLog, obterMembrosCache, obterMemoriaContainer, obterPrimeiroCanalCategoria,
    obterTop3CallSorteio, obterUsoCPU, paineisProtecao, parseBlocosTexto,
    parseDuracaoTexto, parseQuantidadeTexto, participantesElegiveis, protecaoConfig,
    proximoNumeroTicket, punirExecutorNuke, quebrarLinhasComEmoji, reconectarVoiceStates,
    registrarAcaoNuke, registrarAvatarSeNecessario, registrarBannerSeNecessario,
    registrarBioSeNecessario, registrarPainelProtecao, registrarUsernameSeNecessario,
    removerAfk, removerMuteCargo, removerTellonymPendenteUsuario, removerVoiceState,
    renderComponenteV2, renderComponentesV2, restaurarBackupServidor, rodapeExpiracao,
    roundedRect, salvarConfigMoedas, salvarEstadoEventoMoedas, salvarProtecao,
    salvarTellonymPendenteUsuario, salvarVoiceState, setAfk,
    setCallTemp, setClient, setEventoMoedasAtivo, somarMensagens,
    sortearGanhadorSorteio, sorteioTimeouts, sorteioVoiceSessions, spamPunicaoEmAndamento,
    staffBanTracker, staffPunicaoCargos, statusCanalAplicado, tellonymPendentesDB,
    temPermissaoEditarCargosGRoles, ticketDB, tokenizarLinhaComEmoji, tokenizarPalavraComEmoji,
    travarTodosCanais, verificarAntiLink, verificarBanEmMassaStaff, verificarCallTemp,
    verificarCargosLojaExpirados, verificarEventoMoedasAntigo, verificarSpamMensagem, verificarUrlNaBio,
    alternarAntiNukeCanais, antiNukeCanalCriado, antiNukeCanalDeletado, antiNukeCanalEditado,
    definirBypassAntiNukeCanais, inicializarAntiNukeCanais, marcarAcaoPropriaCanal,
    marcarCanalTemporarioAntiNuke, montarPainelAntiNukeCanais, pausarAntiNukeCanais, retomarAntiNukeCanais
} = require('./functions');


// ============ MAPS ============
 
const nukeEmAndamento = new Set();
const callTempDeleteTimeouts = new Map();
const respostasBotoesMsg = new MapaPersistente('respostas_botoes_msg');
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


const DIVIDER_MARGIN = 28;


module.exports = {
    gerarCardTellonym
};



const CARGOS_BLOQUEADOS_GROLES = ['1542321888309809210'];

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


 // 20MB


 


// ============ ANTI-NUKE ============


 


// ============ ANTI-ABUSO: REMOÇÃO TEMPORÁRIA DE CARGOS POR BAN EM MASSA (STAFF) ============
       // executorId -> [timestamps]
    // executorId -> { idsCargos }

 // 30 minutos

 // 2 minutos


// ============ FIM FUNCTIONs/ASYNCs ============


// ============ CRIADOR DE MENSAGENS ============


// ============ USERINFO (userinfo / ui) ============


// controla sessões de voz abertas em memória: chave `${guildId}_${userId}`


// ============ COMANDO HELP ============


// ---------- HELP DINÂMICO ----------
// A lista do /help é montada sozinha:
//  - Slash: lê tudo o que está registrado no Discord (LISTA_DE_COMANDOS + pasta de comandos).
//  - Prefixo: lê os .js do projeto procurando os comandos tratados em message.content.
// INFO_COMANDOS é opcional: se o comando tiver entrada lá, o texto manual sobrescreve o automático.

            // nomes (sem "/" e sem prefixo) que não devem aparecer no help
  // comandos de prefixo tratados fora dos .js lidos (se houver)

 // usado por comando de prefixo novo, sem descrição

// Descrição curta de cada comando de prefixo (chave = nome sem prefixo e sem acento)


// Só pra preencher o "Ajuda › Categoria › comando". Comando fora daqui cai em "Geral".



const { Options, Partials } = require('discord.js');

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
  partials: [
    Partials.Message,
    Partials.Channel,
  ],
  rest: { timeout: 30000, retries: 5 },
  makeCache: Options.cacheWithLimits({
    MessageManager: 300,
    GuildMemberManager: Infinity,
    UserManager: 200,
    ReactionManager: 0,
    PresenceManager: 0,
    GuildBanManager: 0,
    ThreadManager: 50,
    GuildInviteManager: 100,
  }),
  sweepers: {
    messages: { interval: 1800, lifetime: 21600 }
  }
});
setClient(client);

client.on('channelCreate', (canal) => {
    try { antiNukeCanalCriado(canal); } catch (err) { console.error('--- Erro no Anti Nuke (canal criado) ---', err); }
});
client.on('channelDelete', (canal) => {
    antiNukeCanalDeletado(canal).catch(err => console.error('--- Erro no Anti Nuke (canal apagado) ---', err));
});
client.on('channelUpdate', (canalAntigo, canalNovo) => {
    antiNukeCanalEditado(canalAntigo, canalNovo).catch(err => console.error('--- Erro no Anti Nuke (canal editado) ---', err));
});



// ============ COMANDOS SLASH ============


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

client.on('guildMemberRemove', async (member) => {
    // Usuário saiu, foi kickado ou banido do servidor: limpa ele da
    // memória do bot pra não ficar acumulando dados de gente que já foi.
    removerUsuarioDoCache(member.id);
    staffBanTracker.delete(member.id);
    staffPunicaoCargos.delete(member.id);

    const guild = member.guild;
    const guildId = guild.id;
    const userData = member.user ?? member;

    const tempoNoServidor = member.joinedTimestamp
        ? formatarDuracaoMs(Date.now() - member.joinedTimestamp)
        : 'desconhecido';
    const cargosDoMembro = member.roles?.cache?.filter(c => c.id !== guild.id).map(c => `${c}`).join(', ') || '`nenhum`';
    const tagUsuario = userData.discriminator && userData.discriminator !== '0'
        ? `${userData.username}#${userData.discriminator}`
        : userData.username;

    await logarMembro({
        guild,
        tipo: 'Saída',
        membro: userData,
        extra:
            `**ID:** \`${userData.id}\`\n` +
            `**Tag:** \`${tagUsuario}\`\n` +
            `**Estava no servidor há:** \`${tempoNoServidor}\`\n` +
            `**Cargos que possuía:** ${cargosDoMembro}\n` +
            `**Membros no servidor:** \`${guild.memberCount}\``
    }).catch(() => null);

    // ============ EXPULSÃO — LOG + ANTI KICK EM MASSA ============
    const executorKick = await obterExecutorAuditLog(guild, AuditLogEvent.MemberKick, userData.id);
    if (executorKick) {
        if (executorKick.id !== client.user.id) {
            await logarExpulsao({
                guild,
                tipo: 'Expulsão (Manual)',
                alvo: `<@${userData.id}> (${tagUsuario})`,
                alvoUser: userData,
                autor: executorKick,
                motivo: null
            }).catch(err => console.error('--- Erro ao logar kick manual ---', err));
        }
if (protecaoConfig.antiRaid.nukeAtivo) {
            const totalKicks = registrarAcaoNuke(nukeTracker.kicks, executorKick.id);
            if (totalKicks >= limiteNukeAcaoExtra(executorKick, 'kicks')) {
                nukeTracker.kicks.delete(executorKick.id);
                await punirExecutorNuke(guild, executorKick, `Expulsou ${totalKicks} membros em menos de ${protecaoConfig.antiRaid.janelaMs / 1000}s`);
            }
        }
    }

    try {
        const registro = await ConviteMembro.findOne({ guildId, membroId: userData.id });
        if (registro) {
            if (registro.tipo === 'real') {
                await incrementarConviteStats(guildId, registro.inviterId, 'reais', -1);
                await incrementarConviteStats(guildId, registro.inviterId, 'saiu', 1);
            }
            await ConviteMembro.deleteOne({ _id: registro._id }).catch(() => null);
        }
    } catch (err) {
        console.error('--- Erro ao processar saída para stats de convite ---', err);
    }

    try {
        await Carteira.deleteOne({ userId: userData.id });
        await Mensagens.deleteOne({ userId: userData.id });
        await XP.deleteOne({ userId: userData.id });
        console.log(`[Saída] Moedas, mensagens e XP de ${userData.id} foram apagados (saiu do servidor).`);
    } catch (err) {
        console.error('--- Erro ao apagar dados de usuário que saiu ---', err);
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
    
    // Anti-Abuso: staff que bane 3+ pessoas em menos de 30min perde os cargos por 2min
if (executor && executor.id !== client.user.id) {
    verificarBanEmMassaStaff(ban.guild, executor).catch(err => console.error('--- Erro no Anti-Abuso (guildBanAdd) ---', err));
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

// ============ LOGS DE CANAIS (criação, exclusão, edição) ============


client.on('channelCreate', async (canal) => {
    if (!canal.guild) return;
    const executor = await obterExecutorAuditLog(canal.guild, AuditLogEvent.ChannelCreate, canal.id);

    await logarCanalServidor({
        guild: canal.guild,
        tipo: 'Canal criado',
        canal: `${canal} \`${canal.name}\` (\`${canal.id}\`)`,
        tipoCanal: nomeTipoCanalLog(canal.type),
        categoria: canal.parent ? canal.parent.name : null,
        executor: executor ? `${executor}` : '`Desconhecido`',
        canalId: canalDeLogParaTipo(canal.type)
    }).catch(err => console.error('--- Erro ao logar criação de canal ---', err));
});

client.on('channelDelete', async (canal) => {
    if (!canal.guild) return;
    statusCanalAplicado.delete(canal.id);
    const executor = await obterExecutorAuditLog(canal.guild, AuditLogEvent.ChannelDelete, canal.id);

    await logarCanalServidor({
        guild: canal.guild,
        tipo: 'Canal apagado',
        canal: `\`${canal.name}\` (\`${canal.id}\`)`,
        tipoCanal: nomeTipoCanalLog(canal.type),
        categoria: canal.parent ? canal.parent.name : null,
        executor: executor ? `${executor}` : '`Desconhecido`',
        canalId: canalDeLogParaTipo(canal.type)
    }).catch(err => console.error('--- Erro ao logar exclusão de canal ---', err));
});

client.on('channelUpdate', async (canalAntigo, canalNovo) => {
    if (!canalNovo.guild) return;

    const alteracoes = [];

    if (canalAntigo.name !== canalNovo.name) {
        alteracoes.push(`**Nome:** \`${canalAntigo.name}\` → \`${canalNovo.name}\``);
    }
    if (canalAntigo.parentId !== canalNovo.parentId) {
        const catAntiga = canalAntigo.parent ? canalAntigo.parent.name : 'Nenhuma';
        const catNova = canalNovo.parent ? canalNovo.parent.name : 'Nenhuma';
        alteracoes.push(`**Categoria:** \`${catAntiga}\` → \`${catNova}\``);
    }
    if ('topic' in canalAntigo && canalAntigo.topic !== canalNovo.topic) {
        alteracoes.push(`**Tópico:** \`${canalAntigo.topic || 'Nenhum'}\` → \`${canalNovo.topic || 'Nenhum'}\``);
    }
    if ('nsfw' in canalAntigo && canalAntigo.nsfw !== canalNovo.nsfw) {
        alteracoes.push(`**NSFW:** \`${canalAntigo.nsfw ? 'Ativado' : 'Desativado'}\` → \`${canalNovo.nsfw ? 'Ativado' : 'Desativado'}\``);
    }
    if ('rateLimitPerUser' in canalAntigo && canalAntigo.rateLimitPerUser !== canalNovo.rateLimitPerUser) {
        alteracoes.push(`**Slowmode:** \`${canalAntigo.rateLimitPerUser || 0}s\` → \`${canalNovo.rateLimitPerUser || 0}s\``);
    }
    if ('bitrate' in canalAntigo && canalAntigo.bitrate !== canalNovo.bitrate) {
        alteracoes.push(`**Bitrate:** \`${canalAntigo.bitrate}\` → \`${canalNovo.bitrate}\``);
    }
    if ('userLimit' in canalAntigo && canalAntigo.userLimit !== canalNovo.userLimit) {
        alteracoes.push(`**Limite de usuários:** \`${canalAntigo.userLimit || 'Sem limite'}\` → \`${canalNovo.userLimit || 'Sem limite'}\``);
    }

    const overwriteAntigo = canalAntigo.permissionOverwrites?.cache?.get(canalNovo.guild.id);
    const overwriteNovo = canalNovo.permissionOverwrites?.cache?.get(canalNovo.guild.id);
    const mudouPermissaoEveryone =
        (overwriteAntigo?.allow?.bitfield ?? 0n) !== (overwriteNovo?.allow?.bitfield ?? 0n) ||
        (overwriteAntigo?.deny?.bitfield ?? 0n) !== (overwriteNovo?.deny?.bitfield ?? 0n);
    if (mudouPermissaoEveryone) {
        alteracoes.push('**Permissões de @everyone alteradas**');
    }

    if (alteracoes.length === 0) return;

    const executor = await obterExecutorAuditLog(canalNovo.guild, AuditLogEvent.ChannelUpdate, canalNovo.id);

    await logarCanalServidor({
        guild: canalNovo.guild,
        tipo: 'Canal editado',
        canal: `${canalNovo} \`${canalNovo.name}\` (\`${canalNovo.id}\`)`,
        tipoCanal: nomeTipoCanalLog(canalNovo.type),
        categoria: canalNovo.parent ? canalNovo.parent.name : null,
        executor: executor ? `${executor}` : '`Desconhecido`',
        extra: alteracoes.join('\n'),
        canalId: canalDeLogParaTipo(canalNovo.type)
    }).catch(err => console.error('--- Erro ao logar edição de canal ---', err));
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
    client.user.setActivity(`Prefixo: ${PREFIXO}`, { 
      type: ActivityType.Streaming, 
      url: 'https://twitch.tv/discord' // tudo minúsculo
    });

    
carregarTellonymPendentes();
    await carregarProtecao();
    await paineisProtecao.carregar();
    await carregarTickets();
    await respostasBotoesMsg.carregar();
    await canaisLockDB.carregar();
    await inicializarAntiNukeCanais();
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

// NOVO: garante que o cache de membros esteja completo pra logs de saída funcionarem direito
for (const guild of client.guilds.cache.values()) {
    try {
        await guild.members.fetch();
        console.log(`[Cache] ${guild.members.cache.size} membro(s) carregado(s) de ${guild.name}.`);
    } catch (err) {
        console.error(`--- Erro ao popular cache de membros de ${guild.name} ---`, err);
    }
}

inicializarSessoesVoiceSorteio();
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

    // ============ MUTE / UNMUTE (TIMEOUT) — LOG APENAS MANUAL ============
    const antesMs = oldMember.communicationDisabledUntilTimestamp || 0;
    const depoisMs = newMember.communicationDisabledUntilTimestamp || 0;
    const agoraMs = Date.now();

    const estavaMutado = antesMs > agoraMs;
    const estaMutado = depoisMs > agoraMs;

    if (estavaMutado !== estaMutado || (estaMutado && antesMs !== depoisMs)) {
        const entries = await buscarAuditLogsComCache(newMember.guild, AuditLogEvent.MemberUpdate);
        const entrada = entries.find(e =>
            (Date.now() - e.createdTimestamp) < 15000 &&
            e.target?.id === newMember.id &&
            e.changes?.some(c => c.key === 'communication_disabled_until')
        );
        const executor = entrada?.executor ?? null;

        if (executor && executor.id !== client.user.id) {
            if (estaMutado) {
                await logarCastigo({
                    guild: newMember.guild,
                    tipo: 'Castigo Manual',
                    alvo: `${newMember.user} (${newMember.user.tag})`,
                    alvoUser: newMember.user,
                    autor: executor,
                    motivo: entrada?.reason || null,
                    duracao: `expira em <t:${Math.floor(depoisMs / 1000)}:R>`
                }).catch(err => console.error('--- Erro ao logar castigo manual ---', err));
            } else {
                await logarCastigo({
                    guild: newMember.guild,
                    tipo: 'Castigo Removido Manualmente',
                    alvo: `${newMember.user} (${newMember.user.tag})`,
                    alvoUser: newMember.user,
                    autor: executor,
                    motivo: entrada?.reason || null
                }).catch(err => console.error('--- Erro ao logar remoção de castigo manual ---', err));
            }
        }
    }

    // ============ MUTE / UNMUTE POR CARGO — LOG APENAS MANUAL ============
    const tinhaCargoMutado = oldMember.roles.cache.has(CARGO_MUTADO);
    const temCargoMutado = newMember.roles.cache.has(CARGO_MUTADO);

    if (tinhaCargoMutado !== temCargoMutado) {
        const entriesCargo = await buscarAuditLogsComCache(newMember.guild, AuditLogEvent.MemberRoleUpdate);
        const entradaCargo = entriesCargo.find(e =>
            (Date.now() - e.createdTimestamp) < 15000 &&
            e.target?.id === newMember.id
        );
        const executorCargo = entradaCargo?.executor ?? null;

        if (executorCargo && executorCargo.id !== client.user.id) {
            if (temCargoMutado) {
                await logarMute({
                    guild: newMember.guild,
                    tipo: 'Mute por Cargo (Manual)',
                    alvo: `${newMember.user} (${newMember.user.tag})`,
                    alvoUser: newMember.user,
                    autor: executorCargo,
                    motivo: entradaCargo?.reason || null
                }).catch(err => console.error('--- Erro ao logar mute por cargo manual ---', err));
            } else {
                await logarMute({
                    guild: newMember.guild,
                    tipo: 'Unmute por Cargo (Manual)',
                    alvo: `${newMember.user} (${newMember.user.tag})`,
                    alvoUser: newMember.user,
                    autor: executorCargo,
                    motivo: entradaCargo?.reason || null
                }).catch(err => console.error('--- Erro ao logar unmute por cargo manual ---', err));
            }
        }
    }
    
    // ============ CARGO ADICIONADO/REMOVIDO MANUALMENTE (FORA DE COMANDO DO BOT) ============
    const cargosAntesGeral = oldMember.roles.cache;
    const cargosDepoisGeral = newMember.roles.cache;
    const cargosAdicionadosGeral = cargosDepoisGeral.filter(c => !cargosAntesGeral.has(c.id) && c.id !== CARGO_MUTADO);
    const cargosRemovidosGeral = cargosAntesGeral.filter(c => !cargosDepoisGeral.has(c.id) && c.id !== CARGO_MUTADO);

    if (cargosAdicionadosGeral.size > 0 || cargosRemovidosGeral.size > 0) {
        const entriesCargoGeral = await buscarAuditLogsComCache(newMember.guild, AuditLogEvent.MemberRoleUpdate);
        const entradaGeral = entriesCargoGeral.find(e =>
            (Date.now() - e.createdTimestamp) < 15000 &&
            e.target?.id === newMember.id
        );
        const executorGeral = entradaGeral?.executor ?? null;

        if (executorGeral && executorGeral.id !== client.user.id) {
            for (const cargo of cargosAdicionadosGeral.values()) {
                await logarCargo({
                    guild: newMember.guild,
                    tipo: 'Cargo Adicionado Manualmente',
                    alvo: `${newMember.user} (${newMember.user.tag})`,
                    alvoUser: newMember.user,
                    autor: executorGeral,
                    cargo: `${cargo}`,
                    extra: entradaGeral?.reason ? `**Motivo:** ${entradaGeral.reason}` : null
                }).catch(err => console.error('--- Erro ao logar cargo adicionado manualmente ---', err));
            }
            for (const cargo of cargosRemovidosGeral.values()) {
                await logarCargo({
                    guild: newMember.guild,
                    tipo: 'Cargo Removido Manualmente',
                    alvo: `${newMember.user} (${newMember.user.tag})`,
                    alvoUser: newMember.user,
                    autor: executorGeral,
                    cargo: `${cargo}`,
                    extra: entradaGeral?.reason ? `**Motivo:** ${entradaGeral.reason}` : null
                }).catch(err => console.error('--- Erro ao logar cargo removido manualmente ---', err));
            }
        }
    }
    
});

client.on('roleCreate', async (role) => {
    try {
        const entries = await buscarAuditLogsComCache(role.guild, AuditLogEvent.RoleCreate);
        const entrada = entries.find(e => (Date.now() - e.createdTimestamp) < 15000 && e.target?.id === role.id);
        const executor = entrada?.executor ?? null;

        await logarCargoServidor({
            guild: role.guild,
            tipo: 'Cargo Criado',
            cargo: `${role} — \`${role.name}\``,
            executor: executor
                ? (executor.id === client.user.id ? 'Sistema' : `${executor} — \`${executor.tag ?? executor.username}\``)
                : 'Não identificado',
            motivo: entrada?.reason || null,
            extra:
                `**ID:** \`${role.id}\`\n` +
                `**Cor:** \`${role.hexColor}\`\n` +
                `**Posição:** \`${role.position}\`\n` +
                `**Destacado:** ${role.hoist ? 'Sim' : 'Não'}\n` +
                `**Mencionável:** ${role.mentionable ? 'Sim' : 'Não'}\n` +
                `**Gerenciado por integração:** ${role.managed ? 'Sim' : 'Não'}\n` +
                `**Permissões:** ${role.permissions.has('Administrator') ? '\`Administrator\` (todas as permissões)' : (role.permissions.toArray().length ? '`' + role.permissions.toArray().join('`, `') + '`' : '`nenhuma`')}`
        });
    } catch (err) {
        console.error('--- Erro ao logar criação de cargo ---', err);
    }
});

client.on('roleDelete', async (role) => {
    try {
        const entries = await buscarAuditLogsComCache(role.guild, AuditLogEvent.RoleDelete);
        const entrada = entries.find(e => (Date.now() - e.createdTimestamp) < 15000 && e.target?.id === role.id);
        const executor = entrada?.executor ?? null;

        await logarCargoServidor({
            guild: role.guild,
            tipo: 'Cargo Excluído',
            cargo: `\`${role.name}\``,
            executor: executor
                ? (executor.id === client.user.id ? 'Sistema' : `${executor} — \`${executor.tag ?? executor.username}\``)
                : 'Não identificado',
            motivo: entrada?.reason || null,
            extra:
                `**ID:** \`${role.id}\`\n` +
                `**Cor:** \`${role.hexColor}\`\n` +
                `**Posição:** \`${role.position}\`\n` +
                `**Destacado:** ${role.hoist ? 'Sim' : 'Não'}\n` +
                `**Mencionável:** ${role.mentionable ? 'Sim' : 'Não'}\n` +
                `**Gerenciado por integração:** ${role.managed ? 'Sim' : 'Não'}\n` +
                `**Permissões:** ${role.permissions.has('Administrator') ? '\`Administrator\` (todas as permissões)' : (role.permissions.toArray().length ? '`' + role.permissions.toArray().join('`, `') + '`' : '`nenhuma`')}`
        });
    } catch (err) {
        console.error('--- Erro ao logar exclusão de cargo ---', err);
    }
});

client.on('roleUpdate', async (cargoAntigo, cargoNovo) => {
    try {
        const mudancas = [];

        if (cargoAntigo.name !== cargoNovo.name) {
            mudancas.push(`**Nome:** \`${cargoAntigo.name}\` → \`${cargoNovo.name}\``);
        }

        if (cargoAntigo.hexColor !== cargoNovo.hexColor) {
            mudancas.push(`**Cor:** \`${cargoAntigo.hexColor}\` → \`${cargoNovo.hexColor}\``);
        }

        if (cargoAntigo.position !== cargoNovo.position) {
            mudancas.push(`**Posição:** \`${cargoAntigo.position}\` → \`${cargoNovo.position}\``);
        }

        if (cargoAntigo.hoist !== cargoNovo.hoist) {
            mudancas.push(`**Destacado (separado na lista):** \`${cargoAntigo.hoist ? 'Sim' : 'Não'}\` → \`${cargoNovo.hoist ? 'Sim' : 'Não'}\``);
        }

        if (cargoAntigo.mentionable !== cargoNovo.mentionable) {
            mudancas.push(`**Mencionável:** \`${cargoAntigo.mentionable ? 'Sim' : 'Não'}\` → \`${cargoNovo.mentionable ? 'Sim' : 'Não'}\``);
        }

        if (cargoAntigo.icon !== cargoNovo.icon || cargoAntigo.unicodeEmoji !== cargoNovo.unicodeEmoji) {
            mudancas.push(`**Ícone do cargo:** alterado`);
        }

        if (!cargoAntigo.permissions.equals(cargoNovo.permissions)) {
            const antigas = cargoAntigo.permissions.toArray();
            const novas = cargoNovo.permissions.toArray();
            const adicionadas = novas.filter(p => !antigas.includes(p));
            const removidas = antigas.filter(p => !novas.includes(p));

            let textoPermissoes = '**Permissões alteradas:**\n';
            if (adicionadas.length) textoPermissoes += `+ Adicionadas: \`${adicionadas.join('`, `')}\`\n`;
            if (removidas.length) textoPermissoes += `- Removidas: \`${removidas.join('`, `')}\`\n`;
            mudancas.push(textoPermissoes.trim());
        }

        if (mudancas.length === 0) return;

        const entries = await buscarAuditLogsComCache(cargoNovo.guild, AuditLogEvent.RoleUpdate);
        const entrada = entries.find(e => (Date.now() - e.createdTimestamp) < 15000 && e.target?.id === cargoNovo.id);
        const executor = entrada?.executor ?? null;

        await logarCargoServidor({
            guild: cargoNovo.guild,
            tipo: 'Cargo Editado',
            cargo: `${cargoNovo} — \`${cargoNovo.name}\``,
            executor: executor
                ? (executor.id === client.user.id ? 'Sistema' : `${executor} — \`${executor.tag ?? executor.username}\``)
                : 'Não identificado',
            motivo: entrada?.reason || null,
            extra: mudancas.join('\n')
        });
    } catch (err) {
        console.error('--- Erro ao logar edição de cargo ---', err);
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

    await logarAntiBot({
        guild: member.guild,
        bot: member.user,
        acao: acaoBot
    }).catch(() => null);

    return;
}
    
    // Dentro de guildMemberAdd, na chamada de logarMembro:
    const contaCriadaEm = Math.floor(member.user.createdTimestamp / 1000);
    const idadeContaDias = ((Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24)).toFixed(1);

    await logarMembro({
        guild: member.guild,
        tipo: 'Entrada',
        membro: member.user,
        extra:
            `**ID:** \`${member.id}\`\n` +
            `**Tag:** \`${member.user.tag}\`\n` +
            `**Conta criada em:** <t:${contaCriadaEm}:F> (\`${idadeContaDias}\` dia(s) atrás)\n` +
            `**Membros no servidor:** \`${member.guild.memberCount}\``
    }).catch(() => null);
	
	
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
            ? canal.send(` **Seja bem-vindo(a) a Onze** <@${member.id}>\n <:pontored:1548558637507678268> Veja todas as regras em <#1542321889404264480>`).catch(() => null)
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
        await marcarCanalTemporarioAntiNuke(novaCall.id);
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
                                 { label: 'Privar call', value: 'call_privada', emoji: { id: '1548558135742959728', name: 'fechado' } },
                                 { label: 'Abrir call', value: 'call_publica', emoji: { id: '1548558101744193556', name: 'aberto' } },
                                 { label: 'Banir', value: 'call_banir', emoji: { id: '1548558794320257046', name: 'martelo' } },
                                 { label: 'Expulsar', value: 'call_expulsar', emoji: { id: '1548558298742267994', name: 'desconectar' } },
                                 { label: 'Alterar limite', value: 'call_limite', emoji: { id: '1548558468598734898', name: 'info' } },
                                 { label: 'Alterar nome', value: 'call_renomear', emoji: { id: '1548558265409871952', name: 'editar' } },
                                 { label: 'Alterar status', value: 'call_status', emoji: { id: '1548558739420880937', name: 'olho' } },
                                 { label: 'Permitir alguém', value: 'call_permitir', emoji: { id: '1548558348863938660', name: 'mais' } }
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
            await marcarCanalTemporarioAntiNuke(novaCall.id);
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
    
    // ============ LOGS DE VOZ: ENTROU / SAIU / MOVIDO / EXPULSO / MUTE / DEAFEN ============
    const membroLogVoz = newState.member ?? oldState.member;
    if (membroLogVoz && !membroLogVoz.user.bot) {
        const canalAntes = oldState.channelId ? (oldState.channel ?? await newState.guild.channels.fetch(oldState.channelId).catch(() => null)) : null;
        const canalDepois = newState.channelId ? (newState.channel ?? await newState.guild.channels.fetch(newState.channelId).catch(() => null)) : null;

        const listarMembros = (canal) => {
            if (!canal) return '`ninguém`';
            const lista = canal.members.filter(m => !m.user.bot).map(m => `${m}`).join(', ');
            return lista || '`ninguém`';
        };

        if (!canalAntes && canalDepois) {
            await logarVoz({
                guild: newState.guild,
                tipo: 'Entrou',
                membro: membroLogVoz.user,
                extra:
                    `**Canal:** ${canalDepois} — \`${canalDepois.name}\` (\`${canalDepois.id}\`)\n` +
                    `**Na call (${canalDepois.members.filter(m => !m.user.bot).size}):** ${listarMembros(canalDepois)}`
            }).catch(err => console.error('--- Erro ao logar entrada em call ---', err));

        } else if (canalAntes && !canalDepois) {
            const entradasDisconnect = await buscarAuditLogsComCache(newState.guild, AuditLogEvent.MemberDisconnect);
            const entradaDisconnect = entradasDisconnect.find(e => (Date.now() - e.createdTimestamp) < 10000);
            const executorDisconnect = entradaDisconnect?.executor ?? null;

            if (executorDisconnect && executorDisconnect.id !== membroLogVoz.id) {
                await logarVoz({
                    guild: newState.guild,
                    tipo: 'Expulso/Desconectado',
                    membro: membroLogVoz.user,
                    extra:
                        `**Canal:** ${canalAntes} — \`${canalAntes.name}\` (\`${canalAntes.id}\`)\n` +
                        `**Executado por:** ${executorDisconnect} — \`${executorDisconnect.tag ?? executorDisconnect.username}\``
                }).catch(err => console.error('--- Erro ao logar expulsão de call ---', err));
            } else {
                await logarVoz({
                    guild: newState.guild,
                    tipo: 'Saiu',
                    membro: membroLogVoz.user,
                    extra:
                        `**Canal:** ${canalAntes} — \`${canalAntes.name}\` (\`${canalAntes.id}\`)\n` +
                        `**Restam (${canalAntes.members.filter(m => !m.user.bot).size}):** ${listarMembros(canalAntes)}`
                }).catch(err => console.error('--- Erro ao logar saída de call ---', err));
            }

        } else if (canalAntes && canalDepois && canalAntes.id !== canalDepois.id) {
            await logarVoz({
                guild: newState.guild,
                tipo: 'Movido',
                membro: membroLogVoz.user,
                extra:
                    `**Saiu de:** ${canalAntes} — \`${canalAntes.name}\` (\`${canalAntes.id}\`)\n` +
                    `**Entrou em:** ${canalDepois} — \`${canalDepois.name}\` (\`${canalDepois.id}\`)\n` +
                    `**Na call (${canalDepois.members.filter(m => !m.user.bot).size}):** ${listarMembros(canalDepois)}`
            }).catch(err => console.error('--- Erro ao logar movimentação de call ---', err));
        }

        if (oldState.serverMute !== newState.serverMute) {
            const entriesMute = await buscarAuditLogsComCache(newState.guild, AuditLogEvent.MemberUpdate);
            const entradaMute = entriesMute.find(e =>
                (Date.now() - e.createdTimestamp) < 10000 &&
                e.target?.id === membroLogVoz.id &&
                e.changes?.some(c => c.key === 'mute')
            );
            const executorMute = entradaMute?.executor ?? null;

            if (executorMute && executorMute.id !== client.user.id) {
                await logarVoz({
                    guild: newState.guild,
                    tipo: newState.serverMute ? 'Mutado no Servidor' : 'Desmutado no Servidor',
                    membro: membroLogVoz.user,
                    extra:
                        `**Canal:** ${canalDepois ? `${canalDepois} — \`${canalDepois.name}\`` : '`fora de uma call`'}\n` +
                        `**Executado por:** ${executorMute} — \`${executorMute.tag ?? executorMute.username}\``
                }).catch(err => console.error('--- Erro ao logar mute de voz ---', err));
            }
        }

        if (oldState.serverDeaf !== newState.serverDeaf) {
            const entriesDeaf = await aguardarEBuscarAuditLog(newState.guild, AuditLogEvent.MemberUpdate);
            const entradaDeaf = entriesDeaf.find(e =>
                (Date.now() - e.createdTimestamp) < 6000 &&
                e.target?.id === membroLogVoz.id &&
                e.changes?.some(c => c.key === 'deaf')
            );
            const executorDeaf = entradaDeaf?.executor ?? null;

            if (executorDeaf && executorDeaf.id !== client.user.id) {
                await logarVoz({
                    guild: newState.guild,
                    tipo: newState.serverDeaf ? 'Áudio Desativado no Servidor' : 'Áudio Reativado no Servidor',
                    membro: membroLogVoz.user,
                    extra:
                        `**Canal:** ${canalDepois ? `${canalDepois} — \`${canalDepois.name}\`` : '`fora de uma call`'}\n` +
                        `**Executado por:** ${executorDeaf} — \`${executorDeaf.tag ?? executorDeaf.username}\``
                }).catch(err => console.error('--- Erro ao logar deafen de voz ---', err));
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


client.on('messageUpdate', async (oldMessage, newMessage) => {
    if (!newMessage.guild || !newMessage.channel) return;
    if (newMessage.partial) {
        try { newMessage = await newMessage.fetch(); } catch { return; }
    }
    if (newMessage.author?.bot) return;

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

// ============ LOG: MENSAGEM EDITADA ============
    // O Supabase é a fonte de verdade do conteúdo anterior — mesma lógica do
    // log de mensagem apagada, não depende do cache em memória do discord.js.
    const { data: cache, error: erroCache } = await supabase
        .from('mensagens_cache')
        .select('conteudo')
        .eq('mensagem_id', newMessage.id)
        .maybeSingle();
    if (erroCache) console.error('--- Erro ao ler cache de mensagem no Supabase (edição) ---', erroCache);

    let conteudoAntigo = null;
    let antigoDisponivel = false;

    if (cache) {
        conteudoAntigo = cache.conteudo;
        antigoDisponivel = true;
    } else if (!oldMessage.partial) {
        // não tinha chegado a ser cacheado no Supabase (raro) — usa a mensagem
        // ainda viva no cache do discord.js como último recurso
        conteudoAntigo = oldMessage.content;
        antigoDisponivel = typeof conteudoAntigo === 'string';
    }

    const conteudoMudou = !antigoDisponivel || conteudoAntigo !== newMessage.content;

    if (conteudoMudou) {
        logarMensagemEditada({
            guild: newMessage.guild,
            autor: newMessage.author,
            canal: newMessage.channel,
            mensagemId: newMessage.id,
            antes: antigoDisponivel ? conteudoAntigo : null,
            antesIndisponivel: !antigoDisponivel,
            depois: newMessage.content,
            url: newMessage.url
        }).catch(err => console.error('--- Erro ao logar mensagem editada ---', err));
    }

    // atualiza o cache com o texto novo, pra próxima edição/apagada já pegar o atual
    try {
        const { error: erroUpdate } = await supabase.from('mensagens_cache').update({ conteudo: newMessage.content }).eq('mensagem_id', newMessage.id);
        if (erroUpdate) console.error('--- Erro ao atualizar cache de mensagem no Supabase ---', erroUpdate);
    } catch (err) {
        console.error('--- Erro ao atualizar cache de mensagem no Supabase ---', err);
    }
});

// ============ LOG: MENSAGEM APAGADA ============
client.on('messageDelete', async (message) => {
    try {
        if (!message.guild || !message.channel) return;

        const foiOBotQueApagou = mensagensApagadasPeloBot.has(message.id);
        if (foiOBotQueApagou) mensagensApagadasPeloBot.delete(message.id);

        // O Supabase é a fonte de verdade do conteúdo/autor — não depende do
        // cache em memória do discord.js, que é varrido periodicamente pelo
        // sweeper (ver "sweepers" na criação do client) e se perde num restart.
        const { data: cache, error: erroCache } = await supabase
            .from('mensagens_cache')
            .select('*')
            .eq('mensagem_id', message.id)
            .maybeSingle();
        if (erroCache) console.error('--- Erro ao ler cache de mensagem no Supabase (apagada) ---', erroCache);

        let autorObj = null;
        let conteudo = null;

        if (cache) {
            autorObj = await client.users.fetch(cache.autor_id).catch(() => null);
            conteudo = cache.conteudo;
        } else if (!message.partial) {
            // não tinha chegado a ser cacheado no Supabase (raro) — usa a mensagem
            // ainda viva no cache do discord.js como último recurso
            autorObj = message.author || null;
            conteudo = message.content ?? null;
        }

        // Mensagens do próprio bot (painéis, logs etc.) não vão pro Supabase.
        // Depois de um restart elas chegam aqui como "partial", sem autor/conteúdo.
        // Se nenhuma fonte conhece a mensagem, confere no audit log se quem foi
        // apagada foi uma mensagem do bot e, se for, não loga (igual antes do restart).
        if (!foiOBotQueApagou && !autorObj && conteudo === null) {
            const execBot = await obterExecutorAuditLog(message.guild, AuditLogEvent.MessageDelete, client.user.id).catch(() => null);
            if (execBot) return;
        }

        if (autorObj?.bot) return;

        let executor;
        if (foiOBotQueApagou) {
            executor = `${client.user} — \`${client.user.tag}\` (ação automática do bot)`;
        } else if (autorObj) {
            const executorAuditoria = await obterExecutorAuditLog(message.guild, AuditLogEvent.MessageDelete, autorObj.id).catch(() => null);

            if (executorAuditoria && executorAuditoria.id === client.user.id) {
                executor = 'Sistema';
            } else if (executorAuditoria && executorAuditoria.id !== autorObj.id) {
                executor = `${executorAuditoria} — \`${executorAuditoria.tag ?? executorAuditoria.username}\` (\`${executorAuditoria.id}\`)`;
            } else {
                executor = `${autorObj} — \`${autorObj.tag ?? autorObj.username}\` (o próprio autor)`;
            }
        } else {
            executor = '`desconhecido`';
        }

        await logarMensagemApagada({
            guild: message.guild,
            autor: autorObj,
            canal: message.channel,
            executor,
            mensagemId: message.id,
            conteudo: conteudo ?? '`conteúdo não disponível (mensagem não estava em cache)`'
        }).catch(() => null);

        await supabase.from('mensagens_cache').delete().eq('mensagem_id', message.id);
    } catch (err) {
        console.error('--- Erro ao processar log de mensagem apagada ---', err);
    }
});

client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;
    try {
        const { error } = await supabase.from('mensagens_cache').upsert({
            mensagem_id: message.id,
            canal_id: message.channel.id,
            autor_id: message.author.id,
            autor_tag: message.author.tag,
            conteudo: message.content
        }, { onConflict: 'mensagem_id' });
        if (error) console.error('--- Erro ao cachear mensagem no Supabase ---', error);
    } catch (err) {
        console.error('--- Erro ao cachear mensagem no Supabase ---', err);
    }
});

client.on('messageCreate', async (message) => {
    try {
        if (message.author.bot) return;

        // [DEBUG-ANA] Mostra TODA mensagem que chega em qualquer canal, pra confirmar se o listener roda
        console.log(`[DEBUG-ANA] messageCreate recebido | canal=${message.channel.id} | autor=${message.author.id} | conteudo="${message.content}"`);

        if (!CANAIS_VOZ_ANA.includes(message.channel.id)) {
            console.log(`[DEBUG-ANA] Ignorado: canal ${message.channel.id} não está em CANAIS_VOZ_ANA (${CANAIS_VOZ_ANA.join(', ')})`);
            return;
        }

        const ehReply = !!message.reference?.messageId;
        let respondendoAudioDaAna = false;

        if (ehReply) {
            const msgReferenciada = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
            respondendoAudioDaAna = !!(
                msgReferenciada &&
                msgReferenciada.author.id === client.user.id &&
                msgReferenciada.flags?.has(MessageFlags.IsVoiceMessage)
            );

            if (!respondendoAudioDaAna) {
                console.log('[DEBUG-ANA] Ignorado: é reply, mas não a uma mensagem de voz da Ana');
                return;
            }
        } else {
            const foiMencionada = message.mentions.users.has(client.user.id);
            if (!foiMencionada) {
                console.log('[DEBUG-ANA] Ignorado: não é reply e o bot não foi mencionado');
                return;
            }
        }

        console.log('[DEBUG-ANA] Gatilho válido! Prosseguindo para gerar resposta...');

        const mencaoBotRegex = new RegExp(`<@!?${client.user.id}>`, 'g');
        const conteudoLimpo = message.content.replace(mencaoBotRegex, '').trim();
        const textoUsuario = conteudoLimpo || '(o usuário só te mencionou, sem escrever nada — cumprimente ele)';

        await message.channel.sendTyping().catch(() => null);

        if (!message.member) {
            console.log('[DEBUG-ANA] AVISO: message.member veio null (membro não cacheado) — checando permissão só por DONO_ID');
        }

        const autorizado = message.author.id === DONO_ID_ANA
            || !!message.member?.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));

        // Monta uma "nota de contexto" resolvendo quem/o que cada menção da mensagem representa,
        // já que os códigos crus (<@id>, <@&id>, <#id>) não significam nada pra IA sozinhos.
        const notaContextoPartes = [];

        if (message.mentions.users.size) {
            const pessoas = [...message.mentions.users.values()]
                .filter(u => u.id !== client.user.id)
                .map(u => {
                    const membro = message.mentions.members?.get(u.id);
                    const nomeExibido = membro?.displayName || u.globalName || u.username;
                    return `<@${u.id}> é a pessoa "${nomeExibido}" (usuário: ${u.username}, id: ${u.id})`;
                });
            if (pessoas.length) notaContextoPartes.push(pessoas.join('; '));
        }

        if (message.mentions.roles.size) {
            const cargos = [...message.mentions.roles.values()]
                .map(r => `<@&${r.id}> é o cargo "${r.name}" (id: ${r.id})`);
            notaContextoPartes.push(cargos.join('; '));
        }

        if (message.mentions.channels.size) {
            const canais = [...message.mentions.channels.values()]
                .map(c => `<#${c.id}> é o canal "#${c.name}" (id: ${c.id})`);
            notaContextoPartes.push(canais.join('; '));
        }

        const notaContexto = notaContextoPartes.length
            ? `[Contexto interno, não fale isso em voz alta — é só referência sua pra entender a mensagem: ${notaContextoPartes.join('; ')}]`
            : '';

        // Pega a primeira imagem anexada na mensagem, se tiver
        const anexoImagem = message.attachments.find(a => a.contentType?.startsWith('image/'));
        const imagemAnexadaUrl = anexoImagem?.url || null;

        console.log(`[DEBUG-ANA] Chamando anaResponderComAudio | textoUsuario="${textoUsuario}" | autorizado=${autorizado} | notaContexto="${notaContexto}" | imagemAnexadaUrl=${imagemAnexadaUrl}`);

        await anaResponderComAudio({
            canalId: message.channel.id,
            autorId: message.author.id,
            textoUsuario,
            replyToMessageId: message.id,
            guildId: message.guild.id,
            autorizado,
            notaContexto,
            imagemAnexadaUrl
        });

        console.log('[DEBUG-ANA] anaResponderComAudio concluído com sucesso.');
    } catch (err) {
        console.error('--- Erro no sistema de voz da Ana ---', err);
    }
});

client.on(Events.MessageCreate, async (message) => {
    if (!message.guild || !message.channel) return; 
    if (message.author.bot) return;
    

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
    const conteudoLower = message.content.toLowerCase().trim();
    const prefixoLower = PREFIXO.toLowerCase();
    const ehComandoPrefixo = conteudoLower === 'cl' ||
        (conteudoLower.startsWith(prefixoLower) && conteudoLower.length > prefixoLower.length);
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

if (message.content.toLowerCase() === `${PREFIXO}msg`) {
    const temPermissao = message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return message.reply('Você não tem permissão para utilizar este comando!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    await message.delete().catch(() => null);

    const draft = {
        autorId: message.author.id,
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

    const msgPainel = await message.channel.send({
        components: [montarPainelMsgCriadorInicial(draft)],
        flags: [MessageFlags.IsComponentsV2]
    });

    msgCriadorDB.set(msgPainel.id, draft);
    agendarExpiracaoMsgCriador(msgPainel.id, msgPainel.channel.id);
    return;
}

if (message.content.toLowerCase() === `${PREFIXO}áreas` || message.content.toLowerCase() === `${PREFIXO}areas`) {
    const areas = [
        ['Sup', 'Atende tickets e ajuda os membros da comunidade'],
        ['Mod', 'Modera o servidor de forma controlada com permissão para banir, mutar e expulsar'],
        ['Verify TELLONYM', 'Verifica tellonyms enviados para avaliação, ele decide se o tellonym vai ser enviado pro canal, ou não'],
        ['Verify INSTAGRAM', 'Verifica imagens enviadas para avaliação em tickets para cargo de instagram, ele decide se o usuário vai poder enviar o post pro canal ou não']
    ];

    const container = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('# Áreas disponíveis⬇'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    areas.forEach(([nome, descricao]) => {
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### <:barra:1548558939115757688> **${nome}**\n-# <:pontored:1548558637507678268> ${descricao}`
        ));
    });

    return message.channel.send({
        components: [container],
        flags: [MessageFlags.IsComponentsV2]
    });
}
    
    if (message.content.toLowerCase().startsWith(`${PREFIXO}groles`)) {
    if (message.member.roles.cache.some(r => CARGOS_BLOQUEADOS_GROLES.includes(r.id)) && !message.member.roles.cache.has('1542321888355684454')) {
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
        return message.channel.send(`Uso correto: \`${PREFIXO}moedaseditar <adicionar|remover> <@usuário> <quantidade>\``)
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

        return enviarEmbedDetalhada(message.channel, {
            titulo: 'Moedas Adicionadas', alvoUser: alvo, autor: message.author,
            campos: [
                linhaCampo('Quantidade adicionada', `${quantidade} moedas`, true),
                linhaCampo('Saldo atual', novoSaldo, true)
            ]
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

        return enviarEmbedDetalhada(message.channel, {
            titulo: 'Moedas Removidas', alvoUser: alvo, autor: message.author,
            campos: [
                linhaCampo('Quantidade removida', `${quantidade} moedas`, true),
                linhaCampo('Saldo atual', novoSaldo, true)
            ]
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
                    .setEmoji({ id: '1548558686136307732', name: 'pontoblack' })
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
        return message.channel.send(`Uso correto: \`${PREFIXO}ban @usuário [motivo]\``)
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
        return message.channel.send(`Uso correto: \`${PREFIXO}unban <id> [motivo]\``)
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
    
if (message.content.toLowerCase().startsWith(`${PREFIXO}mute `) || message.content.toLowerCase() === `${PREFIXO}mute`) {
    const aviso = (texto) => message.channel.send(`${message.author} ${texto}`).then(m => apagarMensagemApos(m));

    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return aviso('Você não tem permissão para silenciar membros!');
    }
    if (!message.member.permissions.has('ModerateMembers') && !message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return aviso('Você não tem permissão para silenciar membros!');
    }

    const args = message.content.trim().split(/\s+/);
    const alvo = message.mentions.users.first();
    const tempoTexto = args[2];
    const duracaoMs = tempoTexto ? parseDuracaoTexto(tempoTexto) : null;

    if (!alvo || !duracaoMs) {
        return aviso(`Uso correto: \`${PREFIXO}mute @usuário <tempo> [motivo]\` (ex: \`10m\`, \`2h\`, \`1d\`)`);
    }
    if (duracaoMs > 28 * 24 * 60 * 60 * 1000) {
        return aviso('O tempo máximo de mute é de **28 dias**!');
    }
    if (alvo.id === message.author.id) return aviso('Você não pode se mutar!');
    if (alvo.bot) return aviso('Você não pode mutar um bot!');

    const membroAlvo = await message.guild.members.fetch({ user: alvo.id, force: true }).catch(() => null);
    if (!membroAlvo) return aviso('Esse usuário não está no servidor.');
    if (!membroAlvo.moderatable) return aviso('Não consigo silenciar esse usuário. Verifique a hierarquia de cargos.');

    const motivo = args.slice(3).join(' ') || null;

    const container = montarPainelConfirmacaoMute('mute', `${alvo}`, alvo.tag, motivo, tempoTexto);
    const msgConfirmacao = await message.channel.send({ components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });

    confirmacaoModeracaoDB.set(msgConfirmacao.id, {
        tipo: 'mute', autorId: message.author.id, alvoId: alvo.id, alvoTag: alvo.tag, motivo,
        duracaoMs, duracaoTexto: tempoTexto
    });
    setTimeout(() => confirmacaoModeracaoDB.delete(msgConfirmacao.id), 2 * 60 * 1000);
    return;
}

if (message.content.toLowerCase().startsWith(`${PREFIXO}unmute `) || message.content.toLowerCase() === `${PREFIXO}unmute`) {
    const aviso = (texto) => message.channel.send(`${message.author} ${texto}`).then(m => apagarMensagemApos(m));

    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return aviso('Você não tem permissão para remover o silenciamento!');
    }
    if (!message.member.permissions.has('ModerateMembers') && !message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return aviso('Você não tem permissão para remover o silenciamento!');
    }

    const alvo = message.mentions.users.first();
    if (!alvo) return aviso(`Uso correto: \`${PREFIXO}unmute @usuário [motivo]\``);

    const membroAlvo = await message.guild.members.fetch({ user: alvo.id, force: true }).catch(() => null);
    if (!membroAlvo) return aviso('Esse usuário não está no servidor.');
    if (!membroAlvo.communicationDisabledUntil) return aviso('Esse usuário não está silenciado.');

    const motivo = message.content.trim().split(/\s+/).slice(2).join(' ') || null;

    const container = montarPainelConfirmacaoMute('unmute', `${alvo}`, alvo.tag, motivo);
    const msgConfirmacao = await message.channel.send({ components: [container], flags: [MessageFlags.IsComponentsV2], allowedMentions: { parse: [] } });

    confirmacaoModeracaoDB.set(msgConfirmacao.id, {
        tipo: 'unmute', autorId: message.author.id, alvoId: alvo.id, alvoTag: alvo.tag, motivo
    });
    setTimeout(() => confirmacaoModeracaoDB.delete(msgConfirmacao.id), 2 * 60 * 1000);
    return;
}

if (message.content.toLowerCase() === `${PREFIXO}pd`) {
    const aviso = (texto) => message.channel.send(`${message.author} ${texto}`).then(m => apagarMensagemApos(m));

    if (message.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
        return aviso('Você não tem permissão para utilizar este comando!');
    }
    const temPermissao = message.member.roles.cache.has(CARGO_PD_PERMISSAO) || message.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) return aviso('Você não tem permissão para utilizar este comando!');

    const damas = await obterPrimeirasDamas(message.guild.id, message.author.id);
    const msgPainel = await message.channel.send({
        components: [montarPainelPD(message.guild, damas, message.author)],
        flags: [MessageFlags.IsComponentsV2],
        allowedMentions: { parse: [] }
    });
    apagarMensagemApos(msgPainel, 60 * 1000);
    return;
}

    if (message.content.toLowerCase().startsWith(`${PREFIXO}tiktok`)) {
    const args = message.content.trim().split(/\s+/);
    const link = args[1];

    const regexTikTok = /https?:\/\/(www\.|vm\.|vt\.)?tiktok\.com\/\S+/i;
    if (!link || !regexTikTok.test(link)) {
        return message.channel.send(`Uso correto: \`${PREFIXO}tikv <link do tiktok>\``)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const containerCarregando = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('<a:carregando:1548558543253409882> Baixando vídeo, aguarde...'));

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
        new TextDisplayBuilder().setContent(`<:tiktok2:1548558848258744372> **TIKTOK**・Enviado por ${message.author}`)
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
        return message.channel.send(`Uso correto: \`${PREFIXO}xped <adicionar|remover> <@usuário> <quantidade>\``)
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

        return enviarEmbedDetalhada(message.channel, {
            titulo: 'XP Adicionado', alvoUser: alvo, autor: message.author,
            campos: [
                linhaCampo('Quantidade adicionada', `${quantidade} XP`, true),
                linhaCampo('XP atual', dados.xp, true),
                linhaCampo('Nível atual', dados.nivel, true)
            ]
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

        return enviarEmbedDetalhada(message.channel, {
            titulo: 'XP Removido', alvoUser: alvo, autor: message.author,
            campos: [
                linhaCampo('Quantidade removida', `${quantidade} XP`, true),
                linhaCampo('XP atual', dados.xp, true),
                linhaCampo('Nível atual', dados.nivel, true)
            ]
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
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('https://i.supaimg.com/001f5659-bb07-44c4-a79d-4338b59c3c1a/6b621b9b-fdf2-4f4e-a913-6ca022e839bc.png')
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
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('https://i.supaimg.com/001f5659-bb07-44c4-a79d-4338b59c3c1a/6b621b9b-fdf2-4f4e-a913-6ca022e839bc.png')
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
        marcarAcaoPropriaCanal(canal.id);

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
           .addTextDisplayComponents(new TextDisplayBuilder().setContent('-# <:martelo:1548558794320257046> **Canal Resetado**'))
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
            console.log(`[INSTA] anexo recebido | autor=${message.author.id} | tipo=${foto?.contentType} | nome=${foto?.name} | tamanho=${foto?.size}`);
            if (foto && (foto.contentType?.startsWith('image/') || foto.contentType?.startsWith('video/'))) {
                try {
                    const anexo = new AttachmentBuilder(foto.url, { name: 'post.png' });
                    const textoPost = `> <:instagram2:1548561559373217792> <@${message.author.id}>${message.content ? '\n' + message.content : ''}`;

                    const container = new ContainerBuilder()
                        .setAccentColor(0xFFFFFF)
                        .addTextDisplayComponents(new TextDisplayBuilder().setContent(textoPost))
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                        .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://post.png')))
                        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                        .addActionRowComponents(
                            montarBotoesInsta({ curtidas: [], comentarios: [], instagramUser: null })
                        );

                    const postMsg = await comRetryRede(() => enviarWebhook(message.channel, {
                        username: message.member?.displayName || message.author.username,
                        avatarURL: message.author.displayAvatarURL({ dynamic: true }),
                        components: [container],
                        files: [anexo],
                        flags: [MessageFlags.IsComponentsV2]
                    }));

                    console.log(`[INSTA] post enviado | id=${postMsg.id}`);

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
                    // a mensagem original NÃO foi apagada — avisa o autor pra tentar de novo
                    const aviso = await message.reply({
                        components: containerTexto('Não consegui postar agora (erro de conexão). Envie de novo.'),
                        flags: [MessageFlags.IsComponentsV2],
                        allowedMentions: { repliedUser: false }
                    }).catch(() => null);
                    if (aviso) setTimeout(() => aviso.delete().catch(() => {}), 8000);
                }
            } else {
                console.log(`[INSTA] anexo ignorado (tipo não é imagem/vídeo): ${foto?.contentType}`);
            }
        } else {
            console.log(`[INSTA] mensagem sem anexo no canal de insta | autor=${message.author.id}`);
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
        return message.channel.send(`Uso correto: \`${PREFIXO}addcargo @cargo @usuário\``)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (cargo.id === message.guild.id) {
        return message.reply('Não é possível gerenciar o cargo `@everyone`!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    
    if (cargo.id === CARGO_RESTRITO_UNICO && !message.member.roles.cache.has(CARGO_RESTRITO_UNICO)) {
        return message.reply('Você não tem permissão para gerenciar esse cargo!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const cargoBotMaisAlto = message.guild.members.me.roles.highest;
    if (cargo.position >= cargoBotMaisAlto.position) {
        return message.reply(`Não consigo gerenciar o cargo **${cargo.name}** — ele está no mesmo nível ou acima do meu cargo mais alto.`)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (alvo.roles.cache.has(cargo.id)) {
        return enviarEmbedDetalhada(message.channel, {
            titulo: 'Cargo Já Possuído', alvoUser: alvo.user, autor: message.author,
            campos: [linhaCampo('Cargo', `${cargo}`), 'Esse usuário já possui esse cargo.']
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

    return enviarEmbedDetalhada(message.channel, {
        titulo: 'Cargo Adicionado', alvoUser: alvo.user, autor: message.author,
        campos: [linhaCampo('Cargo', `${cargo}`)]
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
        return message.channel.send(`Uso correto: \`${PREFIXO}remcargo @cargo @usuário\``)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (cargo.id === message.guild.id) {
        return message.reply('Não é possível gerenciar o cargo `@everyone`!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }
    
    if (cargo.id === CARGO_RESTRITO_UNICO && !message.member.roles.cache.has(CARGO_RESTRITO_UNICO)) {
        return message.reply('Você não tem permissão para gerenciar esse cargo!')
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    const cargoBotMaisAlto = message.guild.members.me.roles.highest;
    if (cargo.position >= cargoBotMaisAlto.position) {
        return message.reply(`Não consigo gerenciar o cargo **${cargo.name}** — ele está no mesmo nível ou acima do meu cargo mais alto.`)
            .then(m => setTimeout(() => m.delete().catch(() => null), 5000));
    }

    if (!alvo.roles.cache.has(cargo.id)) {
        return enviarEmbedDetalhada(message.channel, {
            titulo: 'Cargo Não Possuído', alvoUser: alvo.user, autor: message.author,
            campos: [linhaCampo('Cargo', `${cargo}`), 'Esse usuário não possui esse cargo.']
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

    return enviarEmbedDetalhada(message.channel, {
        titulo: 'Cargo Removido', alvoUser: alvo.user, autor: message.author,
        campos: [linhaCampo('Cargo', `${cargo}`)]
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
            return message.channel.send(`Uso correto: \`${PREFIXO}limpar <quantidade de 1 a 300>\``)
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
                        ? '### <:check:1548558822711365702> Limpeza concluída'
                        : '### <a:cerregando2:1548558592133824562> Limpando canal...'
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
            .addMediaGalleryComponents(
                new MediaGalleryBuilder().addItems(
                    new MediaGalleryItemBuilder().setURL('https://i.supaimg.com/001f5659-bb07-44c4-a79d-4338b59c3c1a/6b621b9b-fdf2-4f4e-a913-6ca022e839bc.png')
                )
            )
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_iniciar')
                        .setEmoji('<:pontoblack:1548558686136307732>')
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
    
// ============ PAINEL STAFF DO TICKET ============
if (interaction.isButton() && interaction.customId === 'ticket_painelstaff') {
    if (!interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Você não tem permissão para usar o painel staff.', flags: [MessageFlags.Ephemeral] });
    }

    const containerPainelStaff = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Painel staff'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('Selecione uma ação abaixo:'))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('ticket_painelstaff_select')
                    .setPlaceholder('Escolha uma ação')
                    .addOptions(
                        new StringSelectMenuOptionBuilder().setLabel('Adicionar membro').setDescription('Dá acesso a um membro para ver e enviar mensagens no ticket').setValue('add_membro'),
                        new StringSelectMenuOptionBuilder().setLabel('Remover membro').setDescription('Remove o acesso de um membro adicionado ao ticket').setValue('remover_membro'),
                        new StringSelectMenuOptionBuilder().setLabel('Notificar autor').setDescription('Envia uma mensagem mencionando o autor do ticket').setValue('notificar_autor'),
                        new StringSelectMenuOptionBuilder().setLabel('Criar call').setDescription('Cria uma call privada só para a staff e o autor do ticket').setValue('criar_call')
                    )
            )
        );

    return interaction.reply({ components: [containerPainelStaff], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
}

if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_painelstaff_select') {
    if (!interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Você não tem permissão para usar o painel staff.', flags: [MessageFlags.Ephemeral] });
    }

    const escolha = interaction.values[0];
    const thread = interaction.channel;

    if (escolha === 'add_membro') {
        const dados = ticketDB.get(thread.id);
        const listaAtual = dados?.membrosAdicionados?.length
            ? dados.membrosAdicionados.map(id => `<@${id}>`).join(', ')
            : '`Nenhum`';

        const containerAdd = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Adicionar membro ao ticket'))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Membros adicionados:** ${listaAtual}`))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new UserSelectMenuBuilder()
                        .setCustomId('ticket_staffpainel_addmembro')
                        .setPlaceholder('Selecione o membro para adicionar')
                        .setMinValues(1)
                        .setMaxValues(1)
                )
            );

        return interaction.update({ components: [containerAdd], flags: [MessageFlags.IsComponentsV2] });
    }

    if (escolha === 'remover_membro') {
        const dados = ticketDB.get(thread.id);

        if (!dados?.membrosAdicionados?.length) {
            const containerVazio = new ContainerBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Remover membro do ticket'))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent('Nenhum membro extra foi adicionado a este ticket ainda.'));

            return interaction.update({ components: [containerVazio], flags: [MessageFlags.IsComponentsV2] });
        }

        const containerRemover = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Remover membro do ticket'))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Membros adicionados:** ${dados.membrosAdicionados.map(id => `<@${id}>`).join(', ')}`))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new UserSelectMenuBuilder()
                        .setCustomId('ticket_staffpainel_removermembro')
                        .setPlaceholder('Selecione o membro para remover')
                        .setMinValues(1)
                        .setMaxValues(1)
                )
            );

        return interaction.update({ components: [containerRemover], flags: [MessageFlags.IsComponentsV2] });
    }

    if (escolha === 'notificar_autor') {
        const modalNotificar = new ModalBuilder()
            .setCustomId('ticket_staffpainel_notificar_modal')
            .setTitle('Notificar autor do ticket');

        const mensagemInput = new TextInputBuilder()
            .setCustomId('mensagem')
            .setLabel('Mensagem para o autor')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(1000);

        modalNotificar.addComponents(new ActionRowBuilder().addComponents(mensagemInput));
        return interaction.showModal(modalNotificar);
    }

    if (escolha === 'criar_call') {
        await interaction.deferUpdate();

        let dados = ticketDB.get(thread.id);
        if (!dados) {
            const doc = await TicketData.findOne({ threadId: thread.id }).catch(() => null);
            dados = doc ? { autorId: doc.autorId, motivo: doc.motivo, assumidoPor: doc.assumidoPor, numero: doc.numero } : null;
        }
        if (!dados?.autorId) {
            return interaction.editReply({ components: containerTexto('Não foi possível localizar o autor desse ticket.'), flags: [MessageFlags.IsComponentsV2] });
        }

        const guild = interaction.guild;
        const canalTicketsBase = await guild.channels.fetch(CANAL_TICKETS).catch(() => null);

        const overwrites = [
            {
                id: guild.id,
                type: OverwriteType.Role,
                allow: [PermissionFlagsBits.ViewChannel],
                deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages]
            },
            {
                id: dados.autorId,
                type: OverwriteType.Member,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages]
            },
            {
                id: client.user.id,
                type: OverwriteType.Member,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages]
            },
            ...CARGOS_ATENDENTE.map(cargoId => ({
                id: cargoId,
                type: OverwriteType.Role,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages]
            }))
        ];

        let callCriada;
        try {
            callCriada = await guild.channels.create({
                name: thread.name,
                type: ChannelType.GuildVoice,
                parent: canalTicketsBase?.parentId || undefined,
                permissionOverwrites: overwrites,
                reason: `Call privada do ticket N°${dados.numero ?? '?'}`
            });
        } catch (err) {
            console.error('--- Erro ao criar call privada do ticket ---', err);
            return interaction.editReply({ components: containerTexto('Ocorreu um erro ao criar a call privada.'), flags: [MessageFlags.IsComponentsV2] });
        }
        
        await marcarCanalTemporarioAntiNuke(callCriada.id);
        const containerSucessoCall = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Call privada **${callCriada.name}** criada com sucesso!`));

        await interaction.editReply({ components: [containerSucessoCall], flags: [MessageFlags.IsComponentsV2] });

        const containerAvisoCall = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@${dados.autorId}>`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('Uma call privada foi criada para o seu atendimento.'))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Entrar na call').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${guild.id}/${callCriada.id}`)
                )
            );

        await thread.send({ components: [containerAvisoCall], flags: [MessageFlags.IsComponentsV2] }).catch(err =>
            console.error('--- Erro ao avisar sobre call criada no ticket ---', err)
        );
    }
}

if (interaction.isUserSelectMenu() && interaction.customId === 'ticket_staffpainel_addmembro') {
    await interaction.deferUpdate();

    const membroId = interaction.values[0];
    const thread = interaction.channel;

    let dados = ticketDB.get(thread.id);
    if (!dados) {
        const doc = await TicketData.findOne({ threadId: thread.id }).catch(() => null);
        dados = doc ? { autorId: doc.autorId, motivo: doc.motivo, assumidoPor: doc.assumidoPor, numero: doc.numero, membrosAdicionados: [] } : null;
        if (dados) ticketDB.set(thread.id, dados);
    }
    if (!dados) {
        return interaction.followUp({ content: 'Não foi possível localizar os dados desse ticket.', flags: [MessageFlags.Ephemeral] });
    }
    if (!dados.membrosAdicionados) dados.membrosAdicionados = [];

    if (dados.membrosAdicionados.includes(membroId)) {
        return interaction.followUp({ content: `<@${membroId}> já está no ticket.`, flags: [MessageFlags.Ephemeral] });
    }

    try {
        await thread.members.add(membroId);
    } catch (err) {
        console.error('--- Erro ao adicionar membro ao ticket ---', err);
        return interaction.followUp({ content: 'Não foi possível adicionar esse membro ao ticket.', flags: [MessageFlags.Ephemeral] });
    }

    dados.membrosAdicionados.push(membroId);

    const containerAddAtualizado = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Adicionar membro ao ticket'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Membros adicionados:** ${dados.membrosAdicionados.map(id => `<@${id}>`).join(', ')}`))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('ticket_staffpainel_addmembro')
                    .setPlaceholder('Selecione o membro para adicionar')
                    .setMinValues(1)
                    .setMaxValues(1)
            )
        );

    await interaction.editReply({ components: [containerAddAtualizado], flags: [MessageFlags.IsComponentsV2] });
    await interaction.followUp({ content: `<@${membroId}> foi adicionado ao ticket com sucesso!`, flags: [MessageFlags.Ephemeral] });
}

if (interaction.isUserSelectMenu() && interaction.customId === 'ticket_staffpainel_removermembro') {
    await interaction.deferUpdate();

    const membroId = interaction.values[0];
    const thread = interaction.channel;

    const dados = ticketDB.get(thread.id);
    if (!dados?.membrosAdicionados?.includes(membroId)) {
        return interaction.followUp({ content: `<@${membroId}> não está na lista de membros adicionados deste ticket.`, flags: [MessageFlags.Ephemeral] });
    }

    try {
        await thread.members.remove(membroId);
    } catch (err) {
        console.error('--- Erro ao remover membro do ticket ---', err);
        return interaction.followUp({ content: 'Não foi possível remover esse membro do ticket.', flags: [MessageFlags.Ephemeral] });
    }

    dados.membrosAdicionados = dados.membrosAdicionados.filter(id => id !== membroId);

    const listaAtualizada = dados.membrosAdicionados.length
        ? dados.membrosAdicionados.map(id => `<@${id}>`).join(', ')
        : '`Nenhum`';

    const containerRemoverAtualizado = new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('## Remover membro do ticket'))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Membros adicionados:** ${listaAtualizada}`))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId('ticket_staffpainel_removermembro')
                    .setPlaceholder('Selecione o membro para remover')
                    .setMinValues(1)
                    .setMaxValues(1)
            )
        );

    await interaction.editReply({ components: [containerRemoverAtualizado], flags: [MessageFlags.IsComponentsV2] });
    await interaction.followUp({ content: `<@${membroId}> foi removido do ticket com sucesso!`, flags: [MessageFlags.Ephemeral] });
}

if (interaction.isModalSubmit() && interaction.customId === 'ticket_staffpainel_notificar_modal') {
    const mensagemNotificacao = interaction.fields.getTextInputValue('mensagem');

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    const thread = interaction.channel;
    let dados = ticketDB.get(thread.id);
    if (!dados) {
        dados = await TicketData.findOne({ threadId: thread.id }).catch(() => null);
    }
    if (!dados?.autorId) {
        return interaction.editReply({ content: 'Não foi possível localizar o autor desse ticket.' });
    }

    await thread.send({
        content: `-# **Uma mensagem da administração** <@${dados.autorId}>\n${mensagemNotificacao}`,
        allowedMentions: { parse: ['users'] }
    }).catch(err => console.error('--- Erro ao notificar autor do ticket ---', err));

    return interaction.editReply({ content: 'Autor notificado com sucesso!' });
}
	
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

    enviarSucessoModeracao(interaction.channel, {
        tipo: 'mute', alvoId: membroAlvo.id, alvoTag: membroAlvo.user.tag, alvoUser: membroAlvo.user,
        autor: interaction.user, motivo: draft.motivo, duracao: draft.duracaoTexto
    });

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

    enviarSucessoModeracao(interaction.channel, {
        tipo: 'mute', alvoId: membroAlvo.id, alvoTag: membroAlvo.user.tag, alvoUser: membroAlvo.user,
        autor: interaction.user, motivo: draft.motivo, duracao: '5 minutos (mute por cargo)'
    });

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
    
    if (cargo.id === CARGO_RESTRITO_UNICO && !interaction.member.roles.cache.has(CARGO_RESTRITO_UNICO)) {
        return interaction.reply({ content: 'Você não tem permissão para gerenciar esse cargo!', flags: [MessageFlags.Ephemeral] });
    }

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

    if (perfil.privado) {
        return interaction.editReply({
            components: containerTexto('<:fechado:1548558135742959728> Seu perfil está privado, não consegui ver sua bio/pronomes.'),
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

if (interaction.isButton() && interaction.customId === 'antinukecanais_toggle') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }
    await alternarAntiNukeCanais();
    return interaction.update({ components: [montarPainelAntiNukeCanais(interaction.guild.id)], flags: [MessageFlags.IsComponentsV2] });
}

if (interaction.isUserSelectMenu() && interaction.customId === 'antinukecanais_bypass_select') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }
    await definirBypassAntiNukeCanais(interaction.values);
    return interaction.update({ components: [montarPainelAntiNukeCanais(interaction.guild.id)], flags: [MessageFlags.IsComponentsV2] });
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
    pausarAntiNukeCanais();
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
    } finally {
        retomarAntiNukeCanais(interaction.guild).catch(err => console.error('--- Erro ao retomar Anti Nuke ---', err));
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

        verificarBanEmMassaStaff(interaction.guild, interaction.user).catch(err => console.error('--- Erro no Anti-Abuso (comando /ban) ---', err));

        enviarSucessoModeracao(interaction.channel, {
            tipo: 'ban', alvoId: draft.alvoId, alvoTag: draft.alvoTag, alvoUser: alvoUserFetch,
            autor: interaction.user, motivo: draft.motivo
        });

        await interaction.editReply({ components: containerTexto(`**${draft.alvoTag}** foi banido com sucesso!`), flags: [MessageFlags.IsComponentsV2] });
        return apagarInteracaoApos(interaction);
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

        enviarSucessoModeracao(interaction.channel, {
            tipo: 'unban', alvoId: draft.alvoId, alvoTag: draft.alvoTag, alvoUser: alvoUserFetch,
            autor: interaction.user, motivo: draft.motivo
        });

        await interaction.editReply({ components: containerTexto(`**${draft.alvoTag}** foi desbanido com sucesso!`), flags: [MessageFlags.IsComponentsV2] });
        return apagarInteracaoApos(interaction);
    }

    if (draft.tipo === 'mute') {
        const membroAlvo = await interaction.guild.members.fetch({ user: draft.alvoId, force: true }).catch(() => null);
        if (!membroAlvo) {
            await interaction.editReply({ components: containerTexto('Esse usuário não está mais no servidor.'), flags: [MessageFlags.IsComponentsV2] });
            return apagarInteracaoApos(interaction);
        }
        if (!membroAlvo.moderatable) {
            await interaction.editReply({ components: containerTexto('Não consigo silenciar esse usuário. Verifique a hierarquia de cargos.'), flags: [MessageFlags.IsComponentsV2] });
            return apagarInteracaoApos(interaction);
        }

        try {
            await membroAlvo.timeout(draft.duracaoMs, draft.motivo || 'Não informado');
        } catch (err) {
            console.error('--- Erro ao aplicar mute (confirmação) ---', err);
            await interaction.editReply({ components: containerTexto('Ocorreu um erro ao aplicar o mute nesse usuário.'), flags: [MessageFlags.IsComponentsV2] });
            return apagarInteracaoApos(interaction);
        }

        await enviarLogModeracao({
            guild: interaction.guild, tipo: 'MUTE (TIMEOUT)',
            alvo: `${membroAlvo} (${membroAlvo.user.tag})`, alvoUser: membroAlvo.user,
            autor: interaction.user, motivo: draft.motivo, extra: `**Duração:** \`${draft.duracaoTexto}\``
        });

        enviarSucessoModeracao(interaction.channel, {
            tipo: 'mute', alvoId: draft.alvoId, alvoTag: draft.alvoTag, alvoUser: membroAlvo.user,
            autor: interaction.user, motivo: draft.motivo, duracao: draft.duracaoTexto
        });

        await interaction.editReply({ components: containerTexto(`**${draft.alvoTag}** foi mutado com sucesso!`), flags: [MessageFlags.IsComponentsV2] });
        return apagarInteracaoApos(interaction);
    }

    if (draft.tipo === 'unmute') {
        const membroAlvo = await interaction.guild.members.fetch({ user: draft.alvoId, force: true }).catch(() => null);
        if (!membroAlvo) {
            await interaction.editReply({ components: containerTexto('Esse usuário não está mais no servidor.'), flags: [MessageFlags.IsComponentsV2] });
            return apagarInteracaoApos(interaction);
        }

        try {
            await membroAlvo.timeout(null, draft.motivo || 'Não informado');
        } catch (err) {
            console.error('--- Erro ao remover mute (confirmação) ---', err);
            await interaction.editReply({ components: containerTexto('Ocorreu um erro ao remover o silenciamento.'), flags: [MessageFlags.IsComponentsV2] });
            return apagarInteracaoApos(interaction);
        }

        await logar('UNMUTE', `${membroAlvo} (${membroAlvo.user.tag})`, interaction.user, {
            guild: interaction.guild, alvoUser: membroAlvo.user, motivo: draft.motivo
        });

        enviarSucessoModeracao(interaction.channel, {
            tipo: 'unmute', alvoId: draft.alvoId, alvoTag: draft.alvoTag, alvoUser: membroAlvo.user,
            autor: interaction.user, motivo: draft.motivo
        });

        await interaction.editReply({ components: containerTexto(`**${draft.alvoTag}** foi desmutado com sucesso!`), flags: [MessageFlags.IsComponentsV2] });
        return apagarInteracaoApos(interaction);
    }
}

if (interaction.isButton() && interaction.customId === 'moderacao_cancelar') {
    const draft = confirmacaoModeracaoDB.get(interaction.message.id);
    if (draft && interaction.user.id !== draft.autorId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }
    confirmacaoModeracaoDB.delete(interaction.message.id);

    await interaction.update({ components: containerTexto('Ação cancelada.'), flags: [MessageFlags.IsComponentsV2] });
    return apagarInteracaoApos(interaction);
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
    sorteioDoc.status = 'ativo'; // <-- estava faltando, por isso o Participar dava "não está mais ativo"

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
            try {
                const canal = await client.channels.fetch(sorteioDoc.canalId).catch(() => null);
                if (canal && sorteioDoc.mensagemId) {
                    const msg = await canal.messages.fetch(sorteioDoc.mensagemId).catch(() => null);
                    if (msg) await msg.delete().catch(() => null);
                }
            } catch (err) { console.error('--- Erro ao apagar embed do sorteio deletado ---', err); }

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

    setEventoMoedasAtivo(!getEventoMoedasAtivo());
await salvarConfigMoedas();

    if (!getEventoMoedasAtivo() && eventoMoedas.ativo && eventoMoedas.mensagem) {
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

if (interaction.isButton() && interaction.customId === 'lock_antinuke') {
    if (!interaction.member.permissions.has('Administrator') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
        return interaction.reply({ content: 'Apenas administradores podem usar isso!', flags: [MessageFlags.Ephemeral] });
    }

    return interaction.update({ components: [montarPainelAntiNukeCanais(interaction.guild.id)], flags: [MessageFlags.IsComponentsV2] });
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

    const guildIconUrl = interaction.guild.iconURL({ extension: 'png', size: 256 }) || IMG_DISCORD_LOGO;
    const mencionadosTexto = marcado ? `${marcado}` : '`Nenhum`';

    const containerMod = new ContainerBuilder()
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('## Tellonym aguardando avaliação'),
                    new TextDisplayBuilder().setContent(`**Remetente:** \`${interaction.user.username}\``),
                    new TextDisplayBuilder().setContent(`**Mencionados:** ${mencionadosTexto}`)
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIconUrl))
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addMediaGalleryComponents(
            new MediaGalleryBuilder().addItems(
                new MediaGalleryItemBuilder().setURL('attachment://tellonym.png')
            )
        )
        .addActionRowComponents(linhaBotoesMod);

let msgModeracao;
try {
    await canalMod.send({
        components: [new TextDisplayBuilder().setContent('<@&1546552147804692480>')],
    flags: [MessageFlags.IsComponentsV2],
    allowedMentions: { roles: ['1546552147804692480'] }
    });
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

    return interaction.reply({
        components: montarCardComentarioTellonym(dados, 1),
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isButton() && (interaction.customId.startsWith('tellonym_comentario_voltar_') || interaction.customId.startsWith('tellonym_comentario_avancar_'))) {
    const partes = interaction.customId.split('_');
    const paginaAtual = parseInt(partes.pop(), 10);
    const msgId = partes.pop();
    const direcao = interaction.customId.includes('voltar') ? -1 : 1;

    const dados = await TellonymPost.findOne({ messageId: msgId });
    if (!dados) {
        return interaction.reply({ content: 'Esse Tellonym não foi encontrado.', flags: [MessageFlags.Ephemeral] });
    }

    return interaction.update({
        components: montarCardComentarioTellonym(dados, paginaAtual + direcao),
        flags: [MessageFlags.IsComponentsV2]
    });
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
           .setEmoji('1548558220539338772')
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

    const autorAprovado = await client.users.fetch(pendente.autorId).catch(() => null);
    const guildIconUrlAprovado = interaction.guild.iconURL({ extension: 'png', size: 256 }) || IMG_DISCORD_LOGO;
    const mencionadosTextoAprovado = pendente.marcadoId ? `<@${pendente.marcadoId}>` : '`Nenhum`';

    const containerAprovado = new ContainerBuilder()
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('## Tellonym aguardando avaliação'),
                    new TextDisplayBuilder().setContent(`**Remetente:** \`${autorAprovado?.username || pendente.autorId}\``),
                    new TextDisplayBuilder().setContent(`**Mencionados:** ${mencionadosTextoAprovado}`)
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIconUrlAprovado))
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
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

    const guildIconUrlNegado = interaction.guild.iconURL({ extension: 'png', size: 256 }) || IMG_DISCORD_LOGO;
    const mencionadosTextoNegado = pendente.marcadoId ? `<@${pendente.marcadoId}>` : '`Nenhum`';

    const containerNegado = new ContainerBuilder()
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent('## Tellonym aguardando avaliação'),
                    new TextDisplayBuilder().setContent(`**Remetente:** \`${membroAutor?.user?.username || pendente.autorId}\``),
                    new TextDisplayBuilder().setContent(`**Mencionados:** ${mencionadosTextoNegado}`)
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(guildIconUrlNegado))
        );

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
    

// ---- PD: botões Adicionar / Remover do painel público ----
if (interaction.isButton() && (interaction.customId.startsWith('pd_btn_adicionar_') || interaction.customId.startsWith('pd_btn_remover_'))) {
    const ehAdicionar = interaction.customId.startsWith('pd_btn_adicionar_');
    const donoId = interaction.customId.replace(ehAdicionar ? 'pd_btn_adicionar_' : 'pd_btn_remover_', '');

    if (interaction.user.id !== donoId) {
        return interaction.reply({ content: 'Esse painel não pertence a você!', flags: [MessageFlags.Ephemeral] });
    }

    const temPermissao = interaction.member.roles.cache.has(CARGO_PD_PERMISSAO) || interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const damas = await obterPrimeirasDamas(interaction.guild.id, interaction.user.id);

    if (ehAdicionar) {
        if (damas.length >= LIMITE_PRIMEIRAS_DAMAS) {
            return interaction.reply({ content: `Você já atingiu o limite de **${LIMITE_PRIMEIRAS_DAMAS}** primeiras damas!`, flags: [MessageFlags.Ephemeral] });
        }
        return interaction.reply({
            components: [montarSelectAdicionarPD(interaction.message.id)],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    if (!damas.length) {
        return interaction.reply({ content: 'Você não tem nenhuma primeira dama para remover.', flags: [MessageFlags.Ephemeral] });
    }
    return interaction.reply({
        components: [await montarSelectRemoverPD(interaction.guild, damas, interaction.message.id)],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
    });
}

if (interaction.isUserSelectMenu() && interaction.customId.startsWith('pd_selecionar_')) {
    const painelId = interaction.customId.replace('pd_selecionar_', '');
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

    const { data: jaExiste } = await supabase
    .from('primeira_dama')
    .select('id')
    .eq('guild_id', interaction.guild.id)
    .eq('setter_id', interaction.user.id)
    .eq('target_id', alvoId)
    .maybeSingle();
if (jaExiste) {
    return interaction.reply({ content: `${alvoMembro} já é uma das suas primeiras damas!`, flags: [MessageFlags.Ephemeral] });
}

const { count: totalAtual } = await supabase
    .from('primeira_dama')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', interaction.guild.id)
    .eq('setter_id', interaction.user.id);
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
    const { error } = await supabase
        .from('primeira_dama')
        .insert({ guild_id: interaction.guild.id, setter_id: interaction.user.id, target_id: alvoId });
    if (error) throw error;
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
    await atualizarPainelPD(interaction, painelId, damasAtualizadas);

    if (damasAtualizadas.length >= LIMITE_PRIMEIRAS_DAMAS) {
        return interaction.update({
            components: containerTexto('Você atingiu o limite máximo de primeiras damas.'),
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    return interaction.update({
        components: [montarSelectAdicionarPD(painelId)],
        flags: [MessageFlags.IsComponentsV2]
    });
}

if (interaction.isStringSelectMenu() && interaction.customId.startsWith('pd_remover_')) {
    const painelId = interaction.customId.replace('pd_remover_', '');
    const temPermissao = interaction.member.roles.cache.has(CARGO_PD_PERMISSAO) || interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
    if (!temPermissao) {
        return interaction.reply({ content: 'Você não tem permissão para utilizar isso!', flags: [MessageFlags.Ephemeral] });
    }

    const alvoId = interaction.values[0];

    const { data: registros, error: erroDelete } = await supabase
    .from('primeira_dama')
    .delete()
    .eq('guild_id', interaction.guild.id)
    .eq('setter_id', interaction.user.id)
    .eq('target_id', alvoId)
    .select();
const registro = !erroDelete && registros && registros[0];
if (!registro) {
    return interaction.reply({ content: 'Esse registro não foi encontrado ou já foi removido.', flags: [MessageFlags.Ephemeral] });
}

const alvoMembro = await interaction.guild.members.fetch({ user: alvoId, force: true }).catch(() => null);

const { count: outrosRegistros } = await supabase
    .from('primeira_dama')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', interaction.guild.id)
    .eq('target_id', alvoId);
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
    await atualizarPainelPD(interaction, painelId, damasAtualizadas);

    if (!damasAtualizadas.length) {
        return interaction.update({
            components: containerTexto('Você não tem mais primeiras damas para remover.'),
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    return interaction.update({
        components: [await montarSelectRemoverPD(interaction.guild, damasAtualizadas, painelId)],
        flags: [MessageFlags.IsComponentsV2]
    });
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

    const valorSelecionado = interaction.values[0];

    if (valorSelecionado === 'editar') {
        draft.tipo = 'editar';
        await interaction.update({ components: [montarPainelMsgCriadorInicial(draft)], flags: [MessageFlags.IsComponentsV2] });

        const registros = await MensagemCriador.find({ autorId: interaction.user.id, guildId: interaction.guild.id })
            .sort({ criadoEm: -1 })
            .limit(25)
            .catch(() => []);

        if (!registros.length) {
            return interaction.followUp({
                components: containerTexto('Você ainda não criou nenhuma mensagem com este painel neste servidor.'),
                flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
            });
        }

        const tipoLabel = { v2: 'Components V2', embed: 'Embed', texto: 'Texto normal' };

        const containerSelecao = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **EDITAR MENSAGEM EXISTENTE**'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                'Selecione abaixo qual mensagem enviada por você deseja editar.'
            ))
            .addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('msgcriador_editar_select')
                        .setPlaceholder('Selecione a mensagem')
                        .addOptions(registros.map(r => {
                            const canal = interaction.guild.channels.cache.get(r.canalId);
                            const data = new Date(r.criadoEm).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
                            return {
                                label: `${tipoLabel[r.tipo] ?? r.tipo} — ${canal ? `#${canal.name}` : 'canal apagado'}`.slice(0, 100),
                                value: r._id,
                                description: `Criada em ${data}`.slice(0, 100)
                            };
                        }))
                )
            );

        return interaction.followUp({
            components: [containerSelecao],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }

    draft.tipo = valorSelecionado;
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

if (interaction.isStringSelectMenu() && interaction.customId === 'msgcriador_editar_select') {
    const messageId = interaction.values[0];

    const registro = await MensagemCriador.findById(messageId).catch(() => null);
    if (!registro || registro.autorId !== interaction.user.id) {
        return interaction.update({
            components: containerTexto('Essa mensagem não foi encontrada ou não pertence a você.'),
            flags: [MessageFlags.IsComponentsV2]
        });
    }

    const draft = {
        autorId: interaction.user.id,
        tipo: registro.tipo,
        canalId: registro.canalId,
        opcaoAtual: null,
        textoBruto: registro.textoBruto || '',
        embedTitulo: registro.embedTitulo || '',
        embedDescricao: registro.embedDescricao || '',
        embedFooter: registro.embedFooter || '',
        imagemUrl: registro.imagemUrl || null,
        cor: registro.cor || null,
        botoes: registro.botoes || [],
        editando: { messageId: registro._id, canalId: registro.canalId }
    };

    msgCriadorDB.set(interaction.message.id, draft);

    return interaction.update({
        components: [...montarPreviewMsgCriador(draft), montarPainelMsgCriadorBuilder(draft)],
        flags: [MessageFlags.IsComponentsV2]
    });
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

        // ---- Modo edição: dá edit() na mensagem existente ----
        if (draft.editando) {
            const msgAlvo = await canalDestino.messages.fetch(draft.editando.messageId).catch(() => null);
            if (!msgAlvo) {
                return interaction.followUp({
                    components: containerTexto('Não encontrei mais essa mensagem no canal (pode ter sido apagada).'),
                    flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
                });
            }

            try {
                await msgAlvo.edit(payload);
            } catch (err) {
                console.error('--- Erro ao editar mensagem do criador ---', err);
                return interaction.followUp({
                    components: containerTexto('Ocorreu um erro ao editar a mensagem. Verifique minhas permissões nesse canal.'),
                    flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
                });
            }

            await MensagemCriador.findByIdAndUpdate(draft.editando.messageId, {
                tipo: draft.tipo,
                textoBruto: draft.textoBruto,
                embedTitulo: draft.embedTitulo,
                embedDescricao: draft.embedDescricao,
                embedFooter: draft.embedFooter,
                imagemUrl: draft.imagemUrl,
                cor: draft.cor,
                botoes: draft.botoes,
                atualizadoEm: Date.now()
            }).catch(err => console.error('--- Erro ao atualizar registro da mensagem editada ---', err));

            if (draft.botoes?.length) {
                for (const botao of draft.botoes) {
                    if (botao.resposta && !botao.url && botao.id) {
                        await respostasBotoesMsg.definir(`${msgAlvo.id}_${botao.id}`, {
                            texto: botao.resposta,
                            tipo: botao.respostaTipo || 'texto'
                        });
                    }
                }
            }

            msgCriadorDB.delete(interaction.message.id);
            
            msgCriadorDB.delete(interaction.message.id);
            const timeoutAntigoEdit = msgCriadorTimeouts.get(interaction.message.id);
            if (timeoutAntigoEdit) clearTimeout(timeoutAntigoEdit);
            msgCriadorTimeouts.delete(interaction.message.id);

            return interaction.editReply({
                components: containerTexto(`Mensagem editada com sucesso em ${canalDestino}!`),
                flags: [MessageFlags.IsComponentsV2]
            });
        }

        // ---- Modo normal: envia mensagem nova ----
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

        await MensagemCriador.create({
            _id: msgEnviada.id,
            guildId: interaction.guild.id,
            canalId: canalDestino.id,
            autorId: draft.autorId,
            tipo: draft.tipo,
            textoBruto: draft.textoBruto,
            embedTitulo: draft.embedTitulo,
            embedDescricao: draft.embedDescricao,
            embedFooter: draft.embedFooter,
            imagemUrl: draft.imagemUrl,
            cor: draft.cor,
            botoes: draft.botoes
        }).catch(err => console.error('--- Erro ao salvar registro da mensagem criada ---', err));

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
        
        msgCriadorDB.delete(interaction.message.id);
        const timeoutAntigoEnvio = msgCriadorTimeouts.get(interaction.message.id);
        if (timeoutAntigoEnvio) clearTimeout(timeoutAntigoEnvio);
        msgCriadorTimeouts.delete(interaction.message.id);

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
        .setEmoji('1548555551514951801')
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
        painelMessageId: null,
        membrosAdicionados: []
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
