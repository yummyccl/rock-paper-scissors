// API: 石头剪刀布对战
// Vercel Serverless Function - 统一入口捕获所有 /api/rps/* 路由

// 内存状态（同一热实例内保持）
let memoryRoom = {
  wifeConnected: false,
  husbandConnected: false,
  wifeLastSeen: 0,
  husbandLastSeen: 0,
  wifeChoice: null,
  husbandChoice: null,
  result: null,
  revealed: false,
  version: 0
};
let memoryRecords = [];

function getToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function judge(a, b) {
  if (a === b) return 'draw';
  if ((a === 'rock' && b === 'scissors') ||
      (a === 'scissors' && b === 'paper') ||
      (a === 'paper' && b === 'rock')) return 'win';
  return 'lose';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/api\/rps\/?/, '');

  try {
    if (path === 'heartbeat' || path === 'heartbeat/') {
      return handleHeartbeat(req, res);
    }
    if (path === 'poll' || path === 'poll/') {
      return handlePoll(req, res);
    }
    if (path === 'choose' || path === 'choose/') {
      return handleChoose(req, res);
    }
    if (path === 'cancel' || path === 'cancel/') {
      return handleCancel(req, res);
    }
    if (path === 'records' || path === 'records/') {
      return handleRecords(req, res);
    }
    return res.status(404).json({ error: 'not found', path });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'internal error' });
  }
}

function handleHeartbeat(req, res) {
  const { role } = req.body || {};
  const now = Date.now();

  if (role === 'wife') {
    memoryRoom.wifeConnected = true;
    memoryRoom.wifeLastSeen = now;
  } else if (role === 'husband') {
    memoryRoom.husbandConnected = true;
    memoryRoom.husbandLastSeen = now;
  }

  if (now - memoryRoom.wifeLastSeen > 20000) memoryRoom.wifeConnected = false;
  if (now - memoryRoom.husbandLastSeen > 20000) memoryRoom.husbandConnected = false;

  return res.json({ ok: true });
}

function handlePoll(req, res) {
  const role = req.query.role;
  const clientVersion = parseInt(req.query.v || '0');
  const now = Date.now();

  if (now - memoryRoom.wifeLastSeen > 20000) memoryRoom.wifeConnected = false;
  if (now - memoryRoom.husbandLastSeen > 20000) memoryRoom.husbandConnected = false;

  if (role === 'wife') {
    memoryRoom.wifeLastSeen = now;
    memoryRoom.wifeConnected = true;
  } else if (role === 'husband') {
    memoryRoom.husbandLastSeen = now;
    memoryRoom.husbandConnected = true;
  }

  const today = getToday();
  const todayRecord = memoryRecords.find(r => r.date === today) || null;

  return res.json({
    version: memoryRoom.version,
    wifeConnected: memoryRoom.wifeConnected,
    husbandConnected: memoryRoom.husbandConnected,
    wifeChoice: memoryRoom.wifeChoice,
    husbandChoice: memoryRoom.husbandChoice,
    result: memoryRoom.result,
    revealed: memoryRoom.revealed,
    todayRecord: todayRecord,
    changed: memoryRoom.version !== clientVersion
  });
}

function handleChoose(req, res) {
  const { role, choice } = req.body || {};

  if (role === 'wife') {
    memoryRoom.wifeChoice = choice;
    memoryRoom.wifeLastSeen = Date.now();
  } else if (role === 'husband') {
    memoryRoom.husbandChoice = choice;
    memoryRoom.husbandLastSeen = Date.now();
  } else {
    return res.status(400).json({ error: 'invalid role' });
  }

  memoryRoom.version++;

  if (memoryRoom.wifeChoice && memoryRoom.husbandChoice) {
    const result = judge(memoryRoom.wifeChoice, memoryRoom.husbandChoice);
    memoryRoom.result = result;
    memoryRoom.revealed = true;
    memoryRoom.version++;

    const today = getToday();
    const idx = memoryRecords.findIndex(r => r.date === today);
    const newRecord = {
      date: today,
      wifeChoice: memoryRoom.wifeChoice,
      husbandChoice: memoryRoom.husbandChoice,
      result: result,
      revealed: true
    };
    if (idx >= 0) memoryRecords[idx] = newRecord;
    else memoryRecords.push(newRecord);
  }

  return res.json({ ok: true, version: memoryRoom.version });
}

function handleCancel(req, res) {
  const { role } = req.body || {};

  if (role === 'wife') {
    memoryRoom.wifeChoice = null;
    memoryRoom.wifeLastSeen = Date.now();
  } else if (role === 'husband') {
    memoryRoom.husbandChoice = null;
    memoryRoom.husbandLastSeen = Date.now();
  }

  if (memoryRoom.revealed && (!memoryRoom.wifeChoice || !memoryRoom.husbandChoice)) {
    memoryRoom.revealed = false;
    memoryRoom.result = null;
  }

  memoryRoom.version++;
  return res.json({ ok: true, version: memoryRoom.version });
}

function handleRecords(req, res) {
  return res.json(memoryRecords);
}
