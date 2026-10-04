# Files and tools

Open `/admin/` on the published site. Sveltia CMS connects to `cardopoli/enricopolicardo.com`, branch `main`.

## Sign in

Choose **Sign In with Token**. For a fine-grained GitHub token, select only this repository and give **Contents: Read and write**. Metadata read access is automatic. Enter the token in the CMS login screen, never in these files. This setup uses direct commits and does not require pull-request permissions or an OAuth server.

## What you can manage

- **Tools:** edit the complete source of the five existing HTML tools and the InDesign JSX script. The raw format and plain-text field avoid adding front matter or serialising code as an object.
- **Homepage:** edit the existing `index.html` source.
- **Document links:** maintain document titles, file links and notes. This list is stored in `admin/documents.json`; it does not automatically add links to the homepage.
- **Asset Library:** upload, replace and organise files in `uploads`, `tools` and `This Was Tomorrow`. Existing source files may be classified as entries rather than assets; use the Tools collection for those.

Uploading a new HTML tool into `tools` gives it a URL at `/tools/filename.html`. To add it to the Tools editor list, add a file definition to `admin/config.json` following an existing example. Renaming a file changes its URL; links embedded in HTML source are not automatically repaired.

Saving to `main` updates the GitHub repository. The site's existing hosting/deployment must publish this branch for the changes to appear online. This installation does not change hosting, DNS or the existing tool files.

## Installation

Commit the `admin` folder at the repository root. No build step or package manager is needed. For a local check, run `python3 -m http.server 8000` at the repository root and open `http://localhost:8000/admin/`.

## References

- https://sveltiacms.app/en/docs/start
- https://sveltiacms.app/en/docs/backends/github
- https://sveltiacms.app/en/docs/collections/entries/formats
- https://sveltiacms.app/en/docs/ui/asset-library

Sveltia is loaded from its official CDN distribution. The admin page requires an internet connection. An OAuth login can be added later by configuring a Sveltia authenticator; token login works without one.
