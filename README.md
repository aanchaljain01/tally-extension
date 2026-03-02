# Tally — Chrome Extension

Automatically track your job applications directly from LinkedIn with a lightweight, real-time confirmation flow.

Support for Indeed and Handshake is structured and extensible within the architecture, with ongoing development for full multi-board support.
---

## How It Works

| Situation                                    | What Tally Does                                                     |
| -------------------------------------------- | ------------------------------------------------------------------- |
| LinkedIn Easy Apply                          | Detects the Apply click → shows confirmation popup → logs as `auto` |
| External Apply (company site, Workday, etc.) | Detects Apply click → shows confirmation popup → logs as `manual`   |
| Duplicate application (within 7 days)        | Prevents duplicate logging and preserves data integrity             |


---
# Flow Overview

User clicks an Apply button
Tally detects the interaction via content script
A lightweight confirmation popup appears
If confirmed:

Easy Apply → saved as auto

External Apply → saved as manual

Application is stored in chrome.storage.local

Badge and dashboard update in real time

-----
## Installation (Chrome)

1. Download and unzip `tally.zip`
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer Mode** (toggle in top-right corner)
4. Click **"Load unpacked"**
5. Select the `tally` folder
6. The Tally icon will appear in your toolbar ✅

---

## Features

- **Apply detection** for LinkedIn — detects Apply button interactions in real time  
- **Unified Yes/No confirmation popup** — lightweight confirmation before logging  
- **Automatic classification** — logs as `auto` for Easy Apply and `manual` for external applications  
- **Duplicate detection** — prevents logging the same role within a 7-day window  
- **Application dashboard** — view all applications with company, role, date, source, and type  
- **Stats bar** — today / this week / all-time counts  
- **Search** — instantly filter your application history  
- **Export CSV** — download your full application log  
- **Badge counter** — displays today's application count directly on the extension icon  
---

## File Structure

```
wingman/
├── manifest.json              # Extension config
├── popup.html                 # Dashboard popup UI
├── popup.css                  # Popup styles
├── popup.js                   # Popup logic
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── src/
    ├── background.js           # Service worker (tab tracking, storage, messaging)
    ├── content-shared.js       # Shared UI utilities (toast, confirm overlay)
    ├── content-linkedin.js     # LinkedIn-specific detection
    ├── content-indeed.js       # Indeed-specific detection
    ├── content-handshake.js    # Handshake-specific detection
    └── content-external.js     # External/ATS site handling + Yes/No popup
```

---



## Storage

All data is stored locally using `chrome.storage.local`. Nothing is sent to any server.
Data format in storage:
- `applications` — array of confirmed job entries
- `pending` — array of unconfirmed (awaiting Yes/No response)

---

## Troubleshooting

**Easy Apply not being detected?**
LinkedIn occasionally updates their DOM. Open DevTools on a LinkedIn job page and check the confirmation modal's class names, then update the selectors in `content-linkedin.js`.

**External popup not appearing?**
Make sure the extension has permission for that domain. If it's a rarely-visited TLD, the content script may not inject. The job will fall into the pending queue — check the Pending tab in the popup.

**Badge not updating?**
Go to `chrome://extensions/`, find Tally, and click the reload button.
