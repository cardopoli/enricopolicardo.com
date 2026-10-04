# Enrico Policardo - tools and files

Public directory: https://cardopoli.github.io/enricopolicardo.com/

## Structure

| Folder | Contents |
| --- | --- |
| `tools/` | Current browser tools and the InDesign script |
| `tools/archive/` | Earlier tools kept for reference |
| `documents/` | Public PDFs and other project documents |
| `assets/css/` | Directory styling |
| `assets/js/` | Directory search and repository indexing |
| `data/` | Document titles, links and notes managed through Sveltia |
| `admin/` | Sveltia interface and configuration |

`index.html` is the directory homepage. Its styles and indexing code live in `assets/`.

## Add a tool

Upload an HTML file to `tools/` through GitHub or Sveltia’s Asset Library. The homepage discovers it from the public repository index. A new file is shown using its filename until you add a display title and description to the `known` map in `assets/js/directory.js`.

To edit a new tool through the CMS’s Tools collection, add its path to `admin/config.json`, following an existing raw-file entry. The tool URLs are relative to the GitHub Pages project address.

## Add a document

Upload to `documents/`, using lowercase filenames with hyphens. Use a project subfolder where useful. Set its title, link and notes in Sveltia’s Document links collection. This registry is saved to `data/documents.json` and supplies display titles and notes to the homepage.

## Work locally

Run `python3 -m http.server 8000` at the repository root, then visit `http://localhost:8000/`. There is no package manager or build step. The live repository index needs internet access; the saved index remains available if that request fails.

## Compatibility

- Existing current tool URLs are unchanged.
- `tools/writingtool.html` redirects to `tools/archive/writingtool.html`.
- The previous PDF path under `This Was Tomorrow/Info_release form/` is retained as a compatibility copy for existing shared links. New links use `documents/this-was-tomorrow/field-guide-and-release.pdf`.

## Administration

Open https://cardopoli.github.io/enricopolicardo.com/admin/ and sign in with GitHub. See `admin/README.md` for authentication and editing details.
