const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const util = require('util');
const execFileAsync = util.promisify(execFile);

const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const Groq = require('groq-sdk');

const { ConversaAna } = require('./models');

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const PERSONA_ANA = `Você é Ana, a voz de um servidor de Discord — não uma assistente educada, é tipo aquela
amiga sincera e engraçada do grupo que solta o verbo. Fale em português do Brasil, num tom de
resenha, debochado, brincalhão, sem papas na língua. Pode soltar um palavrão leve de vez em
quando (tipo "caralho", "porra", "mermão", "tomar no cu", "seu cu", "azidea", "seu louco", "vai se foder") e zoar o usuário de forma afetuosa — aquele climão
de amigo que te zoa mas gosta de você. Nada de ofensa pesada, preconceito, ou zoeira que realmente
machuque — é putaria leve, não maldade.
NUNCA use markdown, asteriscos, emojis ou listas, porque sua resposta vira áudio. Seja direta e
breve: no máximo 2 a 3 frases curtas por resposta, já que seu áudio tem um limite de geração bem
apertado.`;

// ============ GROQ: gera o texto da resposta ============
async function gerarRespostaAna(userId, textoUsuario) {
    const doc = await ConversaAna.findById(userId).catch(() => null);
    const historico = doc?.historico || [];

    const mensagens = [
        { role: 'system', content: PERSONA_ANA },
        ...historico.slice(-20).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: textoUsuario }
    ];

    const completion = await groq.chat.completions.create({
        model: 'openai/gpt-oss-120b',
        messages: mensagens,
        temperature: 0.8,
        max_tokens: 150
    });

    let resposta = completion.choices[0]?.message?.content?.trim()
        || 'Desculpa, não consegui pensar em uma resposta agora.';

    // Trava de segurança pro crédito do ElevenLabs não estourar numa resposta gigante
    if (resposta.length > 400) resposta = resposta.slice(0, 400);

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

    if (replyToMessageId) {
        payload.message_reference = { message_id: replyToMessageId };
    }

    form.append('payload_json', JSON.stringify(payload));

    const resposta = await fetch(`https://discord.com/api/v10/channels/${canalId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bot ${process.env.DISCORD_TOKEN}` },
        body: form
    });

    if (!resposta.ok) {
        const erroTxt = await resposta.text().catch(() => '');
        throw new Error(`Discord retornou ${resposta.status} ao enviar áudio: ${erroTxt}`);
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
