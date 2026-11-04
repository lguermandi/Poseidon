// Aggiorna NOME_CACHE in www/sw.js con un hash del contenuto di www/.
// Così la cache del service worker cambia solo quando cambia qualcosa di servito.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CARTELLA_WWW = path.join(__dirname, '..', 'www');
const FILE_SW = path.join(CARTELLA_WWW, 'sw.js');
const REGEX_NOME_CACHE = /^const NOME_CACHE = '[^']*';$/m;

function elencaFile(cartella) {
    return fs.readdirSync(cartella, { withFileTypes: true }).flatMap((voce) => {
        const percorso = path.join(cartella, voce.name);
        return voce.isDirectory() ? elencaFile(percorso) : [percorso];
    });
}

function calcolaVersione() {
    const hash = crypto.createHash('sha256');
    elencaFile(CARTELLA_WWW)
        .sort()
        .forEach((file) => {
            let contenuto = fs.readFileSync(file);
            if (file === FILE_SW) {
                // La riga NOME_CACHE dipende dall'hash, quindi va esclusa dal calcolo.
                contenuto = Buffer.from(contenuto.toString('utf8').replace(REGEX_NOME_CACHE, ''));
            }
            hash.update(path.relative(CARTELLA_WWW, file).replace(/\\/g, '/'));
            hash.update(contenuto);
        });
    return hash.digest('hex').slice(0, 12);
}

function aggiornaCache() {
    const versione = `nautica-app-${calcolaVersione()}`;
    const sorgente = fs.readFileSync(FILE_SW, 'utf8');
    if (!REGEX_NOME_CACHE.test(sorgente)) {
        throw new Error('Riga NOME_CACHE non trovata in www/sw.js');
    }
    const nuovaRiga = `const NOME_CACHE = '${versione}';`;
    const nuovo = sorgente.replace(REGEX_NOME_CACHE, nuovaRiga);
    if (nuovo !== sorgente) {
        fs.writeFileSync(FILE_SW, nuovo, 'utf8');
        console.log(`NOME_CACHE aggiornato a ${versione}`);
    } else {
        console.log(`NOME_CACHE già aggiornato (${versione})`);
    }
}

aggiornaCache();
