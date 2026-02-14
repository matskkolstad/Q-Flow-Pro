#!/usr/bin/env node
import path from 'path';
import bcrypt from 'bcryptjs';
import readline from 'readline';
import { fileURLToPath } from 'url';
import { loadState, saveState } from '../lib/stateStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const hashPassword = (pw = '') => bcrypt.hashSync(pw, 10);

const requireState = () => {
  const state = loadState({ users: [] });
  state.users = state.users || [];
  return state;
};

const enforceAdminGuard = (users, targetId, nextRole) => {
  const adminCount = users.filter(u => u.role === 'ADMIN').length;
  const target = users.find(u => u.id === targetId);
  if (!target) return { ok: false, error: 'user not found' };
  const willBeAdmin = nextRole ?? target.role;
  const removingAdmin = target.role === 'ADMIN' && willBeAdmin !== 'ADMIN';
  if (removingAdmin && adminCount <= 1) {
    return { ok: false, error: 'at_least_one_admin_required' };
  }
  return { ok: true };
};

const list = () => {
  const state = requireState();
  state.users.forEach(u => console.log(`${u.id}\t${u.username}\t${u.role}`));
};

const create = (opts) => {
  const state = requireState();
  const { username, name, role = 'OPERATOR', password } = opts;
  if (!username || !password) return { ok: false, error: 'username and password required' };
  const id = `u_${Math.random().toString(36).slice(2, 9)}`;
  state.users.push({ id, name: name || username, username, role, passwordHash: hashPassword(password) });
  saveState(state);
  return { ok: true, id };
};

const update = (opts) => {
  const state = requireState();
  const { id, name, role, password } = opts;
  const user = state.users.find(u => u.id === id);
  if (!user) return { ok: false, error: 'user not found' };
  const guard = enforceAdminGuard(state.users, id, role ?? user.role);
  if (!guard.ok) return guard;
  if (name) user.name = name;
  if (role) user.role = role;
  if (password) user.passwordHash = hashPassword(password);
  saveState(state);
  return { ok: true };
};

const remove = (opts) => {
  const state = requireState();
  const { id } = opts;
  const user = state.users.find(u => u.id === id);
  if (!user) return { ok: false, error: 'user not found' };
  const guard = enforceAdminGuard(state.users, id, 'DELETED');
  if (!guard.ok) return guard;
  state.users = state.users.filter(u => u.id !== id);
  saveState(state);
  return { ok: true };
};

const parseArgs = (tokens) => {
  const args = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('--')) {
      const key = t.slice(2);
      args[key] = tokens[i + 1];
      i++;
    }
  }
  return args;
};

const tokenize = (line) => {
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  const tokens = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    tokens.push(m[1] || m[2] || m[3]);
  }
  return tokens;
};

const help = () => {
  console.log('Commands:');
  console.log(' list');
  console.log(' create --username <u> --name <n> --role <ADMIN|OPERATOR> --password <p>');
  console.log(' update --id <id> [--name <n>] [--role <ADMIN|OPERATOR>] [--password <p>]');
  console.log(' delete --id <id>');
  console.log(' help');
  console.log(' exit | quit');
};

const runCommand = (tokens, silent = false) => {
  const [cmd, ...rest] = tokens;
  if (!cmd) return { ok: true };
  if (cmd === 'help') {
    help();
    return { ok: true };
  }
  if (cmd === 'list') {
    list();
    return { ok: true };
  }
  if (cmd === 'create') {
    const r = create(parseArgs(rest));
    if (!silent) console.log(r.ok ? `created ${r.id}` : `error: ${r.error}`);
    return r;
  }
  if (cmd === 'update') {
    const r = update(parseArgs(rest));
    if (!silent) console.log(r.ok ? 'updated' : `error: ${r.error}`);
    return r;
  }
  if (cmd === 'delete') {
    const r = remove(parseArgs(rest));
    if (!silent) console.log(r.ok ? 'deleted' : `error: ${r.error}`);
    return r;
  }
  if (cmd === 'exit' || cmd === 'quit') {
    process.exit(0);
  }
  console.log('Unknown command. Type "help".');
  return { ok: false, error: 'unknown_command' };
};

const cliArgs = process.argv.slice(2);
if (cliArgs.length === 0) {
  console.log('Q-Flow User CLI (interactive). Type "help" for commands, "exit" to quit.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'qflow> ' });
  rl.prompt();
  rl.on('line', (line) => {
    const tokens = tokenize(line.trim());
    runCommand(tokens);
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
} else {
  // One-shot mode
  const tokens = cliArgs;
  const cmd = tokens[0];
  if (!['create', 'update', 'delete', 'list', 'help'].includes(cmd)) {
    help();
    process.exit(1);
  }
  const result = runCommand(tokens, true);
  if (result?.ok) {
    if (cmd === 'list') list();
    else console.log(cmd === 'create' ? `created ${result.id}` : cmd === 'delete' ? 'deleted' : 'updated');
    process.exit(0);
  } else {
    console.error(result?.error || 'error');
    process.exit(1);
  }
}
