/**
 * PROFILO.JS - Logica di gestione utente e dati
 */

const API_URL = "https://script.google.com/macros/s/AKfycbz66PaHt0R7KJclqVBHGVOSGHrTBBHRGl5HKl7AarzPBa9ZcmJCYqKrHxpoSacrJBw/exec"; // Sostituisci con il tuo URL
const SESSIONE_KEY = 'poseidon_sessione';

document.addEventListener('DOMContentLoaded', () => {
    inizializzaApp();
});

async function inizializzaApp() {
    const sessione = leggiSessione();

    if (sessione) {
        mostraStatoUtente(sessione.email);
        aggiornaStatisticheLocali();
    }

    // Gestione stato online/offline
    window.addEventListener('online', () => aggiornaInterfacciaSync(true));
    window.addEventListener('offline', () => aggiornaInterfacciaSync(false));
    aggiornaInterfacciaSync(navigator.onLine);
}

// --- GESTIONE SESSIONE ---
function leggiSessione() {
    try {
        return JSON.parse(localStorage.getItem(SESSIONE_KEY));
    } catch { return null; }
}

function mostraStatoUtente(email) {
    document.getElementById('form-container').style.display = 'none';
    document.getElementById('profilo-container').style.display = 'block';
    document.getElementById('testo-email-utente').textContent = email;
    caricaListaRotte();
}

// --- STATISTICHE E ROTTE ---
function aggiornaStatisticheLocali() {
    const logbook = JSON.parse(localStorage.getItem('nave_logbook') || "[]");
    const quiz = JSON.parse(localStorage.getItem('nave_storico_quiz') || "[]");

    document.getElementById('stat-logbook').textContent = logbook.length;
    document.getElementById('stat-quiz').textContent = quiz.length;

    // Carica campi profilo
    document.getElementById('profilo-qualifica').value = localStorage.getItem('profilo_qualifica') || "";
    document.getElementById('profilo-barca').value = localStorage.getItem('profilo_barca') || "";
}

function caricaListaRotte() {
    const container = document.getElementById('lista-tracce');
    const rotte = JSON.parse(localStorage.getItem('navigazione_rotte') || "[]");

    if (rotte.length === 0) {
        container.innerHTML = '<p style="color: var(--testo-secondario); text-align:center;">Nessuna rotta in archivio.</p>';
        return;
    }

    container.innerHTML = rotte.reverse().map(rotta => `
        <div class="track-item">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 700; color: var(--testo-primario);">${rotta.nome || 'Navigazione'}</div>
                    <div style="font-size: 0.75rem; color: var(--testo-secondario);">${rotta.data}</div>
                </div>
                <button class="btn-action" style="width: auto; padding: 5px 10px; font-size: 0.7rem;" onclick="scaricaGPX(${rotta.id})">
                    GPX
                </button>
            </div>
        </div>
    `).join('');
}

// --- FUNZIONI DI EXPORT ---
function scaricaGPX(id) {
    const rotte = JSON.parse(localStorage.getItem('navigazione_rotte') || "[]");
    const rotta = rotte.find(r => r.id === id);
    if (!rotta) return;

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Poseidon">
    <trk><name>${rotta.nome}</name><trkseg>`;

    rotta.punti.forEach(p => {
        gpx += `\n<trkpt lat="${p.lat}" lon="${p.lon}"><time>${p.time}</time></trkpt>`;
    });

    gpx += `\n</trkseg></trk></gpx>`;

    const blob = new Blob([gpx], { type: 'application/gpx+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rotta.nome.replace(/\s+/g, '_')}.gpx`;
    a.click();
}

function esportaBackupCompleto() {
    const chiavi = ['profilo_qualifica', 'profilo_barca', 'navigazione_rotte', 'nave_logbook', 'nave_storico_quiz'];
    const backup = {};
    chiavi.forEach(k => backup[k] = localStorage.getItem(k));

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Poseidon_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
}

// --- FEEDBACK UI ---
function aggiornaInterfacciaSync(isOnline) {
    const el = document.getElementById('sync-status');
    if (!el) return;
    el.innerHTML = isOnline
        ? '<span style="color:var(--accento-verde)">●</span> Cloud Sincronizzato'
        : '<span style="color:var(--accento-rosso)">●</span> Modalità Offline';
}

function esciAccount() {
    if (confirm("Vuoi disconnettere l'account? I dati locali rimarranno sul dispositivo.")) {
        localStorage.removeItem(SESSIONE_KEY);
        location.reload();
    }
}