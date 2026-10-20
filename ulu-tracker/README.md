# ULU Payment Tracker — server prototype

Node.js 18+ required. Run `npm start`, open http://localhost:3000.

The backend endpoint is `GET /api/track?uetr=<UUID>`. It validates UETR, rate-limits requests, applies a timeout, checks response format, and returns only necessary fields. By default it returns `503 INTEGRATION_DISABLED` rather than inventing statuses.

**Live integration is disabled until Deutsche Bank explicitly permits use of the observed website endpoint and server-to-server access is verified.** If authorized, configure `DB_API_ENABLED=true` on the server, not in browser code. The observed website endpoint is not a documented third-party API; behavior, authentication, and availability may change. Never use client cookies, bypass access controls, or claim the service covers all SWIFT payments.

Before production: secure HTTPS reverse proxy, approved contractual/API access, user authentication and authorization for private payment details, privacy review, centralized audit logging without sensitive details, production monitoring, provider-specific rate limits, and consent/terms.
