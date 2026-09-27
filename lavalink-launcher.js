const { spawn } = require('child_process');
const path = require('path');

function iniciarLavalinkLocal() {
    const javaPath = path.join(__dirname, 'jdk', 'bin', 'java');
    const jarPath = path.join(__dirname, 'Lavalink.jar');

    const processo = spawn(javaPath, ['-Xmx256m', '-jar', jarPath], {
        cwd: __dirname,
        stdio: 'inherit'
    });

    processo.on('error', (err) => console.error('--- Erro ao iniciar Lavalink local ---', err));
    processo.on('exit', (code) => console.warn(`Lavalink local encerrou (code ${code})`));
}

module.exports = { iniciarLavalinkLocal };
