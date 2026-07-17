# Reglas

Autopsia trae 4 reglas. Para cada una: qué detecta, un ejemplo de código que la rompe, el fix, por qué importa en una app real, y cómo ignorarla cuando hay una razón legítima.

Las 4 se configuran por proyecto en la sección `"rules"` del config:

```json
"rules": {
  "dependency-direction": "error",   // falla --ci (default)
  "direct-data-access": "error",
  "forbidden-external": "warning",   // se reporta en amarillo, no falla
  "circular-deps": "off"             // no corre
}
```

Los imports `import type { … }` **no cuentan** para ninguna regla de dependencias: solo existen en tiempo de compilación y no generan acoplamiento real. Los barrels (`index.ts`) se resuelven al archivo real, así que re-exportar una violación no la "lava".

---

## dependency-direction

**Qué detecta:** una capa importando de una capa que no está en su lista `allowedDependencies`. El caso clásico: la UI saltándose el dominio para hablar directo con la capa de datos.

**Malo** — la pantalla importa el repositorio directamente:

```tsx
// src/presentation/screens/HomeScreen.tsx
import { EventRepository } from '../../data/repositories/EventRepository';

export function HomeScreen() {
  const repo = new EventRepository();        // presentation → data ✖
  // ...
}
```

**Bueno** — la pantalla habla con un caso de uso del dominio, y es el caso de uso quien recibe el repositorio:

```tsx
// src/presentation/screens/HomeScreen.tsx
import { GetEventsUseCase } from '../../domain/usecases/GetEventsUseCase';

export function HomeScreen({ getEvents }: { getEvents: GetEventsUseCase }) {
  // presentation → domain ✔
}
```

**Por qué importa:** cuando la UI conoce los repositorios, cada cambio en la capa de datos (nueva API, cambiar Supabase por otra cosa, agregar caché) obliga a tocar pantallas. Con la dirección correcta, ese cambio se queda en `data` y la UI ni se entera. También es lo que te permite testear un caso de uso con un repositorio falso en memoria.

**Cómo ignorarla legítimamente:** durante una migración por etapas puede haber imports que aún no puedes romper:

```ts
// autopsia-ignore-next-line dependency-direction -- migración a usecases en curso, ticket ARQ-12
import { EventRepository } from '../../data/repositories/EventRepository';
```

---

## direct-data-access

**Qué detecta:** archivos de las capas listadas en `noDirectDataAccessIn` (típicamente `presentation`) importando módulos de red/datos (`dataAccessModules`: axios, Supabase, AsyncStorage…).

**Malo** — la pantalla hace la petición ella misma:

```tsx
// src/presentation/screens/HomeScreen.tsx
import axios from 'axios';

export function HomeScreen() {
  useEffect(() => {
    axios.get('/events').then((r) => setEvents(r.data));   // ✖
  }, []);
}
```

**Bueno** — la petición vive en un repositorio; la pantalla solo consume el resultado:

```ts
// src/data/repositories/EventRepository.ts
import axios from 'axios';                                  // aquí sí ✔

export class EventRepository {
  async getAll(): Promise<Event[]> {
    const { data } = await axios.get('/events');
    return data;
  }
}
```

**Por qué importa:** este es el import que más duele a los 6 meses. Para testear esa pantalla necesitas mockear axios; cuando el backend cambia el shape de la respuesta, el cambio está regado por la UI; y agregar manejo de errores o retry consistente se vuelve imposible porque cada pantalla lo hace a su manera. Centralizado en repositorios, todo eso se arregla en un solo lugar.

**Cómo ignorarla legítimamente:** una pantalla de diagnóstico interna que hace ping a un healthcheck, por ejemplo:

```ts
// autopsia-ignore-next-line direct-data-access -- pantalla de debug interna, no producción
import axios from 'axios';
```

---

## forbidden-external

**Qué detecta:** módulos npm prohibidos en una capa, según el `forbiddenExternal` de esa capa. El uso principal: mantener `domain` como TypeScript puro, libre de `react`, `react-native`, `axios`, `@supabase`…

