# Obsidian SEO Audit — Agent Guide

## Project overview

- Project: **Obsidian SEO Audit**.
- Target: Obsidian Community Plugin.
- Language: TypeScript, compiled into bundled JavaScript.
- Base: Official `obsidian-sample-plugin`.
- Purpose: Scan published webpages using URLs from Markdown frontmatter, extract SEO metadata, and display audit results inside Obsidian.
- Use the official Obsidian API wherever possible.
- Keep `README.md` focused on plugin users: purpose, features, installation, configuration and usage.

## Environment & tooling

- Package manager: npm.
- Bundler: esbuild.
- TypeScript with strict type checking.
- Obsidian API types from the `obsidian` package.
- Prefer lightweight, browser-compatible dependencies.
- Avoid unnecessary frameworks and large dependencies.
- Follow the existing `package.json` and project build configuration.

### Development commands

```bash
npm install
npm run dev
npm run build
```

Run available linting and testing scripts before completing changes. Do not invent scripts that are not configured in `package.json`.

## Project structure

Keep modules small, focused and independently testable.

Recommended structure:

```text
src/
├── main.ts
├── settings/
│   ├── settings.ts
│   └── settings-tab.ts
├── indexer/
│   └── url-indexer.ts
├── scanner/
│   ├── http-client.ts
│   └── scan-manager.ts
├── parser/
│   ├── html-parser.ts
│   └── metadata-parser.ts
├── storage/
│   └── audit-storage.ts
├── ui/
│   ├── audit-view.ts
│   ├── audit-table.ts
│   └── audit-details.ts
├── i18n/
│   ├── index.ts
│   ├── en.ts
│   └── uk.ts
├── utils/
│   ├── normalize-url.ts
│   └── string-length.ts
├── export/
│   └── export-service.ts
└── types.ts
```

This structure is a guideline, not a rigid requirement. Adjust it when necessary to avoid unnecessary abstractions.

### Architecture rules

- Keep `main.ts` minimal: plugin lifecycle, view registration, commands and dependency initialization.
- Separate URL indexing, HTTP scanning, HTML parsing, storage and UI.
- Keep parsing logic independent from Obsidian UI components.
- Prefer dependency injection and explicit interfaces where useful.
- Avoid circular dependencies.
- Split files that become excessively large or have multiple responsibilities.
- Prefer `async/await` and handle errors explicitly.

## Manifest rules

The `manifest.json` must contain the required Obsidian plugin metadata:

- `id`
- `name`
- `version`
- `minAppVersion`
- `description`
- `isDesktopOnly`

Keep the plugin ID stable once published. Use semantic versioning and ensure `minAppVersion` reflects the APIs used.

## URL indexing

- Discover Markdown files through the Obsidian Vault API.
- Read YAML frontmatter through `metadataCache`.
- Use a configurable property name, defaulting to `url`.
- Treat the configured frontmatter property as the source of truth for URL discovery.
- **Each Markdown file represents exactly one webpage URL.**
- The URL property must contain a single string value.
- Do not support arrays, lists or multiple URLs within the same property.
- Ignore files where the URL property is missing, empty, not a string or does not contain a valid HTTP/HTTPS URL.
- Maintain an index mapping URLs to their source Markdown files.
- Deduplicate identical URLs across different files while preserving references to all matching files.
- Scan each unique URL only once, even when referenced by multiple Markdown files.
- Normalize URLs consistently, without incorrectly merging distinct webpages.
- Refresh the index when files are created, modified, renamed or deleted.
- Debounce frequent filesystem and metadata events.

Example of supported frontmatter:

```yaml
---
title: "QR Code Pricing | FbFast"
url: "https://fbfast.io/pricing"
language: "en"
---
```

Unsupported format:

```yaml
---
url:
  - https://example.com/page
  - https://example.com/another-page
---
```

Indexing must not automatically trigger HTTP scanning.

## HTTP scanning

- Use Obsidian's `requestUrl()` API for network requests.
- Start scanning only after explicit user interaction.
- Support scanning all indexed URLs or selected URLs.
- Limit concurrent requests using a configurable concurrency setting.
- Support logical request timeouts, stopping the scan queue and progress reporting.
- Account for the fact that `requestUrl()` does not provide an AbortController-compatible cancellation mechanism.
- After a logical timeout, retain the physical concurrency slot until the underlying request settles. Bound waiting and ignore late results.
- Never start unlimited or uncontrolled background requests.
- Handle failures independently for each URL.

Collect:

- Original URL.
- HTTP status code.
- HTTP request duration in milliseconds.
- Scan timestamp.
- `X-Robots-Tag` response header, including multiple values where available.
- Final URL after redirects, if reliably available.
- Network, timeout and response errors.

Measure duration from request start until the full response is received. Do not describe this metric as TTFB.

Do not execute JavaScript from downloaded webpages.

## HTML parsing

Use `DOMParser` to extract SEO metadata from the returned HTML.

