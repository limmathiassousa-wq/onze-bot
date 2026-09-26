const {
    SlashCommandBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
    MediaGalleryBuilder, MediaGalleryItemBuilder, ActionRowBuilder, ButtonBuilder,
    ButtonStyle, UserSelectMenuBuilder, StringSelectMenuBuilder, ChannelSelectMenuBuilder,
    ChannelType, ThumbnailBuilder, SectionBuilder, MessageFlags, EmbedBuilder, Collection
} = require('discord.js');
const { getVoiceConnection } = require('@discordjs/voice');

const redis = require('./redis');
const { supabase } = require('./supabase');
const {
    CARGOS_ATENDENTE, CARGO_PD_PERMISSAO, CARGO_PRIMEIRA_DAMA, LIMITE_PRIMEIRAS_DAMAS,
    USUARIOS_BLOQUEADOS_EDICAO, COOLDOWN_DAILY_MS, MOEDAS_DAILY, CARGO_MUTADO,
    CARGO_BLOQUEADO_MODERACAO, CANAL_LOGS_KICKS
} = require('./constants');
const { ConviteStats } = require('./models');
const { botCallDB, botCallPaineis, confirmacaoModeracaoDB, msgCriadorDB, sorteioDraftDB, muteDraftDB} = require('./state');
const {
    esperar, containerTexto, comRetry, xpNecessario,
    montarPainelConfirmacaoModeracao,
    getSaldo, somarSaldo, getXP, setXP, getMensagens, setMensagens
} = require('./helpers');

const { logar, enviarSucessoModeracao, COR_EMBED } = require('./logger');
const { tocarMusica } = require('./music');

// ============ PAINÉIS USADOS POR COMANDOS (e reaproveitados em botões no index.js) ============

function montarCardConvite(alvo, stats) {
    const validos = stats.reais + stats.bonus;
    const avatarUrl = alvo.displayAvatarURL({ extension: 'png', size: 256 });

    return new ContainerBuilder()
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## Convites - ${alvo.username}`))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${validos}** convites válidos`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `・Reais · **${stats.reais}**\n・Saíram · **${stats.saiu}**\n・Fake (conta nova) · **${stats.fake}**\n・Bônus (admin) · **${stats.bonus}**`
        ));
}

async function obterConviteStats(guildId, userId) {
    const doc = await ConviteStats.findOne({ guildId, userId });
    return doc || { reais: 0, saiu: 0, fake: 0, bonus: 0 };
}

function montarPainelBotCall(guildId) {
    const dados = botCallDB.get(guildId) || { canalId: null, conectado: false };
    const conexaoReal = getVoiceConnection(guildId);
    const conectado = !!conexaoReal;

    if (dados.conectado !== conectado) {
        dados.conectado = conectado;
        botCallDB.set(guildId, dados);
    }

    const canalTexto = dados.canalId ? `<#${dados.canalId}>` : 'nenhum';
    const statusTexto = conectado ? 'conectado' : 'desconectado';

    const botoes = conectado
        ? [
            new ButtonBuilder().setCustomId('botcall_trocar').setLabel('Call').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('botcall_desconectar').setLabel('Desconectar').setStyle(ButtonStyle.Danger)
        ]
        : [new ButtonBuilder().setCustomId('botcall_conectar').setLabel('Conectar').setStyle(ButtonStyle.Success)];

    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Sistema de call do bot**'))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Canal selecionado:** ${canalTexto}\n**Status:** ${statusTexto}`))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(new ActionRowBuilder().addComponents(botoes));
}

async function registrarPainelBotCall(guildId, channelId, messageId) {
    botCallPaineis.set(guildId, { channelId, messageId });
    try {
        const { error } = await supabase
            .from('bot_call_painel')
            .upsert({ guild_id: guildId, channel_id: channelId, message_id: messageId });
        if (error) throw error;
    } catch (err) {
        console.error('--- Erro ao salvar painel de botcall ---', err);
    }
}

function montarPainelMuteInicial(draft) {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### Mutar usuário\n-# <@${draft.alvoId}>`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Mutar** \`timeout nativo\`\n**Mutar por cargo** \`5 minutos, cargos voltam sozinhos\``
        ))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('mute_modo_timeout').setLabel('Mutar').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('mute_modo_cargo').setLabel('Mutar por cargo').setStyle(ButtonStyle.Secondary)
            )
        );
}

