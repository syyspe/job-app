---
slug: 035-profile-corpus
date: 2026-11-18
---

# Profile corpus

## Problem

Evaluating an ad and drafting an application both need the relevant parts of my
CVs, cover letters and other application material. That material is private, so
it must be searchable without going to an embedding provider. Earlier letters
may also contain errors, so the search has to tell facts from style examples.

## What done looks like

1. A command builds a local index from the corpus paths in private config,
   using embeddings from the LAN Ollama service.
2. Every indexed source is labelled `facts` or `style`, and search results carry
   the label.
3. A read-only `search_profile` MCP tool searches the index and can do nothing
   else.
4. The index records its embedding model, and search refuses to run against a
   different configured model until the index is rebuilt.
5. A health check reports whether the Ollama endpoint is reachable, for the
   runner to call before the evaluation and draft steps.
6. No corpus text, address or model name enters the repository, and tests use
   synthetic fixtures.

## Approach

The contracts are fixed in `docs/job-search-agent.md`:

- [Profile corpus and embeddings](../docs/job-search-agent.md#8-profile-corpus-and-embeddings):
  where embeddings come from and how the index behaves.
- [Agent permissions](../docs/job-search-agent.md#2-agent-permissions): what the
  search tool may reach.
- [Private configuration](../docs/job-search-agent.md#3-private-configuration):
  where the settings and index live.

`search_profile` runs as its own MCP server rather than a tool in `mcp/`,
because `mcp/` holds job-app credentials and the `claude -p` steps must not.

## Out of scope

- Evaluating ads or writing drafts.
- Calling the search tool from the runner, which `036-ad-evaluation` does.
- Updating the index automatically when corpus files change.

## Related streams

- Before: `033-job-search-agent` records the contracts.
- After: `036-ad-evaluation` and `037-application-drafts` search the index.
- In parallel: may run alongside `034-ad-inbox` in its own worktree.

## Open questions

- Does the Ollama embedding model handle Finnish and English well enough?
- Should the vector store be ChromaDB or an equivalent local store? The choice
  needs dependency approval.
- How does WSL reach the laptop on the home LAN?

---

**Next stage:** run `/sdlc`.
