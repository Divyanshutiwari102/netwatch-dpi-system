/**
 * api.js — centralised REST layer. Exposed as window.API.
 * All fetch() calls live here. Components never call fetch directly.
 */

window.API = (() => {
  const BASE = 'http://localhost:8080';

  async function req(method, path, body) {
    const opts = { method, headers: { 'Content-Type': 'application/json' } };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      throw new Error(`[${res.status}] ${path} — ${txt || res.statusText}`);
    }
    return res.json();
  }

  // Unwrap the { success, message, data } envelope the backend always sends
  function data(res) { return res?.data ?? res; }

  return {
    capture: {
      startLive:  ()     => req('POST', '/api/capture/start', {}),
      startFile:  (path) => req('POST', '/api/capture/start', { pcapFilePath: path }),
      stop:       ()     => req('POST', '/api/capture/stop'),
      status:     ()     => req('GET',  '/api/capture/status').then(data),
      interfaces: ()     => req('GET',  '/api/capture/interfaces').then(data),
    },
    packets: {
      stats:  ()              => req('GET', '/api/packets/stats').then(data),
      recent: (limit = 100)   => req('GET', `/api/packets?limit=${limit}`).then(data),
      query:  (params)        => req('GET', `/api/packets?${new URLSearchParams(params)}`).then(data),
    },
    flows: {
      list: (limit = 30) => req('GET', `/api/flows?limit=${limit}`).then(data),
    },
    rules: {
      list:   ()                       => req('GET',    '/api/rules').then(data),
      add:    (type, value, desc)      => req('POST',   '/api/rules', { type, value, description: desc }),
      remove: (id)                     => req('DELETE', `/api/rules/${id}`),
    },
  };
})();