function montarPainelMuteTimeout(draft) {
    const configCompleta = !!draft.duracaoMs;
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### Mutar · Timeout\n-# <@${draft.alvoId}>`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Tempo** \`${draft.duracaoTexto || 'não definido'}\`\n` +
            `**Motivo** ${draft.motivo ? draft.motivo : '`não informado`'}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('mute_voltar').setLabel('Voltar').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('mute_timeout_tempo').setLabel('Tempo').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('mute_timeout_motivo').setLabel('Motivo').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('mute_timeout_confirmar').setLabel('Confirmar').setStyle(ButtonStyle.Success).setDisabled(!configCompleta)
            )
        );
}

function montarPainelMuteCargo(draft) {
    return new ContainerBuilder()
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `### Mutar · Por cargo\n-# <@${draft.alvoId}>`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `**Cargo** <@&${CARGO_MUTADO}> \`5 minutos\`\n` +
            `**Motivo** ${draft.motivo ? draft.motivo : '`não informado`'}`
        ))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('mute_voltar').setLabel('Voltar').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('mute_cargo_motivo').setLabel('Motivo').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('mute_cargo_aplicar').setLabel('Mutar').setStyle(ButtonStyle.Danger)
            )
        );
}

async function obterPrimeirasDamas(guildId, setterId) {
    const { data, error } = await supabase
        .from('primeira_dama')
        .select('*')
        .eq('guild_id', guildId)
        .eq('setter_id', setterId)
        .order('criado_em', { ascending: true });
    if (error) {
        console.error('--- Erro ao obter primeiras damas ---', error);
        return [];
    }
    return data.map(d => ({
        guildId: d.guild_id,
        setterId: d.setter_id,
        targetId: d.target_id,
        criadoEm: d.criado_em
    }));
}

// Painel público do {PREFIXO}pd (estilo: título, lista, dica e botões Adicionar / Remover)
function montarPainelPD(guild, damas, dono) {
    const lista = damas.length
        ? damas.map(d => `<@${d.targetId}>`).join('\n')
        : '*Nenhuma primeira dama definida.*';

    const texto = [
        '## Primeira Dama',
        `**Primeira Dama (${damas.length}/${LIMITE_PRIMEIRAS_DAMAS}):**`,
        lista,
        '',
        'Use os botões abaixo para adicionar ou remover.'
    ].join('\n');

    return new ContainerBuilder()
        .setAccentColor(COR_EMBED)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(texto))
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(dono.displayAvatarURL({ extension: 'png', size: 256 })))
        )
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`pd_btn_adicionar_${dono.id}`)
                    .setLabel('Adicionar')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(damas.length >= LIMITE_PRIMEIRAS_DAMAS),
                new ButtonBuilder()
                    .setCustomId(`pd_btn_remover_${dono.id}`)
                    .setLabel('Remover')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(damas.length === 0)
            )
        );
}

// Mensagem efêmera do botão "Adicionar": só o select menu, sem texto
function montarSelectAdicionarPD(painelId) {
    return new ContainerBuilder().addActionRowComponents(
        new ActionRowBuilder().addComponents(
            new UserSelectMenuBuilder()
                .setCustomId(`pd_selecionar_${painelId}`)
                .setPlaceholder('Selecione sua primeira dama')
                .setMinValues(1)
                .setMaxValues(1)
        )
    );
}

// Mensagem efêmera do botão "Remover": select menu de string (lista só quem já é PD), sem texto
async function montarSelectRemoverPD(guild, damas, painelId) {
    const options = await Promise.all(damas.map(async d => {
        const membro = guild.members.cache.get(d.targetId)
            ?? await guild.members.fetch({ user: d.targetId }).catch(() => null);
        return {
            label: membro ? membro.displayName.slice(0, 100) : 'Usuário desconhecido',
            description: membro ? `@${membro.user.username} • ${d.targetId}`.slice(0, 100) : d.targetId,
            value: d.targetId
        };
    }));

    return new ContainerBuilder()
        .setAccentColor(COR_EMBED)
        .addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`pd_remover_${painelId}`)
                    .setPlaceholder('Selecione quem deseja remover')
                    .addOptions(options)
            )
        );
}

