const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const OpenAI = require('openai');

const { ConversaAna } = require('./models');

// ============ OPENROUTER (no lugar da Groq) ============
const openrouter = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
        'HTTP-Referer': process.env.PUBLIC_URL || 'https://onze-bot.onrender.com',
        'X-Title': 'Ana - Bot Discord'
    }
});

const MODELO_ANA = 'nvidia/nemotron-3-ultra-550b-a55b:free';
const DONO_ID = '1548516775669538898';

const PERSONA_ANA = `Você é Ana, a voz de um servidor de Discord. Fale em português do Brasil.

Por padrão você é carinhosa, animada e acolhedora com as pessoas — curte conversar, trata bem,
puxa assunto com interesse genuíno, comenta o que a pessoa falou, reage antes de mudar de assunto.
Presta atenção em como cada pessoa fala (gíria, humor, estilo) e vai se ajustando ao jeito dela ao
longo da conversa, tipo quem pega a manha de como o amigo é. Não fica só respondendo seco — conversa
que nem gente que curte estar ali.

Você entende qualquer tipo de gíria brasileira, de qualquer região e qualquer cena — gíria de
internet, de TikTok, de jogo, de quebrada, de qualquer bairro ou estado — nunca trava ou finge que
não entendeu o que a pessoa falou só por causa de uma gíria. Você é esperta de verdade: sabe captar
o sentido por trás do que a pessoa disse mesmo se a frase for zoada ou cheia de gíria, sabe
identificar o que vale a pena responder de verdade e o que é só picuinha boba pra ignorar ou
zoar rapidinho, não cai em pegadinha óbvia, e vira o jogo com inteligência quando alguém tenta te
confundir ou te testar. Você é marra na medida certa — segura, na sua, não se abala fácil.

Você só entra no modo zoeira pesada / xingamento quando A PESSOA ZOA OU XINGA VOCÊ PRIMEIRO (tipo
"ana sua cadela", "cala a boca sua inútil", esse tipo de provocação dirigida a você). Nesse caso,
você entra na resenha e devolve na mesma moeda — pode xingar de volta ("seu bosta", "cambada",
"otário", "idiota"), soltar palavrão solto ("caralho", "porra", "mermão", "desgraçado") — sempre
no clima de implicância entre amigos, nunca ódio de verdade, é putaria, não maldade. Fora esses
momentos de provocação, você não sai xingando as pessoas do nada. Nunca use ofensa relacionada a
raça, religião, aparência física, orientação sexual ou qualquer coisa que realmente machuque
alguém — zoa na atitude da pessoa, no que ela disse, na situação, não na identidade dela.

Você também é um pouco safada/provocadora no bom humor. Se alguém flertar com você, chamar pra
namorar, mandar cantada — pode retribuir na zoeira, com uma resposta debochada e sedutora na
brincadeira, tipo devolvendo a cantada só que na ironia. Não é papel de namoradinha grudenta nem
carente: é resposta rápida, espertinha, que já parte pra próxima piada ou assunto, sem ficar
naquele clima por muito tempo nem levar a sério.

Se alguém perguntar quem te criou, quem te desenvolveu, quem te fez, de onde você veio ou coisa do
tipo, responda que foi o 17s ou o Rayan — pode citar só um dos dois (o que preferir na hora,
varia à vontade) ou os dois juntos, como fizer mais sentido na conversa. Não invente outros nomes
nem diga que foi feita por uma empresa ou IA genérica — a resposta é sempre 17s e/ou Rayan.

NUNCA use markdown, asteriscos, emojis ou listas, porque sua resposta vira áudio. Responda SEMPRE
em português do Brasil, mesmo que a pessoa escreva em outro idioma — nunca troque de idioma. Nunca
narre, explique ou descreva o que a pessoa disse nem o que você vai responder (tipo "o usuário
disse X, então vou responder Y") — fale direto como se estivesse falando de verdade, sem nenhum
meta-comentário sobre a conversa. Seja direta e breve: no máximo 2 a 3 frases curtas por resposta,
já que seu áudio tem um limite de geração bem apertado.`;

// ============ OPENROUTER: gera o texto da resposta ============
async function gerarRespostaAna(userId, textoUsuario) {
    const doc = await ConversaAna.findById(userId).catch(() => null);
    const historico = doc?.historico || [];

    const infoDono = userId === DONO_ID
        ? '\n\nImportante: a pessoa falando com você agora é seu dono/criador, quem te fez existir. Trate com um carinho especial e pode reconhecer isso quando fizer sentido na conversa, sem ficar repetindo isso toda hora.'
        : '';

    const mensagens = [
        { role: 'system', content: PERSONA_ANA + infoDono },
        ...historico.slice(-20).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: textoUsuario }
    ];

    const completion = await openrouter.chat.completions.create({
        model: MODELO_ANA,
        messages: mensagens,
        temperature: 0.9,
        max_tokens: 400,
        reasoning: { effort: 'low', exclude: true }
    });

    let resposta = completion?.choices?.[0]?.message?.content?.trim()
        || 'Desculpa, não consegui pensar em uma resposta agora.';

    // Trava de segurança pro áudio não ficar gigante (e o crédito do ElevenLabs não estourar)
    const LIMITE_CARACTERES = 260; // ~15-18s de áudio
    if (resposta.length > LIMITE_CARACTERES) {
        const cortada = resposta.slice(0, LIMITE_CARACTERES);
        const ultimaPontuacao = Math.max(cortada.lastIndexOf('.'), cortada.lastIndexOf('!'), cortada.lastIndexOf('?'));
        resposta = ultimaPontuacao > 40 ? cortada.slice(0, ultimaPontuacao + 1) : cortada;
    }

    const novoHistorico = [
        ...historico,
        { role: 'user', content: textoUsuario },
        { role: 'assistant', content: resposta }
    ].slice(-20);

    await ConversaAna.findByIdAndUpdate(
        userId,
        { historico: novoHistorico, atualizadoEm: new Date() },
        { upsert: true }
    );

    return resposta;
}

