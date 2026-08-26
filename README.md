# Clocker Frontend

Frontend Next.js untuk Clocker MVP. UI mengikuti wireframe sebagai referensi visual, sementara flow mengikuti PRD dan kontrak backend live.

## Setup

1. Install dependency: `npm install`
2. Isi env di `.env.local`
3. Jalankan dev server: `npm run dev`
4. Build production: `npm run build`

## Environment

```env
NEXT_PUBLIC_API_URL="https://clocker-project-tracking.onrender.com"
NEXT_PUBLIC_OWNER_API_KEY="owner_api_key_backend"
```

Karena frontend langsung memanggil backend, `NEXT_PUBLIC_OWNER_API_KEY` akan terlihat di browser. Untuk MVP personal ini praktis. Jika nanti ingin key tersembunyi, pindahkan request ke server-side API route/proxy.

## Implemented Screens

- Dashboard dengan active timer, total hari ini, active projects, dan recent entries.
- Projects list dengan filter status dan search.
- Project detail dengan task board, complete/archive project, dan create/edit task.
- Task detail dengan start/stop timer, review, complete, reopen, time entries, dan activity trail.
- Manual time entry untuk mencatat sesi lama dengan tanggal/jam custom.
- Reports dengan filter date-range, project, task, dan revision.

Tidak ada fitur team, assignment, approval eksternal, billing, export, atau manual time entry karena tidak ada di scope MVP/backend.
