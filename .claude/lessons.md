# Lessons Learned

## Code Style

- **NEVER use `let` or `for` loops.** Always use functional patterns: `reduce`, `map`, `filter`, chaining, recursion. Imperative style is only acceptable when functional becomes genuinely unreadable (almost never).
- This applies to ALL code — backend workers, frontend React, utility functions, everything.

## File Organization

- **Entry points should be thin.** Worker/app entry points wire things together — routing, middleware — but contain no business logic. Split handlers and logic into separate modules.
- Avoid large files that mix concerns. Each file should have a single clear responsibility.
