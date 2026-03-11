# Universal WhatsApp Bot Engine — MVP

A **multi-tenant WhatsApp bot engine** that lets a single Node.js server run automated WhatsApp bots for multiple businesses simultaneously.

Built with **Baileys**, **Supabase**, and **Express.js**, and designed for one-click deployment to **Railway**.

---

## How it works

```
Customer → WhatsApp → Baileys → Bot Engine → Supabase config → Automated reply
```

One server, many WhatsApp numbers. Each business connects its own number; the bot serves them all from a shared database.

---

## Project structure

```
whatsapp-bot-mvp/
├── server.js                  # Entry point
├── package.json
├── .env.example
├── supabase_schema.sql        # Run once in Supabase SQL Editor
├── sessions/                  # Auto-created — Baileys auth files (gitignored)
│
├── config/
│   └── supabase.js            # Supabase client singleton
│
├── services/
│   ├── whatsappService.js     # Baileys socket per business + QR manager
│   ├── botEngine.js           # Orchestrator (DB lookup + message logging)
│
├── bot/
│   ├── menuBuilder.js         # Dynamic numbered menu formatter
│   └── messageHandler.js      # Stateful conversation logic
│
├── utils/
│   └── logger.js              # Pino structured logger
│
└── test-logic.js              # Unit tests for bot behavior
```

---

## Quick start

### 1. Clone and install

```bash
git clone <your-repo>
cd whatsapp-bot-mvp
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your Supabase credentials
```

| Variable       | Description                              |
|----------------|------------------------------------------|
| `SUPABASE_URL` | Your Supabase project URL                |
| `SUPABASE_KEY` | Your anon or service-role API key        |
| `PORT`         | HTTP port (Railway sets this for you)    |
| `LOG_LEVEL`    | `info` recommended for production        |

### 3. Set up the Supabase database

1. Open your [Supabase dashboard](https://app.supabase.com)
2. Go to **SQL Editor**
3. Paste and run the contents of `supabase_schema.sql`

This creates the `businesses` table, the `updated_at` trigger, and an example record.

### 4. Add your businesses

Insert a row per business in the `businesses` table:

```json
{
  "business_name": "Restaurante Roma",
  "whatsapp_number": "+5491112345678",
  "welcome_message": "Hola 👋 Bienvenido a Restaurante Roma",
  "menu_options": {
    "1": "Ver menú",
    "2": "Reservar mesa",
    "3": "Horarios",
    "4": "Ubicación"
  },
  "responses": {
    "1": "Te paso nuestro menú https://menu.com",
    "2": "Decime día y hora",
    "3": "Abrimos de 12 a 23",
    "4": "Av. Siempre Viva 123"
  },
  "active": true
}
```

### 5. Run the server

```bash
npm start
```

---

## Connecting WhatsApp (QR code)

When the server starts, it prints a **QR code in the terminal for each business** that has no saved session.

1. Open WhatsApp on the business owner's phone
2. Go to **Linked Devices → Link a device**
3. Scan the QR code shown in the terminal
4. The session is saved to `./sessions/<number>/` — future restarts reconnect automatically

> **Production tip:** On Railway, view the QR code in the **Deployment Logs** tab.

---

## Deploying to Railway

1. Push this project to a GitHub repository
2. Go to [Railway](https://railway.app) → **New Project → Deploy from GitHub repo**
3. Select your repository
4. Add environment variables in Railway's **Variables** tab:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
5. Railway auto-detects `npm start` and deploys

> Sessions are stored on the Railway volume. By default Railway uses ephemeral storage — consider adding a **Railway Volume** (persistent disk) to `/app/sessions` to survive deployments.

---

## API endpoints

| GET    | `/`                      | Health check                             |
| GET    | `/status`                | Connection status for all businesses     |
| GET    | `/dashboard`             | **Visual dashboard** (Scan QRs here!)    |
| GET    | `/qr/:number`            | Serves current QR code as PNG image      |
| POST   | `/webhook/reload`        | Invalidate config cache for a number     |

**Cache reload example:**

```bash
curl -X POST http://localhost:3000/webhook/reload \
  -H "Content-Type: application/json" \
  -d '{"whatsapp_number": "+5491112345678"}'
```

Useful after editing a business's configuration in Supabase — the next message will pick up the fresh config without a restart.

---

## Bot behavior

| First message or greeting keyword | `welcome_message` + numbered menu |
| User sends `1`, `2`, `3`… | Corresponding `responses["1"]` etc. |
| Anything else | Fallback + menu repeated |
| **Logging** | All messages saved to Supabase `messages` table |

Recognized greeting keywords: `hola`, `hi`, `hello`, `ola`, `buenas`, `inicio`, `start`, `menu`, `menú`.

---

## Scaling

The engine can support **20–40 simultaneous businesses** on a 512 MB RAM instance (e.g., Railway Starter plan). Business configs are cached in memory for 5 minutes to minimize database reads.

---

## License

MIT
