# Arquitectura Modular Basada en Features con Autopsia

[English](features-architecture.md) · Español

La arquitectura basada en features agrupa el código por dominio de negocio (`src/features/auth`, `src/features/checkout`, `src/features/profile`). El principal desafío de diseño en equipos medianos y grandes es el **acoplamiento no controlado entre features**, donde un equipo importa detalles internos y privados de otro.

Autopsia protege las **fronteras de módulos** imponiendo el uso de **APIs Públicas**.

---

## 1. Convención de Estructura por Features

Cada feature expone un punto de entrada público (`index.ts`):

```text
src/features/
├── auth/
│   ├── components/
│   │   └── SecretModal.tsx      <-- Archivo privado interno
│   ├── services/
│   │   └── authClient.ts        <-- Archivo privado interno
│   └── index.ts                 <-- API Pública (única entrada permitida)
└── checkout/
    ├── screens/
    │   └── CheckoutScreen.tsx
    └── index.ts
```

---

## 2. Configuración en `autopsia.config.json`

Agrega el bloque `features`:

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

- `enforcePublicApi: true` (por defecto): Sólo se permite importar desde fuera a través del `index.ts` de la feature.
- `allowedCrossImports`: Define explícitamente qué features tienen permiso de importar a otras features.

---

## 3. Ejemplos de Importaciones

### ❌ Bloqueado (Importación a archivo privado interno)
```ts
// En src/features/checkout/screens/CheckoutScreen.tsx
import { SecretModal } from '../../auth/components/SecretModal';
// ✖ Violación: Feature "checkout" no puede importar archivos privados de "auth"
```

### ✅ Permitido (Consumo a través de la API Pública)
```ts
// En src/features/checkout/screens/CheckoutScreen.tsx
import { useAuth, UserProfile } from '../../auth';
// ✔ Válido: Consume mediante auth/index.ts
```

### ✅ Permitido (Interno a la misma feature)
```ts
// En src/features/auth/screens/LoginScreen.tsx
import { SecretModal } from '../components/SecretModal';
// ✔ Válido: Ambos archivos pertenecen a la feature "auth"
```

---

## 4. Feedback Inmediato

Audita el aislamiento en cualquier momento:

```bash
npx autopsia-rn scan
```

O vigila en vivo durante tu jornada de desarrollo:

```bash
npx autopsia-rn scan --watch
```
