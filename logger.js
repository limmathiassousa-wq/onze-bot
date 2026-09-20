const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const {
    CANAL_LOGS_MOD, CANAL_LOGS_BANS, CANAL_LOGS_MEMBROS, CANAL_LOGS_CARGOS,
    CANAL_LOGS_CALLTEMP, CANAL_LOGS_KICKS, CANAL_LOGS_AUTOMOD, IMG_DISCORD_LOGO,
    CANAL_LOGS_MENSAGENS, CANAL_LOGS_VOZ
} = require('./constants');

// Se CANAL_LOGS_MENSAGENS ainda não existir em constants.js, usa o ID fixo como fallback.
// (Recomendado: adicionar `CANAL_LOGS_MENSAGENS: '1548376183685783582'` em constants.js)
const CANAL_LOGS_MENSAGENS_ID = CANAL_LOGS_MENSAGENS || '1548376183685783582';

// Se CANAL_LOGS_VOZ ainda não existir em constants.js, usa o ID fixo como fallback.
// (Recomendado: adicionar `CANAL_LOGS_VOZ: '1548380755804029090'` em constants.js)
const CANAL_LOGS_VOZ_ID = CANAL_LOGS_VOZ || '1548380755804029090';

// ================================================================
// UTILITÁRIOS — só formatação, NÃO montam embed. Usados por todas
// as funções de log abaixo pra evitar duplicar essa lógica em cada
// uma, mas cada log continua responsável pela sua própria embed.
// ================================================================

// Funciona tanto com um User/GuildMember do discord.js quanto com
// um objeto bruto vindo direto do gateway (ex: pacotes 'raw').
function obterAvatarUrl(usuario) {
    if (!usuario) return IMG_DISCORD_LOGO;

    if (typeof usuario.displayAvatarURL === 'function') {
        return usuario.displayAvatarURL({ extension: 'png', size: 256 });
    }

    const id = usuario.id ?? null;
    if (!id) return IMG_DISCORD_LOGO;

    if (usuario.avatar) {
        const ext = usuario.avatar.startsWith('a_') ? 'gif' : 'png';
        return `https://cdn.discordapp.com/avatars/${id}/${usuario.avatar}.${ext}?size=256`;
    }

    // Avatar padrão do Discord (funciona pro sistema novo de username e pro antigo com discriminator)
    try {
        const indice = usuario.discriminator && usuario.discriminator !== '0'
            ? Number(usuario.discriminator) % 5
            : Number((BigInt(id) >> 22n) % 6n);
        return `https://cdn.discordapp.com/embed/avatars/${indice}.png`;
    } catch {
        return IMG_DISCORD_LOGO;
    }
}

// Tag "usuario#0000" ou "usuario" — funciona com User do discord.js ou objeto bruto.
function obterTag(usuario) {
    if (!usuario) return '?';
    if (usuario.tag) return usuario.tag;
    if (usuario.username) {
        return (usuario.discriminator && usuario.discriminator !== '0')
            ? `${usuario.username}#${usuario.discriminator}`
            : usuario.username;
    }
    return '?';
}

// Menção "<@id>" — funciona com User do discord.js ou objeto bruto.
function obterMencao(usuario) {
    if (!usuario?.id) return '`desconhecido`';
    return `<@${usuario.id}>`;
}

function obterDataHora() {
    const agora = new Date();
    return {
        hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' }),
        data: agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    };
}