// Atualiza a mensagem pública do painel depois de adicionar/remover
async function atualizarPainelPD(interaction, painelId, damas) {
    const msg = await interaction.channel.messages.fetch(painelId).catch(() => null);
    if (!msg) return;
    await msg.edit({
        components: [montarPainelPD(interaction.guild, damas, interaction.user)],
        flags: [MessageFlags.IsComponentsV2],
        allowedMentions: { parse: [] }
    }).catch(err => console.error('--- Erro ao atualizar painel PD ---', err));
}

// ============ COMANDOS ============
const comandos = new Collection();

function registrar(data, execute) {
    comandos.set(data.name, { data, execute });
}

registrar(
    new SlashCommandBuilder().setName('play').setDescription('Toca uma música (nome, link do YouTube ou link do Spotify)')
        .addStringOption(o => o.setName('busca').setDescription('Nome da música, link do YouTube ou do Spotify').setRequired(true)),
    async (interaction) => {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2] });
        const query = interaction.options.getString('busca');
        return tocarMusica(interaction, query);
    }
);

registrar(
    new SlashCommandBuilder().setName('avatar').setDescription('Mostra o seu avatar')
        .addUserOption(o => o.setName('usuario').setDescription('Mostra o avatar de um usuário selecionado').setRequired(false)),
    async (interaction) => {
        const alvo = interaction.options.getUser('usuario') || interaction.user;
        const avatarUrl = alvo.displayAvatarURL({ extension: 'png', size: 4096, forceStatic: false });

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(` **Avatar - ${alvo.username}**`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(avatarUrl)))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(` ID: ${alvo.id}`))
            .addActionRowComponents(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Ver no navegador').setStyle(ButtonStyle.Link).setURL(avatarUrl)
            ));

        return interaction.reply({ components: [container], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }
);

registrar(
    new SlashCommandBuilder().setName('afk').setDescription('Define seu status como ausente (AFK)')
        .addStringOption(o => o.setName('motivo').setDescription('Motivo da sua ausência').setRequired(false)),
    async (interaction) => {
        const motivo = interaction.options.getString('motivo') || 'Não informado';
        await redis.set(`afk:${interaction.user.id}`, JSON.stringify({ motivo, desde: Date.now() }));
        return interaction.reply({
            content: `${interaction.user}, seu **AFK** foi setado: \`${motivo}\``,
            allowedMentions: { users: [] }
        });
    }
);

registrar(
    new SlashCommandBuilder().setName('ban').setDescription('Bane um usuário do servidor')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário a ser banido').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo do banimento').setRequired(false))
        .addIntegerOption(o => o.setName('dias_mensagens').setDescription('Dias de mensagens do usuário a apagar (0 a 7)').setRequired(false).setMinValue(0).setMaxValue(7)),
    async (interaction) => {
        if (interaction.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
            return interaction.reply({ content: 'Você não tem permissão para banir membros!', flags: [MessageFlags.Ephemeral] });
        }
        if (!interaction.member.permissions.has('BanMembers') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
            return interaction.reply({ content: 'Você não tem permissão para banir membros!', flags: [MessageFlags.Ephemeral] });
        }

        const alvo = interaction.options.getUser('usuario');
        const motivo = interaction.options.getString('motivo');
        const diasMensagens = interaction.options.getInteger('dias_mensagens') || 0;

        if (alvo.id === interaction.user.id) return interaction.reply({ content: 'Você não pode se banir!', flags: [MessageFlags.Ephemeral] });
        if (alvo.id === interaction.client.user.id) return interaction.reply({ content: 'Eu não posso me banir!', flags: [MessageFlags.Ephemeral] });

        const membroAlvo = await interaction.guild.members.fetch({ user: alvo.id, force: true }).catch(() => null);
        if (membroAlvo && !membroAlvo.bannable) {
            return interaction.reply({ content: 'Não consigo banir esse usuário. Verifique a hierarquia de cargos.', flags: [MessageFlags.Ephemeral] });
        }

        const container = montarPainelConfirmacaoModeracao('ban', `${alvo}`, alvo.tag, motivo);
        const msgConfirmacao = await interaction.reply({
            components: [container], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral], fetchReply: true
        });

        confirmacaoModeracaoDB.set(msgConfirmacao.id, {
            tipo: 'ban', autorId: interaction.user.id, alvoId: alvo.id, alvoTag: alvo.tag, motivo, diasMensagens
        });
        setTimeout(() => confirmacaoModeracaoDB.delete(msgConfirmacao.id), 2 * 60 * 1000);
    }
);

