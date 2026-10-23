import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { ProjectStatus, RecentProject } from '../shared/types';

const LIMIT = 12;
const file = () => path.join(app.getPath('userData'), 'recents.json');

export function listRecents(): RecentProject[] {
  try {
    const list = JSON.parse(fs.readFileSync(file(), 'utf-8')) as RecentProject[];
    return list.filter((p) => fs.existsSync(p.root));
  } catch {
    return [];
  }
}

function save(list: RecentProject[]): RecentProject[] {
  const trimmed = list.slice(0, LIMIT);
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(trimmed, null, 2));
  return trimmed;
}

export function touchRecent(root: string): RecentProject[] {
  const list = listRecents();
  const existing = list.find((p) => p.root === root);
  const entry: RecentProject = existing
    ? { ...existing, lastOpenedAt: new Date().toISOString() }
    : { root, name: path.basename(root), lastOpenedAt: new Date().toISOString(), status: 'unknown' };
  app.addRecentDocument(root);
  return save([entry, ...list.filter((p) => p.root !== root)]);
}

export function setRecentStatus(root: string, status: ProjectStatus, newCount?: number): RecentProject[] {
  return save(listRecents().map((p) => (p.root === root ? { ...p, status, newCount } : p)));
}

export function forgetRecent(root: string): RecentProject[] {
  return save(listRecents().filter((p) => p.root !== root));
}
