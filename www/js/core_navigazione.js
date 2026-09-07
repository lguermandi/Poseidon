class NavCore {
    // ==========================================
    // 1. TEMPO, SPAZIO, VELOCITÀ
    // ==========================================
    
    /**
     * Calcola la velocità (Nodi)
     * @param {number} distance - Miglia nautiche (Nm)
     * @param {number} timeHours - Tempo in ore decimali
     */
    static getSpeed(distance, timeHours) {
        return distance / timeHours;
    }

    /**
     * Calcola il tempo di Navigazione (Ore decimali)
     */
    static getTime(distance, speed) {
        return distance / speed;
    }

    /**
     * Calcola la distanza percorsa (Miglia nautiche)
     */
    static getDistance(speed, timeHours) {
        return speed * timeHours;
    }

    // ==========================================
    // 2. CONVERSIONI ANGOLARI
    // ==========================================

    /**
     * Converte un angolo in gradi sessagesimali a gradi decimali
     * Es: 45° 30' = 45.5°
     */
    static dmsToDecimal(degrees, minutes, seconds = 0) {
        let dec = Math.abs(degrees) + (minutes / 60) + (seconds / 3600);
        return degrees < 0 ? -dec : dec;
    }

    /**
     * Converte gradi decimali in formato Sessagesimale [Gradi, Primi, Secondi]
     */
    static decimalToDms(decimalAngle) {
        const absolute = Math.abs(decimalAngle);
        const degrees = Math.floor(absolute);
        const minutesNotTruncated = (absolute - degrees) * 60;
        const minutes = Math.floor(minutesNotTruncated);
        const seconds = Math.round((minutesNotTruncated - minutes) * 60);
        
        return {
            sign: decimalAngle < 0 ? -1 : 1,
            deg: degrees,
            min: minutes,
            sec: seconds
        };
    }
    
    /**
     * Assicura che l'angolo resti nel range 0° - 359.9°
     */
    static normalizeAngle(angle) {
        return ((angle % 360) + 360) % 360;
    }

    // ==========================================
    // 3. CONVERSIONI PRORA E ROTTA
    // ==========================================

    /**
     * Calcola la Prora Vera (Pv) partendo dalla Prora Bussola (Pb)
     * Pv = Pb + d + dev
     * @param {number} pb - Prora Bussola (0-360)
     * @param {number} declination - Declinazione magnetica (+ Est, - Ovest)
     * @param {number} deviation - Deviazione magnetica (+ Est, - Ovest)
     */
    static getPvFromPb(pb, declination, deviation) {
        const pv = pb + declination + deviation;
        return this.normalizeAngle(pv);
    }

    /**
     * Calcola la Prora Bussola (Pb) partendo dalla Prora Vera (Pv)
     * Pb = Pv - d - dev
     */
    static getPbFromPv(pv, declination, deviation) {
        const pb = pv - declination - deviation;
        return this.normalizeAngle(pb);
    }

    /**
     * Calcola la Rotta Vera (Rv) applicando l'angolo di scarroccio (lsc)
     * Lo scarroccio è positivo se a dritta, negativo se a sinistra.
     */
    static getRv(pv, scarroccio) {
        return this.normalizeAngle(pv + scarroccio);
    }
}

class DeviationTable {
    /**
     * @param {Array} tableData - Array di oggetti { p: grado, dev: deviazione }
     * I dati devono essere ordinati per 'p' crescente, da 0 a 360.
     */
    constructor(tableData) {
        this.table = tableData;
    }