registrar(
    new SlashCommandBuilder().setName('unban').setDescription('Remove o banimento de um usuário')
        .addStringOption(o => o.setName('usuario_id').setDescription('ID do usuário banido').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo do desbanimento').setRequired(false)),
    async (interaction) => {
        if (interaction.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
            return interaction.reply({ content: 'Você não tem permissão para desbanir membros!', flags: [MessageFlags.Ephemeral] });
        }
        if (!interaction.member.permissions.has('BanMembers') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
            return interaction.reply({ content: 'Você não tem permissão para desbanir membros!', flags: [MessageFlags.Ephemeral] });
        }

        const usuarioId = interaction.options.getString('usuario_id');
        const motivo = interaction.options.getString('motivo');

        const banido = await interaction.guild.bans.fetch({ user: usuarioId, force: true }).catch(() => null);
        if (!banido) return interaction.reply({ content: 'Esse usuário não está banido, ou o ID é inválido.', flags: [MessageFlags.Ephemeral] });

        const container = montarPainelConfirmacaoModeracao('unban', `<@${usuarioId}>`, banido.user.tag, motivo);
        const msgConfirmacao = await interaction.reply({
            components: [container], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral], fetchReply: true
        });

        confirmacaoModeracaoDB.set(msgConfirmacao.id, {
            tipo: 'unban', autorId: interaction.user.id, alvoId: usuarioId, alvoTag: banido.user.tag, motivo
        });
        setTimeout(() => confirmacaoModeracaoDB.delete(msgConfirmacao.id), 2 * 60 * 1000);
    }
);

registrar(
    new SlashCommandBuilder().setName('kick').setDescription('Expulsa um usuário do servidor')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário a ser expulso').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo da expulsão').setRequired(false)),
    async (interaction) => {
        if (interaction.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
            return interaction.reply({ content: 'Você não tem permissão para expulsar membros!', flags: [MessageFlags.Ephemeral] });
        }
        if (!interaction.member.permissions.has('KickMembers') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
            return interaction.reply({ content: 'Você não tem permissão para expulsar membros!', flags: [MessageFlags.Ephemeral] });
        }

        const alvo = interaction.options.getUser('usuario');
        const motivo = interaction.options.getString('motivo');

        if (alvo.id === interaction.user.id) return interaction.reply({ content: 'Você não pode se expulsar!', flags: [MessageFlags.Ephemeral] });

        const membroAlvo = await interaction.guild.members.fetch({ user: alvo.id, force: true }).catch(() => null);
        if (!membroAlvo) return interaction.reply({ content: 'Esse usuário não está no servidor.', flags: [MessageFlags.Ephemeral] });
        if (!membroAlvo.kickable) return interaction.reply({ content: 'Não consigo expulsar esse usuário. Verifique a hierarquia de cargos.', flags: [MessageFlags.Ephemeral] });

        try {
            await membroAlvo.kick(motivo || 'Não informado');
        } catch (err) {
            console.error('--- Erro ao expulsar ---', err);
            return interaction.reply({ content: 'Ocorreu um erro ao expulsar esse usuário.', flags: [MessageFlags.Ephemeral] });
        }

        await logar('EXPULSÃO', `${alvo} (${alvo.tag})`, interaction.user, {
                guild: interaction.guild, alvoUser: alvo, motivo, canalId: CANAL_LOGS_KICKS
        });

        enviarSucessoModeracao(interaction.channel, {
            tipo: 'kick', alvoId: alvo.id, alvoTag: alvo.tag, alvoUser: alvo,
            autor: interaction.user, motivo
        });

        return interaction.reply({ content: `${alvo.tag} foi expulso com sucesso!`, flags: [MessageFlags.Ephemeral] });
    }
);

