const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, MessageFlags } = require('discord.js');
const { CANAL_LOGS_MOD, IMG_DISCORD_LOGO } = require('./constants');

// ============ MOTOR: monta o container e envia ============
async function enviarLogModeracao({ guild, tipo, alvo, alvoUser, autor, motivo, extra, canalId }) {
    try {
        const canal = await guild.channels.fetch(canalId || CANAL_LOGS_MOD).catch(() => null);
        if (!canal) return;

        const agora = new Date();
        const horaFormatada = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/Sao_Paulo' });
        const dataFormatada = agora.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

        const avatarUrl = typeof alvoUser?.displayAvatarURL === 'function'
            ? alvoUser.displayAvatarURL({ extension: 'png', size: 256 })
            : IMG_DISCORD_LOGO;

        const container = new ContainerBuilder()
            .addSectionComponents(
                new SectionBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(`### ${tipo}`),
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

        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(` ${dataFormatada} às ${horaFormatada}`));

        await canal.send({
            components: [container],
            flags: [MessageFlags.IsComponentsV2],
            allowedMentions: { parse: [] }
        });
    } catch (err) {
        console.error('--- Erro ao enviar log de moderação ---', err);
    }
}

// ============ ATALHO: usado por todos os comandos/sistemas ============
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

// ============ ANTI-LINK / ANTI-SPAM / ANTI-BOT ============
async function logarAntiLink({ guild, usuario, motivo, link, canal }) {
    return enviarLogModeracao({
        guild,
        tipo: 'Anti-Link',
        alvo: `${usuario} — \`${usuario.username}\` (\`${usuario.id}\`)`,
        alvoUser: usuario,
        autor: 'Sistema Automático',
        motivo,
        extra: `**Canal:** ${canal}\n**Link:** \`\`\`${link}\`\`\``,
        canalId: CANAL_LOGS_AUTOMOD
    });
}

async function logarAntiSpam({ guild, usuario, motivo, canal, muteMinutos }) {
    return enviarLogModeracao({
        guild,
        tipo: 'Anti-Spam',
        alvo: `${usuario} — \`${usuario.username}\` (\`${usuario.id}\`)`,
        alvoUser: usuario,
        autor: 'Sistema Automático',
        motivo,
        extra: `**Canal:** ${canal}\n**Ação:** Mensagens apagadas + timeout de \`${muteMinutos}\` minuto(s)`,
        canalId: CANAL_LOGS_AUTOMOD
    });
}

async function logarAntiBot({ guild, bot, acao }) {
    return enviarLogModeracao({
        guild,
        tipo: 'Anti-Bot',
        alvo: `${bot} — \`${bot.username}\` (\`${bot.id}\`)`,
        alvoUser: bot,
        autor: 'Sistema Automático',
        motivo: 'Bot detectado ao entrar no servidor',
        extra: `**Ação aplicada:** \`${acao === 'banir' ? 'banido' : 'expulso'}\``,
        canalId: CANAL_LOGS_AUTOMOD
    });
}

module.exports = { enviarLogModeracao, logar, logarAntiLink, logarAntiSpam, logarAntiBot };