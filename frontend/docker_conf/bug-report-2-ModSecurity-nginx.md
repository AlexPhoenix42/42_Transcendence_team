
---

**Title:**  
Segfault when `SecAuditLog` precedes `SecRequestBodyLimit` and `SecRequestBodyNoFilesLimit` in same rules file

---

### Environment

- **ModSecurity-nginx version:** v1.0.3  
- **nginx version:** 1.22.1 (Alpine Linux)  
- **Base image:** `owasp/modsecurity:nginx-alpine`  
- **ModSecurity library version:** *(please run `docker run --rm --entrypoint sh trans-fork-frontend_nginx -c 'apk info | grep -i modsec; strings /usr/local/modsecurity/lib/libmodsecurity.so | grep -i "modsecurity v"'` to get this)*  
- **Operating System:** Alpine Linux (Docker container)

---

### Description

When a ModSecurity rules file (loaded via `modsecurity_rules_file`) contains the following three directives **in this exact order**:

```
SecAuditLog /var/log/modsecurity/audit.log
SecRequestBodyLimit          5242880
SecRequestBodyNoFilesLimit   131072
```

nginx crashes with a segmentation fault (exit code 139) during configuration parsing (`nginx -t`).

If the order is changed (e.g., moving `SecAuditLog` to the end), nginx starts successfully.

---

### Steps to Reproduce

1. Use the image `owasp/modsecurity:nginx-alpine` (or any image with ModSecurity-nginx v1.0.3 and nginx 1.22.1).  
2. Create a ModSecurity rules file, e.g. `/etc/modsecurity/override.conf`, with the following content (exact order is important):

   ```
   SecAuditLog /var/log/modsecurity/audit.log
   SecRequestBodyLimit          5242880
   SecRequestBodyNoFilesLimit   131072
   ```

3. Use a minimal nginx configuration that loads the module and the rules file:

   ```nginx
   load_module modules/ngx_http_modsecurity_module.so;
   events {}
   http {
       server {
           listen 80;
           modsecurity on;
           modsecurity_rules_file /etc/modsecurity/override.conf;
       }
   }
   ```

4. Run `nginx -t` (or start nginx).  
   Observed: `Segmentation fault` and exit code `139`.

---

### Expected Behavior

nginx should start successfully with all three directives, without any crash.

### Actual Behavior

nginx segfaults when the three directives appear in the specified order.  
Exit code is `139` (SIGSEGV). No error message is printed to the normal nginx error log; the process crashes before logging.

---

### Additional Observations

- **Any two of the three directives** (in any combination) do **not** cause a crash. Only the combination of all three in the original order triggers the segfault.  
- **Reordering** the directives so that the two `SecRequestBody*` directives come before `SecAuditLog` avoids the crash:

  ```
  SecRequestBodyLimit          5242880
  SecRequestBodyNoFilesLimit   131072
  SecAuditLog /var/log/modsecurity/audit.log
  ```

- `strace` output shows the crash occurs right after reading the file, with a `SIGSEGV` at `si_addr=0x1`. A snippet of the relevant `strace` output is attached below.

---

### Workaround

Reorder the directives as described above. This keeps all three settings active without any functional loss.

---

### Attachments

here is a full `strace` output of the bug.

<details>
  <summary>Relevant `strace` snippet (showing SIGSEGV after reading override.conf)</summary>

