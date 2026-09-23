# Rules

English · [Español](rules.es.md)

Autopsia checks four dependency rules. Configure each as `error`, `warning` or `off`. Type-only imports are excluded from dependency rules; this is a tool boundary, not a claim that types cannot create design coupling. Re-exports form graph edges and are checked too.

## dependency-direction

Detects imports to another layer outside `allowedDependencies`.

```ts
// Bad: src/presentation/screens/HomeScreen.tsx
import { EventRepository } from '../../data/repositories/EventRepository';

// Better: depend on a domain use case, supplied by the composition root
import { GetEventsUseCase } from '../../domain/usecases/GetEventsUseCase';
export function loadEvents(getEvents: GetEventsUseCase) {
  return getEvents.execute();
}
```

Keeping data implementations out of UI code reduces how many screens must change when a backend changes. Configure your composition root separately so it can wire implementations to contracts.

For logging or other shared services, define a domain contract and inject its implementation. A presentation hook may consume an injected logger from React Context. A temporary direct dependency can instead use a documented exception:

```ts
// autopsia-ignore-next-line dependency-direction -- migrating logger injection, ARQ-12
import { logger } from '../../infrastructure/logger';
```

## direct-data-access

Detects imports of `dataAccessModules` in layers listed in `noDirectDataAccessIn`.

```ts
// Bad in presentation: this import is the evidence
import axios from 'axios';
export const load = () => axios.get('/events');

// Better in data: UI receives a domain use case instead
import axios from 'axios';
export class EventRepository {
  async getAll() { return (await axios.get('/events')).data; }
}
```

A repository provides one place for retries, response mapping and networking changes. This rule checks imports, not every data-access expression: global `fetch()` calls and unconfigured modules are not detected.

An internal diagnostic screen can document an intentional exception:

```ts
// autopsia-ignore-next-line direct-data-access -- internal health-check screen
import axios from 'axios';
```

## forbidden-external

Detects external modules listed in a layer's `forbiddenExternal` configuration.

```ts
// Bad in domain
import axios from 'axios';

// Better: domain defines a contract; data supplies the implementation
export interface HealthCheck { ping(): Promise<boolean>; }
export class CheckHealth {
  constructor(private health: HealthCheck) {}
  execute() { return this.health.ping(); }
}
```

This helps keep domain behavior independent of frameworks and data clients. If a utility is permanently allowed, remove it from the forbidden list. For a temporary exception:

```ts
// autopsia-ignore-next-line forbidden-external -- wrapping date utility in follow-up
import { addDays } from 'date-fns';
```

The example only triggers if `date-fns` is configured as forbidden.

## circular-deps

Detects import cycles, including chains longer than two files.

```ts
// Bad: helperA.ts
import { b } from './helperB';
export const a = () => b() + 1;
// helperB.ts
import { a } from './helperA';
export const b = () => a() - 1;
```

Move shared behavior into a third module that neither imports its consumers nor closes another cycle. Cycles can cause initialization-order problems and make modules harder to isolate. To tolerate a known cycle temporarily, annotate one of its import edges:

```ts
// autopsia-ignore-next-line circular-deps -- legacy serializer cycle, ARQ-30
import { serialize } from './serializers';
```

## Ignore comments

```ts
// autopsia-ignore-next-line <rule> -- reason
// autopsia-ignore-file <rule> -- reason
```

Place file directives near the top. Omitting the rule suppresses all rules for that line or file; prefer an explicit rule and reason. Suppression applies per import occurrence, so ignoring one import does not suppress others to the same module. Suppressed violations contribute to the suppression count but are not listed.

| Situation | Use |
|---|---|
| Existing debt during adoption | [Baseline](getting-started.md#adopting-autopsia-in-a-legacy-project) |
| Intentional local exception | A named ignore comment with a reason |
| Rule being introduced gradually | `warning` in [configuration](configuration.md) |
| Rule does not apply | `off` in configuration |
