# ULU Payment Tracker 4.0

Upload the **entire** `ulu-tracker` directory contents into the existing GitHub `ulu-tracker` folder, preserving paths. Update `public/index.html`, `server.js`, and `package.json`.

Render: Root Directory `ulu-tracker`, Build `npm install`, Start `npm start`. Keep existing `DB_API_ENABLED` setting. No CIPS changes.

## New features
- MT103 TXT: UETR extracted locally in browser.
- MT103 PDF: text-only PDF (up to 4 MB) temporarily parsed on the server. No file persistence, no OCR. UETR must be manually verified.
- PDF status report: click **Save PDF report**, then choose **Save as PDF** in browser print dialog. Report is not a bank-issued confirmation.

Privacy: PDFs may contain sensitive financial data; use only with authorization. Server does not intentionally store the uploaded file; hosting platform/network logging policies still apply.
