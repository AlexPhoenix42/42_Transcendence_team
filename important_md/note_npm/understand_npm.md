**What is npm, in one sentence?**

npm is a tool that lets you download and use code that other people wrote, so you don't have to write everything yourself. Those reusable pieces of code are called **packages**.

---

**`package.json` — your shopping list**

When you start a project, you create a `package.json` file. Think of it as a shopping list — it tells npm *what packages your project needs*.

```json
{
  "name": "my-chess-app",
  "dependencies": {
    "react": "18.3.1",
    "axios": "1.13.0"
  }
}
```

This says: *"my project needs React and Axios."* That's it. It's just a list.

When you hand this file to a teammate, they run:
```bash
npm install
```
And npm reads the list and downloads everything. Simple.

---

**The problem — packages have their own shopping lists**

Here's where it gets complicated. React isn't just React. React itself depends on other packages to work. And those packages depend on even more packages.

```
You install React
  └── React needs "loose-envify"
        └── loose-envify needs "js-tokens"
```

You asked for 1 package. You actually got 3. This is called the **dependency tree**.

Your `package.json` only lists what *you* asked for. It says nothing about `loose-envify` or `js-tokens` — those got pulled in silently.

---

**`package-lock.json` — the receipt**

After `npm install` finishes, npm automatically creates `package-lock.json`. This is the **receipt** — it records every single package that was actually installed, including all the silent ones, at their exact versions.

```
package.json        →   "I want React 18.3.1"
package-lock.json   →   "You got React 18.3.1 + loose-envify 1.4.0 + js-tokens 4.0.0"
```

You write `package.json` by hand. npm writes `package-lock.json` automatically — you never edit it yourself.

---

**Why this matters for your team**

Imagine no `package-lock.json` exists. You and your teammate both run `npm install` a week apart:

```
You on Monday:
  React 18.3.1 ✓
  loose-envify 1.4.0 ✓   ← version available on Monday

Teammate on Friday:
  React 18.3.1 ✓
  loose-envify 1.4.1 ✓   ← newer version, published Tuesday
```

You're both running "the same project" but with different actual code. This causes two problems — bugs that only appear on one machine, and in the current security climate, the risk that the newer version was compromised.

When `package-lock.json` is committed to Git, everyone runs:
```bash
npm ci     # installs EXACTLY what the lockfile says, nothing else
```

Now everyone gets identical packages, every time, on every machine, including inside Docker.

---

**The analogy in one picture**

```
package.json        =   recipe card      ("add flour, eggs, butter")
package-lock.json   =   photo of result  (exact brand, exact weight, exact everything)

npm install   =   cook from the recipe (result may vary slightly each time)
npm ci        =   reproduce the photo exactly (same result every time)
```

---

