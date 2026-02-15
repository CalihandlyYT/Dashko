(function () {
  var API = '/api';
  var authModal = document.getElementById('auth-modal');
  var authClose = document.getElementById('auth-modal-close');
  var authLoginTab = document.getElementById('auth-tab-login');
  var authRegTab = document.getElementById('auth-tab-register');
  var authForm = document.getElementById('auth-form');
  var authEmail = document.getElementById('auth-email');
  var authPassword = document.getElementById('auth-password');
  var authName = document.getElementById('auth-name');
  var authMessage = document.getElementById('auth-message');
  var authBlock = document.getElementById('auth-block');
  var authUserSpan = document.getElementById('auth-user-span');
  var logoutBtn = document.getElementById('auth-logout');
  var reviewsList = document.getElementById('reviews-list');
  var reviewFormBlock = document.getElementById('review-form-block');
  var reviewForm = document.getElementById('review-form');
  var reviewRating = document.getElementById('review-rating');
  var reviewText = document.getElementById('review-text');
  var reviewAuthorName = document.getElementById('review-author-name');
  var reviewSubmitMsg = document.getElementById('review-submit-msg');

  function showAuthModal() { if (authModal) authModal.classList.add('is-open'); }
  function hideAuthModal() { if (authModal) authModal.classList.remove('is-open'); }
  function setAuthMessage(msg, isError) {
    if (!authMessage) return;
    authMessage.textContent = msg || '';
    authMessage.style.color = isError ? '#c00' : 'var(--color-text-soft)';
  }

  function setAuthUI(user) {
    if (authBlock) authBlock.style.display = user ? 'none' : 'inline-block';
    var userEl = document.getElementById('auth-nav-user');
    if (userEl) userEl.style.display = user ? 'flex' : 'none';
    if (authUserSpan && user) authUserSpan.textContent = user.name || user.email || 'Аккаунт';
    if (reviewFormBlock) reviewFormBlock.style.display = user ? 'block' : 'none';
  }

  function api(method, path, body) {
    var opts = { method: method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(API + path, opts).then(function (r) { return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data }; }); });
  }

  function loadUser() {
    api('GET', '/me').then(function (res) {
      setAuthUI(res.data && res.data.user ? res.data.user : null);
    });
  }

  function renderReviews(rows) {
    if (!reviewsList || !rows || !rows.length) return;
    var stars = function (n) { return '★'.repeat(n) + '☆'.repeat(5 - n); };
    var html = rows.map(function (r) {
      var date = r.created_at ? new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      return '<blockquote class="review-card">' +
        '<div class="review-stars" aria-hidden="true">' + stars(r.rating) + '</div>' +
        '<p class="review-text">' + escapeHtml(r.text) + '</p>' +
        '<cite class="review-author">' + escapeHtml(r.author_name) + (date ? ' · ' + date : '') + '</cite>' +
        '</blockquote>';
    }).join('');
    reviewsList.innerHTML = html;
  }

  function escapeHtml(s) {
    if (!s) return '';
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function loadReviews() {
    api('GET', '/reviews').then(function (res) {
      if (res.data && res.data.reviews && res.data.reviews.length) renderReviews(res.data.reviews);
    });
  }

  loadUser();
  loadReviews();

  if (authClose) authClose.addEventListener('click', hideAuthModal);
  if (authModal) authModal.addEventListener('click', function (e) { if (e.target === authModal) hideAuthModal(); });

  var authLink = document.getElementById('auth-nav-link');
  if (authLink) authLink.addEventListener('click', function (e) { e.preventDefault(); showAuthModal(); });

  if (logoutBtn) logoutBtn.addEventListener('click', function () {
    api('POST', '/logout').then(function () { setAuthUI(null); hideAuthModal(); });
  });

  var authSubmitBtn = authForm ? authForm.querySelector('button[type="submit"]') : null;
  if (authLoginTab && authRegTab) {
    authLoginTab.addEventListener('click', function () {
      authLoginTab.classList.add('is-active'); authRegTab.classList.remove('is-active');
      if (authName) authName.closest('.form-group').style.display = 'none';
      if (authSubmitBtn) authSubmitBtn.textContent = 'Войти';
      setAuthMessage('');
    });
    authRegTab.addEventListener('click', function () {
      authRegTab.classList.add('is-active'); authLoginTab.classList.remove('is-active');
      if (authName) authName.closest('.form-group').style.display = 'block';
      if (authSubmitBtn) authSubmitBtn.textContent = 'Зарегистрироваться';
      setAuthMessage('');
    });
  }

  if (authForm && authEmail && authPassword) {
    authForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var email = authEmail.value.trim();
      var password = authPassword.value;
      var isRegister = authRegTab && authRegTab.classList.contains('is-active');
      setAuthMessage('...');
      var body = { email: email, password: password };
      if (isRegister) body.name = authName && authName.value ? authName.value.trim() : email;
      var path = isRegister ? '/register' : '/login';
      api('POST', path, body).then(function (res) {
        if (!res.ok) {
          setAuthMessage(res.data && res.data.error ? res.data.error : 'Ошибка входа', true);
          return;
        }
        setAuthMessage('');
        setAuthUI(res.data && res.data.user ? res.data.user : null);
        hideAuthModal();
      });
    });
  }

  if (reviewForm && reviewRating && reviewText && reviewAuthorName) {
    reviewForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var rating = parseInt(reviewRating.value, 10) || 5;
      var text = reviewText.value.trim();
      var authorName = reviewAuthorName.value.trim() || 'Гость';
      if (!text) { if (reviewSubmitMsg) reviewSubmitMsg.textContent = 'Напишите текст отзыва.'; return; }
      if (reviewSubmitMsg) reviewSubmitMsg.textContent = 'Отправка...';
      api('POST', '/reviews', { author_name: authorName, rating: rating, text: text }).then(function (res) {
        if (!res.ok) {
          if (reviewSubmitMsg) reviewSubmitMsg.textContent = (res.data && res.data.error) ? res.data.error : 'Ошибка отправки.';
          return;
        }
        if (reviewSubmitMsg) reviewSubmitMsg.textContent = 'Спасибо! Отзыв добавлен.';
        reviewText.value = '';
        loadReviews();
      });
    });
  }
})();
