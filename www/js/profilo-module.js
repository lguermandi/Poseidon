/**
 * PROFILO.JS - Logica di gestione utente e dati
 */

const API_URL = POSEIDON_API_URL;
const SESSIONE_KEY = 'poseidon_sessione';

document.addEventListener('DOMContentLoaded', () => {
    inizializzaApp();
});

async function inizializzaApp() {
    window.addEventListener('online', () => {
        aggiornaInterfacciaSync(true);
        const sessione = leggiSessione();
        if (sessione) sincronizzaStoricoCloud(sessione);
    });
    window.addEventListener('offline', () => aggiornaInterfacciaSync(false));
    aggiornaInterfacciaSync(navigator.onLine);

    const sessione = leggiSessione();
    if (!sessione) return;

    mostraStatoUtente(sessione.email);
    aggiornaStatisticheLocali();

    if (!navigator.onLine) {
        aggiornaInterfacciaSync(false);
        return;
    }

    try {
        const risultato = await richiestaAPI({
            azione: 'verifica_sessione',
            sessionToken: sessione.token
        });
        if (risultato.status === 'successo') {
            const email = risultato.email || sessione.email;
            sessione.email = email;
            localStorage.setItem(SESSIONE_KEY, JSON.stringify(sessione));
            mostraStatoUtente(email);
            await sincronizzaStoricoCloud(sessione);
        } else if (/session|token|autorizz/i.test(risultato.messaggio || risultato.errore || '')) {
            cancellaSessione();
            document.getElementById('form-container').style.display = 'block';
            document.getElementById('profilo-container').style.display = 'none';
        }
    } catch (errore) {
        console.warn('Cloud non raggiungibile; mantengo la sessione locale.', errore);
        aggiornaInterfacciaSync(false);
    }
}

// --- GESTIONE SESSIONE ---
function leggiSessione() {
    try {
        const sessione = JSON.parse(localStorage.getItem(SESSIONE_KEY) || sessionStorage.getItem(SESSIONE_KEY) || 'null');
        if (!sessione || !sessione.token || !sessione.email) {
            cancellaSessione();
            return null;
        }
        const scadenzaNumerica = Number(sessione.scadenza);
        const scadenza = Number.isFinite(scadenzaNumerica) ? scadenzaNumerica : Date.parse(sessione.scadenza);
        sessione.offline = Number.isFinite(scadenza) && scadenza <= Date.now();
        localStorage.setItem(SESSIONE_KEY, JSON.stringify(sessione));
        return sessione;
    } catch {
        cancellaSessione();
        return null;
    }
}

function salvaSessione(email, token, scadenza) {
    const sessione = JSON.stringify({ email, token, scadenza });
    localStorage.setItem(SESSIONE_KEY, sessione);
    sessionStorage.setItem(SESSIONE_KEY, sessione);
}

function cancellaSessione() {
    localStorage.removeItem(SESSIONE_KEY);
    sessionStorage.removeItem(SESSIONE_KEY);
}

function richiestaAPI(payload) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    return fetch(API_URL, {
        method: 'POST',
        body: JSON.stringify(payload),
        signal: controller.signal
    }).then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
    }).finally(() => clearTimeout(timeout));
}

function ottieniPosizioneGPS() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ lat: 'Non supportato', lng: 'Non supportato' });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
            () => resolve({ lat: 'Permesso negato', lng: 'Permesso negato' }),
            { enableHighAccuracy: true, timeout: 6000 }
        );
    });
}

async function effettuaAccesso() {
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const password = document.getElementById('auth-password').value;
    const status = document.getElementById('auth-status');
    status.style.color = '#fb923c';
    status.textContent = 'Verifica credenziali...';

    try {
        const posizione = await ottieniPosizioneGPS();
        const risultato = await richiestaAPI({
            azione: 'login', email, password, lat: posizione.lat, lng: posizione.lng
        });
        if (risultato.status !== 'successo' || !risultato.token || !risultato.scadenza) {
            status.style.color = '#ef4444';
            status.textContent = risultato.messaggio || 'Credenziali non valide.';
            return;
        }
        salvaSessione(email, risultato.token, risultato.scadenza);
        mostraStatoUtente(email);
        aggiornaStatisticheLocali();
        await sincronizzaStoricoCloud({ email, token: risultato.token });
    } catch (errore) {
        status.style.color = '#ef4444';
        status.textContent = errore.name === 'AbortError'
            ? 'Il server di autenticazione non risponde. Riprova tra poco.'
            : 'Errore di rete durante il login.';
    }
}

