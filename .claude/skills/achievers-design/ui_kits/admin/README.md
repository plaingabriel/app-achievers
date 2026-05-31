# Admin UI kit

Click-thru recreation of the Achievers admin dashboard.

## Run
Open `index.html`. The app starts authenticated; flip `authed` initial state to `false` in `index.html` to land on Login.

## Surfaces
- **Login** — branded sign-in card on the dotted-grid background
- **Dashboard** — stat cards, area chart, activity stream, status panel
- **Members** — table with toolbar, status pills, row hover
- Other sidebar items render a placeholder.

## Components
| File | Exports |
|---|---|
| `Icon.jsx`     | `Icon` — inline Lucide-style SVGs |
| `Sidebar.jsx`  | `Sidebar` — fixed left nav with brand, nav items, user footer |
| `Topbar.jsx`   | `Topbar` — breadcrumb, search, notifications |
| `Dashboard.jsx`| `StatCard`, `Panel`, `AreaChart` |
| `Table.jsx`    | `MembersTable`, `Pill` |
| `Login.jsx`    | `Login` |

All components attach to `window` for cross-script access.
