(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  let state = null;
  let myVote = null; // argomento votato nella votazione corrente
  let myRound = null;
  let selected = null;
  let sending = false;

  const LS_KEY = 'vote-round';
  function remembered() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch { return null; }
  }
  function remember(round, topic) {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ round, topic })); } catch { /* ignore */ }
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.t);
    toast.t = setTimeout(() => t.classList.remove('show'), 3200);
  }

  function label(id) {
    const t = state.topics.find((x) => x.id === id);
    return t ? t.label : id;
  }

  function show(view) {
    ['viewWait', 'viewVote', 'viewDone'].forEach((v) => { $(v).hidden = v !== view; });
    $('confirmBar').classList.toggle('show', view === 'viewVote');
  }

  function render() {
    if (!state) return;
    const chosen = new Set(state.chosen.map((c) => c.id));

    if (myRound !== state.roundId) { if (myRound !== null) { myVote = null; selected = null; } myRound = state.roundId; }
    // memoria locale come seconda barriera contro il doppio voto
    const mem = remembered();
    if (state.phase === 'voting' && !myVote && mem && mem.round === state.roundId) myVote = mem.topic;

    $('roundLabel').textContent = state.round && state.phase === 'voting' ? `Votazione n. ${state.round}` : 'Festival della Famiglia di Trento';

    if (state.phase === 'voting' && !myVote) {
      show('viewVote');
      const box = $('options');
      if (!box.children.length) {
        state.topics.forEach((t, i) => {
          const b = document.createElement('button');
          b.className = 'opt';
          b.type = 'button';
          b.dataset.id = t.id;
          b.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span><span class="l"></span>`;
          b.querySelector('.l').textContent = t.label;
          b.addEventListener('click', () => { selected = t.id; render(); });
          box.appendChild(b);
        });
      }
      if (selected && chosen.has(selected)) selected = null;
      [...box.children].forEach((b) => {
        b.disabled = chosen.has(b.dataset.id);
        b.classList.toggle('sel', b.dataset.id === selected);
        b.setAttribute('aria-pressed', b.dataset.id === selected);
      });
      const btn = $('confirmBtn');
      btn.disabled = !selected || sending;
      btn.textContent = sending ? 'Invio…' : selected ? `Vota “${label(selected)}”` : 'Seleziona un argomento';
    } else if (state.phase === 'voting' && myVote) {
      show('viewDone');
      $('myChoice').textContent = label(myVote);
    } else {
      show('viewWait');
      const all = state.chosen.length >= state.topics.length;
      if (state.phase === 'revealing') {
        $('waitTitle').textContent = 'Guarda il tabellone!';
        $('waitText').textContent = 'Stiamo svelando l\'argomento più votato.';
      } else if (all) {
        $('waitTitle').textContent = 'Votazioni concluse';
        $('waitText').textContent = 'Tutti gli argomenti sono stati scelti. Grazie per aver partecipato!';
      } else {
        $('waitTitle').textContent = state.chosen.length ? 'Attendi la prossima votazione' : 'Attendi il via';
        $('waitText').textContent = 'La votazione si aprirà tra poco. Tieni aperta questa pagina: si aggiornerà da sola.';
      }
    }

    $('chosenBox').hidden = !state.chosen.length;
    $('chips').innerHTML = '';
    state.chosen.forEach((c, i) => {
      const el = document.createElement('span');
      el.className = 'chip';
      el.innerHTML = `<b>${i + 1}</b>`;
      el.appendChild(document.createTextNode(label(c.id)));
      $('chips').appendChild(el);
    });
  }

  $('confirmBtn').addEventListener('click', async () => {
    if (!selected || sending) return;
    sending = true;
    render();
    try {
      const res = await fetch('/api/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: selected }),
        credentials: 'same-origin',
      });
      const data = await res.json();
      if (res.ok || data.myVote) {
        myVote = data.myVote;
        remember(state.roundId, myVote);
        if (navigator.vibrate) navigator.vibrate(30);
        if (!res.ok) toast(data.error);
      } else {
        toast(data.error || 'Errore, riprova.');
      }
    } catch {
      toast('Connessione assente, riprova.');
    }
    sending = false;
    render();
  });

  async function syncFromServer() {
    try {
      const s = await (await fetch('/api/state', { credentials: 'same-origin' })).json();
      state = s;
      myRound = s.roundId;
      myVote = s.myVote;
      render();
    } catch { /* riprova al prossimo evento */ }
  }

  const socket = io();
  socket.on('connect', syncFromServer);
  socket.on('state', (s) => { state = s; render(); });
})();
