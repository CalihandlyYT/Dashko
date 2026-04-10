(function () {
  var API = '/api';

  function api(method, path, body) {
    var opts = { method: method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function (r) {
      return r.text().then(function (text) {
        var data = {};
        if (text) {
          try { data = JSON.parse(text); } catch (e) { data = { error: text.slice(0, 200) }; }
        }
        return { ok: r.ok, status: r.status, data: data };
      });
    });
  }

  function escapeHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function toast(msg, isError) {
    var el = document.getElementById('admin-toast');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = 'block';
    el.classList.toggle('is-error', !!isError);
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.style.display = 'none'; }, 4200);
  }

  var denied = document.getElementById('admin-denied');
  var app = document.getElementById('admin-app');
  var loadErr = document.getElementById('admin-load-error');
  var statsGrid = document.getElementById('admin-stats-grid');
  var usersTbody = document.getElementById('admin-users-tbody');
  var reviewsTbody = document.getElementById('admin-reviews-tbody');
  var auditTbody = document.getElementById('admin-audit-tbody');
  var userSearch = document.getElementById('admin-user-search');

  function showDenied(msg) {
    if (denied) denied.style.display = 'block';
    if (app) app.style.display = 'none';
    if (loadErr) loadErr.textContent = msg || '';
  }

  function showApp() {
    if (denied) denied.style.display = 'none';
    if (app) app.style.display = 'block';
  }

  function renderStats(data) {
    if (!statsGrid) return;
    var items = [
      { label: 'Пользователей', val: data.users },
      { label: 'Отзывов', val: data.reviews },
      { label: 'Заблокировано', val: data.banned },
      { label: 'В муте сейчас', val: data.muted_active },
      { label: 'Админов', val: data.admins },
      { label: 'Средняя оценка', val: data.avg_rating },
      { label: 'Регистраций за 7 дн.', val: data.registered_last_7_days },
      { label: 'Отзывов за 7 дн.', val: data.reviews_last_7_days },
      { label: 'Размер БД (КБ)', val: data.db_size_bytes != null ? Math.round(data.db_size_bytes / 1024) : '—' },
      { label: 'Python', val: data.python_version || '—' }
    ];
    statsGrid.innerHTML = items.map(function (x) {
      return '<div class="admin-stat-card"><span>' + escapeHtml(x.label) + '</span><strong>' + escapeHtml(String(x.val)) + '</strong></div>';
    }).join('');
  }

  function userStatusBadges(u) {
    var parts = [];
    if (u.is_admin) parts.push('<span class="badge badge-ok">админ</span>');
    if (u.banned) parts.push('<span class="badge badge-bad">бан</span>');
    if (u.muted_active) parts.push('<span class="badge badge-warn">мут</span>');
    if (!parts.length) parts.push('<span class="badge badge-ok">ок</span>');
    return parts.join(' ');
  }

  function renderUsers(users) {
    if (!usersTbody) return;
    if (!users || !users.length) {
      usersTbody.innerHTML = '<tr><td colspan="6">Нет пользователей</td></tr>';
      return;
    }
    usersTbody.innerHTML = users.map(function (u) {
      var actions = '<div class="admin-user-actions">';
      if (!u.banned) {
        actions += '<button type="button" class="btn-admin btn-admin-ban" data-ban="' + u.id + '">Бан</button>';
      } else {
        actions += '<button type="button" class="btn-admin btn-admin-ok" data-unban="' + u.id + '">Разбан</button>';
      }
      if (!u.muted_active) {
        actions += '<button type="button" class="btn-admin btn-admin-muted" data-mute60="' + u.id + '">Мут 1ч</button>';
        actions += '<button type="button" class="btn-admin btn-admin-muted" data-mute1440="' + u.id + '">Мут 24ч</button>';
        actions += '<button type="button" class="btn-admin btn-admin-muted" data-mute-custom="' + u.id + '">Мут…</button>';
      } else {
        actions += '<button type="button" class="btn-admin btn-admin-ok" data-unmute="' + u.id + '">Снять мут</button>';
      }
      actions += '<button type="button" class="btn-admin btn-admin-delete" data-deluser="' + u.id + '">Удалить</button>';
      actions += '</div>';
      var extra = '';
      if (u.banned && u.banned_reason) extra = '<div style="font-size:0.75rem;color:#922b21;margin-top:4px;">' + escapeHtml(u.banned_reason) + '</div>';
      if (u.muted_until && u.muted_active) extra += '<div style="font-size:0.75rem;color:#6c3483;">до ' + escapeHtml(u.muted_until) + '</div>';
      return '<tr data-uid="' + u.id + '"><td>' + u.id + '</td><td>' + escapeHtml(u.email) + '</td><td>' + escapeHtml(u.name || '') + '</td><td>' + userStatusBadges(u) + extra + '</td><td>' + escapeHtml(u.created_at || '') + '</td><td>' + actions + '</td></tr>';
    }).join('');

    usersTbody.querySelectorAll('[data-ban]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-ban'), 10);
        var reason = window.prompt('Причина бана (необязательно):', '') || '';
        api('PATCH', '/admin/users/' + id, { banned: true, banned_reason: reason }).then(function (res) {
          if (res.ok) { toast('Пользователь заблокирован'); refreshUsersAndStats(); }
          else toast((res.data && res.data.error) || 'Ошибка', true);
        });
      });
    });
    usersTbody.querySelectorAll('[data-unban]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-unban'), 10);
        api('PATCH', '/admin/users/' + id, { unban: true }).then(function (res) {
          if (res.ok) { toast('Бан снят'); refreshUsersAndStats(); }
          else toast((res.data && res.data.error) || 'Ошибка', true);
        });
      });
    });
    usersTbody.querySelectorAll('[data-mute60]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-mute60'), 10);
        api('PATCH', '/admin/users/' + id, { mute_minutes: 60 }).then(function (res) {
          if (res.ok) { toast('Мут на 1 час'); refreshUsersAndStats(); }
          else toast((res.data && res.data.error) || 'Ошибка', true);
        });
      });
    });
    usersTbody.querySelectorAll('[data-mute1440]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-mute1440'), 10);
        api('PATCH', '/admin/users/' + id, { mute_minutes: 1440 }).then(function (res) {
          if (res.ok) { toast('Мут на 24 часа'); refreshUsersAndStats(); }
          else toast((res.data && res.data.error) || 'Ошибка', true);
        });
      });
    });
    usersTbody.querySelectorAll('[data-mute-custom]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-mute-custom'), 10);
        var m = window.prompt('Мут на сколько минут? (1–525600)', '120');
        if (m == null) return;
        var n = parseInt(m, 10);
        if (!n || n < 1) { toast('Некорректное число', true); return; }
        api('PATCH', '/admin/users/' + id, { mute_minutes: n }).then(function (res) {
          if (res.ok) { toast('Мут выставлен'); refreshUsersAndStats(); }
          else toast((res.data && res.data.error) || 'Ошибка', true);
        });
      });
    });
    usersTbody.querySelectorAll('[data-unmute]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-unmute'), 10);
        api('PATCH', '/admin/users/' + id, { unmute: true }).then(function (res) {
          if (res.ok) { toast('Мут снят'); refreshUsersAndStats(); }
          else toast((res.data && res.data.error) || 'Ошибка', true);
        });
      });
    });
    usersTbody.querySelectorAll('[data-deluser]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-deluser'), 10);
        if (!confirm('Удалить пользователя #' + id + ' и все его отзывы? Это необратимо.')) return;
        api('DELETE', '/admin/users/' + id).then(function (res) {
          if (res.ok) { toast('Пользователь удалён'); refreshUsersAndStats(); }
          else toast((res.data && res.data.error) || 'Ошибка', true);
        });
      });
    });
  }

  function refreshUsersAndStats() {
    var q = userSearch && userSearch.value ? '?q=' + encodeURIComponent(userSearch.value.trim()) : '';
    return api('GET', '/admin/users' + q).then(function (res) {
      if (res.ok && res.data && res.data.users) renderUsers(res.data.users);
      return api('GET', '/admin/stats');
    }).then(function (res) {
      if (res && res.ok && res.data) renderStats(res.data);
    });
  }

  var reviewCheckState = {};

  function renderReviews(list) {
    if (!reviewsTbody) return;
    reviewCheckState = {};
    if (!list || !list.length) {
      reviewsTbody.innerHTML = '<tr><td colspan="8">Нет отзывов</td></tr>';
      return;
    }
    reviewsTbody.innerHTML = list.map(function (r) {
      return '<tr data-rid="' + r.id + '"><td><input type="checkbox" class="admin-checkbox admin-review-cb" data-rid="' + r.id + '"></td><td>' + r.id + '</td><td>' + escapeHtml(r.author_name) + '</td><td>' + r.rating + '</td><td class="admin-review-text">' + escapeHtml(r.text) + '</td><td>' + escapeHtml(r.user_email || '—') + '</td><td>' + escapeHtml(r.created_at || '') + '</td><td><button type="button" class="btn-admin btn-admin-delete" data-delete-review="' + r.id + '">Удалить</button></td></tr>';
    }).join('');

    reviewsTbody.querySelectorAll('.admin-review-cb').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var id = parseInt(cb.getAttribute('data-rid'), 10);
        reviewCheckState[id] = cb.checked;
      });
    });

    reviewsTbody.querySelectorAll('[data-delete-review]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-delete-review'), 10);
        if (!id || !confirm('Удалить отзыв #' + id + '?')) return;
        api('DELETE', '/admin/reviews/' + id).then(function (delRes) {
          if (delRes.ok) {
            var tr = btn.closest('tr');
            if (tr) tr.remove();
            api('GET', '/admin/stats').then(function (s) {
              if (s.ok && s.data) renderStats(s.data);
            });
            toast('Отзыв удалён');
          } else {
            toast((delRes.data && delRes.data.error) || 'Ошибка удаления', true);
          }
        });
      });
    });
  }

  function loadAudit() {
    if (!auditTbody) return;
    api('GET', '/admin/audit?limit=80').then(function (res) {
      if (!res.ok || !res.data || !res.data.entries) {
        auditTbody.innerHTML = '<tr><td colspan="6">Не удалось загрузить</td></tr>';
        return;
      }
      auditTbody.innerHTML = res.data.entries.map(function (e) {
        return '<tr><td>' + e.id + '</td><td>' + escapeHtml(e.created_at || '') + '</td><td>' + escapeHtml(e.admin_email || ('#' + e.admin_id)) + '</td><td>' + escapeHtml(e.action) + '</td><td>' + (e.target_user_id != null ? '#' + e.target_user_id : '—') + '</td><td>' + escapeHtml(e.detail || '') + '</td></tr>';
      }).join('') || '<tr><td colspan="6">Пусто</td></tr>';
    });
  }

  function loadServerInfo() {
    var lead = document.getElementById('admin-server-info-lead');
    var body = document.getElementById('admin-server-info-body');
    api('GET', '/admin/server-info').then(function (res) {
      if (!res.ok || !res.data) {
        if (lead) lead.textContent = 'Не удалось загрузить';
        return;
      }
      if (lead) lead.textContent = 'Путь к БД и версия Python на сервере.';
      if (body) {
        body.textContent = JSON.stringify(res.data, null, 2);
      }
    });
  }

  function setupTabs() {
    var tabs = document.querySelectorAll('.admin-tab');
    var panels = document.querySelectorAll('.admin-panel');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        var name = tab.getAttribute('data-tab');
        tabs.forEach(function (t) { t.classList.toggle('is-active', t === tab); });
        panels.forEach(function (p) {
          p.classList.toggle('is-visible', p.getAttribute('data-panel') === name);
        });
        if (name === 'audit') loadAudit();
        if (name === 'tools') loadServerInfo();
      });
    });
  }

  document.getElementById('admin-user-search-btn') && document.getElementById('admin-user-search-btn').addEventListener('click', function () { refreshUsersAndStats(); });
  document.getElementById('admin-user-reload') && document.getElementById('admin-user-reload').addEventListener('click', function () {
    if (userSearch) userSearch.value = '';
    refreshUsersAndStats();
  });
  userSearch && userSearch.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); refreshUsersAndStats(); }
  });

  var selAll = document.getElementById('admin-reviews-select-all');
  if (selAll) {
    selAll.addEventListener('change', function () {
      var on = selAll.checked;
      document.querySelectorAll('.admin-review-cb').forEach(function (cb) {
        cb.checked = on;
        var id = parseInt(cb.getAttribute('data-rid'), 10);
        reviewCheckState[id] = on;
      });
    });
  }

  document.getElementById('admin-bulk-delete-reviews') && document.getElementById('admin-bulk-delete-reviews').addEventListener('click', function () {
    var ids = [];
    document.querySelectorAll('.admin-review-cb:checked').forEach(function (cb) {
      ids.push(parseInt(cb.getAttribute('data-rid'), 10));
    });
    if (!ids.length) { toast('Отметьте отзывы галочками', true); return; }
    if (!confirm('Удалить ' + ids.length + ' отзыв(ов)?')) return;
    api('POST', '/admin/reviews/bulk-delete', { ids: ids }).then(function (res) {
      if (res.ok) {
        toast('Удалено: ' + (res.data.deleted != null ? res.data.deleted : ids.length));
        api('GET', '/admin/reviews').then(function (r2) {
          if (r2.ok && r2.data && r2.data.reviews) renderReviews(r2.data.reviews);
        });
        api('GET', '/admin/stats').then(function (s) {
          if (s.ok && s.data) renderStats(s.data);
        });
      } else {
        toast((res.data && res.data.error) || 'Ошибка', true);
      }
    });
  });

  document.getElementById('admin-clear-all-reviews') && document.getElementById('admin-clear-all-reviews').addEventListener('click', function () {
    if (!confirm('УДАЛИТЬ ВСЕ ОТЗЫВЫ? Это необратимо.')) return;
    var phrase = window.prompt('Введите точно: DELETE_ALL_REVIEWS');
    if (phrase !== 'DELETE_ALL_REVIEWS') { toast('Отменено', true); return; }
    api('POST', '/admin/reviews/clear-all', { confirm: 'DELETE_ALL_REVIEWS' }).then(function (res) {
      if (res.ok) {
        toast('Удалено отзывов: ' + (res.data.deleted || 0));
        api('GET', '/admin/reviews').then(function (r2) {
          if (r2.ok && r2.data && r2.data.reviews) renderReviews(r2.data.reviews);
        });
        api('GET', '/admin/stats').then(function (s) {
          if (s.ok && s.data) renderStats(s.data);
        });
      } else {
        toast((res.data && res.data.error) || 'Ошибка', true);
      }
    });
  });

  api('GET', '/admin/stats').then(function (res) {
    if (res.status === 403 || res.status === 401) {
      showDenied('Нужны права администратора. Укажите ADMIN_EMAIL в настройках сервера и войдите под этим email на главной странице.');
      return null;
    }
    if (!res.ok || !res.data) {
      showDenied((res.data && res.data.error) ? res.data.error : 'Не удалось загрузить панель. Запустите python main.py.');
      return null;
    }
    showApp();
    renderStats(res.data);
    setupTabs();
    return api('GET', '/admin/users');
  }).then(function (res) {
    if (!res || !res.ok || !usersTbody) return null;
    renderUsers(res.data && res.data.users ? res.data.users : []);
    return api('GET', '/admin/reviews');
  }).then(function (res) {
    if (!res || !res.ok || !reviewsTbody) return;
    renderReviews(res.data && res.data.reviews ? res.data.reviews : []);
  }).catch(function () {
    showDenied('Ошибка сети. Откройте сайт через python main.py.');
  });
})();
