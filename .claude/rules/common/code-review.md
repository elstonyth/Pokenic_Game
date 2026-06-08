# Code Review Standards

## Purpose

Code review ensures quality, security, and maintainability before code is merged. This rule defines when and how to conduct code reviews.

## When to Review

> **Enforcement note:** code review is **advisory / operator-invoked** — no hook
> runs a reviewer agent automatically. The only auto-enforced quality gate is the
> typecheck (PostToolUse + Stop) hook in `.claude/settings.json`. Invoke a reviewer
> yourself at the points below; don't assume one ran.

**Recommended review triggers** (invoke `ecc:code-reviewer` / `/ecc:code-review`):

- After writing or modifying substantive code
- Before any commit to shared branches
- When security-sensitive code is changed (auth, payments, user data) — also run
  `ecc:security-reviewer`
- When architectural changes are made
- Before merging pull requests

**Pre-Review Requirements:**

Before requesting review, ensure:

- All automated checks (CI/CD) are passing
- Merge conflicts are resolved
- Branch is up to date with target branch

## Review Checklist

Before marking code complete:

- [ ] Code is readable and well-named
- [ ] Functions are focused (<50 lines)
- [ ] Files are cohesive (<800 lines)
- [ ] No deep nesting (>4 levels)
- [ ] Errors are handled explicitly
- [ ] No hardcoded secrets or credentials
- [ ] No console.log or debug statements
- [ ] Tests exist for new behavioral logic
- [ ] Coverage ~80% of genuine logic (utilities/hooks/backend); presentational/visual components are covered by Playwright instead — see testing.md

## Security Review Triggers

Strongly recommended — invoke `ecc:security-reviewer` (or `/ecc:security-scan`) when:

- Authentication or authorization code
- User input handling
- Database queries
- File system operations
- External API calls
- Cryptographic operations
- Payment or financial code

## Review Severity Levels

| Level | Meaning | Action |
|-------|---------|--------|
| CRITICAL | Security vulnerability or data loss risk | **BLOCK** - Must fix before merge |
| HIGH | Bug or significant quality issue | **WARN** - Should fix before merge |
| MEDIUM | Maintainability concern | **INFO** - Consider fixing |
| LOW | Style or minor suggestion | **NOTE** - Optional |

## Agent Usage

Use these agents for code review:

| Agent (`subagent_type`) | Purpose |
|-------|---------|
| `ecc:code-reviewer` | General code quality, patterns, best practices |
| `ecc:security-reviewer` | Security vulnerabilities, OWASP Top 10 |
| `ecc:typescript-reviewer` | TypeScript/JavaScript specific issues |
| `ecc:python-reviewer` | Python specific issues |
| `ecc:go-reviewer` | Go specific issues |
| `ecc:rust-reviewer` | Rust specific issues |

These are plugin-provided (`ecc:` prefix) — not in `~/.claude/agents/`.

## Review Workflow

```
1. Run git diff to understand changes
2. Check security checklist first
3. Review code quality checklist
4. Run relevant tests
5. Verify coverage of genuine logic (visual components via Playwright — see testing.md)
6. Use appropriate agent for detailed review
```

## Common Issues to Catch

### Security

- Hardcoded credentials (API keys, passwords, tokens)
- SQL injection (string concatenation in queries)
- XSS vulnerabilities (unescaped user input)
- Path traversal (unsanitized file paths)
- CSRF protection missing
- Authentication bypasses

### Code Quality

- Large functions (>50 lines) - split into smaller
- Large files (>800 lines) - extract modules
- Deep nesting (>4 levels) - use early returns
- Missing error handling - handle explicitly
- Mutation patterns - prefer immutable operations
- Missing tests - add test coverage

### Performance

- N+1 queries - use JOINs or batching
- Missing pagination - add LIMIT to queries
- Unbounded queries - add constraints
- Missing caching - cache expensive operations

## Approval Criteria

- **Approve**: No CRITICAL or HIGH issues
- **Warning**: Only HIGH issues (merge with caution)
- **Block**: CRITICAL issues found

## Integration with Other Rules

This rule works with:

- [testing.md](testing.md) - Test coverage requirements
- [security.md](security.md) - Security checklist
- [git-workflow.md](git-workflow.md) - Commit standards
- [agents.md](agents.md) - Agent delegation