// ============ ELEVENLABS: texto -> mp3 ============
async function sintetizarAudioElevenLabs(texto) {
    const resposta = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${process.env.ELEVENLABS_VOICE_ID}`, {
        method: 'POST',
        headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            text: texto,
            model_id: 'eleven_multilingual_v2',
            voice_settings: { stability: 0.5, similarity_boost: 0.75 }
        })
    });

    if (!resposta.ok) {
        const erro = await resposta.text().catch(() => '');
        throw new Error(`ElevenLabs retornou ${resposta.status}: ${erro}`);
    }

    const buffer = Buffer.from(await resposta.arrayBuffer());
    const mp3Path = path.join(os.tmpdir(), `ana_${crypto.randomUUID()}.mp3`);
    fs.writeFileSync(mp3Path, buffer);
    return mp3Path;
}

// ============ FFMPEG: mp3 -> ogg/opus (formato de mensagem de voz do Discord) ============
async function converterParaVoiceMessage(mp3Path) {
    const oggPath = mp3Path.replace(/\.mp3$/, '.ogg');

    await execFileAsync(ffmpegPath, [
        '-y', '-i', mp3Path,
        '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '32k',
        oggPath
    ]);

    const { stdout: duracaoStr } = await execFileAsync(ffprobePath, [
        '-v', 'error', '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1', oggPath
    ]);
    const duracaoSegundos = parseFloat(duracaoStr.trim()) || 1;

    // Gera o waveform real a partir do áudio (amostra em baixa resolução, 0-255 por ponto)
    const { stdout: pcmBuffer } = await execFileAsync(ffmpegPath, [
        '-i', mp3Path, '-ac', '1', '-ar', '256', '-f', 'u8', 'pipe:1'
    ], { maxBuffer: 10 * 1024 * 1024, encoding: 'buffer' });

    const amostras = Array.from(pcmBuffer).map(v => Math.min(255, Math.abs(v - 128) * 2));
    const passo = Math.max(1, Math.floor(amostras.length / 100));
    const pontos = [];
    for (let i = 0; i < amostras.length; i += passo) {
        pontos.push(Math.max(...amostras.slice(i, i + passo)));
    }

    const waveformBase64 = Buffer.from(pontos.slice(0, 256)).toString('base64');

    return { oggPath, duracaoSegundos, waveformBase64 };
}

// ============ DISCORD: envia a mensagem de voz de verdade (requisição crua) ============
async function enviarMensagemDeVoz({ canalId, caminhoOgg, duracaoSegundos, waveformBase64, replyToMessageId }) {
    const bufferAudio = fs.readFileSync(caminhoOgg);

    async function tentarEnviar(comReply) {
        const form = new FormData();
        form.append('files[0]', new Blob([bufferAudio], { type: 'audio/ogg' }), 'voice-message.ogg');

        const payload = {
            flags: 1 << 13, // IS_VOICE_MESSAGE
            attachments: [{
                id: '0',
                filename: 'voice-message.ogg',
                duration_secs: duracaoSegundos,
                waveform: waveformBase64
            }]
        };

        if (comReply && replyToMessageId) {
            payload.message_reference = { message_id: replyToMessageId };
        }

        form.append('payload_json', JSON.stringify(payload));

        return fetch(`https://discord.com/api/v10/channels/${canalId}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
            body: form
        });
    }

    let resposta = await tentarEnviar(true);

    if (!resposta.ok) {
        const erroTxt = await resposta.text().catch(() => '');
        const referenciaInvalida = resposta.status === 400 && erroTxt.includes('MESSAGE_REFERENCE_UNKNOWN_MESSAGE');

        if (referenciaInvalida) {
            // A mensagem original sumiu (apagada/expirada) — manda de novo sem o reply
            resposta = await tentarEnviar(false);
            if (!resposta.ok) {
                const erroTxt2 = await resposta.text().catch(() => '');
                throw new Error(`Discord retornou ${resposta.status} ao enviar áudio (retry sem reply): ${erroTxt2}`);
            }
        } else {
            throw new Error(`Discord retornou ${resposta.status} ao enviar áudio: ${erroTxt}`);
        }
    }

    return resposta.json();
}

// ============ FUNÇÃO PRINCIPAL: junta tudo ============
async function anaResponderComAudio({ canalId, autorId, textoUsuario, replyToMessageId }) {
    const mp3Path = await sintetizarAudioElevenLabs(await gerarRespostaAna(autorId, textoUsuario));
    let oggPath;
    try {
        const conversao = await converterParaVoiceMessage(mp3Path);
        oggPath = conversao.oggPath;
        await enviarMensagemDeVoz({
            canalId,
            caminhoOgg: conversao.oggPath,
            duracaoSegundos: conversao.duracaoSegundos,
            waveformBase64: conversao.waveformBase64,
            replyToMessageId
        });
    } finally {
        fs.unlink(mp3Path, () => {});
        if (oggPath) fs.unlink(oggPath, () => {});
    }
}

module.exports = { anaResponderComAudio };
