import { io, Socket } from 'socket.io-client';

export const BASE_URL = process.env.E2E_BASE_URL || 'http://localhost:3000';
export const ADMIN_USERNAME = process.env.QFLOW_ADMIN_USERNAME || 'admin';
export const ADMIN_PASSWORD = process.env.QFLOW_ADMIN_PASSWORD || 'CiAdmin123!';

export const uniqueName = (prefix: string) => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export const apiPost = (path: string, body: unknown, token?: string, headers: Record<string, string> = {}) =>
  fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: JSON.stringify(body),
  });

export const apiGet = (path: string, token?: string) =>
  fetch(`${BASE_URL}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

export const login = async (username: string, password: string) => {
  const res = await apiPost('/api/login', { username, password });
  if (!res.ok) throw new Error(`login failed for ${username}: ${res.status}`);
  return res.json() as Promise<{ token: string; user: { id: string; role: string; mustChangePassword: boolean } }>;
};

export const loginAdmin = async () => (await login(ADMIN_USERNAME, ADMIN_PASSWORD)).token;

export type Connected = {
  socket: Socket;
  session: { role: string; kioskId?: string | null; mustChangePassword?: boolean };
  state: any;
};

// Connects and resolves once both the session info and the initial state have arrived.
export const connect = (auth: { token?: string; deviceToken?: string } = {}) => new Promise<Connected>((resolve, reject) => {
  const socket = io(BASE_URL, { path: '/socket.io', transports: ['websocket'], auth, timeout: 8000, forceNew: true });
  let session: Connected['session'] | null = null;
  let state: any = null;
  const timer = setTimeout(() => {
    socket.disconnect();
    reject(new Error('Timed out waiting for session-info/init-state'));
  }, 8000);
  const maybeDone = () => {
    if (session && state) {
      clearTimeout(timer);
      resolve({ socket, session, state });
    }
  };
  socket.once('session-info', (info) => { session = info; maybeDone(); });
  socket.once('init-state', (s) => { state = s; maybeDone(); });
  socket.once('connect_error', (err) => { clearTimeout(timer); reject(err); });
});

export const waitForEvent = <T = any>(socket: Socket, event: string, predicate: (payload: T) => boolean = () => true, timeoutMs = 8000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for ${event}`));
    }, timeoutMs);
    const handler = (payload: T) => {
      if (predicate(payload)) {
        clearTimeout(timer);
        socket.off(event, handler);
        resolve(payload);
      }
    };
    socket.on(event, handler);
  });

export const waitForState = (socket: Socket, predicate: (state: any) => boolean, timeoutMs = 8000) =>
  waitForEvent(socket, 'state-update', predicate, timeoutMs);

export const emitWithAck = <T = any>(socket: Socket, event: string, payload?: unknown) =>
  socket.timeout(8000).emitWithAck(event, payload) as Promise<T>;

// Adds users through the admin socket (the same path the admin panel uses).
export const addUsers = async (admin: Connected, newUsers: Array<Record<string, unknown>>) => {
  for (const user of newUsers) {
    const res = await emitWithAck(admin.socket, 'user:save', { user });
    if (!res.ok) throw new Error(`user:save failed: ${res.error}`);
  }
  return new Promise<any>((resolve) => {
    admin.socket.once('init-state', resolve);
    admin.socket.emit('request-state');
  });
};

// Creates a new operator account and returns a connected socket for it.
export const connectOperator = async (admin: Connected) => {
  const username = uniqueName('op');
  await addUsers(admin, [{ username, role: 'OPERATOR', password: 'Operator-Pass1' }]);
  return connect({ token: (await login(username, 'Operator-Pass1')).token });
};
