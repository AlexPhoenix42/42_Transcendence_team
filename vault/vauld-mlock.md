
---

Q: what I understand is, if I do disable_mlock = true it means the secrets might be written into the swap. or am I mistaken here?

A:

You understood it correctly. Setting `disable_mlock = true` means that Vault's memory **can** be swapped out to disk.

This is tied to Vault’s core security feature called `mlock`. Let me break it down.

---

### 🔒 What is `mlock`?

`mlock` is a system call that **locks the process's virtual address space into physical RAM**, preventing it from being swapped to disk.

Vault tries to use `mlock` by default because it ensures that **sensitive data in memory (like decrypted secrets, database passwords, etc.) is never written to disk in plain text**. This is a fundamental security property of Vault.

---

### ⚠️ The risk of `disable_mlock = true`

Setting `disable_mlock = true` tells Vault **not** to call `mlock`.

That does introduce the risk you're thinking about:

- **Memory can be swapped to disk**: When the system is under memory pressure, Vault’s memory pages may be written to the swap partition.
- **Plain‑text secrets could be written to disk**: If sensitive data (e.g., a database password you just read from Vault) is in a memory page that gets swapped out, that secret is written to disk **in plain text**.

So yes, `disable_mlock = true` does mean that **under memory pressure, secrets could end up on swap**, increasing the potential attack surface.

---

### 🤔 Why does production recommend `disable_mlock = true` anyway?

This is the part that might feel contradictory. If it’s risky, why do both HashiCorp and the community recommend it for production?

The answer is a **pragmatic trade‑off**, especially when using **Integrated Storage (Raft)**.

1.  **Container privileges**:
    In modern container environments (Docker, Kubernetes), processes inside containers don’t have the privilege to call `mlock` by default. Trying to do so will cause errors like `cannot allocate memory` and Vault will fail to start. You would need to add the `CAP_IPC_LOCK` capability to the container to allow it.
    So your options are:
    - Add `CAP_IPC_LOCK` to the container to enable `mlock`.
    - Set `disable_mlock = true` to bypass the requirement.

2.  **Raft storage is memory‑hungry**:
    This is the most important reason. **When using Raft as the storage backend, HashiCorp strongly recommends setting `disable_mlock = true`**.
    Raft consumes a significant amount of memory. If you lock all of Vault's memory with `mlock`, it can cause Vault to run out of memory under load, crash, or even trigger the kernel’s OOM killer. For stability, the official documentation suggests setting `disable_mlock = true` and, as a complementary step, **disabling swap at the OS level** entirely.

---

### 💎 Summary and recommendation

Your understanding is correct: `disable_mlock = true` weakens one security guarantee, but it’s a deliberate trade‑off for stability and operability.

For your 42 Transcendence deployment, my clear recommendation is:

- **✅ Keep `disable_mlock = true`.**
- **🛡️ At the OS level, ensure your server (or VM) has swap disabled**, or that the swap partition is **fully encrypted**.

By disabling swap at the OS level, you completely eliminate the risk of plain‑text secrets being written to disk, while still keeping the stability benefits of `disable_mlock = true`. This is the **standard, best‑practice approach** for running Vault with Integrated Storage in production.

Your current configuration is correct. We are now ready to move to initialisation and unsealing.

---

