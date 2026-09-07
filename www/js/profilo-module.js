document.addEventListener("DOMContentLoaded", () => {
    caricaStatisticheERotte();
});

function caricaStatisticheERotte() {
    const rotte = JSON.parse(localStorage.getItem("navigazione_rotte") || "[]");
    
    // Calcola totali
    let migliaTotali = 0;
    rotte.forEach(r => {
        migliaTotali += parseFloat(r.distanza || 0);
    });

    document.getElementById("totale-miglia").innerText = migliaTotali.toFixed(2);
    document.getElementById("totale-uscite").innerText = rotte.length;

    // Popola la lista
    const container = document.getElementById("lista-rotte");
    if (rotte.length === 0) {
        container.innerHTML = '<p style="font-size: 0.85rem; color: #94a3b8; text-align: center;">Nessuna rotta salvata.</p>';
        return;
    }

    container.innerHTML = rotte.slice(-5).reverse().map(r => `
        <div class="route-item">
            <div>
                <strong style="color: #38bdf8;">${r.data || 'Uscita'}</strong><br>
                <small style="color: #94a3b8;">${r.durata || '00:00'} min</small>
            </div>
            <div style="font-weight: bold; color: #22c55e;">
                ${parseFloat(r.distanza || 0).toFixed(2)} Nm
            </div>
        </div>
    `).join('');
}

// Esporta i dati in un file scaricabile sul dispositivo
function esportaDati() {
    const dati = localStorage.getItem("navigazione_rotte") || "[]";
    const blob = new Blob([dati], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = `navigazione_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Importa i dati selezionati dall'utente
function importaDati(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const parsed = JSON.parse(e.target.result);
            if (Array.isArray(parsed)) {
                localStorage.setItem("navigazione_rotte", JSON.stringify(parsed));
                alert("Dati ripristinati con successo!");
                caricaStatisticheERotte();
            } else {
                alert("Formato file non valido.");
            }
        } catch (err) {
            alert("Errore durante la lettura del file.");
        }
    };
    reader.readAsText(file);
}