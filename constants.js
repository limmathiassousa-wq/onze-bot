// ============ CANAIS ============
const CATEGORIA_MOEDAS_BOASVINDAS = '1542321889782005981';
const CANAL_TELLONYM_MOD = '1542321891405070399';
const CANAL_TELLONYM = '1542321890058567742';
const CANAL_TICKETS = '1542321889404264482';
const CANAL_LOGS_MOD = '1542321891405070397';
const CANAL_LOGS_TICKETS = '1542321891405070398';
const CANAIS_INSTA = ['1542321889404264486'];
const CANAL_GERADOR_ID = '1542321890490847240';
const CANAL_LOGS_BANS = '1546306998411329577';
const CANAL_LOGS_MEMBROS = '1546308662476283925';
const CANAL_LOGS_CARGOS = '1546309022884302989';
const CANAL_LOGS_CALLTEMP = '1546310128159162450';
const CANAL_LOGS_KICKS = '1546332735591817336';
const CANAL_LOGS_AUTOMOD = '1542321891405070397';
const REACOES_ANEXO = {
    '1542321889782005988': '\<:angel:1542586836130730064>',
    '1542940391614054530': '\<:ring_girl:1542586297707790336>'
};

// ============ SORTEIO ============
const INTERVALO_TICK_CALL_SORTEIO_MS = 60 * 1000;

// ============ CRIADOR DE MENSAGENS/COR ============
const CORES_MSG_CRIADOR = [
    { label: 'Sem cor', value: 'nenhuma' },
    { label: 'Preto', value: '000000' },
    { label: 'Branco', value: 'FFFFFF' },
    { label: 'Vermelho', value: 'ED4245' },
    { label: 'Laranja', value: 'E67E22' },
    { label: 'Amarelo', value: 'FEE75C' },
    { label: 'Verde', value: '57F287' },
    { label: 'Azul', value: '5865F2' },
    { label: 'Roxo', value: '9B59B6' },
    { label: 'Rosa', value: 'EB459E' },
    { label: 'Cinza', value: '99AAB5' }
];
const CORES_BOTAO = [
    { label: 'Azul', value: 'primary' },
    { label: 'Cinza', value: 'secondary' },
    { label: 'Verde', value: 'success' },
    { label: 'Vermelho', value: 'danger' }
];
const POSICOES_BOTAO = [
    { label: 'Acima de tudo', value: 'cima' },
    { label: 'Entre texto e imagem', value: 'entre' },
    { label: 'Abaixo da imagem (padrão)', value: 'abaixo', default: true },
    { label: 'Fora do container', value: 'fora' }
];

// ============ CARGOS ============
const CARGOS_ATENDENTE = ['1542321888355684456', '1542321888309809212', '1542321888309809210', '1542321888355684455', '1542321888355684454'];
const CARGO_AUTOMATICO = '1542321888175456358';
const CARGO_LIMPAR = '1542321888234045547';
const CARGO_BOOSTER = '1543558502843162687';
const USUARIOS_BLOQUEADOS_EDICAO = ['1517503595673813175'];
const DURACAO_CARGO_LOJA_DIAS = 30;
const INTERVALO_CHECAGEM_CARGOS_LOJA_MS = 10 * 60 * 1000;
const IDADE_MINIMA_CONVITE_DIAS = 7;
const CARGO_PD_PERMISSAO = '1542321888309809203';
const CARGO_PRIMEIRA_DAMA = '1542321888234045540';
const LIMITE_PRIMEIRAS_DAMAS = 5;
const CARGO_BLOQUEADO_MODERACAO = '1542321888309809212';
const CARGOS_LOJA = [
    { id: '1542321888234045540', nome: 'cutie', preco: 1000, emoji: { id: '1542593118371717230' } },
    { id: '1542321888175456366', nome: 'f1', preco: 3000, emoji: { id: '1542586194217672845' } },
    { id: '1542321888175456365', nome: 'seeking', preco: 3500, emoji: { id: '1542592429742489671' } },
    { id: '1542321888175456364', nome: 'devil eyes', preco: 5000, emoji: { id: '1542589188803928144' } },
    { id: '1542321888175456363', nome: 'eternal', preco: 7000, emoji: { id: '1542593328753803367' } },
    { id: '1542321888175456362', nome: 'psycho', preco: 10000, emoji: { id: '1542590392271376445' } }
];
const CARGO_MUTADO = '1545230701534777375';

// ============ CARGOS DE BOOST ============
const CARGOS_BOOST = [
    '1542321888234045546',
    '1542321888234045547',
    '1542321888234045549',
    '1542321888234045548',
    '1542321888309809203'
];

