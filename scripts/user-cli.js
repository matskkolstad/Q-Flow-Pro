#!/usr/bin/env node
// Q-Flow Pro user management from the command line (for example when every admin is locked out).
// Edits the database directly, so the server must be stopped first.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { loadState, saveState, getDataDir } from '../lib/stateStore.js';
import { hashPassword, passwordPolicy } from '../lib/users.js';

const PID_FILE = path.join(getDataDir(), 'server.pid');

// The running server keeps its own copy of the data in memory and would overwrite our changes.
const runningServerPid = () => {
  try {
    const pid = Number(fs.readFileSync(PID_FILE, 'utf8'));
    if (!Number.isInteger(pid) || pid <= 0) return null;
    process.kill(pid, 0);
    return pid;
  } catch {
    return null;
  }
};

const requireState = () => {
  const state = loadState({ users: [] });
  state.users = state.users || [];
  return state;
};

const enforceAdminGuard = (users, targetId, nextRole) => {
  const adminCount = users.filter(u => u.role === 'ADMIN').length;
  const target = users.find(u => u.id === targetId);
  if (!target) return { ok: false, error: 'user not found' };
  const removingAdmin = target.role === 'ADMIN' && nextRole !== 'ADMIN';
  if (removingAdmin && adminCount <= 1) {
    return { ok: false, error: 'at least one admin is required' };
  }
  return { ok: true };
};

const findUser = (users, opts) => users.find(u => (opts.id && u.id === opts.id) || (opts.username && u.username === opts.username));

const checkPassword = (password) => {
  const policy = passwordPolicy(password);
  if (policy.ok) return null;
  return policy.error === 'password_too_short'
    ? 'password must be at least 8 characters'
    : 'password must contain upper- and lowercase letters and a digit';
};

const isYes = (value) => ['yes', 'true', '1', 'ja'].includes(String(value || '').toLowerCase());

const list = () => {
  const state = requireState();
  console.log('ID\tUSERNAME\tROLE\tPROVIDER\tMUST_CHANGE_PASSWORD');
  state.users.forEach(u => console.log(`${u.id}\t${u.username}\t${u.role}\t${u.provider || 'local'}\t${u.mustChangePassword ? 'yes' : 'no'}`));
  return { ok: true };
};

const create = (opts) => {
  const state = requireState();
  const { username, name, password } = opts;
  const role = (opts.role || 'OPERATOR').toUpperCase();
  if (!username || !password) return { ok: false, error: 'username and password required' };
  if (!['ADMIN', 'OPERATOR'].includes(role)) return { ok: false, error: 'role must be ADMIN or OPERATOR' };
  if (state.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return { ok: false, error: 'username already exists' };
  const passwordError = checkPassword(password);
  if (passwordError) return { ok: false, error: passwordError };
  const id = `u_${crypto.randomBytes(6).toString('hex')}`;
  state.users.push({
    id,
    name: name || username,
    username,
    role,
    provider: 'local',
    passwordHash: hashPassword(password),
    mustChangePassword: isYes(opts['must-change']),
  });
  saveState(state);
  return { ok: true, message: `created ${id}` };
};

const update = (opts) => {
  const state = requireState();
  const user = findUser(state.users, opts);
  if (!user) return { ok: false, error: 'user not found (use --id or --username)' };
  const role = opts.role ? opts.role.toUpperCase() : user.role;
  if (!['ADMIN', 'OPERATOR'].includes(role)) return { ok: false, error: 'role must be ADMIN or OPERATOR' };
  const guard = enforceAdminGuard(state.users, user.id, role);
  if (!guard.ok) return guard;
  if (opts.password) {
    const passwordError = checkPassword(opts.password);
    if (passwordError) return { ok: false, error: passwordError };
    user.passwordHash = hashPassword(opts.password);
    user.mustChangePassword = isYes(opts['must-change']);
  } else if (opts['must-change'] !== undefined) {
    user.mustChangePassword = isYes(opts['must-change']);
  }
  if (opts.name) user.name = opts.name;
  if (role !== user.role) {
    user.role = role;
  }
  // Sign the user out everywhere after a password or role change.
  if (opts.password || opts.role) {
    Object.entries(state.sessions || {}).forEach(([key, sess]) => {
      if (sess.userId === user.id) delete state.sessions[key];
    });
  }
  saveState(state);
  return { ok: true, message: 'updated' };
};

const remove = (opts) => {
  const state = requireState();
  const user = findUser(state.users, opts);
  if (!user) return { ok: false, error: 'user not found (use --id or --username)' };
  const guard = enforceAdminGuard(state.users, user.id, 'DELETED');
  if (!guard.ok) return guard;
  state.users = state.users.filter(u => u.id !== user.id);
  Object.entries(state.sessions || {}).forEach(([key, sess]) => {
    if (sess.userId === user.id) delete state.sessions[key];
  });
  saveState(state);
  return { ok: true, message: 'deleted' };
};

const parseArgs = (tokens) => {
  const args = {};
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.startsWith('--')) {
      const key = t.slice(2);
      const value = tokens[i + 1];
      if (value === undefined || value.startsWith('--')) {
        args[key] = 'yes';
      } else {
        args[key] = value;
        i++;
      }
    }
  }
  return args;
};

const tokenize = (line) => {
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  const tokens = [];
  let m;
  while ((m = re.exec(line)) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
};

const help = () => {
  console.log('Commands:');
  console.log(' list');
  console.log(' create --username <u> [--name <n>] [--role ADMIN|OPERATOR] --password <p> [--must-change yes]');
  console.log(' update (--id <id> | --username <u>) [--name <n>] [--role ADMIN|OPERATOR] [--password <p>] [--must-change yes|no]');
  console.log(' delete (--id <id> | --username <u>)');
  console.log(' help');
  console.log(' exit | quit');
  console.log('Stop the server before changing users (systemctl stop qflow), or add --force.');
  return { ok: true };
};

const WRITE_COMMANDS = ['create', 'update', 'delete'];

const runCommand = (tokens) => {
  const [cmd, ...rest] = tokens;
  if (!cmd) return { ok: true };
  const args = parseArgs(rest);
  if (WRITE_COMMANDS.includes(cmd)) {
    const pid = runningServerPid();
    if (pid && !args.force) {
      return { ok: false, error: `the Q-Flow server is running (pid ${pid}). Stop it first (e.g. systemctl stop qflow) or add --force.` };
    }
  }
  switch (cmd) {
    case 'help': return help();
    case 'list': return list();
    case 'create': return create(args);
    case 'update': return update(args);
    case 'delete': return remove(args);
    case 'exit':
    case 'quit':
      process.exit(0);
      return { ok: true };
    default:
      console.log('Unknown command. Type "help".');
      return { ok: false, error: 'unknown_command' };
  }
};

const report = (result) => {
  if (!result) return;
  if (!result.ok) console.error(`error: ${result.error}`);
  else if (result.message) console.log(result.message);
};

const cliArgs = process.argv.slice(2);
if (cliArgs.length === 0) {
  console.log('Q-Flow User CLI (interactive). Type "help" for commands, "exit" to quit.');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: 'qflow> ' });
  rl.prompt();
  rl.on('line', (line) => {
    report(runCommand(tokenize(line.trim())));
    rl.prompt();
  });
  rl.on('close', () => process.exit(0));
} else {
  const result = runCommand(cliArgs);
  report(result);
  process.exit(result?.ok ? 0 : 1);
}
