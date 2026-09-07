// cover-generator.js - Generador procedural de portadas para libros sin carátula
export class CoverGenerator {
    static PALETTES = [
        { bg1: '#1a102f', bg2: '#3b185f', accent: '#a855f7', textColor: '#f3e8ff' }, // Royal Velvet
        { bg1: '#0f172a', bg2: '#1e293b', accent: '#38bdf8', textColor: '#f0f9ff' }, // Dark Obsidian
        { bg1: '#064e3b', bg2: '#022c22', accent: '#34d399', textColor: '#ecfdf5' }, // Emerald Night
        { bg1: '#431407', bg2: '#7c2d12', accent: '#fb923c', textColor: '#fff7ed' }, // Sunset Amber
        { bg1: '#1e1b4b', bg2: '#312e81', accent: '#818cf8', textColor: '#e0e7ff' }, // Cosmic Indigo
        { bg1: '#18181b', bg2: '#27272a', accent: '#e4e4e7', textColor: '#ffffff' }  // Monolith
    ];

    static generate(title = 'Sin Título', author = 'Desconocido', seed = '') {
        const hash = this._hashString(title + author + seed);
        const palette = this.PALETTES[Math.abs(hash) % this.PALETTES.length];

        const width = 400;
        const height = 600;

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // 1. Fondo degradado
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, palette.bg1);
        grad.addColorStop(1, palette.bg2);
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // 2. Patrón de textura geométrica sutil
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.15;

        // Marco interior elegante
        const margin = 24;
        ctx.strokeRect(margin, margin, width - margin * 2, height - margin * 2);
        ctx.strokeRect(margin + 6, margin + 6, width - (margin + 6) * 2, height - (margin + 6) * 2);

        // Líneas diagonales o rombos sutiles
        for (let i = 0; i < width; i += 60) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i + height, height);
            ctx.stroke();
        }

        ctx.globalAlpha = 1.0;

        // 3. Icono de libro / logo superior
        ctx.fillStyle = palette.accent;
        ctx.font = '28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('📖', width / 2, 90);

        // 4. Título del Libro (centrado y con auto-wrap)
        ctx.fillStyle = palette.textColor;
        ctx.font = 'bold 26px "Inter", -apple-system, BlinkMacSystemFont, sans-serif';
        ctx.textAlign = 'center';

        const titleWords = title.trim().split(/\s+/);
        const lines = [];
        let curLine = '';

        for (const w of titleWords) {
            const testLine = curLine ? `${curLine} ${w}` : w;
            if (ctx.measureText(testLine).width > width - 80) {
                if (curLine) lines.push(curLine);
                curLine = w;
            } else {
                curLine = testLine;
            }
        }
        if (curLine) lines.push(curLine);

        // Limitar a máximo 5 líneas
        const displayLines = lines.slice(0, 5);
        if (lines.length > 5) displayLines[4] += '...';

        const lineHeight = 36;
        let startY = 220 - (displayLines.length * lineHeight) / 2;
        if (startY < 140) startY = 140;

        for (let i = 0; i < displayLines.length; i++) {
            ctx.fillText(displayLines[i], width / 2, startY + i * lineHeight);
        }

        // 5. Divisor decorativo
        const divY = startY + displayLines.length * lineHeight + 25;
        ctx.strokeStyle = palette.accent;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(width / 2 - 40, divY);
        ctx.lineTo(width / 2 + 40, divY);
        ctx.stroke();

        // 6. Autor
        ctx.fillStyle = palette.accent;
        ctx.font = '500 16px "Inter", sans-serif';
        const cleanAuthor = (author && author !== 'Desconocido') ? author : 'Voco Reader';
        ctx.fillText(cleanAuthor.toUpperCase(), width / 2, divY + 35);

        // 7. Badge de formato inferior
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        const badgeW = 90;
        const badgeH = 24;
        const badgeX = (width - badgeW) / 2;
        const badgeY = height - 60;
        ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 12);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.fillText('VOCO 2', width / 2, badgeY + 16);

        return canvas.toDataURL('image/png');
    }

    static _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }
}
