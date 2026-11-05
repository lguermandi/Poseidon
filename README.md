# ⛵ Poseidon – Plancia di Comando Nautica

Poseidon è una web app (PWA) per la preparazione alla patente nautica e per l'uso di bordo: quiz, carteggio, navigazione GPS con registrazione tracce, strumenti di vela, maree, meteo, fari e logbook di bordo. Lo stesso codice viene confezionato come app Android tramite [Capacitor](https://capacitorjs.com/).

## Indice

- [Funzionalità](#funzionalità)
- [Struttura del progetto](#struttura-del-progetto)
- [Architettura](#architettura)
- [Requisiti](#requisiti)
- [Avvio in locale](#avvio-in-locale)
- [Test](#test)
- [Build Android](#build-android)
- [Deploy web (GitHub Pages)](#deploy-web-github-pages)
- [Dati salvati nel browser](#dati-salvati-nel-browser)
- [Servizi esterni](#servizi-esterni)
- [Problemi noti](#problemi-noti)

## Funzionalità

Il menu principale ([index.html](./www/index.html)) ha tre sezioni, ognuna caricata in un `iframe`:

| Sezione | Pagina | Contenuto |
|---|---|---|
| **Accademia** | [accademia.html](./www/moduli/accademia.html) | Hub di studio: quiz, carteggio, fari, VHF, sicurezza |
| **Navigazione** | [navigazione.html](./www/moduli/navigazione.html) | Hub strumenti di bordo: mappa, meteo, maree, vela, motore, ancoraggio, sicurezza |
| **Profilo** | [profilo.html](./www/moduli/profilo.html) | Dati dell'utente e della barca, storico quiz e rotte, backup/ripristino |

Moduli principali:

- **Quiz** ([quiz-module.js](./www/js/quiz-module.js)): domande scaricate da un endpoint Google Apps Script e salvate in locale per l'uso offline.
- **Mappa e navigazione** ([mappa.html](./www/moduli/mappa.html) + [mappa-module.js](./www/js/mappa-module.js)): mappa Leaflet con OpenStreetMap e OpenSeaMap, posizione GPS (su Android tramite BackgroundGeolocation), registrazione tracce, rotte esportabili in GPX, distanza e velocità calcolate con [core_gps.js](./www/js/core_gps.js), previsioni marine e vento (Open-Meteo).
- **Manovre vela** ([vela.html](./www/moduli/vela.html) + [core_vela.js](./www/js/core_vela.js)): calcolo vento vero, VMG e velocità target da polare.
- **Maree** ([maree.html](./www/moduli/maree.html)), **Meteo** ([meteo.html](./www/moduli/meteo.html)), **Fari** ([fari.html](./www/moduli/fari.html)), **Motore** ([motore.html](./www/moduli/motore.html)), **Ancoraggio** ([ancora.html](./www/moduli/ancora.html)), **Sicurezza** ([sicurezza.html](./www/moduli/sicurezza.html)), **VHF** ([vhf.html](./www/moduli/vhf.html)).
- **Carteggio** ([carteggio.html](./www/moduli/carteggio.html)): esercitazioni di carteggio con Leaflet ed esportazione PDF (html2pdf).
- **Logbook** ([logbook.html](./www/moduli/logbook.html)): registro di bordo.
- **Permessi all'avvio**: su Android l'app chiede il permesso notifiche e la posizione ([app-shell.js](./www/js/app-shell.js)).

## Struttura del progetto

```
Simulatore_Navigazione/
├── www/                          # Sorgenti web (la webapp vera e propria)
│   ├── index.html                # Shell: header con menu + iframe
│   ├── manifest.json             # Manifest PWA
│   ├── sw.js                     # Service worker (cache offline)
│   ├── robots.txt, sitemap.xml
│   ├── css/style.css
│   ├── fonts/inter-latin-variable.woff2   # Font Inter locale (variabile, latin)
│   ├── google2ee976ef7475385b.html        # File di verifica Google Search Console
│   ├── img/icona.svg
│   ├── js/
│   │   ├── app-shell.js          # Permessi all'avvio, registrazione service worker
│   │   ├── config.js             # URL dell'endpoint Google Apps Script (unico punto da modificare)
│   │   ├── core_navigazione.js   # NavCore, DeviationTable (deviazione bussola), VectorMath
│   │   ├── core_gps.js           # GpsTrackMetrics: distanza e velocità da GPS
│   │   ├── core_vela.js          # LogicaVela: vento vero, VMG, polare
│   │   ├── mappa-module.js       # Logica di mappa e navigazione
│   │   ├── profilo-module.js     # Profilo, sessione, backup, sincronizzazione
│   │   └── quiz-module.js        # Quiz e storico
│   └── moduli/                   # Pagine caricate nell'iframe o negli hub
├── tests/
│   └── core.test.js              # Test unitari dei moduli core (node:test)
├── android/                      # Progetto Android generato da Capacitor
├── .github/workflows/            # CI/CD (build APK, deploy Pages, generazione keystore)
├── scripts/
│   └── aggiorna-versione-cache.js  # Aggiorna NOME_CACHE in www/sw.js (hash di www/)
├── server.js                     # Server HTTP statico per sviluppo locale
├── capacitor.config.json         # Configurazione Capacitor (appId, webDir)
└── package.json
```

## Architettura

- **Shell + iframe**: [index.html](./www/index.html) mostra il menu e un `iframe` (`#app-frame`). La funzione `cambiaModulo()` cambia la `src` dell'iframe e aggiorna il pulsante attivo.
- **Moduli core senza dipendenze**: i file `www/js/core_*.js` espongono classi pure, esportate anche tramite `module.exports` così da poter essere testate con Node. Nel browser vengono caricate con `<script>`.
- **Stato in `localStorage`**: non esiste un backend proprietario. Sessione, profilo, tracce, rotte, storico quiz e coda di sincronizzazione vivono nel browser (vedi [Dati salvati nel browser](#dati-salvati-nel-browser)).
- **Offline**: [sw.js](./www/sw.js) pre-carica una lista fissa di file (`FILE_DA_SALVARE`) nella cache `NOME_CACHE` e risponde con strategia *cache-first*. Se un file non è in cache e la rete non risponde, le navigazioni ricevono `index.html`, le altre richieste un 503.
- **Endpoint remoto**: l'URL di Google Apps Script è definito una sola volta in [config.js](./www/js/config.js) (`POSEIDON_API_URL`), caricato prima dei moduli nelle pagine che lo usano.

## Requisiti

- **Node.js 22** (usato anche dalla CI).
- **npm**.
- Per la build Android: **Java 21**, Android SDK e Gradle (incluso tramite `android/gradlew`).

## Avvio in locale

```powershell
npm install
npm start
```

`npm start` esegue [server.js](./server.js), un server statico che serve `www/` su `http://127.0.0.1:5500` (porta modificabile con la variabile d'ambiente `PORT`). Supporta solo `GET` e `HEAD`; le directory vengono reindirizzate al loro `index.html`.

> Il service worker viene registrato anche in locale. `NOME_CACHE` in `sw.js` viene aggiornato automaticamente con `npm run cache:version` (hash del contenuto di `www/`) e in CI prima del deploy; dopo modifiche locali eseguirlo, altrimenti il browser può servire i file vecchi (oppure svuotare la cache).

## Test

```powershell
npm test
```

Lancia `node --test tests/*.test.js`. La suite copre:

- normalizzazione degli angoli e conversione prora → rotta/velocità effettiva (`NavCore`, `VectorMath`);
- interpolazione della deviazione magnetica (`DeviationTable`);
- VMG e vento vero (`LogicaVela`);
- accumulo di distanza e velocità GPS (`GpsTrackMetrics`).

Non ci sono test per i moduli di interfaccia (`mappa-module.js`, `quiz-module.js`, `profilo-module.js`) né per il service worker.

## Build Android

L'app Android usa Capacitor con `appId` `com.lucaguermandi.poseidon` e `webDir` = `www`.

Build locale:

```powershell
npm install
npx cap sync android
cd android
.\gradlew.bat assembleRelease
```

Il workflow [build-android.yml](./.github/workflows/build-android.yml) gira su push su `main`/`master`: installa le dipendenze, esegue `npx cap sync android`, compila `assembleRelease`, firma l'APK con il keystore memorizzato nei secret (`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, alias `poseidon`) e carica l'artifact `Poseidon-APK-Ufficiale`. L'action di firma è fissata a un commit SHA e il workflow ha permessi `contents: read`.

Genera il keystore su una macchina fidata, non in GitHub Actions, con `keytool -genkeypair -v -keystore poseidon.jks -keyalg RSA -keysize 2048 -validity 10000 -alias poseidon -dname "CN=Poseidon, OU=Poseidon, O=Vela, C=IT"`; inserisci una password robusta quando richiesto e usa la stessa password per keystore e chiave. In PowerShell, ottieni il Base64 con `[Convert]::ToBase64String([IO.File]::ReadAllBytes("poseidon.jks"))`. Non committare né condividere il file o il valore Base64: salva quest'ultimo e la password in **Settings > Secrets and variables > Actions** del repository, rispettivamente come `KEYSTORE_BASE64` e `KEYSTORE_PASSWORD`; non inserirli in workflow, log o artifact.

Il precedente workflow di generazione pubblicava il keystore come artifact. Se è stato eseguito, considera compromessa la chiave generata: elimina gli artifact e le esecuzioni che la rendono scaricabile, aggiorna i secrets e valuta la rotazione della chiave secondo il canale di distribuzione dell'app (la rotazione può impedire gli aggiornamenti agli utenti esistenti).

Plugin nativi: `@capacitor-community/background-geolocation` per la traccia GPS in background, `@capacitor/local-notifications` per le notifiche.

## Deploy web (GitHub Pages)

Il workflow [static.yml](./.github/workflows/static.yml) pubblica la cartella `www/` su GitHub Pages a ogni push su `main`. Prima dell'upload esegue `scripts/aggiorna-versione-cache.js`, quindi non serve build. Il file `google2ee976ef7475385b.html` è in `www/` ed è pubblicato con il resto del sito.

## Dati salvati nel browser

Chiavi principali usate in `localStorage` (alcune con fallback su `sessionStorage`):

| Chiave | Contenuto | Usata da |
|---|---|---|
| `poseidon_sessione` | Sessione utente | profilo, mappa |
| `poseidon_sync_queue` | Coda di invii da sincronizzare quando torna la rete | mappa |
| `navigazione_traccia_attiva` | Traccia in registrazione | mappa |
| `navigazione_rotte` | Rotte salvate | mappa, profilo |
| `nave_logbook` | Voci del logbook | profilo |
| `nave_storico_quiz` | Storico dei quiz | profilo |
| `db_quiz` | Domande quiz in cache | quiz |
| `profilo_qualifica`, `profilo_barca` | Dati del profilo | profilo, mappa |

Il backup del profilo esporta queste chiavi; il ripristino le reimporta.

## Servizi esterni

| Servizio | Uso |
|---|---|
| Google Apps Script (endpoint in [config.js](./www/js/config.js)) | Quiz, sincronizzazione e salvataggi remoti |
| OpenStreetMap / OpenSeaMap | Tile della mappa |
| Open-Meteo | Previsioni marine e vento |
| unpkg (Phosphor Icons 2.1.2, Leaflet 1.9.4) | Icone e libreria mappa, con versione fissata e `integrity` SRI |
| cdnjs (html2pdf 0.10.1), jsDelivr (Chart.js 4.6.1) | Esportazione PDF e grafici maree, con versione fissata e SRI |

Il font Inter è servito localmente da `www/fonts/`, senza Google Fonts.

## Mappa: posizione e navigazione

`mappa.html` ha due schede in fondo allo schermo:

- **Posizione**: mostra la posizione GPS, il marcatore, le coordinate e l'indicatore di precisione (`±N m`, con stato "assente" se il GPS non risponde). Il GPS è attivo mentre la scheda è aperta.
- **Navigazione**: registra la traccia, calcola distanza e velocità e permette di pianificare rotte sulla mappa. Registrare avvia sempre il GPS, anche fuori da questa scheda.

Il fondo mappa è vettoriale (MapLibre GL con lo stile OpenFreeMap, dati OpenStreetMap, senza chiave API) e mostra le etichette in italiano quando disponibili (`name:it`); se lo stile non si carica torna alle tile OpenStreetMap. Le librerie sono fissate con SRI in [mappa.html](./www/moduli/mappa.html) e incluse nella cache offline di [sw.js](./www/sw.js); lo stile invece va scaricato, quindi la mappa vettoriale richiede connessione. Il livello nautico (OpenSeaMap) è sopra la base.

Il servizio di posizione è condiviso da entrambe le schede (`avviaPosizione` / `fermaPosizione` in [mappa-module.js](./www/js/mappa-module.js)). Tutti i punti vengono accettati e mostrati con la loro precisione; la distanza è calcolata da [core_gps.js](./www/js/core_gps.js) con soglia di 2 m, quindi a bassa precisione può comparire qualche metro di rumore.

Se la distanza resta a zero mentre il tempo scorre, controllare: permesso di posizione concesso al browser o all'app, indicatore di precisione presente nella scheda Posizione, e che la scheda Navigazione mostri "● REC". Gli errori di segnale GPS sono non bloccanti: la registrazione continua.

Se il GPS non risponde, la scheda Posizione mostra il motivo: permesso negato, localizzazione del sistema disattivata, o assenza di segnale. Nell'app Android il watcher nativo (`@capacitor-community/background-geolocation`) parte quando si apre la scheda Posizione o si avvia la registrazione, e chiede da solo il permesso di posizione; non attende più la richiesta di permesso notifiche, che poteva bloccarlo.

Su Windows, se la posizione del browser è impostata su "Nega" (`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\location`), il GPS da desktop non funziona: va abilitata in Impostazioni → Privacy e sicurezza → Posizione.

Senza connessione alcune funzioni non sono disponibili; quelle che dipendono dalla rete usano la coda di sincronizzazione o la cache locale.

### Stato "Modalità Offline" nel profilo

Nella pagina profilo lo stato è "Cloud Sincronizzato" o "Modalità Offline". Viene mostrato offline solo se il browser risulta offline oppure se la verifica della sessione col server fallisce (il messaggio è in console: `Cloud non raggiungibile...`). Una sessione con scadenza passata non causa più lo stato offline: il server viene interrogato comunque, e solo una risposta di sessione non valida chiede di nuovo il login.

## Problemi noti

Problemi ancora aperti, emersi dall'analisi del codice:

1. **Icone Phosphor offline e senza SRI sui file secondari** – Lo script `index.js` (ora con SRI) inserisce a runtime i fogli di stile e i font da `cdn.jsdelivr.net` senza `integrity` e senza precaching in `sw.js`: offline le icone potrebbero non comparire. Soluzione possibile: self-hosting di CSS e font di Phosphor.
2. **`home.html` non collegato** – È in cache ma nessuna pagina lo linka.
3. **GPS nell'APK non ancora verificato** – Le modifiche al watcher nativo sono state testate solo nel browser con posizione simulata. Da confermare con un'APK ricompilata.
4. **Verifica della sessione nell'APK** – Se il profilo mostra "Modalità Offline" con rete attiva, serve il messaggio di errore da `chrome://inspect`.

Risolti: pagine `mappa.html`/`vhf.html` e `core_gps.js` nella cache offline, file di verifica Google spostato in `www/` (ora pubblicato da GitHub Pages), `main` in `package.json`, `console.log` di debug in `core_navigazione.js`, endpoint Apps Script centralizzato in `config.js`, versioni CDN fissate con SRI, font Inter locale, `NOME_CACHE` aggiornato automaticamente con `npm run cache:version`.


## Licenza

ISC (vedi `package.json`).