**Malo** — un caso de uso que importa axios "solo para una cosita":

```ts
// src/domain/usecases/GetEventsUseCase.ts
import axios from 'axios';                                  // ✖

export class GetEventsUseCase {
  async execute() {
    await axios.get('/health');   // el dominio ahora depende de la red
    // ...
  }
}
```

**Bueno** — el dominio define el contrato; la implementación con axios vive en `data`:

```ts
// src/domain/usecases/GetEventsUseCase.ts — TypeScript puro ✔
export interface HealthCheck {
  ping(): Promise<boolean>;
}

export class GetEventsUseCase {
  constructor(private health: HealthCheck) {}
}
```

**Por qué importa:** el dominio es la parte de tu app que debería sobrevivir a cualquier cambio de framework: son las reglas del negocio. Si importa React o axios, ya no puedes correrlo en un test de Node sin montar medio entorno, ni reusarlo (en una web, en un script) sin arrastrar dependencias móviles.

**Cómo ignorarla legítimamente:** una librería puramente utilitaria que decidiste permitir en dominio mientras la envuelves:

```ts
// autopsia-ignore-next-line forbidden-external -- date-fns es puro, pendiente envolver en util propia
import { addDays } from 'date-fns';
```

(La alternativa más limpia: quitar ese módulo del `forbiddenExternal` de la capa si la decisión es permanente.)

---

## circular-deps

**Qué detecta:** ciclos de imports — `A → B → A`, o cadenas más largas `A → B → C → A`. Se reporta cada ciclo una sola vez.

**Malo** — dos helpers que se importan mutuamente:

```ts
// helperA.ts
import { b } from './helperB';
export const a = () => b() + 1;

// helperB.ts
import { a } from './helperA';   // ✖ ciclo A → B → A
export const b = () => a() - 1;
```

**Bueno** — lo compartido se extrae a un tercer módulo del que ambos dependen:

```ts
// shared.ts
export const base = 1;

// helperA.ts
import { base } from './shared';   // ✔ A → shared ← B

// helperB.ts
import { base } from './shared';
```

**Por qué importa:** los ciclos producen los bugs más raros de diagnosticar en JavaScript: un módulo que a veces es `undefined` según el orden de carga, especialmente con Metro/React Native. También hacen imposible extraer o testear un módulo sin arrastrar al otro.

**Cómo ignorarla legítimamente:** un ciclo conocido que no puedes romper todavía — marca **una** de sus aristas:

```ts
// autopsia-ignore-next-line circular-deps -- ciclo legacy models<->serializers, ticket ARQ-30
import { serialize } from './serializers';
```

---

<a id="ignore-comments"></a>
## Comentarios de escape (referencia)

```ts
// autopsia-ignore-next-line <regla> [-- razón]   → suprime esa regla en la línea siguiente
// autopsia-ignore-file <regla> [-- razón]        → suprime esa regla en todo el archivo (ponlo al inicio)
```

- El nombre de regla es el de los títulos de esta página (`dependency-direction`, `direct-data-access`, `forbidden-external`, `circular-deps`).
- **Sin nombre de regla se suprimen TODAS las reglas** en esa línea/archivo. Funciona, pero es mala práctica: nombra la regla y deja la razón tras `--` para que la excepción quede documentada y revisable.
- Las violaciones suprimidas no se listan en el reporte; solo se muestra el conteo: `N suprimida(s) con comentarios autopsia-ignore`.

¿Cuándo usar cada mecanismo?

| Situación | Herramienta |
|---|---|
| Deuda heredada masiva al adoptar la herramienta | [Baseline](getting-started.md#adopting-autopsia-in-a-legacy-project) |
| Excepción puntual y justificada en una línea | `autopsia-ignore-next-line` con regla y razón |
| Una regla no aplica (aún) a tu proyecto | `"rules": { "<regla>": "warning" }` u `"off"` en el [config](configuration.md) |