// ================================================================
// MOTOR GENÉRICO — mantido só pra chamadas avulsas espalhadas pelo
// index.js que ainda usam enviarLogModeracao()/logar() diretamente
// pra casos sem função própria. Os logs nomeados abaixo (ban, kick,
// mute, cargo, etc) NÃO usam mais essa função — cada um monta e
// envia sua própria embed de forma independente.
// ================================================================
async function enviarLogModeracao({ guild, tipo, alvo, alvoUser, autor, motivo, extra, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_MOD).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(alvoUser);

        const camposPrincipais = [
            new TextDisplayBuilder().setContent(`### ${tipo} — ${guild.name}`),
            new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`)
        ];
        if (autor) {
            camposPrincipais.push(new TextDisplayBuilder().setContent(`**Executado por:** ${autor}`));
        }

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(...camposPrincipais)
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        if (motivo) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Motivo:** ${motivo}`));
        }

        if (extra) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extra));
        }

        if (motivo || extra) {
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        }

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(` ${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de moderação (genérico) ---', err);
    }
}

async function logar(tipo, alvo, autor, opcoes = {}) {
    if (!opcoes.guild) {
        console.error('--- logar() chamado sem "guild" nas opções ---', tipo);
        return;
    }

    return enviarLogModeracao({
        guild: opcoes.guild,
        tipo,
        alvo,
        alvoUser: opcoes.alvoUser || null,
        autor,
        motivo: opcoes.motivo || null,
        extra: opcoes.extra || null,
        canalId: opcoes.canalId || null
    });
}

// ============ BANIMENTO / UNBAN — EMBED PRÓPRIA ============
async function logarBanimento({ guild, tipo, alvo, alvoUser, autor, motivo, extra, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_BANS).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(alvoUser);

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${tipo} — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`),
                        new TextDisplayBuilder().setContent(`**Executado por:** ${autor}`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Motivo:** ${motivo || 'Não informado'}`));

        if (extra) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extra));
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de banimento/unban ---', err);
    }
}

// ============ ENTRADA / SAÍDA DE MEMBROS — EMBED PRÓPRIA (sem campo Executor) ============
async function logarMembro({ guild, tipo, membro, extra, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_MEMBROS).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(membro);
        const alvo = `${obterMencao(membro)} (${obterTag(membro)})`;

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${tipo} — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        if (extra) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extra));
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        }

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de entrada/saída de membro ---', err);
    }
}

// ============ EXPULSÃO (KICK) — EMBED PRÓPRIA ============
async function logarExpulsao({ guild, tipo, alvo, alvoUser, autor, motivo, extra, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_KICKS).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(alvoUser);

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${tipo || 'Expulsão (Kick)'} — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`),
                        new TextDisplayBuilder().setContent(`**Executado por:** ${autor}`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Motivo:** ${motivo || 'Não informado'}`));

        if (extra) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extra));
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de expulsão ---', err);
    }
}

// ============ MUTE / UNMUTE (TIMEOUT) — EMBED PRÓPRIA ============
async function logarMute({ guild, tipo, alvo, alvoUser, autor, motivo, extra, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_MOD).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(alvoUser);

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${tipo} — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`),
                        new TextDisplayBuilder().setContent(`**Executado por:** ${autor}`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        if (motivo) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Motivo:** ${motivo}`));
        }

        if (extra) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extra));
        }

        if (motivo || extra) {
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        }

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de mute/unmute ---', err);
    }
}

// ============ CARGOS (adicionado/removido de um membro) — EMBED PRÓPRIA ============
async function logarCargo({ guild, tipo, alvo, alvoUser, autor, cargo, extra, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_CARGOS).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(alvoUser);

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${tipo} — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`),
                        new TextDisplayBuilder().setContent(`**Executado por:** ${autor}`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        if (cargo) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Cargo:** ${cargo}`));
        }

        if (extra) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extra));
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de cargo ---', err);
    }
}

// ============ CALL TEMPORÁRIA — EMBED PRÓPRIA ============
async function logarCallTemp({ guild, acao, dono, canalVoz, alvo, extra, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_CALLTEMP).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(dono);

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### Call Temp — ${acao} — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${dono} (${obterTag(dono)})`),
                        new TextDisplayBuilder().setContent(`**Canal:** ${canalVoz}`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        if (alvo) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Alvo:** ${alvo}`));
        }

        if (extra) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extra));
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de call temporária ---', err);
    }
}

// ============ ANTI-LINK — EMBED PRÓPRIA ============
async function logarAntiLink({ guild, usuario, motivo, link, canal: canalOrigem, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_AUTOMOD).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(usuario);

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### Anti-Link — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${usuario} — \`${obterTag(usuario)}\` (\`${usuario?.id ?? '?'}\`)`),
                        new TextDisplayBuilder().setContent('**Executado por:** Sistema Automático')
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Motivo:** ${motivo}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Canal:** ${canalOrigem}\n**Link:** \`\`\`${link}\`\`\``))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de anti-link ---', err);
    }
}

// ============ ANTI-SPAM — EMBED PRÓPRIA ============
async function logarAntiSpam({ guild, usuario, motivo, canal: canalOrigem, muteMinutos, canalId, acao }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_AUTOMOD).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(usuario);

        const ehKick = acao === 'kick';
        const textoAcao = ehKick
            ? 'Mensagens apagadas + **expulsão** (bot detectado)'
            : `Mensagens apagadas + timeout de \`${muteMinutos}\` minuto(s)`;

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### Anti-Spam — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${usuario} — \`${obterTag(usuario)}\` (\`${usuario?.id ?? '?'}\`)${ehKick ? ' — **BOT**' : ''}`),
                        new TextDisplayBuilder().setContent('**Executado por:** Sistema Automático')
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Motivo:** ${motivo}`))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Canal:** ${canalOrigem}\n**Ação:** ${textoAcao}`))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de anti-spam ---', err);
    }
}

