import { WebSocketServer } from 'ws';
import { networkInterfaces } from 'node:os';

const PORT = Number(process.env.PORT ?? 8787);
const ROOM = process.env.ROOM ?? 'DEV';
const SECRET = process.env.SECRET ?? 'dev';

let nextId = 0;
let hostId = null;
const peers = new Map();

function send(ws, payload) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.searchParams.get('room') !== ROOM) {
    ws.close(4003, '房间码错误');
    return;
  }
  const id = (nextId += 1);
  const isHost = url.searchParams.get('secret') === SECRET && hostId === null;
  const name = url.searchParams.get('name') || `玩家${id}`;
  peers.set(id, { ws, name, isHost });
  if (isHost) hostId = id;

  send(ws, { server: 'welcome', id, role: isHost ? 'host' : 'guest' });
  if (!isHost && hostId && peers.has(hostId)) {
    send(peers.get(hostId).ws, { server: 'join', id, name });
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }
    const payload = msg?.payload ?? null;
    const envelope = { from: id, payload };
    if (isHost) {
      if (msg?.to != null) {
        const target = peers.get(Number(msg.to));
        if (target) send(target.ws, envelope);
      } else {
        for (const [peerId, peer] of peers) {
          if (peerId !== id) send(peer.ws, envelope);
        }
      }
    } else if (hostId && peers.has(hostId)) {
      send(peers.get(hostId).ws, envelope);
    }
  });

  ws.on('close', () => {
    peers.delete(id);
    if (isHost) {
      hostId = null;
      for (const peer of peers.values()) send(peer.ws, { server: 'host-left' });
    } else if (hostId && peers.has(hostId)) {
      send(peers.get(hostId).ws, { server: 'leave', id, name });
    }
  });
});

const addresses = [];
for (const list of Object.values(networkInterfaces())) {
  for (const item of list ?? []) {
    if (item.family === 'IPv4' && !item.internal) addresses.push(item.address);
  }
}

console.log(`[relay] ws://0.0.0.0:${PORT}  房间码 ${ROOM}`);
for (const address of addresses) console.log(`[relay] 局域网地址 ws://${address}:${PORT}`);
