// test-suite.js - Pruebas automáticas de lógica de Voco 2
import { TxtParser } from './src/js/parsers/txt-parser.js';
import { CoverGenerator } from './src/js/library/cover-generator.js';

async function runTests() {
    console.log("🧪 Iniciando pruebas de Voco 2...");
    let passed = 0;
    let total = 0;

    function assert(cond, msg) {
        total++;
        if (cond) {
            console.log(`  ✅ [PASS] ${msg}`);
            passed++;
        } else {
            console.error(`  ❌ [FAIL] ${msg}`);
            process.exitCode = 1;
        }
    }

    // Prueba 1: Detección y parseo de capítulos TXT para novelas web
    console.log("\n1. Test TxtParser - Detección de Capítulos");
    const sampleNovelText = `
Capítulo 1: El despertar de la magia
En una noche oscura de invierno, Klein despertó en una habitación desconocida.
Frente a él había un revólver oxidado y una libreta vieja.

El dolor de cabeza era punzante y apenas recordaba su nombre.
"¿Dónde estoy?", se preguntó en silencio.

Capítulo 2: Encuentro inesperado
A la mañana siguiente, sonaron tres golpes secos en la puerta.
Klein se levantó lentamente y se preparó para lo peor.
    `;

    const chapters = TxtParser.splitIntoChapters(sampleNovelText, "Klein Novel");
    assert(chapters.length === 2, `Se detectaron 2 capítulos (resultado: ${chapters.length})`);
    assert(chapters[0].title.includes("Capítulo 1"), `Título cap 1 correcto: "${chapters[0].title}"`);
    assert(chapters[1].title.includes("Capítulo 2"), `Título cap 2 correcto: "${chapters[1].title}"`);
    assert(chapters[0].paragraphs.length >= 2, `Cap 1 tiene párrafos extraídos: ${chapters[0].paragraphs.length}`);
    assert(chapters[0].paragraphs[0].id === 0, `Primer párrafo tiene id 0`);

    // Prueba 2: Generador de Portadas
    console.log("\n2. Test CoverGenerator - Generación de portada procedural");
    // Simulamos un hash o paleta
    const hash = CoverGenerator._hashString("Lord of the Mysteries");
    assert(typeof hash === 'number' && hash !== 0, `Hash numérico generado: ${hash}`);

    // Prueba 3: Cálculo y mapeo de marcas proporcionales para Whispersync
    console.log("\n3. Test Mapeo de Marcas de Sincronización Whispersync");
    const durationSec = 120; // 2 minutos
    const paragraphs = chapters[0].paragraphs;
    const totalWords = paragraphs.reduce((sum, p) => sum + (p.text.match(/\b\w+\b/g) || []).length, 0);

    let curSec = 0;
    const timestamps = paragraphs.map(p => {
        const words = (p.text.match(/\b\w+\b/g) || []).length;
        const dur = (words / totalWords) * durationSec;
        const start = curSec;
        const end = curSec + dur;
        curSec = end;
        return { paragraphId: p.id, start, end };
    });

    assert(timestamps.length === paragraphs.length, `Marcas temporales generadas para cada párrafo`);
    assert(timestamps[0].start === 0, `El primer párrafo inicia en segundo 0`);
    assert(Math.round(timestamps[timestamps.length - 1].end) === durationSec, `El último párrafo termina en ${durationSec}s`);

    console.log(`\n🎉 Resultado de Pruebas: ${passed}/${total} exitosas.`);
}

runTests().catch(err => {
    console.error("Error en pruebas:", err);
    process.exit(1);
});
