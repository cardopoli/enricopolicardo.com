# Dependencies and compatibility

Recorded from ReThinkable WordPress on **20 November 2026**. Versions are a snapshot, not an automatic live dependency lock.

| Component | Observed version | Role / dependency |
| --- | --- | --- |
| WordPress | 7.1.5 | Core CMS |
| PHP | 8.4.28 | Hosting runtime |
| Inspiro | 1.6.4 | Existing footer widget layout and theme footer template |
| Advanced Custom Fields | 6.8.11 | Required for Editorial Kit homepage fields |
| ReThinkable Editorial Kit | Installed 1.0.0; proposed 1.1.0 | Homepage fields and styles (page ID 12467); public overrides opt-in |
| ReThinkable Partners Manager | Installed 1.0.0; proposed 1.2.1 | Edition-partner storage, footer and linked credits |
| Universal WordPress MCP Bridge | Installed 0.6.1; proposed 0.6.4 | MCP/OAuth integration, administrator controls |
| qTranslate-XT | 3.16.1 | Existing IT / SL / EN content rendering |
| Events Manager | 7.4.13 | Programme, event bookings and metadata |
| Yoast SEO | 28.9 | Metadata / indexing |
| Shortcodes Ultimate | 7.9.2 | Shortcodes used by existing content |
| Content Views | 4.5.1.2 | Existing partner / listing shortcodes |
| Elementor | 4.4.1 | Existing content/layout dependencies |

Also in use: Max Mega Menu, Contact Form 7 and historical Smart Slider shortcodes. Do not deactivate them without inspecting content dependencies.

## Technical constraints

- **Partners Manager:** 1.2.1 moves its logos into the existing four-column Inspiro footer widgets in the browser. It does not create a second visible section, and skips duplicate historical supporter logos. Requires JS for the added logos. Automatic footer rendering assumes Inspiro's `template-parts/footer/site-info.php` is loaded. Another theme needs the `[rt_partners]` shortcode placed explicitly. CSS uses smaller responsive logo columns; it does not replace existing footer widgets.
- **Editorial Kit:** ACF required for its fields. It edits a specific homepage post, currently **12467**. A new homepage ID needs deliberate code changes. Existing page content is preserved as fallback.
- **MCP Bridge:** HTTPS, WordPress admin approval, allowed redirect hosts, OAuth authorization code + PKCE. Used with an MCP client on an earlier live build; **Claude and the 0.6.4 release still need end-to-end testing**. Do not promise cross-client compatibility or claim security certification.
- **Security / recovery:** upgrading theme or core may affect custom footer hooks and earlier parent-theme edits. Verify UpdraftPlus restoration off production. Website ownership, hosting, domain, privacy and incident-response controls are not solved by plugin installation.

## Versioned release discipline

1. Modify source, run `php -l` on all PHP files.
2. Build a WordPress-installable ZIP with a single correctly named plugin root folder.
3. Compute SHA-256 and record it in `CHECKSUMS.sha256`.
4. Review changed settings and migrations against existing site data.
5. Perform integration and language tests on staging.
6. Update public guide/version; ship **after** tests, noting any outstanding issues.

All website configuration and secrets stay on WordPress. None belong in the public GitHub repository.