// ============ ANTI-BOT — EMBED PRÓPRIA ============
async function logarAntiBot({ guild, bot, acao, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_AUTOMOD).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(bot);

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### Anti-Bot — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${bot} — \`${obterTag(bot)}\` (\`${bot?.id ?? '?'}\`)`),
                        new TextDisplayBuilder().setContent('**Executado por:** Sistema Automático')
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Motivo:** Bot detectado ao entrar no servidor'))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Ação aplicada:** \`${acao === 'banir' ? 'banido' : 'expulso'}\``))
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de anti-bot ---', err);
    }
}

// ============ MENSAGEM APAGADA — EMBED PRÓPRIA ============
async function logarMensagemApagada({ guild, autor, canal, executor, mensagemId, conteudo, canalId }) {
    try {
        const canalLogs = await guild.channels.fetch(canalId || CANAL_LOGS_MENSAGENS_ID).catch(() => null);
        if (!canalLogs) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(autor);

        const conteudoFinal = conteudo && conteudo.trim().length > 0
            ? conteudo.slice(0, 3500)
            : '`Sem conteúdo de texto (anexo, embed ou sticker)`';

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('### Mensagem apagada'),
                        new TextDisplayBuilder().setContent(`**Autor:** ${autor ?? '\`desconhecido\`'} — \`${obterTag(autor)}\` (\`${autor?.id ?? '?'}\`)`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Canal:** ${canal} — \`${canal.name}\` (\`${canal.id}\`)`),
                new TextDisplayBuilder().setContent(`**Executor:** ${executor}`),
                new TextDisplayBuilder().setContent(`**Mensagem ID:** \`${mensagemId}\``)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('**Conteúdo**'),
                new TextDisplayBuilder().setContent(`\`\`\`\n${conteudoFinal}\n\`\`\``)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canalLogs.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de mensagem apagada ---', err);
    }
}

// ============ MENSAGEM EDITADA — EMBED PRÓPRIA ============
async function logarMensagemEditada({ guild, autor, canal, mensagemId, antes, depois, antesIndisponivel, url, canalId }) {
    try {
        const canalLogs = await guild.channels.fetch(canalId || CANAL_LOGS_MENSAGENS_ID).catch(() => null);
        if (!canalLogs) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(autor);

        const antesFinal = antesIndisponivel
            ? '`Não disponível (mensagem enviada antes do bot reiniciar/cachear)`'
            : (antes && antes.trim().length > 0 ? antes.slice(0, 1500) : '`Sem conteúdo de texto`');
        const depoisFinal = depois && depois.trim().length > 0 ? depois.slice(0, 1500) : '`Sem conteúdo de texto`';

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent('### Mensagem editada'),
                        new TextDisplayBuilder().setContent(`**Autor:** ${autor} — \`${obterTag(autor)}\` (\`${autor?.id ?? '?'}\`)`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`**Canal:** ${canal} — \`${canal.name}\` (\`${canal.id}\`)`),
                new TextDisplayBuilder().setContent(`**Mensagem ID:** \`${mensagemId}\``)
            );

        if (url) {
            container.addActionRowComponents(
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Abrir mensagem').setStyle(ButtonStyle.Link).setURL(url)
                )
            );
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('**Antes**'),
                new TextDisplayBuilder().setContent(`\`\`\`\n${antesFinal}\n\`\`\``)
            )
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent('**Depois**'),
                new TextDisplayBuilder().setContent(`\`\`\`\n${depoisFinal}\n\`\`\``)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canalLogs.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de mensagem editada ---', err);
    }
}

// ============ LOGS DE VOZ — EMBED PRÓPRIA ============
async function logarVoz({ guild, tipo, membro, extra, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_VOZ_ID).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(membro);

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### Voz — ${tipo} — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${membro} — \`${obterTag(membro)}\` (\`${membro?.id ?? '?'}\`)`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        if (extra) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extra));
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        }

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de voz ---', err);
    }
}

// ============ CASTIGO MANUAL (TIMEOUT FORA DE COMANDO) — EMBED PRÓPRIA ============
async function logarCastigo({ guild, tipo, alvo, alvoUser, autor, motivo, duracao, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_MOD).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const avatarUrl = obterAvatarUrl(alvoUser);

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${tipo} — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${alvo}`),
                        new TextDisplayBuilder().setContent(`**Executado por:** ${autor}`)
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Motivo:** ${motivo || 'Não informado'}`));

        if (duracao) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Duração:** \`${duracao}\``));
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de castigo manual ---', err);
    }
}

// ============ CARGO DO SERVIDOR CRIADO / EXCLUÍDO — EMBED PRÓPRIA ============
async function logarCargoServidor({ guild, tipo, cargo, executor, motivo, extra, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_CARGOS).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${tipo} — ${guild.name}`),
                new TextDisplayBuilder().setContent(`**Cargo:** ${cargo}`),
                new TextDisplayBuilder().setContent(`**Executado por:** ${executor}`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        if (motivo) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Motivo:** ${motivo}`));
        }

        if (extra) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extra));
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de cargo do servidor ---', err);
    }
}