// ============ EMOJIS ============
const EMOJI_CROW = '1542328746147713094';
const EMOJI_CURTIR = '<:19301:1542558769534210179>';
const EMOJI_COMENTAR = '<:19299:1542558309477916834>';
const EMOJI_INFO = '1542352044336353380';
const EMOJI_LIXEIRA = '1526757605916147742';
const EMOJI_INSTA_PERFIL = '<:19297:1542558010205806733>';
const EMOJI_ATIVADO = '<a:19007:1542333462013284382>';
const EMOJI_DESATIVADO = '<a:19008:1542333485040009348>';
const EMOJI_ATUALIZAR_PREVIEW = '1542334314694447266';
const EMOJI_VOLTAR_PAINEL = '1542334291269386300';

// ============ IMG ============
const IMG_MOEDAS = 'https://i.supaimg.com/001f5659-bb07-44c4-a79d-4338b59c3c1a/c8eb40b5-5256-42b9-98e0-8a92b11d12a2.jpg';
const IMG_DISCORD_LOGO = 'https://cdn.discordapp.com/embed/avatars/0.png';

// ============ ECONOMIA ============
const XP_MIN_POR_MENSAGEM = 8;
const XP_MAX_POR_MENSAGEM = 12;
const MOEDAS_POR_NIVEL = 200;
const TAXA_MOEDA_XP_EXTRA = 0.5;
const MOEDAS_DAILY = 150;
const COOLDOWN_DAILY_MS = 24 * 60 * 60 * 1000;

// ============ ANTLINK ============
const DOMINIOS_MUSICA_PERMITIDOS = [
    'youtube.com', 'youtu.be', 'music.youtube.com',
    'open.spotify.com', 'spotify.link',
    'soundcloud.com', 'on.soundcloud.com',
    'music.apple.com',
    'tidal.com', 'listen.tidal.com',
    'deezer.com', 'link.deezer.com',
    'music.amazon.com', 'music.amazon.com.br'
];
const DOMINIOS_IMAGEM_CONFIAVEIS = [
    'cdn.discordapp.com', 'media.discordapp.net',
    'tenor.com', 'giphy.com', 'imgur.com', 'i.imgur.com',
    'i.supaimg.com',
    'klipy.com', 'gifer.com', 'redgifs.com'
];
const BLACKLIST_DOMINIOS = [
    'dlscord.com', 'dis-cord.com', 'discorb.com', 'discrod.com',
    'steamcommunlty.com', 'steancommunity.com', 'steamcomunnity.com',
    'discord-nitro.com', 'discordnitro.gift', 'discordgift.site'
];
const DOMINIOS_CONVITE = ['discord.gg', 'dsc.gg', 'discord.new', 'discordapp.com'];
const EXTENSOES_IMAGEM = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];

// ============ CACHE ============
const CACHE_MEMBROS_MS = 60 * 1000;
const INTERVALO_LIMPEZA_INVITES_MS = 15 * 60 * 1000;

// ============ CATEGORIA STATUS SORTEIO ============
const CATEGORIA_STATUS_SORTEIO = '1542321890058567746';
const GIFS_BEIJO = [
    'https://i.imgur.com/wGDklK4.gif',
    'https://i.imgur.com/awUZtr7.gif',
    'https://i.imgur.com/6KkApNS.gif',
    'https://i.imgur.com/iHsHuw9.gif',
    'https://i.imgur.com/6ttqv5L.gif',
    'https://i.imgur.com/mTB1l98.gif',
    'https://i.imgur.com/Mq4tDjl.gif',
    'https://i.imgur.com/nmrth7R.gif',
    'https://i.imgur.com/6MNIMQK.gif',
    'https://i.imgur.com/nZ6au2T.gif',
    'https://i.imgur.com/rukMew3.gif',
    'https://i.imgur.com/YaDNJ12.gif',
    'https://i.imgur.com/1JvbXPU.gif',
    'https://i.imgur.com/PpVPq7Z.gif',
    'https://i.imgur.com/zDqQ9vl.gif',
    'https://i.imgur.com/w5tYTHn.gif',
    'https://i.imgur.com/1ne6ijb.gif',
    'https://i.imgur.com/A1ESg0o.gif'
];

module.exports = {
    EMOJI_ATIVADO, EMOJI_DESATIVADO,
    CANAL_TELLONYM_MOD, CANAL_TELLONYM, CANAL_TICKETS,
    GIFS_BEIJO,
    CANAL_LOGS_MOD, CANAL_LOGS_TICKETS, CATEGORIA_MOEDAS_BOASVINDAS,
CANAL_LOGS_AUTOMOD,
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
    CATEGORIA_STATUS_SORTEIO, CARGOS_BOOST, CARGO_MUTADO, CANAL_LOGS_BANS, CANAL_LOGS_MEMBROS, CANAL_LOGS_CARGOS, CANAL_LOGS_CALLTEMP, CANAL_LOGS_KICKS, CARGO_BLOQUEADO_MODERACAO
};
