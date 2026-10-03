const {

    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,

    ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags

} = require('discord.js');

async function urlValida(url) {

    if (!url) return false;

    try {

        const controller = new AbortController();

        const timeout = setTimeout(() => controller.abort(), 4000);



        const resposta = await fetch(url, { method: 'HEAD', signal: controller.signal });

        clearTimeout(timeout);



        return resposta.ok;

    } catch {

        return false;

    }

}

function esperar(ms) {

    return new Promise(resolve => setTimeout(resolve, ms));

}



function containerTexto(texto) {

    const { ContainerBuilder, TextDisplayBuilder } = require('discord.js');

    return [new ContainerBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(texto))];

}



async function comRetry(fn, tentativas = 3, delayBase = 1000) {

    let ultimoErro;

    for (let i = 0; i < tentativas; i++) {

        try {

            return await fn();

        } catch (err) {

            ultimoErro = err;

            const codigosRetentaveis = ['UND_ERR_SOCKET', 'ECONNRESET', 'ETIMEDOUT', 'AbortError', 'RateLimitError'];

            const ehRateLimit = err.status === 429 || err.httpStatus === 429;

            const deveTentarNovamente = codigosRetentaveis.some(c => err.code === c || err.name === c) || ehRateLimit;

            if (!deveTentarNovamente || i === tentativas - 1) throw err;

            const delay = ehRateLimit ? (err.retry_after ? err.retry_after * 1000 : delayBase * Math.pow(2, i)) : delayBase * Math.pow(2, i);

            await esperar(delay);

        }

    }

    throw ultimoErro;

}



function montarPainelConfirmacaoModeracao(tipo, alvoMencao, alvoTag, motivo) {

    const titulos = {

        ban: 'Deseja realmente banir?',

        unban: 'Deseja realmente desbanir?'

    };



    return new ContainerBuilder()

        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${titulos[tipo] || 'Deseja realmente continuar?'}`))

        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${alvoMencao} · \`${alvoTag}\``))

        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# **Motivo:** ${motivo || '_'}`))

        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))

        .addActionRowComponents(

            new ActionRowBuilder().addComponents(

                new ButtonBuilder().setCustomId('moderacao_confirmar').setLabel(tipo === 'ban' ? 'Banir' : 'Desbanir').setStyle(ButtonStyle.Danger),

                new ButtonBuilder().setCustomId('moderacao_cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Secondary)

            )

        );

}



async function avisoSucessoModeracao(channel, texto) {

    try {

        if (!channel) return;

        const container = new ContainerBuilder()

            .addTextDisplayComponents(new TextDisplayBuilder().setContent(texto));

        const msg = await channel.send({

            components: [container],

            flags: [MessageFlags.IsComponentsV2]

        });

        setTimeout(() => msg.delete().catch(() => null), 10000);

    } catch (err) {

        console.error('--- Erro ao enviar aviso de sucesso de moderação ---', err);

    }

}



module.exports = {
    esperar, containerTexto, comRetry,
    montarPainelConfirmacaoModeracao,
    urlValida, avisoSucessoModeracao
};
