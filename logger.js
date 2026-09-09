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

module.exports = { enviarLogModeracao, logar };
