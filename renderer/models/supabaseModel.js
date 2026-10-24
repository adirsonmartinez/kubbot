// Supabase project (demo data): its tables and whether the RLS vulnerability is active.
import { Observable } from '../core/observable.js';

export const TABLES = [
  { name: 'users', vulnerable: true, columns: [
    { name: 'id', type: 'uuid', key: 'PK' },
    { name: 'email', type: 'text', sensitive: true },
    { name: 'full_name', type: 'text', sensitive: true },
    { name: 'phone', type: 'text', sensitive: true },
    { name: 'created_at', type: 'timestamptz' },
  ] },
  { name: 'profiles', columns: [
    { name: 'id', type: 'uuid', key: 'PK' },
    { name: 'user_id', type: 'uuid', key: 'FK' },
    { name: 'avatar_url', type: 'text' },
    { name: 'bio', type: 'text' },
  ] },
  { name: 'transactions', columns: [
    { name: 'id', type: 'bigint', key: 'PK' },
    { name: 'user_id', type: 'uuid', key: 'FK' },
    { name: 'amount', type: 'numeric' },
    { name: 'currency', type: 'text' },
    { name: 'status', type: 'text' },
  ] },
  { name: 'subscriptions', columns: [
    { name: 'id', type: 'uuid', key: 'PK' },
    { name: 'user_id', type: 'uuid', key: 'FK' },
    { name: 'plan', type: 'text' },
    { name: 'renews_at', type: 'timestamptz' },
  ] },
  { name: 'sessions', columns: [
    { name: 'id', type: 'uuid', key: 'PK' },
    { name: 'user_id', type: 'uuid', key: 'FK' },
    { name: 'ip', type: 'inet' },
    { name: 'expires_at', type: 'timestamptz' },
  ] },
  { name: 'audit_logs', columns: [
    { name: 'id', type: 'bigint', key: 'PK' },
    { name: 'actor_id', type: 'uuid', key: 'FK' },
    { name: 'action', type: 'text' },
    { name: 'created_at', type: 'timestamptz' },
  ] },
];

export class SupabaseModel {
  tables = TABLES;
  store = new Observable({ vulnerable: false });

  get vulnerable() {
    return this.store.state.vulnerable;
  }

  setVulnerable(on) {
    if (on !== this.store.state.vulnerable) this.store.set({ vulnerable: on });
  }

  // A table leaks data when the vulnerability is active and RLS is off on it
  isExposed(table) {
    return this.vulnerable && !!table.vulnerable;
  }
}
