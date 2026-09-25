/* TypeHub — کمک‌های احراز هویت و ارتباط با بک‌اند (مشترک بین app.html و admin.html) */
(function (global) {
  'use strict';

  var meCache = null;
  var meFetched = false;

  function api(path, method, body) {
    return fetch(path, {
      method: method || 'GET',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().then(function (j) { return { status: r.status, body: j }; });
    });
  }

  // اطلاعات کاربر لاگین‌کرده (null اگر مهمان). نتیجه کش می‌شود.
  function me() {
    if (meFetched) return Promise.resolve(meCache);
    return api('/api/auth/me').then(function (r) {
      meFetched = true;
      meCache = (r.body.ok && r.body.user) ? r.body.user : null;
      return meCache;
    }).catch(function () { meFetched = true; meCache = null; return null; });
  }

  function logout() {
    return api('/api/auth/logout', 'POST').then(function () {
      meCache = null; meFetched = false;
      location.replace('/index.html');
    });
  }

  // اگر لاگین نیست، بفرست به صفحه ورود
  function requireUser() {
    return me().then(function (u) {
      if (!u) { location.replace('/index.html'); throw new Error('redirect'); }
      return u;
    });
  }

  function requireAdmin() {
    return me().then(function (u) {
      if (!u) { location.replace('/index.html'); throw new Error('redirect'); }
      if (u.role !== 'admin') { location.replace('/app.html'); throw new Error('redirect'); }
      return u;
    });
  }

  global.TH = global.TH || {};
  global.TH.api = api;
  global.TH.me = me;
  global.TH.logout = logout;
  global.TH.requireUser = requireUser;
  global.TH.requireAdmin = requireAdmin;
})(window);
