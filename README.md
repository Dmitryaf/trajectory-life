# Trajectory

A personal journal for seeing how your days, weeks, and months fit together.

[Explore Trajectory](https://trajectory-app-lilac.vercel.app/)

Record what matters, review your notes, explore trends, and export your data.

Built with Vue 3, TypeScript, Pinia, IndexedDB, Supabase, and ECharts.

## Run locally

Requires Node.js 22.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

## Checks

```sh
npm run check
npx playwright install chromium webkit
npm run test:e2e
```

[MIT License](LICENSE)
