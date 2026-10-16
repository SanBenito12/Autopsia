# Modular Feature-Based Architecture with Autopsia

English · [Español](features-architecture.es.md)

Feature-based architecture groups code by business domain (e.g., `src/features/auth`, `src/features/checkout`, `src/features/profile`). The biggest architectural challenge in growing teams is **cross-feature leaks**, where one feature imports private internals from another.

Autopsia enforces strict **Public API boundaries** between features.

---

## 1. Feature Structure Convention

Each feature should have a public entry point (`index.ts`):

```text
src/features/
├── auth/
│   ├── components/
│   │   └── SecretModal.tsx      <-- Private internal
│   ├── services/
│   │   └── authClient.ts        <-- Private internal
│   └── index.ts                 <-- Public API (only allowed entry)
└── checkout/
    ├── screens/
    │   └── CheckoutScreen.tsx
    └── index.ts
```

---

## 2. Configuration

Add the `features` block in `autopsia.config.json`:

```json
{
  "features": {
    "patterns": ["src/features/*", "features/*"],
    "enforcePublicApi": true,
    "allowedCrossImports": {
      "checkout": ["auth", "products"],
      "auth": []
    }
  }
}
```

- `enforcePublicApi: true` (default): Only imports targeting `features/<name>/index.ts` are permitted from outside that feature.
- `allowedCrossImports`: Explicitly declare which features may import other features.

---

## 3. Allowed vs. Blocked Imports

### ❌ Blocked (Private Internal Import)
```ts
// In src/features/checkout/screens/CheckoutScreen.tsx
import { SecretModal } from '../../auth/components/SecretModal';
// ✖ Violation: Feature "checkout" cannot import private internals of "auth"
```

### ✅ Allowed (Public API Contract)
```ts
// In src/features/checkout/screens/CheckoutScreen.tsx
import { useAuth, UserProfile } from '../../auth';
// ✔ Clean: Consumes through auth/index.ts
```

### ✅ Allowed (Internal to Same Feature)
```ts
// In src/features/auth/screens/LoginScreen.tsx
import { SecretModal } from '../components/SecretModal';
// ✔ Clean: Both files belong to the "auth" feature
```

---

## 4. Immediate Feedback

Verify feature boundaries anytime:

```bash
npx autopsia-rn scan
```

Or watch live during development:

```bash
npx autopsia-rn scan --watch
```
