# Contributing

Thanks for looking. This is a small library with a narrow remit, so the most
useful contributions are usually small ones.

## Getting set up

```bash
git clone git@github.com:tb962/heatmap-ui.git
cd heatmap-ui
npm install
npm test
```

Node 20 or newer. `npm test` runs the build first, so a passing test run means
the TypeScript compiles too.

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run build`     | Compiles `src` to `dist` with `tsc`            |
| `npm run typecheck` | Type-checks without emitting                   |
| `npm test`          | Builds, then runs the `node --test` suite      |

CI runs `npm ci` on Node 20, 22 and 24. If you change dependencies, commit the
updated `package-lock.json`. `npm ci` fails on a lockfile that has drifted
from `package.json`.

## The playground

```bash
npm run build
npx serve .
```

Open `examples/playground.html`. It imports the compiled output from `dist`,
so rebuild after changing anything in `src`. React comes from a CDN, so the
page needs network access. The hosted copy is at
<https://tb962.github.io/heatmap-ui/>.

## What the library is trying to be

A wide set of heatmaps you can shape yourself, rather than one chart with a
few knobs. Shapes, 3D forms, block styles, themes, patterns and colour
resolvers are all props, and new ones are welcome if they compose with what is
already there.

Three things shape most review comments, so they are worth knowing up front.

It is headless. The library ships structure and a stylesheet you can replace.
Please do not add opinionated visual design to the core, and do not add runtime
dependencies. React is a peer dependency and the package has no others.

Defaults follow the conventions readers already know. `scale="linear"` is the
default because that is how GitHub and most other heatmaps band their colours.
Quantile, log and custom functions are there for people who need them, and the
README says when to reach for each. A change to a default needs an argument
about what readers expect, not only about what is statistically nicer.

A gap is not a zero. `known: false` renders differently from a zero value and
reads differently to a screen reader. Anything that erases that distinction is
a bug, not a simplification.

## Pull requests

- Branch off `main`.
- Add a test for behaviour changes. The suite is plain `node --test` against
  the compiled output in `dist`; see `test/` for the shape of existing ones.
- Accessibility is part of the change, not a follow-up: anything that renders
  needs a sensible accessible name and must survive keyboard navigation.
- Keep the commit history readable. One logical change per commit is ideal, but
  nobody will bounce a PR over it.
- CI must be green before review.

## Reporting bugs

Open an issue with the version, what you passed in, and what you expected. A
runnable snippet is worth more than a description. For anything security
related see [SECURITY.md](SECURITY.md) instead.

## Releases

Maintainers only. Bump the version in `package.json`, merge to `main`, then
push a matching tag:

```bash
git tag -a v0.2.0 -m "v0.2.0"
git push origin v0.2.0
```

The Release workflow verifies the tag matches `package.json`, publishes to npm
and cuts the GitHub Release.

## License

Contributions are accepted under the [MIT license](LICENSE).