registrar(
    new SlashCommandBuilder().setName('mute').setDescription('Abre o painel de mute de um usuário')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário a ser mutado').setRequired(true)),
    async (interaction) => {
        if (interaction.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
            return interaction.reply({ content: 'Você não tem permissão para silenciar membros!', flags: [MessageFlags.Ephemeral] });
        }
        const temPermissao = interaction.member.permissions.has('ModerateMembers') || interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
        if (!temPermissao) return interaction.reply({ content: 'Você não tem permissão para silenciar membros!', flags: [MessageFlags.Ephemeral] });

        const alvo = interaction.options.getUser('usuario');
        if (alvo.id === interaction.user.id) return interaction.reply({ content: 'Você não pode se mutar!', flags: [MessageFlags.Ephemeral] });
        if (alvo.bot) return interaction.reply({ content: 'Você não pode mutar um bot!', flags: [MessageFlags.Ephemeral] });

        const membroAlvo = await interaction.guild.members.fetch({ user: alvo.id, force: true }).catch(() => null);
        if (!membroAlvo) return interaction.reply({ content: 'Esse usuário não está no servidor.', flags: [MessageFlags.Ephemeral] });

        const draft = { autorId: interaction.user.id, alvoId: alvo.id, modo: null, duracaoTexto: null, duracaoMs: null, motivo: null };

        const msgPainel = await interaction.reply({
            components: [montarPainelMuteInicial(draft)],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
            fetchReply: true
        });

        muteDraftDB.set(msgPainel.id, draft);
    }
);

registrar(
    new SlashCommandBuilder().setName('unmute').setDescription('Remove o silenciamento (timeout) de um usuário')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário a ter o mute removido').setRequired(true))
        .addStringOption(o => o.setName('motivo').setDescription('Motivo da remoção do mute').setRequired(false)),
    async (interaction) => {
        if (interaction.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
            return interaction.reply({ content: 'Você não tem permissão para remover o silenciamento!', flags: [MessageFlags.Ephemeral] });
        }
        if (!interaction.member.permissions.has('ModerateMembers') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
            return interaction.reply({ content: 'Você não tem permissão para remover o silenciamento!', flags: [MessageFlags.Ephemeral] });
        }

        const alvo = interaction.options.getUser('usuario');
        const motivo = interaction.options.getString('motivo');

        const membroAlvo = await interaction.guild.members.fetch({ user: alvo.id, force: true }).catch(() => null);
        if (!membroAlvo) return interaction.reply({ content: 'Esse usuário não está no servidor.', flags: [MessageFlags.Ephemeral] });
        if (!membroAlvo.communicationDisabledUntil) return interaction.reply({ content: 'Esse usuário não está silenciado.', flags: [MessageFlags.Ephemeral] });

        try {
            await membroAlvo.timeout(null, motivo || 'Não informado');
        } catch (err) {
            console.error('--- Erro ao remover mute ---', err);
            return interaction.reply({ content: 'Ocorreu um erro ao remover o silenciamento.', flags: [MessageFlags.Ephemeral] });
        }

        await logar('UNMUTE', `${alvo} (${alvo.tag})`, interaction.user, {
                 guild: interaction.guild, alvoUser: alvo, motivo
        });

        enviarSucessoModeracao(interaction.channel, {
            tipo: 'unmute', alvoId: alvo.id, alvoTag: alvo.tag, alvoUser: alvo,
            autor: interaction.user, motivo
        });

        return interaction.reply({ content: `O silenciamento de ${alvo.tag} foi removido!`, flags: [MessageFlags.Ephemeral] });
    }
);

registrar(
    new SlashCommandBuilder().setName('convite').setDescription('Mostra as estatísticas de convites de um usuário')
        .addUserOption(o => o.setName('usuario').setDescription('Veja os convites de outro usuário').setRequired(false)),
    async (interaction) => {
        const alvo = interaction.options.getUser('usuario') || interaction.user;
        if (alvo.bot) return interaction.reply({ content: 'Bots não possuem convites!', flags: [MessageFlags.Ephemeral] });

        const stats = await obterConviteStats(interaction.guild.id, alvo.id);
        return interaction.reply({
            components: [montarCardConvite(alvo, stats)],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral]
        });
    }
);

