// Rode UMA vez, com o .env carregado:  node migrar-supabase-para-mongo.js
// Copia todas as tabelas do Supabase para o MongoDB. Pode rodar de novo sem duplicar (usa upsert).
require('dotenv').config();
const mongoose = require('mongoose');
const { createClient } = require('@supabase/supabase-js');
const { MensagemCache, PrimeiraDama, BotCallPainel, ProtecaoConfig } = require('./models');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function lerTudo(tabela) {
    const todos = [];
    for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from(tabela).select('*').range(de, de + 999);
        if (error) { console.error(`[${tabela}] erro:`, error.message); return todos; }
        todos.push(...data);
        if (data.length < 1000) break;
    }
    return todos;
}

(async () => {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);

    const paineis = await lerTudo('bot_call_painel');
    for (const p of paineis) await BotCallPainel.updateOne({ _id: p.guild_id }, { $set: { channelId: p.channel_id, messageId: p.message_id } }, { upsert: true });
    console.log(`bot_call_painel: ${paineis.length}`);

    const damas = await lerTudo('primeira_dama');
    for (const d of damas) await PrimeiraDama.updateOne(
        { guildId: d.guild_id, setterId: d.setter_id, targetId: d.target_id },
        { $setOnInsert: { criadoEm: d.criado_em ? new Date(d.criado_em) : new Date() } }, { upsert: true });
    console.log(`primeira_dama: ${damas.length}`);

    const cfgs = await lerTudo('protecao_config');
    for (const c of cfgs) await ProtecaoConfig.updateOne({ _id: 'protecao_config' }, { $set: {
        antiSpam: c.anti_spam ?? {}, antiLink: c.anti_link ?? {}, antiFake: c.anti_fake ?? {}, antiBot: c.anti_bot ?? {}, antiRaid: c.anti_raid ?? {}
    } }, { upsert: true });
    console.log(`protecao_config: ${cfgs.length}`);

    const msgs = await lerTudo('mensagens_cache');
    for (const m of msgs) await MensagemCache.updateOne({ _id: m.mensagem_id }, {
        $set: { canalId: m.canal_id, autorId: m.autor_id, autorTag: m.autor_tag, conteudo: m.conteudo ?? '' },
        $setOnInsert: { criadoEm: m.criado_em ? new Date(m.criado_em) : new Date() }
    }, { upsert: true });
    console.log(`mensagens_cache: ${msgs.length}`);

    console.log('Migração concluída.');
    await mongoose.disconnect();
})().catch(e => { console.error(e); process.exit(1); });
