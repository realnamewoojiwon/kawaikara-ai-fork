# Security changes

This is a personal streaming derivative of Kawaikara v2.3.1. It does not claim a comprehensive security certification.

Remote pages do not receive preferences, menu selection, arbitrary callbacks, download execution, or Node APIs. A narrow login callback is exposed only for the active Netflix or Coupang Play origin. Main-process handlers additionally validate the sender webContents, main frame, origin, channel, and callback tag. Unknown origins and child frames are denied.

The vulnerable shell-based YouTube download path and plaintext cookie-export path were removed. Chzzk no longer fetches unversioned JavaScript and executes it. Discord integration and embedded publisher credentials were removed. A fresh archive drops obsolete code and source maps instead of retaining the original archive bytes.

All windows use sandbox=true, nodeIntegration=false, contextIsolation=true. Popups cannot create a privileged Electron window; HTTPS links can open through the default browser. External links reject non-HTTPS schemes and embedded user credentials. The kawai resource protocol serves only packaged icon files and rejects path traversal.

The supported runtime is Castlabs Electron 43.5.0+wvcus. The original 35.2.2 runtime is retained only in a local backup and is not included in this release. The 44.1.0 candidate crashed on page reopening on this PC. The release uses the factory VMP-signed binary without editing it. Production DRM compatibility remains unverified.

The source repository and release archives exclude app profiles, cookies, browser history, logs, credentials, environment files, original Git metadata, personal paths, and authenticated screenshots. Distribution packaging uses an allowlist and scans file contents before upload.

Test status and remaining limits are in VALIDATION.json. Report security problems privately to the repository owner. Automatic publication, telemetry, and upstream auto-update are disabled.
