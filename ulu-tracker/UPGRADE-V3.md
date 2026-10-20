# ULU Payment Tracker 3.0

Replace `ulu-tracker/public/index.html` in your GitHub repository with the `public/index.html` from this archive. Render should automatically redeploy.

Features: English/Russian/Chinese, status interpretation timeline, manual refresh, shareable UETR link, up to 10 checks per UETR saved locally in the visitor's browser. The timeline is conceptual, not a bank-provided event history. No new external service or npm package is required. Existing server.js and DB_API_ENABLED=true remain unchanged.

Privacy: Browser history is stored locally; avoid using shared computers for sensitive UETRs. Shared links contain UETR in the URL. Do not publish confidential transaction details.
