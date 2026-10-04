# Files and tools

Open `https://cardopoli.github.io/enricopolicardo.com/admin/`. Sveltia CMS connects to `cardopoli/enricopolicardo.com`, branch `main`.

## Sign in

Choose **Sign In with GitHub**. This setup reuses your existing authenticator at `https://sveltia-cms-auth.cardopoli.workers.dev`.

If the worker restricts sites through `ALLOWED_DOMAINS`, keep its existing domains and add `cardopoli.github.io` as comma-separated hostnames in Cloudflare Workers > sveltia-cms-auth > Settings > Variables and Secrets. Save and deploy the worker. No new OAuth app or client secret is required.

Token sign-in remains an alternative, but is not needed for the normal GitHub sign-in flow.

## What you can manage

- **Tools:** edit the complete source of the five HTML tools (including the archived version) and the InDesign JSX script. The raw format and plain-text field avoid adding front matter or serialising code as an object.
- **Homepage:** edit the existing `index.html` source.
- **Document links:** maintain document titles, file links and notes. This list is stored in `data/documents.json`; its titles and notes appear on the homepage.
- **Asset Library:** upload, replace and organise files in `uploads`, `tools` and `documents`. Existing source files may be classified as entries rather than assets; use the Tools collection for those.

Uploading a new HTML tool into `tools` gives it a URL at `/enricopolicardo.com/tools/filename.html`. To add it to the Tools editor list, add a file definition to `admin/config.json` following an existing example. Renaming a file changes its URL; links embedded in HTML source are not automatically repaired.

Saving to `main` updates the GitHub repository. The site's existing hosting/deployment must publish this branch for the changes to appear online. This installation does not change hosting, DNS or the existing tool files.

## Installation

Commit the `admin` folder at the repository root. No build step or package manager is needed. For a local check, run `python3 -m http.server 8000` at the repository root and open `http://localhost:8000/admin/`.

## References

- https://sveltiacms.app/en/docs/start
- https://sveltiacms.app/en/docs/backends/github
- https://sveltiacms.app/en/docs/collections/entries/formats
- https://sveltiacms.app/en/docs/ui/asset-library

Sveltia is loaded from its official CDN distribution. The admin page requires an internet connection. GitHub OAuth uses your existing Sveltia authenticator.
