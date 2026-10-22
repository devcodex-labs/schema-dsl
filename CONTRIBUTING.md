# Contributing to schema-dsl

Thank you for your interest in contributing to schema-dsl! This document describes
how to participate in this project.

## Types of Contributions

We welcome all types of contributions, including:

- **Bug reports**: Found a bug? Please submit an issue.
- **Feature requests**: Have an idea? Open a feature request.
- **Bug fixes**: Submit a Pull Request to fix a confirmed bug.
- **New features**: Implement a new feature after discussion.
- **Documentation**: Improve or translate documentation.
- **Tests**: Add test cases to improve coverage.

## Development Setup

### Prerequisites

- **Node.js 24 LTS** (see `.nvmrc`); the complete toolchain also supports Node.js 22.13.0 and later Node.js 22 releases.
- **npm**, using the committed `package-lock.json` for reproducible installation.

The published library retains Node.js >=18.0.0 support. Older Node versions run packed runtime-consumer checks in CI; they do not install the repository's development dependencies.

### Getting Started

```bash
# Clone the repository
git clone https://github.com/devcodex-labs/schema-dsl.git
cd schema-dsl

# Install dependencies
npm ci --engine-strict

# Build the project
npm run build

# Run tests
npm test
```

### Available Scripts

```bash
npm run build       # Build production output (CJS + ESM + types)
npm test            # Run all tests
npm run typecheck   # TypeScript type checking
npm run lint        # Run ESLint
npm run test:version  # Verify version consistency
npm run test:runtime -- /absolute/path/package.tgz # Verify a built package on the selected Node
npm run test:audit:website # Audit the website's independent lockfile
npm run test:all:with-audit # Full library checks plus both dependency audits
```

The website has its own `package-lock.json`. CI, Pages, and npm publication run its audit separately; a successful library audit does not cover website dependencies. `prepublishOnly` reuses `test:all:with-audit` so both audits block publication at moderate severity or above.

## Branch Strategy

| Branch | Purpose |
| ------ | ------- |
| `main` | Production-ready stable code |
| `develop` | Integration branch for features |
| `feat/*` | New feature development |
| `fix/*` | Bug fixes |
| `chore/*` | Tooling, dependencies, CI |
| `docs/*` | Documentation updates |

Always branch off from `develop` for new work.
```bash
git checkout develop
git pull origin develop
git checkout -b feat/your-feature-name
```

## Pull Request Requirements

Before submitting a PR, ensure:

1. **Tests pass**: All existing and new tests pass.
2. **Coverage**: Statements, lines, and functions remain >=95%, and branches >=85% (`npm run test:coverage`).
3. **Linting**: No ESLint errors (warnings are acceptable).
4. **Type checking**: No TypeScript errors.
5. **Documentation**: Updated if the change affects public API.
6. **CHANGELOG**: Add an entry if applicable.
```bash
npm run typecheck
npm run lint
npm test
```

Target your PR at the `develop` branch (not `main`).

## Commit Message Format

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**

| Type | When to Use |
| ---- | ----------- |
| `feat` | A new feature |
| `fix` | A bug fix |
| `docs` | Documentation only changes |
| `style` | Formatting, no logic change |
| `refactor` | Code refactoring, no feature/fix |
| `perf` | Performance improvement |
| `test` | Adding or updating tests |
| `build` | Changes to build system or dependencies |
| `chore` | Other maintenance tasks |
| `ci` | CI/CD configuration |

**Examples:**

```
feat(parser): add support for union type shorthand
fix(validator): correct min-length error message for empty strings
docs(readme): update installation instructions
test(core): add edge cases for conditional validation
```

## Code Style

This project uses **ESLint** and **Prettier** for code consistency.

```bash
# Check for linting errors
npm run lint

# Format code (if configured)
npx prettier --write src/
```

**Key guidelines:**

- Use TypeScript strict mode features
- Prefer `const` and `let` over `var`
- Use descriptive variable names
- Add JSDoc comments for all public APIs
- Avoid `any` type — use proper types or generics
- Handle errors explicitly

## Testing Requirements

We use **Vitest** as the test framework.

```bash
# Run all tests
npm test

# Run tests in watch mode
npx vitest --watch

# Run a specific test file
npx vitest run test/unit/your-test.test.ts

# Check coverage
npx vitest run --coverage
```

**Requirements:**

- Coverage must remain >= 80% (tracked by Vitest)
- Each new feature must include unit tests
- Each bug fix must include a regression test
- Tests should be deterministic and independent

### Test Structure

```
test/
  unit/
    core/           # Core module tests
    parser/          # Parser tests
    adapters/        # Adapter tests
    exporters/       # Exporter tests
```

## Release Process

Releases are managed by maintainers. The process follows:

1. Update `package.json` and `plugin.json` version numbers.
2. Add changelog entry.
3. Run full verification: `npm run typecheck && npm run lint && npm test && npm run build`.
4. Commit: `git commit -m "release: vX.Y.Z - description"`.
5. Tag: `git tag vX.Y.Z`.
6. Push: `git push && git push origin vX.Y.Z`.
7. Create a GitHub Release from the tag.

## Getting Help

- Open an [Issue](https://github.com/devcodex-labs/schema-dsl/issues) for bugs or feature requests.
- Email: rockyshi1993@gmail.com

## License

By contributing, you agree that your contributions will be licensed under the same
[MIT License](./LICENSE) as the project.
