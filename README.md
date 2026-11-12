# Oracle VM Manager

[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15.3-black.svg)](https://nextjs.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-teal.svg)](https://orm.drizzle.team/)
[![OCI SDK](https://img.shields.io/badge/Oracle_Cloud-OCI_SDK_2.146-red.svg)](https://docs.oracle.com/en-us/iaas/Content/API/SDKDocs/typescriptsdk.htm)
[![Design](https://img.shields.io/badge/Theme-Ferrari_Giallo_Modena-yellow.svg)](https://en.wikipedia.org/wiki/Giallo_Modena)

A single-administrator, production-grade cloud management console for controlling an Oracle Cloud Infrastructure (OCI) Compute virtual machine. Built with Next.js 15 App Router, Supabase PostgreSQL, Drizzle ORM, and official OCI TypeScript SDK.

---

## ⚡ Highlights

- **Dual Provider Modes**: Seamlessly toggle between `mock` (zero-cloud-spend local simulation) and `live` (official `oci-core` and `oci-common` SDK integration).
- **Hardened Security Architecture**:
  - Zero plaintext credentials: Passwords hashed with **Argon2id** (`@node-rs/argon2`).
  - Cryptographically signed **HMAC-SHA256 CSRF tokens**.
  - Database-backed revocable session tokens stored in `HttpOnly`, `SameSite=Lax`, `Secure` cookies.
  - Mandatory initial password change enforcement (`mustRotatePassword`).
  - Sliding-window IP and actor rate-limiting on sensitive auth and control endpoints.
  - Zero client-side OCID submission: instance OCIDs are strictly configured server-side.
- **Enterprise VM Orchestration**:
  - Idempotency key tracking to avoid accidental double-clicks.
  - Active operation distributed locking (prevents concurrent mutating requests).
  - Bounded polling with configurable timeouts (up to 300s for lengthy cloud state changes).
  - Operations supported: **Start** (`START`), **Graceful Stop** (`SOFTSTOP`), **Graceful Restart** (`SOFTRESET`), and **Force Stop** (`STOP`).
- **Audit Logging**: Full audit trail of user logins, VM operations, and outcomes with server-side pagination.
- **Ferrari-Inspired Luxury Bento Dashboard**:
  - Dual-column responsive layout built with Zinc Yellow RAL 1018 (`#f4d632`), Ferrari Giallo Modena, and Rosso Corsa accents.
  - Accessible confirmation dialogs with keyboard trap and focus restoration.
  - Real-time transitional state animations and optimistic status feedback.

---

## 🏗️ Architecture

```text
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── api/v1/
│   │   │   ├── auth/             # Login, logout, me, rotate-password
│   │   │   ├── vm/               # Status, start, stop, force-stop, restart
│   │   │   ├── operations/[id]/  # Polling and operation status
│   │   │   └── audit/            # Paginated audit log retrieval
│   │   ├── dashboard/            # Authenticated VM Management Dashboard
│   │   ├── login/                # Administrator Sign-In
│   │   └── globals.css           # Ferrari Giallo Modena & Zinc Yellow styling
│   ├── components/               # React 19 UI components
│   │   ├── auth/                 # LoginForm, PasswordRotationCard
│   │   └── vm/                   # VmDashboard, ActionConfirmDialog
│   ├── lib/
│   │   ├── auth/                 # Argon2id hashing, session token management
│   │   ├── config/               # Validated server-only environment loader
│   │   ├── database/             # Drizzle PostgreSQL schema, client, & store
│   │   ├── oci/                  # Provider interface, MockAdapter & LiveOciAdapter
│   │   ├── security/             # HMAC CSRF, sliding rate-limiters, redaction
│   │   ├── services/             # VM orchestrator, locks, bounded polling
│   │   └── validators/           # Zod schema definitions
│   └── types/                    # Domain DTOs and lifecycle state enums
├── drizzle/                      # Drizzle SQL migrations
├── scripts/                      # Admin provisioning and key generation utilities
└── tests/                        # Vitest unit & component tests, Playwright E2E
```

---

## 📋 Prerequisites

- **Node.js**: `v20.9.0` or higher (Recommended: Node `v20.15.x` LTS)
- **npm**: `v10.x` or higher
- **PostgreSQL Database**: Supabase PostgreSQL project (or set `ALLOW_IN_MEMORY_DB="true"` for quick local mock dev)
- **OCI Account** (Optional, required only for `VM_ADAPTER_MODE="live"`):
  - Target Compute Instance in your tenancy (e.g. region `us-phoenix-1`)
  - User OCID, Tenancy OCID, Compartment OCID, and Instance OCID
  - API Key Fingerprint and Private RSA Key (`.pem` format)

---

## 🚀 Quick Start (Mock Mode)

To explore and test the dashboard locally without needing an Oracle Cloud account or Supabase database:

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/vnekbote/oracle-vm-manager.git
cd oracle-vm-manager
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

For mock testing with in-memory storage, ensure your `.env.local` contains:

```env
VM_ADAPTER_MODE="mock"
ALLOW_IN_MEMORY_DB="true"
AUTH_SECRET="any-secure-random-32-byte-hex-secret-for-local-testing"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD_HASH="JGFyZ29uMmlkJHY9MTkkbT02NTUzNix0PTMscD0xJHBmQlg0Ym54S3RqcU5qR1YyTmtleXckbE5YNnZPdXlpaEQ5ajJzc0tUMzQyMHp1UUxpMjJucjU1Y1hmV0pzTUVudw=="
```

*(Note: The sample hash above corresponds to password: `Password123!`)*

### 3. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) and sign in:
- **Username**: `admin` (or the configured `ADMIN_USERNAME`)
- **Password**: `Password123!`

---

## ☁️ Live OCI & Supabase Production Setup

### 1. Supabase Database Configuration

1. Create a Supabase project at [database.new](https://database.new).
2. Go to **Project Settings > Database > Connection pooling configuration**.
3. Select **Transaction pooler** (Port `6543`) and copy your connection URI.
4. Set in `.env.local`:
   ```env
   DATABASE_URL="postgresql://postgres.[REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?pgbouncer=true"
   ALLOW_IN_MEMORY_DB="false"
   ```
5. Apply database migrations:
   ```bash
   npm run db:migrate
   ```

### 2. Provision the Administrator Account

Generate a secure Argon2id hash and insert the admin user:

```bash
# Provision directly into Supabase PostgreSQL:
npm run provision:admin -- --db --generate
```

### 3. Configure Oracle Cloud Infrastructure (OCI)

1. Log into your [Oracle Cloud Console](https://cloud.oracle.com/).
2. Navigate to **Identity > Users > [Your User] > API Keys**.
3. Click **Add API Key**, download the private key (`.pem`), and copy the fingerprint and OCIDs.
4. Update `.env.local`:
   ```env
   VM_ADAPTER_MODE="live"
   OCI_REGION="us-phoenix-1"
   OCI_INSTANCE_DISPLAY_NAME="my-production-vm"
   OCI_TENANCY_OCID="ocid1.tenancy.oc1..aaaaaaa..."
   OCI_COMPARTMENT_OCID="ocid1.compartment.oc1..aaaaaaa..."
   OCI_USER_OCID="ocid1.user.oc1..aaaaaaa..."
   OCI_FINGERPRINT="20:3b:97:13:55:1c:..."
   OCI_PRIVATE_KEY="/absolute/path/to/oci_api_key.pem"
   OCI_INSTANCE_OCID="ocid1.instance.oc1.phx.aaaaaaa..."
   ```

---

## 🛠️ Available Scripts

| Script | Command | Purpose |
| :--- | :--- | :--- |
| **Development** | `npm run dev` | Starts Next.js dev server on `http://localhost:3000` |
| **Production Build** | `npm run build` | Compiles and optimizes production assets |
| **Start Production** | `npm run start` | Runs the compiled production build |
| **Type Check** | `npm run typecheck` | Validates TypeScript types across the codebase |
| **Lint** | `npm run lint` | Runs ESLint 9 checks |
| **Unit Tests** | `npm run test` | Runs 26 unit, security, and component tests with Vitest |
| **E2E Tests** | `npm run test:e2e` | Runs Playwright end-to-end integration tests |
| **DB Migrate** | `npm run db:migrate` | Applies Drizzle migrations to Supabase PostgreSQL |
| **Admin Provision** | `npm run provision:admin` | Generates Argon2id hashes and seeds administrator |

---

## 🛡️ Security Best Practices

- **Never Commit Secrets**: `.env.local`, `.pem` files, and database passwords are gitignored. Keep `.env.example` sanitized.
- **Key Storage**: On serverless environments (e.g. Vercel), `OCI_PRIVATE_KEY` can be provided as inline PEM content directly in environment variables.
- **Restricted IAM Policy**: Use a dedicated service account in OCI with minimal privileges:
  ```text
  Allow group VmManagers to manage instance-family in compartment MyCompartment where request.instance.id = 'ocid1.instance.oc1...'
  ```

---

## 📄 License

MIT © [Vinay Ekbote](https://github.com/vnekbote)
