const fs = require('fs');

try {
    const mainPath = require.resolve('@distube/yt-dlp');
    let conteudo = fs.readFileSync(mainPath, 'utf8');
    const antes = conteudo;

    conteudo = conteudo.replace(/noCallHome:\s*true,?\s*/g, '');
    conteudo = conteudo.replace(
        /noWarnings:\s*true,/g,
        "noWarnings: true, extractorArgs: 'youtube:player_client=android,web',"
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