```
$ docker run --rm --privileged --entrypoint sh trans-fork-frontend_nginx -c '
                                apk add --no-cache strace
                                strace -f -o /tmp/nginx.strace nginx -t 2>&1
                                tail -100 /tmp/nginx.strace
                              '
fetch https://dl-cdn.alpinelinux.org/alpine/v3.16/main/x86_64/APKINDEX.tar.gz
fetch https://dl-cdn.alpinelinux.org/alpine/v3.16/community/x86_64/APKINDEX.tar.gz
(1/3) Installing fts (1.2.7-r1)
(2/3) Installing libelf (0.186-r0)
(3/3) Installing strace (5.17-r0)
Executing busybox-1.35.0-r17.trigger
OK: 79 MiB in 67 packages
Segmentation fault
12    wait4(14, [{WIFEXITED(s) && WEXITSTATUS(s) == 0}], 0, NULL) = 14
12    open("unicode.mapping", O_RDONLY|O_LARGEFILE) = -1 ENOENT (No such file or directory)
12    open("/etc/modsecurity.d/unicode.mapping", O_RDONLY|O_LARGEFILE) = 8
12    mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7fce77ddf000
12    munmap(0x7fce77ddf000, 4096)      = 0
12    close(8)                          = 0
12    mmap(NULL, 262164, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7fce77d9f000
12    open("/etc/modsecurity.d/unicode.mapping", O_RDONLY|O_LARGEFILE) = 8
12    mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7fce77d9e000
12    lseek(8, 0, SEEK_END)             = 53146
12    lseek(8, 0, SEEK_CUR)             = 53146
12    lseek(8, 0, SEEK_SET)             = 0
12    mmap(NULL, 53248, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7fce77d91000
12    read(8, "(MAC - Roman)\r\n\r\n\r\n(MAC - Icelan"..., 53146) = 53146
12    munmap(0x7fce77d9e000, 4096)      = 0
12    close(8)                          = 0
12    munmap(0x7fce77d91000, 53248)     = 0
12    ioctl(7, TIOCGWINSZ, 0x7fffa07ad208) = -1 ENOTTY (Not a tty)
12    close(7)                          = 0
12    madvise(0x7fce77dfc000, 16384, MADV_FREE) = 0
12    open("/etc/modsecurity/override.conf", O_RDONLY|O_LARGEFILE) = 7
12    close(7)                          = 0
12    pipe2([7, 8], O_CLOEXEC)          = 0
12    rt_sigprocmask(SIG_BLOCK, ~[], [], 8) = 0
12    rt_sigprocmask(SIG_BLOCK, ~[RTMIN RT_1 RT_2], ~[KILL STOP], 8) = 0
12    rt_sigprocmask(SIG_BLOCK, ~[], ~[KILL STOP], 8) = 0
12    fork()                            = 15
15    gettid()                          = 15
12    rt_sigprocmask(SIG_SETMASK, ~[KILL STOP],  <unfinished ...>
15    rt_sigprocmask(SIG_SETMASK, ~[KILL STOP],  <unfinished ...>
12    <... rt_sigprocmask resumed>NULL, 8) = 0
15    <... rt_sigprocmask resumed>NULL, 8) = 0
12    rt_sigprocmask(SIG_SETMASK, ~[KILL STOP],  <unfinished ...>
15    rt_sigprocmask(SIG_SETMASK, ~[KILL STOP],  <unfinished ...>
12    <... rt_sigprocmask resumed>NULL, 8) = 0
15    <... rt_sigprocmask resumed>NULL, 8) = 0
12    rt_sigprocmask(SIG_SETMASK, [],  <unfinished ...>
15    rt_sigprocmask(SIG_SETMASK, [],  <unfinished ...>
12    <... rt_sigprocmask resumed>NULL, 8) = 0
15    <... rt_sigprocmask resumed>NULL, 8) = 0
12    close(8 <unfinished ...>
15    dup2(8, 1 <unfinished ...>
12    <... close resumed>)              = 0
15    <... dup2 resumed>)               = 1
15    execve("/bin/sh", ["sh", "-c", "eval \"printf %s\\\\\\\\0 x $1 $2\"", "sh", "/etc/modsecurity/override.conf", "2>/dev/null"], 0x7fffa07b2070 /* 64 vars */ <unfinished ...>
12    read(7,  <unfinished ...>
15    <... execve resumed>)             = 0
15    arch_prctl(ARCH_SET_FS, 0x7f778dd17b48) = 0
15    set_tid_address(0x7f778dd17fb0)   = 15
15    brk(NULL)                         = 0x555839865000
15    brk(0x555839867000)               = 0x555839867000
15    mmap(0x555839865000, 4096, PROT_NONE, MAP_PRIVATE|MAP_FIXED|MAP_ANONYMOUS, -1, 0) = 0x555839865000
15    mprotect(0x7f778dd14000, 4096, PROT_READ) = 0
15    mprotect(0x555809d5c000, 16384, PROT_READ) = 0
15    getuid()                          = 0
15    mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f778dc78000
15    getpid()                          = 15
15    mmap(NULL, 8192, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f778dc76000
15    rt_sigprocmask(SIG_UNBLOCK, [RT_1 RT_2], NULL, 8) = 0
15    rt_sigaction(SIGCHLD, {sa_handler=0x555809cd9b7a, sa_mask=~[RTMIN RT_1 RT_2], sa_flags=SA_RESTORER, sa_restorer=0x7f778dcc7c9f}, NULL, 8) = 0
15    mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f778dc75000
15    getppid()                         = 12
15    stat("/usr/share/nginx/html", {st_mode=S_IFDIR|0775, st_size=4096, ...}) = 0
15    stat(".", {st_mode=S_IFDIR|0775, st_size=4096, ...}) = 0
15    rt_sigaction(SIGINT, NULL, {sa_handler=SIG_DFL, sa_mask=[], sa_flags=0}, 8) = 0
15    rt_sigaction(SIGINT, {sa_handler=0x555809cd9b7a, sa_mask=~[RTMIN RT_1 RT_2], sa_flags=SA_RESTORER, sa_restorer=0x7f778dcc7c9f}, NULL, 8) = 0
15    rt_sigaction(SIGQUIT, NULL, {sa_handler=SIG_DFL, sa_mask=[], sa_flags=0}, 8) = 0
15    rt_sigaction(SIGQUIT, {sa_handler=SIG_IGN, sa_mask=~[RTMIN RT_1 RT_2], sa_flags=SA_RESTORER, sa_restorer=0x7f778dcc7c9f}, NULL, 8) = 0
15    rt_sigaction(SIGTERM, NULL, {sa_handler=SIG_DFL, sa_mask=[], sa_flags=0}, 8) = 0
15    mmap(NULL, 4096, PROT_READ|PROT_WRITE, MAP_PRIVATE|MAP_ANONYMOUS, -1, 0) = 0x7f778dc74000
15    open("/dev/null", O_WRONLY|O_CREAT|O_TRUNC|O_LARGEFILE, 0666) = 7
15    fcntl(2, F_DUPFD_CLOEXEC, 10)     = 10
15    fcntl(10, F_SETFD, FD_CLOEXEC)    = 0
15    dup2(7, 2)                        = 2
15    close(7)                          = 0
15    fcntl(1, F_GETFL)                 = 0x1 (flags O_WRONLY)
15    ioctl(1, TIOCGWINSZ, 0x7fffbe3dc928) = -1 ENOTTY (Not a tty)
15    writev(1, [{iov_base="x\0/etc/modsecurity/override.conf"..., iov_len=33}, {iov_base=NULL, iov_len=0}], 2 <unfinished ...>
12    <... read resumed>"x\0/etc/modsecurity/override.conf"..., 1024) = 33
15    <... writev resumed>)             = 33
12    read(7,  <unfinished ...>
15    dup2(10, 2)                       = 2
15    close(10)                         = 0
15    munmap(0x7f778dc74000, 4096)      = 0
15    exit_group(0)                     = ?
12    <... read resumed>"", 1024)       = 0
15    +++ exited with 0 +++
12    --- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=15, si_uid=0, si_status=0, si_utime=0, si_stime=0} ---
12    close(7)                          = 0
12    wait4(15, [{WIFEXITED(s) && WEXITSTATUS(s) == 0}], 0, NULL) = 15
12    open("/etc/modsecurity/override.conf", O_RDONLY|O_LARGEFILE) = 7
12    close(7)                          = 0
12    open("/etc/modsecurity/override.conf", O_RDONLY|O_LARGEFILE) = 7
12    close(7)                          = 0
12    open("/etc/modsecurity/override.conf", O_RDONLY|O_LARGEFILE) = 7
12    ioctl(7, TIOCGWINSZ, 0x7fffa07ad208) = -1 ENOTTY (Not a tty)
12    readv(7, [{iov_base="# Custom overrides applied after"..., iov_len=8191}, {iov_base="", iov_len=1024}], 2) = 163
12    readv(7, [{iov_base="", iov_len=8028}, {iov_base="", iov_len=1024}], 2) = 0
12    --- SIGSEGV {si_signo=SIGSEGV, si_code=SEGV_MAPERR, si_addr=0x1} ---
12    +++ killed by SIGSEGV +++
```

---

### Additional Context

This issue was initially discovered while using the `owasp/modsecurity:nginx-alpine` image with a custom nginx configuration. The problem is reproducible in a minimal setup, so it appears to be a bug in the ModSecurity-nginx connector itself, not in nginx or the ModSecurity library alone.

Please let me know if any further information is required.

---

