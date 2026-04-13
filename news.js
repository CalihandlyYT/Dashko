(function () {
  var API = '/api';
  var API_UNAVAILABLE_MSG = 'Новости, вход и регистрация работают только когда сайт открыт через Flask-сервер. Запусти python main.py и открой http://127.0.0.1:8000 — на GitHub Pages backend и база данных не работают.';

  function api(method, path, body) {
    var opts = { method: method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function (r) {
      return r.text().then(function (text) {
        var data = {};
        if (text) {
          try {
            data = JSON.parse(text);
          } catch (e) {
            data = {
              error: (text.indexOf('<!') === 0 || text.indexOf('<html') === 0 || text.indexOf('<!DOCTYPE') === 0)
                ? API_UNAVAILABLE_MSG
                : 'Сервер вернул некорректный ответ. Проверь, что сайт запущен через python main.py.'
            };
          }
        }
        return { ok: r.ok, status: r.status, data: data };
      });
    }).catch(function () {
      return { ok: false, status: 0, data: { error: API_UNAVAILABLE_MSG } };
    });
  }

  function escapeHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function formatDate(value) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  var newsList = document.getElementById('news-list');
  var newsEmpty = document.getElementById('news-empty');

  function renderNews(items) {
    if (!newsList || !newsEmpty) return;
    if (!items || !items.length) {
      newsList.innerHTML = '';
      newsEmpty.style.display = 'block';
      return;
    }

    newsEmpty.style.display = 'none';
    newsList.innerHTML = items.map(function (item) {
      var summary = item.summary ? '<p class="news-card-summary">' + escapeHtml(item.summary) + '</p>' : '';
      var contentHtml = escapeHtml(item.content).replace(/\n/g, '<br>');
      return (
        '<article class="news-card">' +
          '<div class="news-card-meta">' +
            '<span class="news-card-date">' + escapeHtml(formatDate(item.created_at)) + '</span>' +
            '<span class="news-card-author">Опубликовал: ' + escapeHtml(item.author_name || 'Администратор') + '</span>' +
          '</div>' +
          '<h3 class="news-card-title">' + escapeHtml(item.title) + '</h3>' +
          summary +
          '<div class="news-card-content">' + contentHtml + '</div>' +
        '</article>'
      );
    }).join('');
  }

  function loadNews() {
    return api('GET', '/news').then(function (res) {
      if (!res.ok) {
        if (newsEmpty) {
          newsEmpty.style.display = 'block';
          newsEmpty.textContent = (res.data && res.data.error) ? res.data.error : 'Не удалось загрузить новости.';
        }
        return;
      }
      renderNews(res.data && res.data.news ? res.data.news : []);
    });
  }

  loadNews();
})();
