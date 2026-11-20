# ReThinkable WordPress administration

Three separate, versioned plugins used by the ReThinkable Festival website. Each has its own top-level WordPress administration menu. No credentials, database exports, generated logs, caches or private configuration are included.

| WordPress menu | Plugin | Version | Release |
| --- | --- | --- | --- |
| **Homepage & Design** | ReThinkable Editorial Kit | 1.1.0 | [ZIP](releases/rethinkable-editorial-kit-v1.1.0.zip) |
| **Partners & Supporters** | ReThinkable Partners Manager | 1.2.1 | [ZIP](releases/rethinkable-partners-manager-v1.2.1.zip) |
| **AI Connection** | Universal WordPress MCP Bridge | 0.6.3 beta | [ZIP](releases/universal-wordpress-mcp-bridge-v0.6.3.zip) |

Each ZIP includes readable PHP/CSS/JavaScript source and its own documentation, plus the nine RT.5 logo assets in Partners Manager. Releases are intended to be installed as WordPress plugins, not extracted into this GitHub Pages site.

## Installation / upgrade

1. Verify a restorable backup of the website and database; test on staging first.
2. WordPress **Plugins → Add New → Upload Plugin**. Select the ZIP for the relevant plugin.
3. If upgrading, choose **Replace current with uploaded**, **not uninstall**. Existing WordPress options, partner editions, ACF data and MCP authorisations should remain intact.
4. Verify three separate sidebar menus appear: **Homepage & Design**, **Partners & Supporters** and **AI Connection**.
5. Test all three languages (IT, SL, EN), homepage editing, partner credits, footer logo links, mobile layout, event booking and MCP read-only access.
6. Keep MCP write, maintenance and code-edit permissions disabled unless needed and authorised. Never copy OAuth tokens into GitHub.

**The packages have passed PHP syntax validation, not a full end-to-end staging or production test.** The MCP Bridge has not had an independent security assessment; Claude compatibility is unverified.

## Working practice

- **Footer integration**: keep the original four-column widget content (branding, historical logos, municipalities, Links). The RT.5 partner logos are compact in a new column within that same row; only Cassa Rurale FVG is appended to existing supporters. No duplicate lower footer section.\n- **Partners & Supporters**: change links, order, role, logos and visibility in WordPress; copy an edition before editing the next one. Publishing a new active edition requires an administrator. Historical programme and media-kit credits remain fixed to their own edition.
- **Homepage & Design**: edit the current RT.5 homepage using the ACF fields; its public rendering is disabled until an administrator explicitly activates it.
- **AI Connection**: self-hosted OAuth-protected MCP endpoint. Start read-only, whitelist approved callback domains, keep administrator approval for modifications.

**Dependencies, ownership, handover and recovery:** [documentation](../../docs/rethinkable-wordpress-admin/README.md). **Checksums:** [SHA-256](../../docs/rethinkable-wordpress-admin/CHECKSUMS.sha256).

The original general-purpose [WordPress MCP Bridge download page](../wordpress-mcp-bridge.html) remains available.
