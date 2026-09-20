// ============ SUPABASE (PostgreSQL) ============
// Roda em paralelo com o MongoDB (mongoose). Use este módulo para
// as tabelas que você quiser manter no Supabase/Postgres.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // use a service_role key (não a anon), já que é o bot rodando no servidor

if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[Supabase] SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos no .env!');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false } // bot não precisa de sessão de usuário
});

// Log de conexão (valida com uma query simples numa tabela leve;
// troque 'healthcheck' por qualquer tabela real que você já tenha criado)
const supabaseConectado = supabase
    .from('healthcheck')
    .select('*')
    .limit(1)
    .then(({ error }) => {
        if (error && error.code !== '42P01') { // 42P01 = tabela não existe, ok por enquanto
            console.error('--- Erro ao conectar no Supabase ---', error);
            return false;
        }
        console.log('[Supabase] Conectado com sucesso!');
        return true;
    })
    .catch(err => {
        console.error('--- Erro ao conectar no Supabase ---', err);
        return false;
    });

module.exports = { supabase, supabaseConectado };
