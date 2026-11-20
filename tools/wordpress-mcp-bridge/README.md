# Universal WordPress MCP Bridge - Public beta 0.6.4

An independent, self-hosted WordPress Model Context Protocol (MCP) server.

**Status:** beta; source and installation package in the ZIP beside this README. No independent security audit. Do not deploy to a live site without staging tests and a verified backup.

## Free download

[Download the WordPress plugin ZIP (0.6.4)](universal-wordpress-mcp-bridge-v0.6.4.zip)

SHA-256: `947fe69866b17930338fb9055428641dc37ce70ca4554692ebcc737aa78b8d32`

[Open the tools page](../wordpress-mcp-bridge.html)

The ZIP contains all PHP/JS source files, WordPress installation instructions, a compatibility matrix and security notes. Licence: GPL-2.0-or-later.

## Compatibility

- **Claude:** remote MCP with OAuth dynamic client registration. End-to-end testing still to come. Add the exact `claude.ai` hostname in **AI Connection** (WordPress sidebar) → Allowed OAuth callback domains. In Claude, choose automatic registration, not Claude's published identity mode.
- **Other clients:** only those supporting appropriate remote MCP HTTP and OAuth. Compatibility may require client-specific setup.
- **Testing:** no claim that this ZIP is verified with all assistants. Keep compatibility status in the bundled COMPATIBILITY.md.

## Works well with

- **qTranslate-XT:** reads content with language markers intact; edits that would add or remove a language block are refused.
- **Yoast SEO:** updates SEO title, meta description and social description, when Yoast is active.
- **UpdraftPlus:** reads backup schedules, remote destination and history; warns when there's no off-site backup.
- **Custom post types:** list and search any post type.

Scheduled tasks belonging to WordPress core, UpdraftPlus, Wordfence and WooCommerce are protected from removal. So far used on one multilingual WordPress site.

## Security

The bridge has privileges to inspect and propose changes to a WordPress installation. It is disabled by default. HTTPS and explicit administrator OAuth consent are required. Write, maintenance and theme code editing have separate controls. Do not open the callback allowlist to unknown domains; never publish server credentials or OAuth tokens. Test on staging first.

## Pricing

**Free / donation-supported**. The source is freely licensed. You can optionally fund development or pay for setup and support. Donations are not required, and no payment link is active yet.

## Notes for maintainers

- Review code changes and third-party dependencies before publishing to any WordPress plugin directory.
- The public release should be accompanied by automated integration tests, an independent security review and a responsible disclosure channel.
- No WordPress site settings, personal data or passwords are included in this ZIP.
