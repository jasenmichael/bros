---
title: Google Gemini
description: OpenAI-compat Gemini API. AI Studio key.
---

# Google Gemini

Google Gemini via the OpenAI-compatible endpoint. AI Studio free key exists; Flash is the real free workhorse, Pro often quota-zero for new users. Free-tier notes are Sep 2026 and change often.

## Key

Create a key in [Google AI Studio](https://aistudio.google.com/api-keys). Paste it on Providers → Popular services → Google Gemini (open the card). Keys live in SQLite, not env.

## Enable

1. Open Providers
2. Popular services → Google Gemini → open the card
3. Paste the key, Save

Status is **running** when a key is saved.

## API

- Base URL: `https://generativelanguage.googleapis.com/v1beta/openai`
- Auth: `Authorization: Bearer <key>`
- Chat: `POST /chat/completions`

Default model ids (editable on the card; live `GET /models` merges when a key exists):

- `gemini-2.5-flash`
- `gemini-2.5-pro`
