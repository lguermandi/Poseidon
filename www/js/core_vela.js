class LogicaVela {

    /**
     * Calcola il Vento Vero (True Wind) conoscendo la velocità della barca,
     * l'angolo e la velocità del Vento Apparente (Apparent Wind).
     * 
     * @param {number} sog - Velocità della barca (Nodi)
     * @param {number} awa - Apparent Wind Angle (Gradi 0-180)
     * @param {number} aws - Apparent Wind Speed (Nodi)
     */
    static calcolaVentoVero(sog, awa, aws) {
        const awaRad = awa * (Math.PI / 180);

        // Scomponiamo il vento apparente sugli assi della barca
        const awsX = aws * Math.sin(awaRad);
        const awsY = aws * Math.cos(awaRad);

        // Vento Vero Y = Apparente Y - Velocità barca
        const twsY = awsY - sog;
        const twsX = awsX;

        // Magnitudo del Vento Vero (TWS)
        const tws = Math.sqrt(Math.pow(twsX, 2) + Math.pow(twsY, 2));

        // Angolo del Vento Vero (TWA)
        let twaRad = Math.atan2(twsX, twsY);
        let twa = twaRad * (180 / Math.PI);

        return {
            tws: Math.round(tws * 10) / 10,
            twa: Math.round(Math.abs(twa))
        };
    }

    /**
     * Calcola la VMG (Velocity Made Good) verso la direzione del vento.
     * @param {number} twa - True Wind Angle in gradi (0-180)
     * @param {number} boatSpeed - Velocità della barca in nodi
     */
    static calcolaVMG(twa, boatSpeed) {
        const twaRad = twa * (Math.PI / 180);
        const vmg = boatSpeed * Math.cos(twaRad);
        return Math.round(vmg * 100) / 100;
    }

    /**
     * Estrae la velocità target dalle polari della barca
     */
    static getTargetSpeed(polari, tws, twa) {
        const ventiDisponibili = Object.keys(polari.tws).map(Number);
        if (ventiDisponibili.length === 0) return 0;

        // Trova l'intensità di vento più vicina nella polare
        const ventoPiuVicino = ventiDisponibili.reduce((prev, curr) =>
            Math.abs(curr - tws) < Math.abs(prev - tws) ? curr : prev
        );

        const curva = polari.tws[ventoPiuVicino];
        const angoliDisponibili = Object.keys(curva).map(Number);

        // Trova l'angolo (TWA) più vicino nella polare
        const angoloPiuVicino = angoliDisponibili.reduce((prev, curr) =>
            Math.abs(curr - twa) < Math.abs(prev - twa) ? curr : prev
        );

        return curva[angoloPiuVicino];
    }
}

if (typeof module !== 'undefined') {
    module.exports = { LogicaVela };
}