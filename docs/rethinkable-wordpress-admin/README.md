# ReThinkable WordPress - maintenance and handover

Public project documentation for the three site-specific plugin upgrades released 20 November 2026. This is a guide, **not** a backup, live config, OAuth key store or snapshot of WordPress content.

## Plugin architecture

The three plugins are independent, with **separate first-level WordPress sidebar entries**:

1. **Homepage & Design** - ReThinkable Editorial Kit 1.1.0. ACF-assisted editing of homepage page 12467, multilingual copy and media, and optional styles.
2. **Partners & Supporters** - ReThinkable Partners Manager 1.2.1. Edition-scoped partner/supporter database, linked names and logos, and a compact responsive footer inside the existing Inspiro layout.
3. **AI Connection** - Universal WordPress MCP Bridge 0.6.3 (beta). WordPress-hosted MCP/OAuth endpoint and separately gated read/write/maintenance capabilities.

They should not share a synthetic Settings submenu or a controlling umbrella plugin. Deactivating one should not remove another's management screen.

## Install and safely upgrade

1. Confirm a usable, offsite database-and-files backup and a separate administrator recovery login. Prefer a staging environment.
2. Download the three [release ZIP files](../../tools/rethinkable-wordpress-admin/README.md). Install or upgrade **one at a time** through **Plugins → Add New → Upload Plugin**. Choose **Replace existing**, not Delete.
3. Check each WordPress sidebar entry. The original options and post meta are not deleted by a replacement upload.
4. Verify the homepage in IT, SL and EN; inspect desktop/mobile responsive layout, images and video; check a live event's booking flow.
5. Verify the four original footer widgets are unchanged: identity, historical Regione FVG / Io Sono FVG / GO!2025, Comune di Gorizia / Mestna občina Nova Gorica, and Links. The six RT.5 partner logos should be small in the existing footer row, with only Cassa Rurale FVG added to historic supporters. There should be **no duplicate section below the footer widgets**.
6. Confirm fixed RT.5 partner credits in the programme and Media Kit, and dynamic current-edition credits on Chi siamo.
7. Test MCP read-only connection before enabling extra capabilities. Allow only expected OAuth callback domains.

## Each edition gets its own partners

Use **Partners & Supporters → Manage partners** to edit partner role, name, URL, logo, sort order and enabled status. **Copy to new edition** to create the next version as a draft. Do not publish that edition until the partner list has been approved. Publishing updates the shared footer and current partner credits; previous festival editions retain their historical credits.

Use **Centro Volontari Cooperazione allo Sviluppo - CVCS** as the displayed full name. The original nine-logo set is bundled in the manager; change it through WordPress, not by editing the theme. The current site uses qTranslate-XT for Italian, Slovenian and English.

## Responsibilities

- **Editors**: texts, media, partner records and new draft edition lists, event translations and programme metadata.
- **Administrators**: activate editions, plugin updates, backups and restores, user roles, MCP authorisations, domain and hosting ownership.
- **Technical maintainer**: staging tests, monitoring, dependency compatibility, backup restore drills, security assessment and safe migrations.

An internal operational handbook is saved as **WordPress draft page 12521** on the live site; do not publish it or export its private material into this public repository.

## Rollback

Keep the previous ZIP and a verified backup. To revert a plugin release, upload the previous known-good ZIP using WordPress's replacement flow. Do not delete the plugin or erase WordPress options; check the frontend after rollback. For the bridge, preserve and verify OAuth authorisations and use read-only permissions after recovery.

## Notes

These packages were locally PHP-linted; no independent pentest or full staging test is claimed. No server access keys, private config, user data, media library dump, OAuth credentials or database files are included. Review the [dependency matrix](DEPENDENCIES.md) before removing or upgrading shared WordPress plugins.
