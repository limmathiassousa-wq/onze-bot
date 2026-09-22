const fs = require('fs');

try {
    const mainPath = require.resolve('@distube/yt-dlp');
    let conteudo = fs.readFileSync(mainPath, 'utf8');
    const antes = conteudo;

    conteudo = conteudo.replace(/noCallHome:\s*true,?\s*/g, '');
    conteudo = conteudo.replace(
        /noWarnings:\s*true,/g,
        "noWarnings: true, extractorArgs: 'youtube:player_client=tv,ios,android,web', cookies: process.env.YTDLP_COOKIES_PATH,"
    );

    if (conteudo !== antes) {
        fs.writeFileSync(mainPath, conteudo, 'utf8');
        console.log('[patch-ytdlp] Patch aplicado com sucesso em', mainPath);
    } else {
        console.log('[patch-ytdlp] Nenhuma ocorrência encontrada (pacote pode ter mudado).');
    }
} catch (e) {
    console.error('[patch-ytdlp] Falha ao aplicar patch:', e);
}
// --- DEBUG: inspecionar @distube/spotify ---
try {
    const spotifyPath = require.resolve('@distube/spotify');
    const spotifySrc = fs.readFileSync(spotifyPath, 'utf8');
    const idx = spotifySrc.indexOf('function apiError');
    console.log('[patch-ytdlp] @distube/spotify resolvido em:', spotifyPath);
    console.log('[patch-ytdlp] trecho apiError:', idx === -1 ? 'não encontrado' : spotifySrc.slice(idx, idx + 600));
} catch (e) {
    console.error('[patch-ytdlp] Falha ao inspecionar @distube/spotify:', e);
}
// --- FIM DEBUG ---
