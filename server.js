'use strict';

const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const QRCode = require('qrcode');

// ---------------------------------------------------------------------------
// Configurazione
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || 'regia';
const PUBLIC_URL = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'state.json');
const REVEAL_MS = 4200; // durata animazione sul tabellone (+ margine)

const TOPICS = [
  { id: 'violenza', label: 'Violenza' },
  { id: 'quando-e-troppo', label: 'Quando è troppo' },
  { id: 'salute-mentale', label: 'Salute mentale' },
  { id: 'competenze', label: 'Competenze' },
  { id: 'socialita', label: 'Socialità' },
  { id: 'gamification', label: 'Gamification' },
  { id: 'terapia', label: 'Terapia' },
  { id: 'carriera', label: 'Carriera' },
  { id: 'formazione', label: 'Formazione' },
  { id: 'arte', label: 'Arte' },
];
const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));

// ---------------------------------------------------------------------------
// Stato
//   phase: 'idle'     -> in attesa del via della regia
//          'voting'   -> votazione aperta
//          'revealing'-> animazione del vincitore in corso
// ---------------------------------------------------------------------------
function freshState() {
  return {
    roundId: null,
    phase: 'idle',
    round: 0, // numero della votazione corrente/ultima
    votes: {}, // topicId -> numero voti (round corrente)
    voters: {}, // voterId -> topicId (round corrente)
    chosen: [], // [{ id, round, votes, total, tie }]
    reveal: null, // { id, at }
  };
}

let state = freshState();
try {
  if (fs.existsSync(DATA_FILE)) {
    state = Object.assign(freshState(), JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
    if (state.phase === 'revealing') state.phase = 'idle';
  }
} catch (err) {
  console.warn('Impossibile leggere lo stato salvato, riparto da zero:', err.message);
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE, JSON.stringify(state));
    } catch (err) {
      console.warn('Salvataggio non riuscito:', err.message);
    }
  }, 150);
}

const chosenIds = () => new Set(state.chosen.map((c) => c.id));
const totalVotes = () => Object.values(state.votes).reduce((a, b) => a + b, 0);

// Vista pubblica: niente conteggi durante la votazione (evita l'effetto "carro del vincitore")
function publicView() {
  return {
    topics: TOPICS,
    roundId: state.roundId || null,
    phase: state.phase,
    round: state.round,
    total: totalVotes(),
    chosen: state.chosen,
    reveal: state.reveal,
  };
}

function adminView() {
  return Object.assign(publicView(), { votes: state.votes });
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const app = express();
app.disable('x-powered-by');
app.use(express.json());

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((p) => {
    const i = p.indexOf('=');
    if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}

// Ogni telefono riceve un identificativo anonimo (cookie) per impedire il doppio voto
function voterId(req, res) {
  let id = parseCookies(req).voter;
  if (!id || !/^[a-f0-9]{32}$/.test(id)) {
    id = crypto.randomBytes(16).toString('hex');
    res.cookie('voter', id, { httpOnly: true, sameSite: 'lax', maxAge: 1000 * 60 * 60 * 24 * 30 });
  }
  return id;
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'board.html')));
app.get('/vota', (req, res) => res.sendFile(path.join(__dirname, 'public', 'vote.html')));
app.get('/regia', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h' }));

app.get('/api/state', (req, res) => {
  const id = voterId(req, res);
  res.json(Object.assign(publicView(), { myVote: state.phase === 'voting' ? state.voters[id] || null : null }));
});

app.post('/api/vote', (req, res) => {
  const id = voterId(req, res);
  const topic = req.body && req.body.topic;
  if (state.phase !== 'voting') return res.status(409).json({ error: 'La votazione non è aperta.' });
  if (!TOPIC_IDS.has(topic)) return res.status(400).json({ error: 'Argomento non valido.' });
  if (chosenIds().has(topic)) return res.status(409).json({ error: 'Questo argomento è già stato scelto.' });
  if (state.voters[id]) return res.status(409).json({ error: 'Hai già votato in questa votazione.', myVote: state.voters[id] });

  state.voters[id] = topic;
  state.votes[topic] = (state.votes[topic] || 0) + 1;
  save();
  broadcast();
  res.json({ ok: true, myVote: topic });
});

app.get('/api/qr.svg', async (req, res) => {
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  const svg = await QRCode.toString(`${base}/vota`, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#14102bff', light: '#00000000' },
  });
  res.type('image/svg+xml').set('Cache-Control', 'no-store').send(svg);
});