async function registrati() {
    const email = document.getElementById('auth-email').value.trim().toLowerCase();
    const password = document.getElementById('auth-password').value;
    const status = document.getElementById('auth-status');
    if (!email || !password) {
        status.style.color = '#ef4444';
        status.textContent = 'Inserisci email e password per la registrazione.';
        return;
    }
    status.style.color = '#fb923c';
    status.textContent = 'Registrazione sul cloud in corso...';
    try {
        const posizione = await ottieniPosizioneGPS();
        const risultato = await richiestaAPI({
            azione: 'registrazione', email, password, lat: posizione.lat, lng: posizione.lng
        });
        status.style.color = risultato.status === 'successo' ? '#4ade80' : '#ef4444';
        status.textContent = risultato.messaggio || 'Registrazione completata.';
    } catch (errore) {
        status.style.color = '#ef4444';
        status.textContent = errore.name === 'AbortError'
            ? 'Il server di autenticazione non risponde. Riprova tra poco.'
            : 'Errore di rete durante la registrazione.';
    }
}

function mostraStatoUtente(email) {
    document.getElementById('form-container').style.display = 'none';
    document.getElementById('profilo-container').style.display = 'block';
    document.getElementById('testo-email-utente').textContent = email;
    caricaListaRotte();
}

// --- STATISTICHE E ROTTE ---
function aggiornaStatisticheLocali() {
    const logbook = leggiArrayLocale('nave_logbook');
    const quiz = leggiArrayLocale('nave_storico_quiz');

    document.getElementById('stat-logbook').textContent = logbook.length;
    document.getElementById('stat-quiz').textContent = quiz.length;

    // Carica campi profilo
    document.getElementById('profilo-qualifica').value = localStorage.getItem('profilo_qualifica') || "";
    document.getElementById('profilo-barca').value = localStorage.getItem('profilo_barca') || "";
}

function leggiArrayLocale(chiave) {
    try {
        const dati = JSON.parse(localStorage.getItem(chiave) || '[]');
        return Array.isArray(dati) ? dati : [];
    } catch (errore) {
        console.warn(`Dati locali non validi (${chiave}).`, errore);
        return [];
    }
}

async function sincronizzaStoricoCloud(sessione) {
    if (!navigator.onLine || !sessione?.token || !sessione.email) return;

    try {
        const risultato = await richiestaAPI({
            azione: 'carica_riepilogo',
            email: sessione.email,
            sessionToken: sessione.token
        });
        if (risultato.status !== 'successo') {
            throw new Error(risultato.messaggio || 'Risposta non valida dal server.');
        }

        if (Array.isArray(risultato.logbook)) {
            localStorage.setItem('nave_logbook', JSON.stringify(risultato.logbook));
        }
        if (Array.isArray(risultato.quiz)) {
            localStorage.setItem('nave_storico_quiz', JSON.stringify(risultato.quiz));
        }

        aggiornaStatisticheLocali();
        if (!Array.isArray(risultato.logbook) && Number.isFinite(Number(risultato.vociLogbook))) {
            document.getElementById('stat-logbook').textContent = Number(risultato.vociLogbook);
        }
        if (!Array.isArray(risultato.quiz) && Number.isFinite(Number(risultato.quizSvolti))) {
            document.getElementById('stat-quiz').textContent = Number(risultato.quizSvolti);
        }
    } catch (errore) {
        console.warn('Impossibile caricare lo storico dal cloud; mantengo i dati locali.', errore);
    }
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