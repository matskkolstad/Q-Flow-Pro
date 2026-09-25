# User CLI for Q-Flow Pro

`scripts/user-cli.js` manages users (list, create, update, delete) directly in the database. It is mainly meant for when every admin is locked out; in normal use, manage users under *Settings → Users* in the admin panel.

## Important: stop the server first

The running server keeps its own copy of the data in memory and would overwrite changes made by the CLI.
The CLI therefore refuses to create, update or delete users while the server is running (it checks `server.pid` in the data directory). Stop the service first:

```sh
systemctl stop qflow
# ... run the CLI ...
systemctl start qflow
```

`--force` skips the check. Only use it if you are sure the server is not running (for example a stale `server.pid`).

## Running it

Run the CLI as the service user, with the same data directory as the service:

```sh
cd /opt/Q-Flow-Pro
sudo -u qflow QFLOW_DATA_DIR=/var/lib/qflow node scripts/user-cli.js list
```

- One-shot: `node scripts/user-cli.js <command> ...` (or `npm run user-cli -- <command> ...`).
- Interactive: `node scripts/user-cli.js` with no command gives a `qflow>` prompt. Type `help` for an overview and `exit` to quit.
- Use quotes around values with spaces or special characters: `--name "Maria Admin"`, `--password 'My-Pass1!'` (single quotes stop the shell from interpreting `!`).

## Commands

| Command | Description |
|---|---|
| `list` | All users: id, username, role, sign-in method, whether a password change is required |
| `create --username <u> [--name <n>] [--role ADMIN\|OPERATOR] --password <p> [--must-change yes]` | New local user (role defaults to `OPERATOR`) |
| `update (--id <id> \| --username <u>) [--name <n>] [--role ...] [--password <p>] [--must-change yes\|no]` | Change a user. Changing the password or role signs the user out everywhere |
| `delete (--id <id> \| --username <u>)` | Delete a user and their sessions |
| `help`, `exit`, `quit` | |

Rules:
- Passwords need at least 8 characters, with upper- and lowercase letters and a digit.
- Roles are `ADMIN` or `OPERATOR`.
- The last admin cannot be deleted or demoted.
- `--must-change yes` makes the user choose a new password at the next sign-in.

## Examples

```sh
# Reset the admin password (the user must choose a new one at the next sign-in)
systemctl stop qflow
sudo -u qflow QFLOW_DATA_DIR=/var/lib/qflow node scripts/user-cli.js update --username admin --password 'Temp-Pass1' --must-change yes
systemctl start qflow

# Create a new admin
sudo -u qflow QFLOW_DATA_DIR=/var/lib/qflow node scripts/user-cli.js create --username maria --name "Maria Admin" --role ADMIN --password 'Strong-Pass1'
```

Without `QFLOW_DATA_DIR` the CLI uses `./data` next to the code, which is not where a systemd install keeps its data.
