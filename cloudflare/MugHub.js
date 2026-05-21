export class MugHub {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/broadcast' && request.method === 'POST') {
      const msg = await request.json();
      await this.broadcast(msg.channel || 'mug:drop', msg.payload || msg);
      return new Response('ok');
    }
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const id = crypto.randomUUID();
    this.sessions.set(id, server);
    server.addEventListener('message', async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'auth' && msg.token) {
          this.sessions.set(id, { ws: server, token: msg.token });
        }
        if (msg.type === 'ping') server.send(JSON.stringify({ type: 'pong' }));
        if (msg.type === 'broadcast' && msg.channel && msg.payload) {
          await this.broadcast(msg.channel, msg.payload);
        }
      } catch (_) {}
    });
    server.addEventListener('close', () => this.sessions.delete(id));
    return new Response(null, { status: 101, webSocket: client });
  }

  async broadcast(channel, payload) {
    const data = JSON.stringify({ channel, ...payload });
    for (const [, sess] of this.sessions) {
      const ws = sess.ws || sess;
      try {
        ws.send(data);
      } catch (_) {}
    }
  }
}
