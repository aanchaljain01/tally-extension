# Wingman — Chrome Extension

Automatically track your job applications across LinkedIn, Indeed, Handshake, and any external ATS (Workday, Greenhouse, Lever, etc.)

---

## How It Works

| Situation | What Wingman Does |
|-----------|------------------|
| LinkedIn Easy Apply | Auto-detects success confirmation → silent toast notification, no interaction needed |
| External redirect (Workday, company site, etc.) | Shows a Yes/No popup on the new tab asking "Did you submit?" |
| ATS confirmation pages (`/confirmation`, `/thank-you`, etc.) | Auto-detects success URL and confirms silently |

---

## Installation (Chrome)

1. Download and unzip `wingman.zip`
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer Mode** (toggle in top-right corner)
4. Click **"Load unpacked"**
5. Select the `wingman` folder
6. The Wingman icon will appear in your toolbar ✅

---

## Features

- **Auto-detection** for LinkedIn Easy Apply — zero interaction needed
- **Smart Yes/No popup** only appears for external site redirects
- **ATS pattern matching** — recognizes Workday, Greenhouse, Lever, iCIMS confirmation pages
- **Duplicate detection** — warns if you apply to the same role twice within 7 days
- **Pending queue** — if you close the popup without answering, it's saved for later
- **Dashboard** — view all applications with company, role, date, source, and type
- **Stats bar** — today / this week / all time counts
- **Search** — filter your application list instantly
- **Export CSV** — download your full application history
- **Badge counter** — green = today's count, orange = unconfirmed pending items

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

## Extending to New Job Boards

To add a new job board (e.g. Glassdoor):

1. Create `src/content-glassdoor.js` following the pattern in `content-indeed.js`
2. Add the domain to `manifest.json` under both `host_permissions` and `content_scripts`
3. Scrape the role/company with the board's specific DOM selectors

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
Go to `chrome://extensions/`, find Wingman, and click the reload button.
