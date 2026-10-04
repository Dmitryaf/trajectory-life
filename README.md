# Trajectory

A personal journal for recording your day and reviewing your weeks and months.

[Explore Trajectory](https://trajectory-app-lilac.vercel.app/)

- Keep daily notes and track sleep, well-being, and activities.
- Review your history with weekly and monthly summaries and charts.
- Search past entries, export your data, and restore it from a backup.

The app interface is in Russian.

Built with Vue 3, TypeScript, Pinia, IndexedDB, Supabase, and ECharts.

## Run locally

Requires Node.js 22.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

The default configuration runs without an account and stores data in your browser. Cloud sync requires your own Supabase configuration.

## Checks

```sh
npm run check
npx playwright install chromium webkit
npm run test:e2e
```

[MIT License](LICENSE)