### Required metadata

**Basic SEO**

- `title`
- `meta[name="description"]`
- `link[rel="canonical"]`
- `meta[name="robots"]`

**Open Graph**

- `og:title`
- `og:description`
- `og:image`

**Twitter Cards**

- `twitter:title`
- `twitter:description`
- `twitter:image`

**Alternate languages**

- All `link[rel="alternate"][hreflang]` elements.
- Preserve every `hreflang` and `href` pair.
- Include `x-default` when present.
- Do not limit the number of alternate entries.

**Headings**

- All H1 elements.
- Preserve their text and document order.
- Record the total H1 count.

### Parsing rules

- Preserve original extracted values.
- Preserve duplicate metadata tags instead of silently discarding them.
- Store missing scalar values as `null` and missing collections as empty arrays.
- Store the length of every extracted text and URL field.
- Count Unicode code points consistently, not JavaScript UTF-16 code units.
- Keep original and normalized values separate when normalization is needed.
- Handle malformed HTML gracefully.
- Never execute remote scripts.
- Do not introduce fixed SEO length limits or assume that character counts directly determine Google search result truncation.

Design the metadata schema so additional SEO fields can be added later.

## Data storage

- Treat all Markdown files as strictly read-only.
- Never modify Markdown content, frontmatter or file paths.
- Store plugin settings and audit results separately from Markdown files.
- Use Obsidian-supported plugin storage mechanisms.
- Keep settings separate from potentially large scan-result caches.
- Use versioned storage schemas and provide migration support when schemas change.
- Serialize or coordinate writes to avoid data loss.
- Do not store complete HTML responses unless explicitly required.
- Preserve the latest scan result, scan timestamp, metadata values and their lengths.
- Design storage so historical scans can be added in the future.
- Avoid rewriting large datasets unnecessarily.

Do not rely on Markdown properties to store audit results.

## User interface

Provide a dedicated Obsidian `ItemView` for SEO Audit.

### Main table

- List indexed URLs and associated Markdown files.
- Show scan status, HTTP status, response duration and last scan time.
- Display available SEO metadata.
- Support searching, sorting and filtering.
- Allow users to configure visible columns.
- Support selecting pages for scanning.
- Provide scan progress and stop controls.
- Open the source Markdown file or published webpage.
- Display meaningful empty, loading and error states.

### Audit details

Provide a detailed view for each page containing:

- All extracted metadata values.
- Character lengths.
- All H1 elements.
- All alternate language links.
- HTTP status and response information.
- Scan timestamp and available error details.

Highlight missing metadata and HTTP errors without introducing unsupported SEO judgments.

### UX guidelines

- Follow Obsidian's design conventions.
- Use Obsidian CSS variables rather than hardcoded theme colors.
- Support light and dark themes.
- Keep tables usable with many rows and long metadata values.
- Avoid unnecessary modals and blocking UI operations.
- Register and clean up all event listeners.
- Keep interface labels short and consistent.

## Settings

Provide sensible defaults and validation for:

- Frontmatter URL property name (default: `url`).
- Maximum concurrent requests (default: `3`).
- Request timeout.
- Interface language (automatic or manually selected).

Settings changes should update the appropriate services without unnecessary reinitialization.

## Internationalization

- Support English (`en`) and Ukrainian (`uk`).
- English is the default fallback.
- Detect the Obsidian interface language where supported.
- Allow manual language selection.
- Keep all user-facing strings in translation dictionaries.
- Use typed translation keys.
- Do not hardcode UI text inside components.
- Make additional languages easy to introduce.
- Refresh UI translations when the selected language changes.

## Export

Support exporting audit results to:

- CSV.
- JSON.

Preserve Unicode text and escape CSV values correctly. Include URLs, metadata, lengths, HTTP information and scan timestamps.

## Performance

- Keep plugin startup lightweight.
- Avoid full HTTP scans during plugin initialization.
- Debounce indexing updates.
- Avoid repeated Vault scans when cached metadata is sufficient.
- Limit HTTP concurrency and memory usage.
- Keep the interface responsive during long scans.
- Avoid rendering thousands of table rows simultaneously if virtualization or pagination is appropriate.
- Avoid excessive storage writes.
- Release resources and listeners when views or the plugin are unloaded.

## Security & privacy

Follow Obsidian's Developer Policies and Plugin Guidelines.

- Never modify source Markdown files.
- Never transmit Vault contents, filenames or unrelated note data.
- Network requests should target only URLs explicitly indexed or selected for scanning.
- Restrict scanned URLs to supported HTTP and HTTPS protocols.
- Do not execute downloaded JavaScript or remote code.
- Do not introduce telemetry without explicit user consent.
- Do not access files outside the Vault.
- Clearly document that the plugin requests published webpages over the network.
- Validate and safely handle external HTML, URLs and response data.
- Render untrusted metadata as text, not executable HTML.

## Coding conventions

### General principles

