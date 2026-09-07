(function () {
    const API_URL = "https://script.google.com/macros/s/AKfycbz66PaHt0R7KJclqVBHGVOSGHrTBBHRGl5HKl7AarzPBa9ZcmJCYqKrHxpoSacrJBw/exec";

    let databaseGrezzo = [];
    let argomentiDisponibili = [];
    let domandeSessione = [];
    let risposteUtente = {};
    let indiceCorrente = 0;
    let modalitaAttuale = "";
    let tempoRimanente = 0;
    let timerInterval = null;

    async function inizializza() {
        try {
            const response = await fetch(API_URL);
            databaseGrezzo = await response.json();
            localStorage.setItem('db_quiz', JSON.stringify(databaseGrezzo));
        } catch (e) {
            console.error('Offline. Uso dati locali.', e);
            databaseGrezzo = JSON.parse(localStorage.getItem('db_quiz') || '[]');
        }

        if (databaseGrezzo.length === 0) {
            document.getElementById('loading').innerHTML = "<h2 style='color:red;'>Nessun dato trovato. Controlla Google Sheets.</h2>";
            return;
        }

        const setArgomenti = new Set();
        databaseGrezzo.forEach((q) => {
            if (q.argomento) setArgomenti.add(q.argomento);
        });
        argomentiDisponibili = Array.from(setArgomenti).sort();

        const select = document.getElementById('select-argomento');
        select.innerHTML = '';
        argomentiDisponibili.forEach((arg) => {
            select.innerHTML += `<option value="${arg}">${arg}</option>`;
        });

        document.getElementById('loading').classList.add('hidden');
        document.getElementById('schermata-setup').classList.remove('hidden');
    }

    function avviaQuiz(modalita) {
        modalitaAttuale = modalita;
        risposteUtente = {};
        indiceCorrente = 0;

        if (modalita === 'esame') {
            const mazzo = [...databaseGrezzo].sort(() => 0.5 - Math.random());
            domandeSessione = mazzo.slice(0, 20);
            tempoRimanente = 30 * 60;
        } else if (modalita === 'argomento') {
            const argScelto = document.getElementById('select-argomento').value;
            domandeSessione = databaseGrezzo.filter((q) => q.argomento === argScelto);
            domandeSessione = domandeSessione.sort(() => 0.5 - Math.random()).slice(0, 30);
            tempoRimanente = domandeSessione.length * 90;
        }

        if (domandeSessione.length === 0) {
            alert('Nessuna domanda trovata per questa selezione.');
            return;
        }

        document.getElementById('schermata-setup').classList.add('hidden');
        document.getElementById('schermata-quiz').classList.remove('hidden');

        aggiornaInterfacciaDomanda();
        avviaTimer();
    }

    function aggiornaInterfacciaDomanda() {
        const q = domandeSessione[indiceCorrente];
        document.getElementById('contatore-domande').textContent = `Domanda ${indiceCorrente + 1} di ${domandeSessione.length}`;
        document.getElementById('categoria-label').textContent = `${q.sezione} - ${q.argomento}`;
        document.getElementById('testo-domanda').textContent = q.domanda;

        const contOpzioni = document.getElementById('contenitore-opzioni');
        contOpzioni.innerHTML = '';

        q.opzioni.forEach((testoOpt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'btn-opzione';
            if (risposteUtente[q.id] === idx) btn.classList.add('selezionata');

            btn.textContent = testoOpt;
            btn.addEventListener('click', () => selezionaRisposta(q.id, idx));
            contOpzioni.appendChild(btn);
        });

        document.getElementById('btn-prev').disabled = (indiceCorrente === 0);
        document.getElementById('btn-next').disabled = (indiceCorrente === domandeSessione.length - 1);
    }

    function selezionaRisposta(idDomanda, indiceRisposta) {
        risposteUtente[idDomanda] = indiceRisposta;
        aggiornaInterfacciaDomanda();
    }

    function cambiaDomanda(step) {
        indiceCorrente += step;
        aggiornaInterfacciaDomanda();
    }

    function avviaTimer() {
        clearInterval(timerInterval);
        timerInterval = setInterval(() => {
            tempoRimanente -= 1;
            if (tempoRimanente <= 0) {
                clearInterval(timerInterval);
                alert('Tempo scaduto! Il compito verrà consegnato automaticamente.');
                consegnaQuiz();
                return;
            }
            const m = Math.floor(tempoRimanente / 60).toString().padStart(2, '0');
            const s = (tempoRimanente % 60).toString().padStart(2, '0');
            document.getElementById('timer-display').textContent = `${m}:${s}`;
        }, 1000);
    }

    function consegnaQuiz() {
        if (tempoRimanente > 0 && Object.keys(risposteUtente).length < domandeSessione.length) {
            if (!confirm('Non hai risposto a tutte le domande. Sicuro di voler consegnare?')) return;
        }

        clearInterval(timerInterval);
        let punteggio = 0;
        let listaErroriHTML = '';
        let idErroriPerCloud = [];

        domandeSessione.forEach((q) => {
            const rspData = risposteUtente[q.id];
            const rspCorretta = parseInt(q.rispostaCorretta, 10);

            if (rspData === rspCorretta) {
                punteggio += 1;
            } else {
                idErroriPerCloud.push(q.id);
                const testoData = rspData !== undefined ? q.opzioni[rspData] : '<i>Nessuna risposta data</i>';
                const testoEsatta = q.opzioni[rspCorretta];

                listaErroriHTML += `
                    <div class="errore-item">
                        <b style="color:#f87171;">Q: ${q.domanda}</b><br>
                        <span style="color:#94a3b8;">Tua risposta:</span> ${testoData}<br>
                        <span style="color:#4ade80;">Risposta esatta:</span> ${testoEsatta}<br>
                        <small style="color:#fb923c; margin-top:5px; display:block;">ℹ️ ${q.spiegazione}</small>
                    </div>
                `;
            }
        });

        const limiteErrori = modalitaAttuale === 'esame' ? 3 : Math.floor(domandeSessione.length * 0.2);
        const erroriFatti = domandeSessione.length - punteggio;
        const promosso = erroriFatti <= limiteErrori;

        document.getElementById('esito-titolo').textContent = promosso ? 'COMPLIMENTI! IDONEO 🟢' : 'BOCCIATO 🔴';
        document.getElementById('esito-titolo').style.color = promosso ? '#4ade80' : '#ef4444';
        document.getElementById('esito-punteggio').textContent = `Punteggio: ${punteggio} su ${domandeSessione.length} (Errori: ${erroriFatti})`;
        document.getElementById('lista-errori').innerHTML = erroriFatti === 0 ? "<p style='color:#4ade80'>Percorso netto! Nessun errore.</p>" : listaErroriHTML;

        document.getElementById('schermata-quiz').classList.add('hidden');
        document.getElementById('schermata-risultati').classList.remove('hidden');

        salvaInCloud(modalitaAttuale, `${punteggio}/${domandeSessione.length}`, promosso ? 'Idoneo' : 'Bocciato', idErroriPerCloud.join(', '));
    }

    async function salvaInCloud(mod, punt, esito, errTxt) {
        const payload = {
        email: localStorage.getItem('navigazione_user'),
        modalita: mod === 'esame' ? 'Simulazione Esame Base' : 'Argomento',
        punteggio: punt,
        esito: esito,
        errori: errTxt
    };

        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload)
            });
            document.getElementById('stato-salvataggio').textContent = '✔ Risultati salvati nello Storico Cloud.';
            document.getElementById('stato-salvataggio').style.color = '#4ade80';
        } catch (e) {
            document.getElementById('stato-salvataggio').textContent = '❌ Errore di connessione. Dati salvati solo in locale.';
            document.getElementById('stato-salvataggio').style.color = '#ef4444';
        }
    }

    function tornaAlSetup() {
        document.getElementById('schermata-risultati').classList.add('hidden');
        document.getElementById('schermata-setup').classList.remove('hidden');
    }

    window.avviaQuiz = avviaQuiz;
    window.consegnaQuiz = consegnaQuiz;
    window.tornaAlSetup = tornaAlSetup;
    window.cambiaDomanda = cambiaDomanda;

    inizializza();
})();
