<div align="center">

# UserTesting Opportunity Notifier

### Real-time opportunity alerts for UserTesting contributors on Chrome

![Platform](https://img.shields.io/badge/Platform-Chrome%20Extension%20%7C%20Manifest%20V3-4285F4)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)

</div>

**UserTesting Opportunity Notifier** is a lightweight, background Chrome extension (Manifest V3) designed for UserTesting contributors. It monitors test opportunities every 30 seconds and delivers instant desktop notifications the moment an invite arrives — even if your UserTesting tab is in the background, inactive, or on a different virtual desktop.

---

## Key Features

- **Automated background polling**: Checks every 30 seconds using persistent `chrome.alarms` without requiring you to keep the tab active.
- **Smart DOM & title scraping**: Extracts opportunity counts using resilient heuristics (tab title, badge elements, opportunity cards, section headings).
- **Zero notification spam**: Only triggers desktop alerts when the count *increases* (new opportunities appear).
- **Persistent desktop alerts**: Dispatches interactive macOS notifications that stay visible until acknowledged so you never miss high-paying tests.
- **Live badge counter**: Displays a high-contrast badge on the toolbar icon indicating available opportunities in real-time.
- **Interactive popup controller**: Check live counts, trigger instant manual scans, or toggle sound/monitoring at any time.
- **One-click focus**: Clicking any notification or popup shortcut automatically focuses your open UserTesting tab or launches one directly.

---

## Architecture & How It Works

```
┌─────────────────────────────────────────────────────────────┐
│                 Chrome Background Worker                    │
│                                                             │
│   ┌──────────────┐     every 30s     ┌──────────────────┐   │
│   │ chrome.alarm │ ────────────────> │ Tab Query/Scrape │   │
│   └──────────────┘                   └────────┬─────────┘   │
│                                               │             │
│   ┌───────────────────────────────────────────┴─────────┐   │
│   │ New opportunity detected (count > lastCount)?       │   │
│   └─────────────────────┬───────────────────────────────┘   │
│                         │ Yes                               │
│                         ▼                                   │
│            ┌──────────────────────────┐                     │
│            │   OffscreenCanvas Icon   │                     │
│            └────────────┬─────────────┘                     │
│                         ▼                                   │
│            ┌──────────────────────────┐                     │
│            │   Desktop Notification   │                     │
│            └──────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

---

## Installation & Setup

1. **Clone this repository**:
   ```bash
   git clone https://github.com/<your-username>/usertesting-notifier.git
   ```

2. **Load into Google Chrome**:
   - Open Chrome and navigate to `chrome://extensions`.
   - Toggle **Developer mode** on in the upper-right corner.
   - Click **Load unpacked**.
   - Select the repository root folder.

3. **Configure macOS Notifications (Recommended)**:
   - Open **System Settings → Notifications → Google Chrome**.
   - Select **Alerts** style (instead of Banners) so notifications remain on screen until dismissed.

---

## Project Structure

```
usertesting-notifier/
├── manifest.json          # Manifest V3 extension definition
├── service-worker.js      # Background polling, scraping, and notification engine
├── generate_icons.py      # Programmatic icon generator (Pillow)
├── icons/                 # Extension icons (16px, 48px, 128px)
├── popup/
│   ├── popup.html         # Controller popup markup
│   ├── popup.css          # Modern styling & layout
│   └── popup.js           # Interactive state & messaging bridge
├── .gitignore             # Standard git exclusions
└── README.md              # Project documentation
```

---

## License

This project is licensed under the [MIT License](LICENSE).
