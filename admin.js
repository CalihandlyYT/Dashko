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

  var denied = document.getElementById('admin-denied');
  var app = document.getElementById('admin-app');
  var statUsers = document.getElementById('stat-users');
  var statReviews = document.getElementById('stat-reviews');
  var usersTbody = document.getElementById('admin-users-tbody');
  var reviewsTbody = document.getElementById('admin-reviews-tbody');
  var loadErr = document.getElementById('admin-load-error');

  function showDenied(msg) {
    if (denied) denied.style.display = 'block';
    if (app) app.style.display = 'none';
    if (loadErr) loadErr.textContent = msg || '';
  }

  function showApp() {
    if (denied) denied.style.display = 'none';
    if (app) app.style.display = 'block';
  }

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
    if (statUsers) statUsers.textContent = res.data.users != null ? String(res.data.users) : '—';
    if (statReviews) statReviews.textContent = res.data.reviews != null ? String(res.data.reviews) : '—';
    return api('GET', '/admin/users');
  }).then(function (res) {
    if (!res || !res.ok || !usersTbody) return null;
    var users = res.data && res.data.users ? res.data.users : [];
    usersTbody.innerHTML = users.map(function (u) {
      return '<tr><td>' + u.id + '</td><td>' + escapeHtml(u.email) + '</td><td>' + escapeHtml(u.name || '') + '</td><td>' + (u.is_admin ? 'да' : '') + '</td><td>' + escapeHtml(u.created_at || '') + '</td></tr>';
    }).join('') || '<tr><td colspan="5">Нет пользователей</td></tr>';
    return api('GET', '/admin/reviews');
  }).then(function (res) {
    if (!res || !res.ok || !reviewsTbody) return;
    var list = res.data && res.data.reviews ? res.data.reviews : [];
    reviewsTbody.innerHTML = list.map(function (r) {
      return '<tr data-id="' + r.id + '"><td>' + r.id + '</td><td>' + escapeHtml(r.author_name) + '</td><td>' + r.rating + '</td><td class="admin-review-text">' + escapeHtml(r.text) + '</td><td>' + escapeHtml(r.user_email || '—') + '</td><td>' + escapeHtml(r.created_at || '') + '</td><td><button type="button" class="btn-admin-delete" data-delete-review="' + r.id + '">Удалить</button></td></tr>';
    }).join('') || '<tr><td colspan="7">Нет отзывов</td></tr>';

    reviewsTbody.querySelectorAll('[data-delete-review]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = parseInt(btn.getAttribute('data-delete-review'), 10);
        if (!id || !confirm('Удалить отзыв #' + id + '?')) return;
        api('DELETE', '/admin/reviews/' + id).then(function (delRes) {
          if (delRes.ok) {
            var tr = btn.closest('tr');
            if (tr) tr.remove();
            api('GET', '/admin/stats').then(function (s) {
              if (s.ok && s.data && statReviews) statReviews.textContent = String(s.data.reviews);
            });
          } else {
            alert((delRes.data && delRes.data.error) || 'Ошибка удаления');
          }
        });
      });
    });
  }).catch(function () {
    showDenied('Ошибка сети. Откройте сайт через python main.py.');
  });
})();
