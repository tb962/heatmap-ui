# Security policy

## Supported versions

heatmap-ui is pre-1.0. Fixes land on the latest released minor; older ones are
not backported.

| Version | Supported |
| ------- | --------- |
| 0.1.x   | Yes       |
| < 0.1   | No        |

## Reporting a vulnerability

Please report privately rather than opening a public issue. Use GitHub's
private vulnerability reporting:

**[Report a vulnerability](https://github.com/tb962/heatmap-ui/security/advisories/new)**

That opens a private advisory visible only to the maintainers. Include the
version, a description, and the smallest reproduction you can manage.

Expect an acknowledgement within a week. If a report is accepted you will get
an estimate for the fix and credit in the advisory unless you would rather not
be named.

## Scope

This is a rendering library. It takes your data and produces DOM and SVG. The
things worth reporting are:

- Any input to a component that escapes as markup or script — values, labels,
  tooltip text, class names, or CSS custom properties reaching the DOM
  unescaped.
- A crash or unbounded loop reachable from ordinary data (`NaN`, `Infinity`,
  enormous grids, hostile date ranges).
- Anything in the published tarball that should not be there.

Out of scope: vulnerabilities in React itself, in your bundler, or in the
playground's CDN dependencies, which are development conveniences and are not
part of the published package.
