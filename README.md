# usa-e-getta: tabellone argomenti

Tabellone con 10 argomenti. Il pubblico vota dallo smartphone (QR code) e l'argomento più votato si illumina con un'animazione di circa 3,5 secondi. Ogni votazione parte solo quando la regia dà il via.

| Pagina | Indirizzo | A cosa serve |
|---|---|---|
| Tabellone | `/` | Da proiettare. Premi **F** (o doppio clic) per lo schermo intero |
| Voto | `/vota` | Si apre dal QR code |
| Regia | `/regia` | Dal tuo telefono: apri, chiudi, annulla, rivedi |

## Come funziona una serata

1. Apri il tabellone sul proiettore e la regia sul tuo telefono (chiave `ADMIN_KEY`).
2. **Via! Apri la votazione**: il pubblico inquadra il QR e vota.
3. **Chiudi e illumina il vincitore**: il tabellone fa la scansione, poi l'argomento più votato si accende.
4. Il sistema resta fermo finché non dai di nuovo il via.

Regole:
- un voto per telefono in ogni votazione;
- gli argomenti già illuminati non si possono più votare;
- in caso di pareggio vince un argomento estratto a sorte tra i primi (la regia lo segnala).

Comandi extra in regia: *Annulla votazione* (scarta i voti in corso), *Ripeti animazione*, *Spegni ultimo*, *Azzera tutto*.

## Avvio in locale

```bash
npm install
ADMIN_KEY=la-tua-chiave npm start
```

## Messa online (Render, gratuito)

1. Su render.com: **New → Blueprint** e collega questo repository (usa `render.yaml`).
2. In *Environment* trovi `ADMIN_KEY` generata in automatico (puoi cambiarla).
3. Facoltativo: imposta `PUBLIC_URL` (es. `https://tabellone.tuodominio.it`) se usi un dominio personalizzato. Il QR punterà a `PUBLIC_URL/vota`.

Va bene qualsiasi hosting Node con WebSocket (Railway, Fly.io, un VPS).
Nota: sul piano gratuito di Render il servizio si addormenta dopo 15 minuti di inattività e lo stato si azzera se il server riparte. Apri il tabellone qualche minuto prima dell'evento.

## Personalizzazione

- Argomenti: `TOPICS` in `server.js`
- Titoli e testi del tabellone: `public/board.html`
- Loghi: `public/assets/logos/`
- Colori: variabili in `public/css/base.css`
