import { describe, expect, it } from 'vitest';
import {
  getCachedAdminData,
  setCachedAdminData,
  invalidateAdminCache,
  bindAdminCacheSession,
} from '../src/lib/admin-cache';
import fs from 'fs';
import path from 'path';

describe('Admin Memory Cache Safety & Anti-Flash (UX-018)', () => {
  it('stores and retrieves cached items within TTL', () => {
    invalidateAdminCache();
    setCachedAdminData('test_key', { count: 42 });
    const cached = getCachedAdminData<{ count: number }>('test_key');
    expect(cached).toEqual({ count: 42 });
  });

  it('expires items past TTL', () => {
    invalidateAdminCache();
    setCachedAdminData('expired_key', { status: 'ok' });
    const cached = getCachedAdminData('expired_key', -1);
    expect(cached).toBeNull();
  });

  it('invalidates by prefix correctly', () => {
    invalidateAdminCache();
    setCachedAdminData('admin_leads_all', [1, 2]);
    setCachedAdminData('admin_users_all', [3, 4]);

    invalidateAdminCache('admin_leads');
    expect(getCachedAdminData('admin_leads_all')).toBeNull();
    expect(getCachedAdminData('admin_users_all')).toEqual([3, 4]);
  });

  describe('Session Isolation & Cross-Account Leak Prevention', () => {
    it('prevents user B from reading data cached for user A', () => {
      invalidateAdminCache();
      bindAdminCacheSession('admin_user_A');

      setCachedAdminData('admin_payments_secret', { balance: 1000 }, { userId: 'admin_user_A' });

      // User A can read it
      expect(getCachedAdminData('admin_payments_secret', { userId: 'admin_user_A' })).toEqual({ balance: 1000 });

      // User B cannot read it (returns null and purges)
      expect(getCachedAdminData('admin_payments_secret', { userId: 'admin_user_B' })).toBeNull();
    });

    it('automatically wipes the cache when switching active user session', () => {
      invalidateAdminCache();
      bindAdminCacheSession('admin_user_A');
      setCachedAdminData('admin_users_list', ['u1', 'u2']);

      // Switch to different user
      bindAdminCacheSession('admin_user_B');

      // Previous cache is wiped
      expect(getCachedAdminData('admin_users_list')).toBeNull();
    });
  });

  describe('Stale-Write & Race Condition Protection', () => {
    it('rejects stale revalidation writes that started before a mutation invalidation', () => {
      invalidateAdminCache();
      const now = Date.now();
      const t0 = now - 50;
      // Mutation occurs now:
      invalidateAdminCache('admin_payments');

      // The slow async request finishes now, but its requestStartedAt was t0:
      const writeAccepted = setCachedAdminData(
        'admin_payments',
        { stale: true },
        { requestStartedAt: t0 }
      );

      // Write MUST be rejected because invalidation happened after request started
      expect(writeAccepted).toBe(false);
      expect(getCachedAdminData('admin_payments')).toBeNull();
    });

    it('rejects an older in-flight response when a newer revalidation response has already arrived', () => {
      invalidateAdminCache();
      const now = Date.now();
      const tReq1 = now + 10;
      const tReq2 = now + 20;

      // Request 2 finishes first and populates the cache
      const r2Accepted = setCachedAdminData('admin_leads_search', { results: ['lead_new'] }, { requestStartedAt: tReq2 });
      expect(r2Accepted).toBe(true);

      // Request 1 (which started earlier at tReq1) resolves late and attempts to write:
      const writeAccepted = setCachedAdminData(
        'admin_leads_search',
        { results: ['lead_stale'] },
        { requestStartedAt: tReq1 }
      );

      // Must be rejected; cache retains Request 2's fresh data
      expect(writeAccepted).toBe(false);
      expect(getCachedAdminData('admin_leads_search')).toEqual({ results: ['lead_new'] });
    });
  });

  describe('Mutation Handlers & Logout Invalidation Enforcement', () => {
    it('verifies admin pages guard against skeleton flashing when data is cached', () => {
      const leadsPage = fs.readFileSync(path.resolve(__dirname, '../src/app/admin/leads/page.tsx'), 'utf-8');
      const usersPage = fs.readFileSync(path.resolve(__dirname, '../src/app/admin/users/page.tsx'), 'utf-8');
      const paymentsPage = fs.readFileSync(path.resolve(__dirname, '../src/app/admin/payments/page.tsx'), 'utf-8');

      expect(leadsPage).toContain('loading && leads.length === 0');
      expect(usersPage).toContain('loading && users.length === 0');
      expect(paymentsPage).toContain('loading && pendingPayments.length === 0');
    });

    it('verifies all mutations in admin pages explicitly invalidate cache', () => {
      const leadsPage = fs.readFileSync(path.resolve(__dirname, '../src/app/admin/leads/page.tsx'), 'utf-8');
      const usersPage = fs.readFileSync(path.resolve(__dirname, '../src/app/admin/users/page.tsx'), 'utf-8');
      const paymentsPage = fs.readFileSync(path.resolve(__dirname, '../src/app/admin/payments/page.tsx'), 'utf-8');

      // Leads page mutations
      expect(leadsPage).toContain("invalidateAdminCache('admin_leads')");
      // Users page mutations (suspend / adjust credits)
      expect(usersPage).toContain("invalidateAdminCache('admin_users')");
      // Payments page mutations (approve / reject)
      expect(paymentsPage).toContain("invalidateAdminCache('admin_payments')");
    });

    it('verifies TopBar calls invalidateAdminCache upon logout', () => {
      const topBar = fs.readFileSync(path.resolve(__dirname, '../src/components/domain/TopBar.tsx'), 'utf-8');
      expect(topBar).toContain('invalidateAdminCache();');
    });
  });
});
