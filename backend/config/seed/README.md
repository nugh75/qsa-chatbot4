Seed configuration files (lowercase) used as read-only defaults.

Files placed here are copied on first run into the writable runtime storage under /app/storage.

Conventions:
- system_prompts.json
- summary_prompt.md
- personalities.json
- system-prompt.md (optional single prompt legacy)

Legacy uppercase names (SYSTEM_PROMPTS.json, SUMMARY_PROMPT.md, PERSONALITIES.json) or the old /app/data mount
are still supported as fallback sources, but are deprecated.

Do NOT store secrets here.