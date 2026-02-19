
export const API = {
    baseUrl: localStorage.getItem('voco_server_url') || 'http://localhost:5000',

    setBaseUrl(url) {
        // Ensure no trailing slash
        this.baseUrl = url.replace(/\/$/, "");
        localStorage.setItem('voco_server_url', this.baseUrl);
    },

    async ping() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const res = await fetch(`${this.baseUrl}/ping`, { signal: controller.signal });
            clearTimeout(timeoutId);
            return res.ok;
        } catch (e) {
            return false;
        }
    },

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('archivo', file);
        const res = await fetch(`${this.baseUrl}/analizar`, {
            method: 'POST',
            body: formData
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Error uploading');
        return await res.json();
    },

    async getLanguages() {
        const res = await fetch(`${this.baseUrl}/idiomas`);
        return await res.json();
    },

    async getVoices(locale) {
        const res = await fetch(`${this.baseUrl}/voces/${locale}`);
        return await res.json();
    },

    async convert(fileId, voiceId, chapterIds) {
        const res = await fetch(`${this.baseUrl}/convertir`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_id: fileId,
                voz_id: voiceId,
                capitulos: chapterIds
            })
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Error starting conversion');
        return await res.json(); // returns { job_id }
    },

    async getJobStatus(jobId) {
        const res = await fetch(`${this.baseUrl}/estado/${jobId}`);
        return await res.json();
    },

    getDownloadUrl(jobId, fileName) {
        return `${this.baseUrl}/descargar/${jobId}/${encodeURIComponent(fileName)}`;
    }
};