registrar(
    new SlashCommandBuilder().setName('carteira').setDescription('Mostra sua carteira de moedas ou a de outro usuário')
        .addUserOption(o => o.setName('usuario').setDescription('veja a carteira de outros usuários').setRequired(false)),
    async (interaction) => {
        const alvo = interaction.options.getUser('usuario') || interaction.user;
        if (alvo.bot) return interaction.reply({ content: 'Bots não possuem carteira!', flags: [MessageFlags.Ephemeral] });

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
            new ButtonBuilder().setCustomId(`carteira_atualizar_${interaction.user.id}_${alvo.id}`).setEmoji('1548555551514951801').setStyle(ButtonStyle.Secondary)
        ];
        if (ehPropriaCarteira) {
            botoes.push(new ButtonBuilder().setCustomId(`daily_${interaction.user.id}`).setLabel('Daily').setStyle(ButtonStyle.Success));
        }
        container.addActionRowComponents(new ActionRowBuilder().addComponents(botoes));

        return interaction.reply({ components: [container], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }
);

registrar(
    new SlashCommandBuilder().setName('pix').setDescription('Transfere moedas para outro usuário')
        .addUserOption(o => o.setName('usuario').setDescription('Usuário que vai receber as moedas').setRequired(true))
        .addIntegerOption(o => o.setName('quantidade').setDescription('Quantidade de moedas a transferir').setRequired(true).setMinValue(1)),
    async (interaction) => {
        const alvo = interaction.options.getUser('usuario');
        const quantidade = interaction.options.getInteger('quantidade');

        if (alvo.id === interaction.user.id) return interaction.reply({ content: 'Você não pode transferir moedas para si mesmo!', flags: [MessageFlags.Ephemeral] });
        if (alvo.bot) return interaction.reply({ content: 'Você não pode transferir moedas para bots!', flags: [MessageFlags.Ephemeral] });

        const saldoAtual = await getSaldo(interaction.user.id);
        if (saldoAtual < quantidade) {
            return interaction.reply({ content: `Saldo insuficiente! Você tem apenas **${saldoAtual}** moedas.`, flags: [MessageFlags.Ephemeral] });
        }

        await somarSaldo(interaction.user.id, -quantidade);
        await somarSaldo(alvo.id, quantidade);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **PIX enviado!**'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**De:** ${interaction.user}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Para:** ${alvo}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Quantidade:** \`${quantidade}\` moedas`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Sua carteira atual:** \`${saldoAtual - quantidade}\``));

        return interaction.reply({ components: [container], flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral] });
    }
);

registrar(
    new SlashCommandBuilder().setName('limpar').setDescription('Deleta uma quantidade de mensagens do canal')
        .addIntegerOption(o => o.setName('quantidade').setDescription('Número de mensagens a serem apagadas (1 a 300)').setRequired(true).setMinValue(1).setMaxValue(300)),
    async (interaction) => {
        if (interaction.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
            return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
        }
        if (!interaction.member.permissions.has('ManageMessages') && !interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id))) {
            return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
        }

        const quantidade = interaction.options.getInteger('quantidade');
        const inicioUnix = Math.floor(Date.now() / 1000);
        let deletadas = 0;

        function montarPainelLimpeza(finalizado = false) {
            return new ContainerBuilder()
                .setAccentColor(0x000000)
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    finalizado
                        ? '### <:check:1548558822711365702> Limpeza concluída'
                        : '### <a:cerregando2:1548558592133824562> Limpando canal...'
                ))
                .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
                .addTextDisplayComponents(new TextDisplayBuilder().setContent(
                    `**Progresso:** \`${deletadas}/${quantidade}\`\n` +
                    `**Iniciado:** <t:${inicioUnix}:R>${finalizado ? `\n**Por:** ${interaction.user}` : ''}`
                ));
        }

        await interaction.reply({ components: [montarPainelLimpeza(false)], flags: [MessageFlags.IsComponentsV2] });
        const replyMsg = await interaction.fetchReply();

        while (deletadas < quantidade) {
            const mensagens = await interaction.channel.messages.fetch({ limit: 5 }).catch(() => null);
            const msg = mensagens?.find(m => m.id !== replyMsg.id);
            if (!msg) break;

            const apagou = await msg.delete().then(() => true).catch(() => false);
            if (!apagou) break;

            deletadas++;

            if (deletadas % 5 === 0 || deletadas === quantidade) {
                await interaction.editReply({
                    components: [montarPainelLimpeza(false)],
                    flags: [MessageFlags.IsComponentsV2]
                }).catch(() => null);
            }

            await esperar(350);
        }

        return interaction.editReply({
            components: [montarPainelLimpeza(true)],
            flags: [MessageFlags.IsComponentsV2]
        });
    }
);

