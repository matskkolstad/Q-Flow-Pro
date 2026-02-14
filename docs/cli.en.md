# User CLI for Q-Flow Pro

The CLI allows you to manage users (list, create, update, delete) without starting the app. All changes are saved in `db.json`.

## Prerequisites
- Node.js is installed.
- Run commands from the project root (e.g., `/opt/qflow`).
- If the server is running, restart it after changes so new users/roles/passwords are loaded.
- (Optional) Install local bin: `npm install -g .` or `npm link` from the project folder. Then you can run `qflow-cli` directly.

## Usage
- Interactive mode (recommended):
  - Start with `qflow-cli` or `npm run user-cli`. You get the `qflow>` prompt and can type commands without prefix.
  - Type `help` for overview and `exit` or `quit` to exit.
  - Use quotes around values with spaces, e.g., `--name "Maria Admin"`.
- One-shot command:
  - `qflow-cli <command> ...`
  - Alternative without global install: `node scripts/user-cli.js <command> ...`

## Commands
- `list` — shows all users (id, username, role)
- `create --username <u> --name <name> --role <ADMIN|OPERATOR> --password <pw>`
- `update --id <id> [--name <name>] [--role <ADMIN|OPERATOR>] [--password <pw>]`
- `delete --id <id>`
- `help`, `exit`, `quit`

## Examples
- Interactive session:
  ```
  qflow-cli
  qflow> list
  qflow> create --username maria --name "Maria Admin" --role ADMIN --password secret
  qflow> update --id u1 --name "New Admin"
  qflow> delete --id u2
  qflow> exit
  ```
- One-shot commands:
  ```
  qflow-cli list
  qflow-cli create --username maria --name "Maria Admin" --role ADMIN --password secret
  qflow-cli update --id u1 --password newpass
  qflow-cli delete --id u2
  ```

## Tips
- Find the `id` from the `list` command output.
- Roles must be `ADMIN` or `OPERATOR` (uppercase).
- You cannot remove the last admin; attempts will fail with `at_least_one_admin_required` error.
- Remember to restart `server.js` after changes if it's already running.
