# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in `ai-chat/`.

## Overview

An AI chatbot app: a single continuous, streaming conversation between one anonymous user and Claude. No login, no multiple chat rooms — one thread per browser session, persisted to MongoDB so it survives page reloads.

- **Stack**: Next.js (App Router) + TypeScript + Tailwind CSS
- **LLM**: Anthropic Claude API via `@anthropic-ai/sdk`, called only from a server-side route handler
- **Persistence**: MongoDB via Mongoose, keyed by an anonymous session ID (cookie-based, no auth)
- **Deployment target**: undecided

This directory is self-contained and independent of `../todo/` and `../todo-next/` — no shared code.

## Commands

Run all commands from inside `ai-chat/`.

- `npm run dev` — start the dev server (Turbopack), default `http://localhost:3000`.
- `npm run build` / `npm start` — production build / serve.
- `npm run lint` — ESLint (Next core-web-vitals + TypeScript rules).
- `npx tsc --noEmit` — typecheck.
- `npm test` — run the full Vitest suite once (`vitest run`).
- `npx vitest run src/lib/<file>.test.ts` — run a single test file.
- `npx vitest run -t "test name"` — run a single test by name.
- `npx vitest` — watch mode.

## Architecture

- `src/lib/claude.ts` — wraps `@anthropic-ai/sdk`; builds the message request and returns a stream of response chunks. Pure/testable logic (message formatting, etc.) lives here, separate from the route handler.
- `src/lib/db.ts` — MongoDB/Mongoose connection singleton. Reuses the connection across hot reloads in dev (cache the connection on `global` to avoid exhausting connections on every file change).
- `src/models/Message.ts` — Mongoose schema for one chat message: `{ sessionId, role ("user" | "assistant"), content, createdAt }`.
- `src/lib/session.ts` — reads/generates the anonymous session ID stored in a cookie; this ID is the only thing that scopes a conversation to a visitor.
- `src/app/api/chat/route.ts` — `POST` handler: receives `{ sessionId, message }`, saves the user message to MongoDB, calls `src/lib/claude.ts` to stream Claude's reply back to the client (`ReadableStream`), then saves the complete assistant message to MongoDB once the stream finishes.
- `src/components/ChatApp.tsx` — the single `"use client"` component. Owns UI state, sends messages to `/api/chat`, and renders tokens as they stream in.
- `src/app/page.tsx` — renders `<ChatApp />` and loads prior history for the current session (server-side fetch from MongoDB by session ID) so a reload doesn't lose the conversation.
- Path alias `@/*` maps to `src/*` (see `tsconfig.json`).

## Data model

One conversation thread per session — no multi-thread/conversation-list UI. All messages for a session are stored in a single MongoDB collection and always appended to, ordered by `createdAt`.

## Environment variables

Set in `.env.local` (never committed, never exposed to the client):

- `ANTHROPIC_API_KEY` — Claude API key. Used only inside `src/lib/claude.ts` / the API route — never referenced from client components.
- `MONGODB_URI` — MongoDB connection string.

## Security notes

- The Claude API key must never be sent to or used from the browser. All Claude API calls happen inside `src/app/api/chat/route.ts` (or code it calls on the server).
- The session ID cookie is the only way a conversation is scoped to a visitor; there is no authentication, so treat it as identifying a browser, not a verified user.

## Testing requirements

- Whenever a new function is added to a `.ts` file, a corresponding Vitest test must also be written in the same change (same rule as the rest of this repo — see the root `CLAUDE.md`).
