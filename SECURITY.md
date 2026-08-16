# Security Policy

## Reporting a vulnerability

If you discover a security issue in Nexus, please report it privately.

**Preferred method:** Open a private security advisory on this GitHub repository, or email the maintainer directly if an advisory is not practical.

Please include:
- A clear description of the issue
- Steps to reproduce (if possible)
- Impact assessment (what an attacker could achieve)
- Any suggested fix (optional)

Do not open a public issue for security-sensitive reports until a fix is available or the maintainer has confirmed disclosure is appropriate.

## Security posture

Nexus is designed with a simple threat model:

- **Local-first.** Core functionality requires no accounts and no cloud services.
- **Markdown is the source of truth.** Notes live as ordinary files on disk that the user controls.
- **The search index is disposable.** It lives outside the vault (under application data) and can be deleted and rebuilt. It should never be treated as authoritative.
- **No remote code execution by design** in the core note/search path. The desktop shell uses Tauri; the browser path uses the File System Access API with user-granted folder access.

Users should still treat any local application that can read and write their files with normal care (keep the OS and dependencies updated, only open trusted vaults, review contributions before merging, etc.).

## Scope

In scope: vulnerabilities in the Nexus application code, its indexing pipeline, file handling, or the desktop/web shells that could lead to data loss, unauthorized local file access beyond the intended vault, or similar issues.

Out of scope for this policy: issues that require physical access to an unlocked machine, social engineering, or vulnerabilities solely in third-party dependencies (report those upstream when possible; we will still appreciate a heads-up).

Thank you for helping keep the project safe for users who trust it with their notes.
