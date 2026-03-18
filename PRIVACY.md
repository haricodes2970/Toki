# Toki – Privacy Policy

**Last updated: 2026-03-18**

## Summary

Toki is a browser extension that tracks your AI token usage **entirely on your own device**. No personal data, prompt content, or usage statistics are ever transmitted to any server.

## What Toki collects

| Data | Where it's stored | Sent externally? |
|---|---|---|
| Token counts per AI site | `chrome.storage.local` (your device) | ❌ Never |
| Daily usage totals | `chrome.storage.local` (your device) | ❌ Never |
| Your custom token limit setting | `chrome.storage.sync` (your Chrome account) | ❌ Never* |
| Prompt text | **Never stored** – read briefly for token counting then discarded | ❌ Never |

\* `chrome.storage.sync` syncs settings between your own signed-in Chrome instances only, via your Google account. Toki has no access to this channel beyond writing/reading your own settings.

## What Toki does NOT do

- ❌ Does not read, store, or transmit any prompt content
- ❌ Does not collect any personally identifiable information
- ❌ Does not make any network requests to external servers
- ❌ Does not use analytics, telemetry, or crash reporting
- ❌ Does not inject ads or affiliate links
- ❌ Does not modify the AI sites' requests or responses

## Permissions used

| Permission | Why it's needed |
|---|---|
| `activeTab` | Detect which AI site is active to apply the correct DOM selectors |
| `storage` | Save your usage data and settings locally |
| `alarms` | Schedule the daily midnight reset of token counters |
| Host permissions for AI sites | Inject the content script to observe the prompt textarea |

## Data retention

All data is stored locally on your device. You can clear it at any time via the popup's "Reset Today's Usage" button or by clearing extension data in `chrome://extensions`.

## Contact

This is an open-source project. For questions, open an issue at: https://github.com/haricodes2970/Toki
