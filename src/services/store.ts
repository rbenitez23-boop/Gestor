import type { Database } from '../types';
import { loadDatabase, saveWithRetry } from './githubStore';

type Listener = () => void;

class Store {
  private data: Database | null = null;
  private listeners: Listener[] = [];
  private loading = false;

  get current(): Database | null {
    return this.data;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private notify() {
    this.listeners.forEach((l) => l());
  }

  async load(force = false): Promise<Database> {
    if (this.data && !force) return this.data;
    if (this.loading) {
      // Espera a que la carga en curso termine en vez de disparar otra.
      await new Promise((r) => setTimeout(r, 150));
      return this.load(force);
    }
    this.loading = true;
    try {
      const { data } = await loadDatabase();
      this.data = data;
      this.notify();
      return data;
    } finally {
      this.loading = false;
    }
  }

  /**
   * Aplica una mutación y la persiste en GitHub. Si hay conflicto de
   * concurrencia (alguien más guardó primero), reintenta una vez con
   * datos frescos — ver githubStore.saveWithRetry.
   */
  async mutate(mutate: (db: Database) => Database, commitMessage: string): Promise<Database> {
    const result = await saveWithRetry(mutate, commitMessage);
    this.data = result;
    this.notify();
    return result;
  }
}

export const store = new Store();
