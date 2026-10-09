# Security changes

This is a personal streaming derivative of Kawaikara v2.3.1. It does not claim a comprehensive security certification.

Remote pages do not receive preferences, menu selection, arbitrary callbacks, download execution, or Node APIs. A narrow login callback is exposed only for the active Netflix or Coupang Play origin. Main-process handlers additionally validate the sender webContents, main frame, origin, channel, and callback tag. Unknown origins and child frames are denied.

The vulnerable shell-based YouTube download path and plaintext cookie-export path were removed. Chzzk no longer fetches unversioned JavaScript and executes it. Discord integration and embedded publisher credentials were removed. A fresh archive drops obsolete code and source maps instead of retaining the original archive bytes.

All windows use sandbox=true, nodeIntegration=false, contextIsolation=true. Popups cannot create a privileged Electron window; HTTPS links can open through the default browser. External links reject non-HTTPS schemes and embedded user credentials. The kawai resource protocol serves only packaged icon files and rejects path traversal.

The supported runtime is Castlabs Electron 43.5.0+wvcus. The original 35.2.2 runtime is retained only in a local backup and is not included in this release. The 44.1.0 candidate crashed on page reopening on this PC. The release uses the factory VMP-signed binary without editing it. Production DRM compatibility remains unverified.

The source repository and release archives exclude app profiles, cookies, browser history, logs, credentials, environment files, original Git metadata, personal paths, and authenticated screenshots. Distribution packaging uses an allowlist and scans file contents before upload.

Test status and remaining limits are in VALIDATION.json. Report security problems privately to the repository owner. Automatic publication, telemetry, and upstream auto-update are disabled.

## User-installed extensions (2.3.1-ai.3)

Extensions are opt-in unpacked folders, added through the native folder picker and an explicit permission confirmation. Their code can read/modify sites covered by their requested permissions; this release does not audit third-party extensions. Packages and the registry stay in the user's portable data/extensions directory and are never published. Installed packages have persistent extension IDs. Duplicate keys/content are rejected before loading, and copies reject symlinks, excessive size and managed-folder recursion.

The extension manager has a separate persistent session without extensions, a minimal preload and a restrictive CSP. Its IPC verifies the exact manager window, top-level frame and local file. Extension popups and options run in the service session with sandbox, context isolation, no Node integration and no application preload. File URL access is disabled. Uninstall deletes only a validated token directory, not the selected original folder. Existing remote-page application restrictions remain enforced.

Electron only partially implements the Chrome APIs. Static popup pages do not emulate a Chrome action click or activeTab grant. The unused global request interception was removed. The existing header compatibility hook runs only while CoupangPlay is selected and is removed when switching away; network/request extensions can conflict during that service. VMP/paid playback and screen-sharing/recording behavior are not newly certified by this release.
