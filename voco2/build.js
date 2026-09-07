// build.js - Script de compilación ultrarrápido con esbuild para Voco 2
import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

async function build() {
    console.log('⚡ [Voco 2] Iniciando compilación...');

    // Asegurar directorios de destino
    fs.mkdirSync('www/static/js', { recursive: true });
    fs.mkdirSync('www/static/css', { recursive: true });

    // 1. Bundle JS con esbuild
    console.log('📦 Empaquetando módulos JavaScript...');
    await esbuild.build({
        entryPoints: ['src/js/app.js'],
        bundle: true,
        format: 'esm',
        outfile: 'www/static/js/app.bundle.js',
        sourcemap: true,
        target: ['chrome100', 'safari15', 'es2022'],
        define: {
            'process.env.NODE_ENV': '"production"',
            'global': 'window'
        }
    });

    // 2. Copiar CSS
    console.log('🎨 Copiando estilos...');
    fs.copyFileSync('src/css/style.css', 'www/static/css/style.css');

    // 3. Copiar HTML
    console.log('📄 Copiando index.html...');
    fs.copyFileSync('src/index.html', 'www/index.html');

    console.log('✨ [Voco 2] ¡Build completado exitosamente en www/!');
}

build().catch(err => {
    console.error('❌ Error en el build:', err);
    process.exit(1);
});
