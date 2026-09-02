# npm Supply Chain Security — Team Briefing

> **Why you're reading this:** The npm ecosystem has been under sustained attack since September 2025. As a team building a web app with React, we use npm and need to take simple precautions. This document explains what's happening and exactly what we need to do about it.

---

## What is a supply chain attack?

A supply chain attack doesn't break into *your* code directly. Instead, attackers compromise a package you trust — one you installed via `npm install` — and inject malicious code into it. Because you trust the package, the malicious code runs on your machine or in your CI pipeline automatically.

The danger is scale: a single compromised package can reach millions of developers within minutes.

---

## What has been happening (2025–2026)

### September 2025 — Shai-Hulud worm (wave 1)
The first self-replicating npm worm. It compromised **chalk**, **debug**, and 16 other packages with a combined 2.6 billion weekly downloads. Once it infected a maintainer's machine, it stole their npm credentials and used them to automatically infect more packages — hence "self-replicating." Payload: credential theft targeting npm tokens, GitHub tokens, and AWS keys.

### November 2025 — Shai-Hulud 2.0
A more aggressive variant. In addition to stealing credentials, if it failed to exfiltrate anything, it attempted to **destroy the victim's entire home directory** by overwriting every writable file.

### March 2026 — Axios compromise
**Axios** — one of the most widely used JavaScript HTTP libraries, with ~100 million weekly downloads — was compromised. Two malicious versions were live for three hours. Attributed to a North Korean state-sponsored group (Lazarus / UNC1069). The attack started with social engineering: the attacker impersonated a company founder, invited the axios maintainer to a fake Slack workspace, then tricked him into installing malware on a Teams call.

### May 2026 — Mini Shai-Hulud / TanStack
84 malicious versions published across 42 **@tanstack/*** packages in a **six-minute window**. Notably, the malicious packages carried valid cryptographic provenance (SLSA Level 3) — meaning even security tooling that checks signatures was fooled, because the attack hijacked the legitimate build pipeline itself.

---

## Does this affect our React frontend?

**Yes.** We use npm for React and its ecosystem. We are in scope for these attacks.

The good news: the risk for a student project is lower than for a production system with real user credentials or cloud infrastructure. But the habits we build now matter, and some of the mitigations below take under five minutes to put in place.

---

## What we need to do

### 1. Pin exact versions in `package.json`

Ranges like `^18.3.1` allow npm to silently pull in newer versions, which could be compromised. Use exact pins instead.

```json
// ❌ Risky — allows automatic minor/patch updates
{
  "dependencies": {
    "react": "^18.3.1",
    "axios": "^1.13.0"
  }
}

// ✅ Safe — installs exactly this version, nothing else
{
  "dependencies": {
    "react": "18.3.1",
    "axios": "1.13.0"
  }
}
```

To pin all your current dependencies at once:
```bash
npm shrinkwrap
```

### 2. Always commit `package-lock.json`

The lockfile records the exact version of every package (including transitive dependencies) that was installed. If it's in Git, everyone on the team installs the same thing.

- **Never add `package-lock.json` to `.gitignore`**
- Commit it alongside every `package.json` change

### 3. Use `npm ci` instead of `npm install` in Docker

`npm install` resolves versions at install time and can pull in updates.  
`npm ci` installs **exactly** what the lockfile says — no surprises.

In your `Dockerfile`:
```dockerfile
# ❌ Avoid this in production/Docker builds
RUN npm install

# ✅ Use this instead
RUN npm ci --omit=dev
```

### 4. Run `npm audit` regularly

```bash
npm audit
```

This checks your installed packages against a database of known vulnerabilities and prints a report. Run it:
- Before starting the project
- After adding any new package
- Before your final submission

To automatically fix low-risk issues:
```bash
npm audit fix
```

### 5. Check a package before installing it

Before running `npm install <something>`, spend 60 seconds checking:

| What to check | Why |
|---|---|
| Does it have a GitHub repo? | Anonymous packages are higher risk |
| When was it last published? | Very recent publish after a long gap = suspicious |
| How many weekly downloads? | Well-used packages have more eyes on them |
| How many maintainers? | One maintainer = single point of failure |
| Does the repo match what's on npm? | Compare the source code |

Use [socket.dev](https://socket.dev) to instantly check a package for supply chain risk before installing.

### 6. Keep dependencies minimal

Every package you add is a new attack surface. Ask: do we actually need this, or can we write the 10 lines ourselves?

---

## Quick reference — safe npm workflow

```bash
# Starting fresh on a cloned repo
npm ci                      # installs exact lockfile versions

# Adding a new package
npm install <package>@<exact-version>   # pin the version explicitly
npm audit                               # check for issues immediately
git add package.json package-lock.json  # commit both files

# Regular check
npm audit                   # run this periodically
npm outdated                # see what has updates available (review before updating)
```

---

## What to do if a package you used gets compromised

1. Check if the version you have pinned in `package-lock.json` is in the list of affected versions
2. If yes: rotate any credentials (tokens, keys, passwords) that were accessible on the machine where you ran `npm install`
3. Update to the patched version: `npm install <package>@<safe-version>`
4. Run `npm audit` to confirm clean

Resources to monitor:
- [socket.dev](https://socket.dev) — real-time package risk scanner
- [npmjs.com/advisories](https://www.npmjs.com/advisories) — official npm security advisories
- [github.com/advisories](https://github.com/advisories) — GitHub security advisories

---

## Summary

| Action | Who | When |
|---|---|---|
| Pin exact versions in `package.json` | Person 1 (frontend lead) | Before first `npm install` |
| Commit `package-lock.json` to Git | Everyone | Now |
| Switch Dockerfile to `npm ci` | Person 4 (DevOps) | During Docker setup |
| Run `npm audit` | Everyone | After adding any package |
| Check packages before installing | Everyone | Every time |

---


