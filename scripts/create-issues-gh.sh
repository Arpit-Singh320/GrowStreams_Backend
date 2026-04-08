#!/bin/bash

# Create issues using GitHub CLI (handles issue templates properly)
# Install with: brew install gh
# Login with: gh auth login

echo "Creating 10 issues using GitHub CLI..."

gh issue create \
  --title "Add .env.example file — new contributors can't run the API locally without it" \
  --body-file ./scripts/issues/issue-01.md \
  --repo BlockXAI/GrowStreams_Backend

gh issue create \
  --title "API streams endpoint missing pagination — /api/streams/sender/:address returns unbounded results" \
  --body-file ./scripts/issues/issue-02.md \
  --repo BlockXAI/GrowStreams_Backend

gh issue create \
  --title "Document the flowRate unit system — raw units vs human-readable GROW/sec is confusing for new developers" \
  --body-file ./scripts/issues/issue-03.md \
  --repo BlockXAI/GrowStreams_Backend

gh issue create \
  --title "Remove Solidity files from a Vara/Rust repository — they create confusion about the tech stack" \
  --body-file ./scripts/issues/issue-04.md \
  --repo BlockXAI/GrowStreams_Backend

gh issue create \
  --title "Frontend: add buffer depletion warning on active streams — users don't know when a stream is about to liquidate" \
  --body-file ./scripts/issues/issue-05.md \
  --repo BlockXAI/GrowStreams_Backend

gh issue create \
  --title "Add rate limiting to POST /api/grow-token/faucet — currently open to abuse" \
  --body-file ./scripts/issues/issue-06.md \
  --repo BlockXAI/GrowStreams_Backend

gh issue create \
  --title "SDK missing TypeScript types for all API response shapes — callers get implicit any" \
  --body-file ./scripts/issues/issue-07.md \
  --repo BlockXAI/GrowStreams_Backend

gh issue create \
  --title "Add a stream history / activity feed per wallet — there's no way to see past completed streams" \
  --body-file ./scripts/issues/issue-08.md \
  --repo BlockXAI/GrowStreams_Backend

gh issue create \
  --title "Build a flow rate calculator component — users have no idea what flowRate value to enter" \
  --body-file ./scripts/issues/issue-09.md \
  --repo BlockXAI/GrowStreams_Backend

gh issue create \
  --title "Add a GET /api/protocol/stats endpoint — there's no single source of truth for protocol health" \
  --body-file ./scripts/issues/issue-10.md \
  --repo BlockXAI/GrowStreams_Backend

echo "✅ All issues created!"
