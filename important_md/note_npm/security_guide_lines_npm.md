# npm Secure Usage Guide — Chess App Team

> **Who this is for:** Everyone on the team. No prior npm experience needed.
> Read this once before touching any npm command.

---

## Table of contents

1. [What is npm and why do we use it](#1-what-is-npm-and-why-do-we-use-it)
2. [The two files you need to understand](#2-the-two-files-you-need-to-understand)
3. [The current threat landscape](#3-the-current-threat-landscape)
4. [Golden rules — memorise these](#4-golden-rules--memorise-these)
5. [Safe daily workflow](#5-safe-daily-workflow)
6. [How to add a new package](#6-how-to-add-a-new-package)
7. [How to check if a package is safe](#7-how-to-check-if-a-package-is-safe)
8. [What never to do](#8-what-never-to-do)
9. [What to do if something goes wrong](#9-what-to-do-if-something-goes-wrong)
10. [Quick reference card](#10-quick-reference-card)

---

## 1. What is npm and why do we use it

npm (Node Package Manager) is a tool that lets you download reusable pieces of code
called **packages**, written by other developers, so you don't have to write everything
from scratch.

We use it for our React frontend. When you run an npm command, it downloads packages
from the npm **registry** — a giant public database of over 2 million packages.

```
You run: npm install
npm goes to: registry.npmjs.org
npm downloads: react, socket.io-client, chess.js, and all their dependencies
npm puts them in: the node_modules/ folder in your project
```

The `node_modules/` folder is **never committed to Git** — it can be hundreds of
megabytes and is always regenerated from the lockfile. This is why `node_modules/`
must be in your `.gitignore`.

---

## 2. The two files you need to understand

### `package.json` — the shopping list

This is the file **you write and maintain**. It lists the packages your project needs
and the exact versions you want.

```json
{
  "name": "chess-app-frontend",
  "private": true,
  "dependencies": {
    "react": "19.2.7",
    "socket.io-client": "4.8.3"
  }
}
```

Think of it as a recipe card — it says what ingredients you want.

### `package-lock.json` — the receipt

This file is **written automatically by npm** — you never edit it by hand. It records
every single package that was actually installed, including packages that your packages
depend on (called transitive dependencies), all at their exact versions.

```
You asked for:   react 19.2.7
You also got:    loose-envify 1.4.0  ← react's dependency
                 js-tokens 4.0.0     ← loose-envify's dependency
```

`package-lock.json` records all three. `package.json` only mentions React.

### Why both files must be committed to Git

| Situation | Without lockfile | With lockfile |
|---|---|---|
| Teammate installs on a different day | May get different package versions | Gets exactly the same versions |
| A package gets compromised after you installed | They get the bad version | They get your safe pinned version |
| Docker builds your container | May install different code than you tested | Installs exactly what you tested |

**Rule:** always commit `package.json` and `package-lock.json` together. Never one
without the other.

---

## 3. The current threat landscape

The npm ecosystem has been under sustained attack since September 2025. You need to
understand this to understand why the rules below exist.

### What is a supply chain attack?

A supply chain attack does not break into your code directly. Instead, attackers
compromise a package you trust — one sitting in your `package.json` — and inject
malicious code into it. Because you trust the package, the malicious code runs on your
machine automatically the next time you run `npm install`.

### What has happened

**September 2025 — Shai-Hulud worm**
The first self-replicating npm worm. Compromised `chalk`, `debug`, and 16 other
packages with a combined 2.6 billion weekly downloads. It stole npm tokens and GitHub
credentials from developer machines, then used those credentials to infect more packages
automatically.

**November 2025 — Shai-Hulud 2.0**
A more destructive variant. If it failed to steal credentials, it attempted to destroy
the victim's entire home directory by overwriting every writable file.

**March 2026 — Axios compromise**
`axios` — one of the most widely used JavaScript packages with ~100 million weekly
downloads — was backdoored for three hours. Attributed to a North Korean state-sponsored
group. The attack started by social engineering the package maintainer on a fake Teams
call into installing malware.

**May 2026 — TanStack / Mini Shai-Hulud**
84 malicious package versions published across 42 `@tanstack/*` packages in a
six-minute window. Notably, the malicious packages carried valid cryptographic
signatures — security tooling that checks signatures was completely fooled.

### The key insight

The risk is not just obviously fake packages. It is legitimate, trusted packages being
hijacked. The attack does not need you to do anything wrong — it just needs you to run
`npm install` after a maintainer's account was compromised.

Exact version pinning and lockfile discipline are your primary defences.

---

## 4. Golden rules — memorise these

```
1. Always use exact version numbers — never ^ or ~
2. Always commit package-lock.json alongside package.json
3. Always use npm ci to install — never npm install on a shared/Docker environment
4. Always run npm audit after adding a package
5. Never edit package-lock.json by hand
6. Never add package-lock.json to .gitignore
7. Never install a package without checking it first
8. Never run npm install as root or inside a production system
```

---

## 5. Safe daily workflow

### Cloning the repo for the first time

```bash
git clone <repo-url>
cd chess-app-frontend
npm ci                  # installs exactly what the lockfile says
```

`npm ci` (ci = clean install) is different from `npm install`:
- It reads `package-lock.json` and installs exactly those versions
- It never modifies `package-lock.json`
- It deletes `node_modules/` and starts fresh every time
- It fails loudly if `package.json` and `package-lock.json` are out of sync

Always use `npm ci` when you just want to install what already exists.

### Starting the dev server

```bash
npm run dev             # starts the Vite development server
```

### Building for production (inside Docker)

```bash
npm ci --omit=dev       # installs only production dependencies, not dev tools
npm run build           # builds the optimised output
```

The `--omit=dev` flag skips `devDependencies` (like Vite itself) — they are only
needed to build, not to run. A smaller install means fewer packages that could be
compromised.

### Regular security check

```bash
npm audit               # run this at least once a week
```

This checks every installed package against a database of known vulnerabilities and
prints a report. If it finds issues, read the output carefully before running
`npm audit fix` — the fix may update a package version, which you should review first.

---

## 6. How to add a new package

Adding a package is a deliberate team decision, not a reflex. Follow these steps every
single time, without exception.

### Step 1 — Agree as a team first

Before installing anything, make sure at least one other team member agrees the package
is necessary. Post in your team chat: *"I want to add X for Y reason, any objections?"*

### Step 2 — Find the exact current version

```bash
npm view <package-name> version
```

Example:
```bash
npm view react-hot-toast version
# → 2.4.1
```

### Step 3 — Check the package is safe (see section 7)

Do not skip this step.

### Step 4 — Install with the exact version pinned

```bash
npm install <package-name>@<exact-version>
```

Example:
```bash
npm install react-hot-toast@2.4.1
```

**Never** run `npm install <package-name>` without an `@version` — this installs the
latest version at that moment and adds a `^` range to your `package.json`, which allows
future automatic updates.

### Step 5 — Audit immediately

```bash
npm audit
```

If the audit reports any new issues introduced by this package, stop and discuss with
the team before proceeding.

### Step 6 — Commit both files together

```bash
git add package.json package-lock.json
git commit -m "add react-hot-toast@2.4.1 for in-game notifications"
```

The commit message should say what you added and why. Never commit just one of the two
files.

---

## 7. How to check if a package is safe

Before installing any package, spend two minutes on these checks.

### Check 1 — Does it have a real GitHub repository?

Go to [npmjs.com](https://www.npmjs.com) and search for the package. Look for a link
to a GitHub repository. If there is no source code repository linked, do not install it.

### Check 2 — Look at the publish history

On the npm page, click "Versions." Look for:

| Signal | What it means |
|---|---|
| Recent publish after months of silence | Could be a compromised maintainer account |
| Many versions published in a short burst | Suspicious activity |
| Steady, regular release history | Healthy project |

### Check 3 — Check weekly downloads

A package with millions of weekly downloads has thousands of eyes on it. A package with
200 weekly downloads has almost none. Prefer well-used packages.

### Check 4 — Check the number of maintainers

One maintainer = one account that can be phished or compromised. The axios attack
started with social engineering one person. More maintainers with 2FA enforced is safer.

### Check 5 — Use socket.dev

Go to [socket.dev](https://socket.dev/npm) and search for the package name. Socket
analyses packages for supply chain risk indicators and gives you an instant risk score.
It is free and takes 10 seconds.

### Check 6 — Ask yourself: do we actually need this?

Every package you add is a new attack surface. Before installing, ask:
- Do we already have a package that does this?
- Can we write this in 20 lines ourselves?
- Does the browser already have a native API for this?

If yes to any of these, skip the package.

---

## 8. What never to do

### Never use `^` or `~` in version numbers

```json
// ❌ Never write these — they allow automatic updates
"react": "^19.2.7"
"react": "~19.2.7"
"react": "*"
"react": "latest"

// ✅ Always write exact versions
"react": "19.2.7"
```

The `^` symbol means "install this or anything newer that seems compatible." That is
exactly what allows a compromised new version to silently replace a safe one.

### Never run `npm install` instead of `npm ci` on a shared environment

```bash
# ❌ This can modify package-lock.json and pull in new versions
npm install

# ✅ This installs exactly the lockfile and never modifies it
npm ci
```

The only time `npm install` is acceptable is when you are deliberately adding or
updating a package on your own machine, following the process in section 6.

### Never commit `node_modules/`

```bash
# This must be in your .gitignore
node_modules/
```

The `node_modules/` folder can contain thousands of files and hundreds of megabytes. It
is always regenerated from `package-lock.json`. Committing it would make every Git
operation painfully slow and would mean your repo contains untouched third-party code
that nobody reviewed.

### Never edit `package-lock.json` by hand

npm generates this file. If you edit it manually, you corrupt the integrity record that
protects the team. If it ever looks wrong, delete it and run `npm ci` to regenerate it
cleanly.

### Never add `package-lock.json` to `.gitignore`

Old tutorials sometimes suggest this. It is dangerous advice. Check your `.gitignore`
right now and remove this line if it exists:

```bash
# ❌ Remove this if it's in your .gitignore
package-lock.json
```

### Never install a package as root

```bash
# ❌ Never do this
sudo npm install <package>
```

If a package runs a malicious install script, running as root gives it full control of
your system. In Docker, the Dockerfile handles permissions — you should never need sudo
for npm.

---

## 9. What to do if something goes wrong

### A package you use gets reported as compromised

1. Check the affected versions in the security report
2. Open `package-lock.json` and search for that package name
3. Check if your installed version is in the affected range
4. If yes:
   - Stop what you are doing
   - Tell the team immediately in your chat channel
   - Rotate any credentials that were accessible on your machine
     (GitHub tokens, npm tokens, SSH keys, any API keys in `.env`)
   - Update to the patched version: `npm install <package>@<safe-version>`
   - Run `npm audit` to confirm clean
   - Commit both files

### `npm audit` reports a vulnerability

```bash
npm audit
```

Read the output carefully. It shows:
- Which package has the issue
- How severe it is (low / moderate / high / critical)
- Whether a fix is available

For a student project, focus on **high** and **critical** issues. Low and moderate
issues in dev dependencies are generally not urgent.

To apply available fixes:
```bash
npm audit fix
```

Always review what `npm audit fix` changed before committing — it may have updated
package versions. Check that the new versions are exact pins in `package.json`.

### `npm ci` fails with a lockfile mismatch error

This means someone modified `package.json` without updating `package-lock.json`, or
vice versa. Fix it by having the person who made the change run:

```bash
npm install     # regenerates package-lock.json to match package.json
git add package.json package-lock.json
git commit -m "fix: sync package-lock.json with package.json"
```

---

## 10. Quick reference card

### Commands

| Command | When to use |
|---|---|
| `npm ci` | Every time you clone or pull — installs exact lockfile |
| `npm ci --omit=dev` | In Docker / production builds |
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm audit` | After adding a package, and weekly |
| `npm view <pkg> version` | Check the current exact version of a package |
| `npm install <pkg>@<version>` | Add a new package (exact version only) |

### Before installing any package — checklist

- [ ] Team agreed it's necessary
- [ ] Checked it on npmjs.com — has a real GitHub repo
- [ ] Checked publish history — no suspicious recent activity
- [ ] Checked on socket.dev — no risk flags
- [ ] Installing with exact version: `npm install <pkg>@<x.y.z>`
- [ ] Will run `npm audit` immediately after
- [ ] Will commit both `package.json` and `package-lock.json` together

### Files — what goes where

| File | Edited by | Committed to Git |
|---|---|---|
| `package.json` | You (manually) | ✅ Yes |
| `package-lock.json` | npm (automatically) | ✅ Yes |
| `node_modules/` | npm (automatically) | ❌ No — add to .gitignore |

### Version number syntax — what to use and avoid

| Syntax | Meaning | Use? |
|---|---|---|
| `"19.2.7"` | Exactly this version | ✅ Always |
| `"^19.2.7"` | This or any compatible newer version | ❌ Never |
| `"~19.2.7"` | This or any newer patch version | ❌ Never |
| `"latest"` | Whatever is newest right now | ❌ Never |
| `"*"` | Any version | ❌ Never |

---