- Use TypeScript with strict type checking.
- Follow existing project formatting and linting rules.
- Prefer readable, maintainable code over unnecessary abstractions.
- Use descriptive names for variables, functions, classes and interfaces.
- Keep functions focused on a single responsibility.
- Prefer early returns to reduce nesting.
- Avoid duplicated logic and magic values.
- Prefer explicit types where they improve clarity.
- Do not introduce unnecessary dependencies.
- Prefer `async/await` over promise chains.

### Function documentation and comments

- Add JSDoc comments to public APIs, non-trivial functions and methods whose purpose or behavior is not immediately obvious.
- Document important algorithms, edge cases, unexpected behavior and technical limitations.
- Explain **why** something is implemented in a particular way rather than repeating what the code already says.
- Include parameter and return descriptions when they provide useful additional information.
- Do not comment every function automatically.
- Avoid redundant comments on simple getters, setters, obvious utility functions or self-explanatory code.
- Keep comments short, accurate and synchronized with the implementation.
- Write code comments and JSDoc in English.

Example of useful documentation:

```typescript
/**
 * Normalizes a URL for indexing without merging
 * webpages that may have different content.
 */
function normalizeUrl(value: string): string | null {
  // Implementation
  return null;
}
```

Example of unnecessary documentation:

```typescript
// Returns the title.
function getTitle(): string {
  return this.title;
}
```

### Conditional statements and braces

- Always use curly braces `{}` when an `if` condition contains two or more logical conditions.
- This includes expressions combined with `&&`, `||` or nested logical operators.
- Do not use single-line conditional statements without braces when multiple conditions are involved.
- For simple single-condition guard clauses, omitting braces is acceptable.
- Use braces for multi-line statements and when they improve readability.
- Apply these rules consistently to `else if` conditions as well.

Incorrect:

```typescript
if (typeof value !== 'string' || !value.trim()) return null;
```

Correct:

```typescript
if (typeof value !== 'string' || !value.trim()) {
  return null;
}
```

Acceptable for a simple condition:

```typescript
if (!value) return null;
```

Also correct:

```typescript
if (!value) {
  return null;
}
```

Prefer consistent formatting within the same function or module.

### Error handling

- Handle expected errors explicitly.
- Avoid silently swallowing exceptions.
- Use meaningful error messages.
- Do not use exceptions for normal control flow.
- Preserve useful error context when propagating failures.
- Never allow a single failed HTTP request to interrupt unrelated scans.

## Testing

Use automated tests for logic that does not require a running Obsidian instance.

Prioritize:

- URL extraction and normalization.
- Validation of single-string URL properties.
- Rejection of URL arrays and unsupported property types.
- Duplicate URL handling across different Markdown files.
- HTML metadata parsing.
- Repeated tags and alternate links.
- Unicode code point lengths.
- Missing or malformed metadata.
- HTTP error and timeout handling.
- Storage serialization and schema compatibility.

Mock Obsidian APIs when necessary.

Manually verify plugin lifecycle, view registration, scanning and UI integration inside a test Vault.

## Build & release

- Run TypeScript checks, configured linting, tests and production build.
- Keep release artifacts compatible with the Obsidian plugin loader.
- Release files are `main.js`, `manifest.json` and optionally `styles.css`.
- Keep `manifest.json` and `versions.json` versions consistent.
- Use GitHub release tags matching the manifest version without a leading `v`.
- Do not commit generated artifacts unless required by the release workflow.
- Do not create commits or releases unless explicitly requested.

## Agent do / don't

### Do

- Follow existing project conventions.
- Keep implementations simple and maintainable.
- Preserve compatibility with the Obsidian Plugin API.
- Handle errors without interrupting unrelated scans.
- Use small, testable modules.
- Document non-trivial functions and important implementation decisions.
- Use curly braces for conditional statements with multiple logical conditions.
- Maintain backwards compatibility for stored data.
- Document meaningful architecture or configuration changes.
- Update existing tests when modifying behavior.

### Don't

- Modify Markdown files or their frontmatter.
- Support multiple URLs in a single Markdown file.
- Add redundant comments to obvious functions or statements.
- Write single-line `if` statements with multiple logical conditions.
- Add unrelated features or dependencies.
- Start network scans without user action.
- Execute scripts from downloaded pages.
- Hardcode SEO recommendations or character limits.
- Block the UI with synchronous processing.
- Put all functionality into `main.ts`.
- Introduce undocumented cloud dependencies.
- Change plugin IDs or existing storage schemas without considering compatibility.
- Commit changes unless requested.

## References

- [Obsidian Sample Plugin](https://github.com/obsidianmd/obsidian-sample-plugin)
- [Obsidian Developer Documentation](https://docs.obsidian.md)
- [Obsidian Developer Policies](https://docs.obsidian.md/Developer+policies)
- [Obsidian Plugin Guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines)
- [Obsidian Style Guide](https://help.obsidian.md/style-guide)