// ============ CANAL DO SERVIDOR CRIADO / EXCLUÍDO / EDITADO — EMBED PRÓPRIA ============
async function logarCanalServidor({ guild, tipo, canal, tipoCanal, categoria, executor, extra, canalId }) {
    try {
        const canalLogs = await guild.channels.fetch(canalId || CANAL_LOGS_MOD).catch(() => null);
        if (!canalLogs) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(`### ${tipo} — ${guild.name}`),
                new TextDisplayBuilder().setContent(`**Canal:** ${canal}`),
                ...(tipoCanal ? [new TextDisplayBuilder().setContent(`**Tipo:** ${tipoCanal}`)] : []),
                ...(categoria ? [new TextDisplayBuilder().setContent(`**Categoria:** ${categoria}`)] : []),
                new TextDisplayBuilder().setContent(`**Executado por:** ${executor}`)
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        if (extra) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extra));
            container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        }

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canalLogs.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de canal do servidor ---', err);
    }
}

// ============ REMOÇÃO/DEVOLUÇÃO TEMPORÁRIA DE CARGOS (ANTI-ABUSO) — EMBED PRÓPRIA ============
async function logarPunicaoCargosStaff({ guild, tipo, membro, cargos, extra, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_MOD).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const usuarioAlvo = membro?.user ?? membro;
        const avatarUrl = obterAvatarUrl(usuarioAlvo);

        const container = new ContainerBuilder()
            .setAccentColor(0xFFFFFF)
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${tipo} — ${guild.name}`),
                        new TextDisplayBuilder().setContent(`**Usuário:** ${membro} (${obterTag(usuarioAlvo)})`),
                        new TextDisplayBuilder().setContent('**Executado por:** Sistema (Anti-Abuso)')
                    )
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl))
            )
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        if (cargos && cargos.length) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Cargos afetados:** ${cargos.join(', ')}`));
        }

        if (extra) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(extra));
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de punição de cargos (staff) ---', err);
    }
}

// ============ ANTI NUKE DE CANAIS (canais restaurados / edições revertidas) — EMBED PRÓPRIA ============
async function logarAntiNukeCanais({ guild, executores, restaurados, revertidos, falhas, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_MOD).catch(() => null);
        if (!canal) return;

        const { hora: horaFormatada, data: dataFormatada } = obterDataHora();
        const listar = (lista) => {
            const nomes = lista.slice(0, 15).map(n => `\`${n}\``).join(', ');
            return lista.length > 15 ? `${nomes} e mais ${lista.length - 15}` : nomes;
        };

        const principal = executores[0]?.user ?? null;
        const unico = executores.length === 1 ? executores[0] : null;

        const linhasTopo = [
            new TextDisplayBuilder().setContent(`### Anti Nuke — ${guild.name}`),
            new TextDisplayBuilder().setContent(
                !executores.length
                    ? '**Usuário:** `não identificado`'
                    : unico
                        ? `**Usuário:** <@${unico.id}> — \`${obterTag(unico.user)}\` (\`${unico.id}\`)`
                        : `**Usuários:** ${executores.map(e => `<@${e.id}>`).join(', ')}`
            ),
            new TextDisplayBuilder().setContent('**Executado por:** Sistema Automático')
        ];

        const container = new ContainerBuilder().setAccentColor(0xFFFFFF);

        if (principal) {
            container.addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(...linhasTopo)
                    .setThumbnailAccessory(new ThumbnailBuilder().setURL(obterAvatarUrl(principal)))
            );
        } else {
            container.addTextDisplayComponents(...linhasTopo);
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent('**Motivo:** Canais protegidos apagados ou editados sem bypass'));

        for (const e of executores) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
                unico ? `**Ação aplicada:** \`${e.acao}\`` : `**Ação aplicada em <@${e.id}>:** \`${e.acao}\``
            ));
        }

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

        if (restaurados.length) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Canais restaurados (${restaurados.length}):** ${listar(restaurados)}`));
        }
        if (revertidos.length) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Edições revertidas (${revertidos.length}):** ${listar(revertidos)}`));
        }
        if (falhas.length) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`**Não consegui devolver (${falhas.length}):** ${listar(falhas)} — confira minhas permissões`));
        }

        container
            .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de anti nuke de canais ---', err);
    }
}

module.exports = {
    enviarLogModeracao, logar,
    logarBanimento, logarMembro, logarCargo, logarCallTemp, logarExpulsao, logarMute,
    logarAntiLink, logarAntiSpam, logarAntiBot,
    logarMensagemApagada, logarMensagemEditada,
    logarVoz, logarCastigo, logarCargoServidor,
    logarCanalServidor, logarPunicaoCargosStaff, logarAntiNukeCanais
};