app.get('/api/vote-url', (req, res) => {
  const base = PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ url: `${base}/vota` });
});

// ---------------------------------------------------------------------------
// Socket.io (tabellone, telefoni e regia ricevono gli aggiornamenti in tempo reale)
// ---------------------------------------------------------------------------
const server = http.createServer(app);
const io = new Server(server);

function broadcast() {
  io.to('public').emit('state', publicView());
  io.to('admin').emit('admin-state', adminView());
}

let revealTimer = null;

const actions = {
  open() {
    if (state.phase !== 'idle') throw new Error('Una votazione è già in corso.');
    if (state.chosen.length >= TOPICS.length) throw new Error('Tutti gli argomenti sono già stati scelti.');
    state.round += 1;
    state.roundId = crypto.randomBytes(6).toString('hex'); // identificativo univoco della votazione
    state.votes = {};
    state.voters = {};
    state.reveal = null;
    state.phase = 'voting';
  },
  close() {
    if (state.phase !== 'voting') throw new Error('Nessuna votazione aperta.');
    const total = totalVotes();
    if (total === 0) throw new Error('Nessun voto ricevuto: attendi almeno un voto.');
    const max = Math.max(...Object.values(state.votes));
    const leaders = Object.keys(state.votes).filter((k) => state.votes[k] === max);
    const winner = leaders[crypto.randomInt(leaders.length)]; // pareggio: sorteggio tra i primi
    state.chosen.push({ id: winner, round: state.round, votes: max, total, tie: leaders.length > 1 ? leaders : null });
    state.reveal = { id: winner, at: Date.now() };
    state.phase = 'revealing';
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      if (state.phase === 'revealing') {
        state.phase = 'idle';
        save();
        broadcast();
      }
    }, REVEAL_MS);
  },
  cancel() {
    if (state.phase !== 'voting') throw new Error('Nessuna votazione aperta.');
    state.round -= 1;
    state.votes = {};
    state.voters = {};
    state.phase = 'idle';
  },
  undo() {
    if (state.phase === 'voting') throw new Error('Chiudi o annulla prima la votazione in corso.');
    if (!state.chosen.length) throw new Error('Non c\'è nulla da annullare.');
    clearTimeout(revealTimer);
    state.chosen.pop();
    state.round = state.chosen.length;
    state.reveal = null;
    state.phase = 'idle';
  },
  replay() {
    const last = state.chosen[state.chosen.length - 1];
    if (state.phase !== 'idle' || !last) throw new Error('Niente da rivedere.');
    state.reveal = { id: last.id, at: Date.now(), replay: true };
    state.phase = 'revealing';
    clearTimeout(revealTimer);
    revealTimer = setTimeout(() => {
      state.phase = 'idle';
      broadcast();
    }, REVEAL_MS);
  },
  reset() {
    clearTimeout(revealTimer);
    state = freshState();
  },
};

io.on('connection', (socket) => {
  socket.join('public');
  socket.emit('state', publicView());

  socket.on('admin-login', (key, cb) => {
    const ok = typeof key === 'string' && key.length === ADMIN_KEY.length &&
      crypto.timingSafeEqual(Buffer.from(key), Buffer.from(ADMIN_KEY));
    if (ok) {
      socket.data.admin = true;
      socket.join('admin');
      socket.emit('admin-state', adminView());
    }
    if (typeof cb === 'function') cb({ ok });
  });

  socket.on('admin', (action, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    if (!socket.data.admin) return reply({ error: 'Non autorizzato.' });
    if (!Object.prototype.hasOwnProperty.call(actions, action)) return reply({ error: 'Azione sconosciuta.' });
    try {
      actions[action]();
      save();
      broadcast();
      reply({ ok: true });
    } catch (err) {
      reply({ error: err.message });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Tabellone:  http://localhost:${PORT}/`);
  console.log(`Voto:       http://localhost:${PORT}/vota`);
  console.log(`Regia:      http://localhost:${PORT}/regia`);
  if (ADMIN_KEY === 'regia') console.log('ATTENZIONE: imposta la variabile ADMIN_KEY prima di andare online.');
});