registrar(
    new SlashCommandBuilder()
        .setName('addemoji')
        .setDescription('Adiciona um emoji de outro servidor neste servidor')
        .addStringOption(o =>
            o.setName('emoji')
                .setDescription('Cole o emoji customizado que você quer adicionar')
                .setRequired(true)
        )
        .addStringOption(o =>
            o.setName('nome')
                .setDescription('Nome do emoji (opcional)')
                .setRequired(false)
        ),
    async (interaction) => {
        if (interaction.member.roles.cache.has(CARGO_BLOQUEADO_MODERACAO)) {
            return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
        }
        const temPermissao = interaction.member.permissions.has('Administrator') || interaction.member.roles.cache.some(r => CARGOS_ATENDENTE.includes(r.id));
        if (!temPermissao) {
            return interaction.reply({ content: 'Você não tem permissão para utilizar este comando!', flags: [MessageFlags.Ephemeral] });
        }

        const entrada = interaction.options.getString('emoji').trim();
        const nomeInformado = interaction.options.getString('nome');

        const matchCompleto = entrada.match(/<(a)?:(\w{2,32}):(\d+)>/);
        const matchApenasId = entrada.match(/^\d{15,25}$/);

        let emojiId, nomeOriginal, animadoConhecido;

        if (matchCompleto) {
            [, , nomeOriginal, emojiId] = matchCompleto;
            animadoConhecido = !!matchCompleto[1];
        } else if (matchApenasId) {
            emojiId = matchApenasId[0];
            nomeOriginal = null;
            animadoConhecido = null;
        } else {
            return interaction.reply({
                content: 'Envie um emoji customizado válido (colando ele normalmente) ou apenas o ID numérico do emoji.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        const nomeFinal = (nomeInformado || nomeOriginal || 'emoji').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 32) || 'emoji';

        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        async function tentarCriar(extensao) {
            return interaction.guild.emojis.create({
                attachment: `https://cdn.discordapp.com/emojis/${emojiId}.${extensao}`,
                name: nomeFinal,
                reason: `Emoji adicionado por ${interaction.user.tag}`
            });
        }

        let emojiCriado;
        try {
            if (animadoConhecido === true) {
                emojiCriado = await tentarCriar('gif');
            } else if (animadoConhecido === false) {
                emojiCriado = await tentarCriar('png');
            } else {
                try {
                    emojiCriado = await tentarCriar('png');
                } catch {
                    emojiCriado = await tentarCriar('gif');
                }
            }
        } catch (err) {
            console.error('--- Erro ao adicionar emoji ---', err);
            let motivoErro = 'Não consegui adicionar esse emoji. Verifique se o ID/emoji está correto.';
            if (err.code === 30008) motivoErro = 'O servidor já atingiu o limite máximo de emojis.';
            else if (err.code === 50035) motivoErro = 'Nome inválido ou imagem muito grande/inacessível.';
            return interaction.editReply({ content: motivoErro });
        }

        const container = new ContainerBuilder()
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(' **EMOJI ADICIONADO**'))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Emoji:** ${emojiCriado} \`:${emojiCriado.name}:\``))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Adicionado por:** ${interaction.user}`));

        return interaction.editReply({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });
    }
);


module.exports = { comandos, montarPainelBotCall, registrarPainelBotCall, montarPainelPD, montarSelectAdicionarPD, montarSelectRemoverPD, atualizarPainelPD, obterPrimeirasDamas, montarPainelMuteInicial, montarPainelMuteTimeout, montarPainelMuteCargo };