    /**
     * Calcola la deviazione interpolata per una data prora
     * @param {number} prora - Il valore della prora (0-360)
     * @returns {number} La deviazione interpolata
     */
    getDeviation(prora) {
        // 1. Normalizziamo l'angolo per assicurarci che sia tra 0 e 360
        let p = ((prora % 360) + 360) % 360;
        
        // Se p è esattamente 0, possiamo trattarlo come 360 se la tabella finisce a 360
        if (p === 0 && this.table[0].p !== 0) p = 360;

        // 2. Cerchiamo i due valori limite (P1 e P2)
        for (let i = 0; i < this.table.length - 1; i++) {
            let p1 = this.table[i].p;
            let p2 = this.table[i + 1].p;

            // Trovato l'intervallo che contiene la nostra prora
            if (p >= p1 && p <= p2) {
                let dev1 = this.table[i].dev;
                let dev2 = this.table[i + 1].dev;

                // Se la prora coincide esattamente con un valore in tabella, restituiamo la deviazione
                if (p === p1) return dev1;
                if (p === p2) return dev2;

                // 3. Applichiamo la formula di interpolazione lineare
                let interpolatedDev = dev1 + ((p - p1) / (p2 - p1)) * (dev2 - dev1);

                // Arrotondiamo al primo decimale (standard per il carteggio nautico)
                return Math.round(interpolatedDev * 10) / 10;
            }
        }
        
        // Fallback in caso di errore nei dati
        throw new Error("Prora fuori dai limiti della tabella");
    }
}

// ==========================================
// ESEMPIO DI UTILIZZO
// ==========================================

// Simuliamo un estratto di una tipica tabella ministeriale
// Valori positivi = Est (+), Valori negativi = Ovest (-)
const tabellaMinisteriale = [
    { p: 0,   dev: 2.5 },
    { p: 10,  dev: 2.8 },
    { p: 20,  dev: 3.1 },
    { p: 30,  dev: 3.5 },
    // ... altri valori ...
    { p: 350, dev: 2.0 },
    { p: 360, dev: 2.5 } // Il ciclo si chiude
];

const miaBarca = new DeviationTable(tabellaMinisteriale);

// Vogliamo la deviazione per Pb = 14°
const pb = 14;
const devCalcolata = miaBarca.getDeviation(pb);

console.log(`Per Pb ${pb}°, la deviazione è: ${devCalcolata}°`);
// Output atteso: Per Pb 14°, la deviazione è: 2.9°


class VectorMath {
    /**
     * Converte i gradi in radianti per le funzioni Math di JS
     */
    static toRadians(degrees) {
        return degrees * (Math.PI / 180);
    }

    /**
     * Converte i radianti in gradi nautici (0-360)
     */
    static toDegrees(radians) {
        let deg = radians * (180 / Math.PI);
        return ((deg % 360) + 360) % 360;
    }

    /**
     * Primo Problema della Corrente: 
     * Calcola Rotta Vera (Rv) e Velocità Effettiva (Veff)
     * 
     * @param {number} rs - Rotta di Superficie (Pv + Scarroccio) in gradi
     * @param {number} vp - Velocità propulsiva (Log speed) in nodi
     * @param {number} dc - Direzione della corrente in gradi
     * @param {number} vc - Velocità della corrente in nodi
     */
    static calcolaRvVeff(rs, vp, dc, vc) {
        // 1. Scomposizione vettore Barca
        const rsRad = this.toRadians(rs);
        const barcaX = vp * Math.sin(rsRad);
        const barcaY = vp * Math.cos(rsRad);

        // 2. Scomposizione vettore Corrente
        const dcRad = this.toRadians(dc);
        const corrX = vc * Math.sin(dcRad);
        const corrY = vc * Math.cos(dcRad);

        // 3. Somma dei vettori (Vettore Risultante)
        const resX = barcaX + corrX;
        const resY = barcaY + corrY;

        // 4. Calcolo Veff (Magnitudo tramite Pitagora)
        const veff = Math.sqrt(Math.pow(resX, 2) + Math.pow(resY, 2));

        // 5. Calcolo Rv (Angolo tramite Arcotangente)
        // Usiamo atan2(x, y) invece dello standard atan2(y, x) per avere il Nord a 0°
        const rvRad = Math.atan2(resX, resY);
        const rv = this.toDegrees(rvRad);

        return {
            rv: Math.round(rv * 10) / 10,
            veff: Math.round(veff * 10) / 10
        };
    }

    /**
     * Calcola la Rotta di Superficie (Rs) aggiungendo lo scarroccio
     * @param {number} pv - Prora Vera
     * @param {number} lsc - Scarroccio (+ a dritta, - a sinistra)
     */
    static calcolaRs(pv, lsc) {
        return ((pv + lsc) % 360 + 360) % 360;
    }
}

