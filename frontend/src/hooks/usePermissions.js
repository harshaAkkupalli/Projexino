import { useEffect, useState } from "react";
import { api } from "@/lib/api";

let _cache = null;
let _inflight = null;
let _subscribers = new Set();

/**
 * usePermissions — fetch the current user's permission matrix from /api/rbac/permissions.
 * Returns an object with helpers:
 *   - perms.permissions: { module_slug: { view, create, edit, delete } }
 *   - perms.can(module, action='view') — boolean
 *   - perms.role / perms.is_super_admin
 *
 * The result is cached for the page lifetime so multiple components share one request.
 */
export default function usePermissions() {
  const [data, setData] = useState(_cache);

  useEffect(() => {
    const update = (d) => setData(d);
    _subscribers.add(update);
    if (_cache) {
      update(_cache);
    } else if (!_inflight) {
      _inflight = api.get("/rbac/permissions").then(({ data }) => {
        _cache = data;
        _inflight = null;
        _subscribers.forEach((fn) => fn(data));
        return data;
      }).catch(() => {
        _inflight = null;
        return null;
      });
    }
    return () => { _subscribers.delete(update); };
  }, []);

  const can = (module, action = "view") => {
    if (!data) return null;            // null = still loading
    if (data.is_super_admin) return true;
    const m = data.permissions?.[module];
    if (!m) return false;
    return Boolean(m[action]);
  };

  return {
    loaded: !!data,
    role: data?.role,
    is_super_admin: !!data?.is_super_admin,
    permissions: data?.permissions || {},
    can,
  };
}

/** Force-refresh after a super admin changes the matrix. */
export function refreshPermissions() {
  _cache = null;
  _inflight = api.get("/rbac/permissions").then(({ data }) => {
    _cache = data;
    _inflight = null;
    _subscribers.forEach((fn) => fn(data));
    return data;
  });
  return _inflight;
}
