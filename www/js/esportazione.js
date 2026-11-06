/**
 * ESPORTAZIONE.JS - Salvataggio e condivisione di file generati dall'app
 */

function trovaCapacitor() {
    if (window.Capacitor) return window.Capacitor;
    try {
        return window.parent !== window ? window.parent.Capacitor : undefined;
    } catch (errore) {
        return undefined;
    }
}

async function salvaFileEsportato(file) {
    const capacitor = trovaCapacitor();
    if (capacitor?.isNativePlatform?.() && capacitor.Plugins?.Filesystem && capacitor.Plugins?.Share) {
        return salvaFileNativo(file);
    }

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
            await navigator.share({ files: [file], title: file.name });
            return true;
        } catch (errore) {
            if (errore.name === 'AbortError') return false;
        }
    }

    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
}

async function salvaFileNativo(file) {
    const { Filesystem, Share } = trovaCapacitor().Plugins;
    const testo = await file.text();
    const { uri } = await Filesystem.writeFile({
        path: file.name,
        data: testo,
        directory: 'CACHE',
        encoding: 'utf8',
        recursive: true
    });
    try {
        await Share.share({ title: file.name, files: [uri], dialogTitle: 'Salva o condividi' });
    } catch (errore) {
        if (!/cancel/i.test(String(errore?.message ?? errore))) throw errore;
    }
    return true;
}
