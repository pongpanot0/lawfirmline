# Samnuan Outlook add-in ("ส่งเข้าคดี")

A task pane in Outlook that files the email you are reading into a Samnuan case
in one tap. It uses your own Microsoft 365 connection: a lawyer can only file
through their own connected mailbox, and only into cases they can access.

- Manifest: `https://samnuan.com/outlook-addin/manifest.xml` (source: `apps/web/public/outlook-addin/manifest.xml`)
- Task pane: `https://samnuan.com/outlook-addin`
- API: `POST /outlook/addin/suggest`, `POST /outlook/addin/file`

## Prerequisites

- The user has connected Microsoft 365 in Samnuan (Settings → Microsoft 365).
- The Outlook mailbox being used is that same connected address.

## Admin deployment (Microsoft 365 admin center)

1. Sign in to the Microsoft 365 admin center.
2. Go to **Settings → Integrated apps → Upload custom apps**.
3. Choose **Provide link to manifest file** and enter
   `https://samnuan.com/outlook-addin/manifest.xml`.
4. Continue, assign users or groups, and finish. Deployment can take a few hours to reach Outlook clients.

## Sideload for one user

1. In Outlook (web or new Outlook), open an email and choose **Get Add-ins**.
2. Choose **My add-ins → Add a custom add-in → Add from URL**.
3. Enter `https://samnuan.com/outlook-addin/manifest.xml` and confirm.
4. Open an email and choose **ส่งเข้าคดี** on the ribbon to open the pane.

## Using the pane

1. Log in to Samnuan when prompted (the login page opens in a new tab; reopen the pane afterwards).
2. Suggested cases appear from the sender and recipient addresses and the subject.
3. Tap **ส่งเข้าคดีนี้** on a case, or search for a case by number or title.
4. On success, **เปิดแท็บอีเมลของคดี** opens the case's email tab.

If the pane says the mailbox is not connected, connect that Microsoft 365 account in Samnuan first.

## Notes

- The pane loads Office.js from `appsforoffice.microsoft.com`. `/outlook-addin` is framed only by Outlook hosts (`frame-ancestors` in `apps/web/next.config.js`).
- The icons under `apps/web/public/outlook-addin/` are plain placeholders and should be replaced with the brand icon before wide rollout.
