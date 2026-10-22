# Music player

Open `tools/music.html` through the site's HTTPS address. This is a browser-only Dropbox player using OAuth code flow with PKCE. No worker, app secret, folder shared link, or server password is required.

## One-time Dropbox setup

1. Visit https://www.dropbox.com/developers/apps and create a **Scoped access** app with **Full Dropbox** access. App Folder access cannot browse an existing music collection outside the app folder. Choose an app name such as `Enrico Music` (Dropbox may require a globally unique name).
2. In **Permissions**, enable only `files.metadata.read` and `files.content.read`, then submit the changes. These are read-only permissions. Full Dropbox authorisation gives the app read access across the account; choosing a music folder limits the player UI, not the underlying OAuth permission.
3. In **Settings → OAuth 2 → Redirect URIs**, add the exact address shown in the player's **First-time setup** section. For GitHub Pages it is `https://cardopoli.github.io/enricopolicardo.com/tools/music.html`. Add a separate redirect for a custom domain if used. The scheme, host, path and trailing slash must match exactly.
4. Copy the **App key** into the player's first-time setup and save. This is a public client identifier. Never supply an app secret, password, generated access token or refresh token in the repository or chat.
5. Click **Connect Dropbox**, sign in and approve the requested read access on Dropbox's page. Choose the music folder in the player and click **Use this music folder**. The previously shared music-folder link is deliberately not used or stored in the repository.

The app key is remembered in this browser. Session credentials and the queue normally stay in sessionStorage. Choosing **Remember this connection on this device** stores the credentials and listening state in localStorage. There are no third-party scripts or analytics on the player page. Browser storage is accessible to other code running on the same origin; use the remember option only on your own device.

**Disconnect Dropbox** stops audio, clears the connection, queue, folder selection and listening history from both storage types, and attempts to revoke the token. If offline revocation fails, revoke the connection in Dropbox's connected-app settings. The public app key is kept for convenience.

## Playback

Open folders, play a track or play all displayed tracks. `+` adds a track to the queue. The whole-folder search recursively lists the chosen music folder and searches filenames and folder names, not ID3 tags. Large collections load in API pages; search can be cancelled. Temporary streaming links are fetched as needed and reused in memory for up to three hours. Tracks are streamed from Dropbox, not copied into GitHub or cached for offline playback.

Shuffle, repeat off/all/one, queue removal and saved-track resume are supported. Playback never starts automatically after reload. Lock-screen controls use the browser Media Session API where supported. Phone background playback, codecs and auto-advance depend on the browser and OS. MP3 is the safest starting format; an unsupported format produces a retry message rather than silently skipping files.

## Validation

Run `node --test tests/music.test.mjs` and `node --check assets/js/music/player.mjs`. The tests cover S256, callback state/expiry, folder containment, API pagination, refresh races, disconnect during refresh, 401 renewal, rate limiting, safe media hosts and shuffle membership.

Live Dropbox authorisation and real-file playback require the app key and owner approval and cannot be verified using mocks. No credentials or test tokens are included in source.

References: https://docs.dropboxapi.com/dropbox-api/docs/get-started/authorization and https://docs.dropboxapi.com/dropbox-api/api-reference/user-endpoints/files/get-temporary-link
