(function () {
  var SUPABASE_URL = window.SUPABASE_URL || '';
  var SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
  var hasConfig = !!(SUPABASE_URL && SUPABASE_ANON_KEY);

  var supabaseClient = null;
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

  function getSupabase(cb) {
    if (supabaseClient) { cb(); return; }
    if (window.supabase && window.supabaseClient.createClient) {
      supabaseClient = window.supabaseClient.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      cb();
      return;
    }
    var s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    s.onload = function () {
      supabaseClient = window.supabaseClient.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
      cb();
    };
    document.head.appendChild(s);
  }

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
    if (authUserSpan && user) authUserSpan.textContent = user.email || 'Аккаунт';
    if (reviewFormBlock) reviewFormBlock.style.display = user ? 'block' : 'none';
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
    getSupabase(function () {
      supabaseClient.from('reviews').select('id, author_name, rating, text, created_at').order('created_at', { ascending: false })
        .then(function (res) {
          if (res.data && res.data.length) renderReviews(res.data);
        });
    });
  }

  getSupabase(function () {
    supabaseClient.auth.getSession().then(function (_ref) {
      var data = _ref.data;
      if (data && data.session) setAuthUI(data.session.user);
      loadReviews();
    });
    supabaseClient.auth.onAuthStateChange(function (event, session) {
      setAuthUI(session ? session.user : null);
    });
  });

  if (authClose) authClose.addEventListener('click', hideAuthModal);
  if (authModal) authModal.addEventListener('click', function (e) { if (e.target === authModal) hideAuthModal(); });

  var authLink = document.getElementById('auth-nav-link');
  if (authLink) authLink.addEventListener('click', function (e) { e.preventDefault(); showAuthModal(); });
  if (!hasConfig) {
    if (authForm) authForm.style.display = 'none';
    var hint = document.createElement('p');
    hint.className = 'form-msg';
    hint.textContent = 'Вход и отзывы работают после настройки Supabase. Откройте config.js и SUPABASE_SETUP.md.';
    if (authModal) authModal.querySelector('.auth-modal-inner').appendChild(hint);
    return;
  }
  if (logoutBtn) logoutBtn.addEventListener('click', function () {
    getSupabase(function () {
      supabaseClient.auth.signOut().then(hideAuthModal);
    });
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
      getSupabase(function () {
        if (isRegister) {
          var name = authName && authName.value ? authName.value.trim() : email;
          supabaseClient.auth.signUp({ email: email, password: password, options: { data: { display_name: name } } })
            .then(function (res) {
              if (res.error) setAuthMessage(res.error.message, true);
              else { setAuthMessage('Проверьте почту для подтверждения или войдите.'); setTimeout(hideAuthModal, 1500); }
            });
        } else {
          supabaseClient.auth.signInWithPassword({ email: email, password: password })
            .then(function (res) {
              if (res.error) setAuthMessage(res.error.message, true);
              else { setAuthMessage(''); hideAuthModal(); }
            });
        }
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
      getSupabase(function () {
        supabaseClient.auth.getUser().then(function (_ref2) {
          var user = _ref2.data && _ref2.data.user;
          if (!user) { if (reviewSubmitMsg) reviewSubmitMsg.textContent = 'Нужно войти в аккаунт.'; return; }
          supabaseClient.from('reviews').insert({ user_id: user.id, author_name: authorName, rating: rating, text: text })
            .then(function (res) {
              if (res.error) { if (reviewSubmitMsg) reviewSubmitMsg.textContent = res.error.message; return; }
              if (reviewSubmitMsg) reviewSubmitMsg.textContent = 'Спасибо! Отзыв добавлен.';
              reviewText.value = '';
              loadReviews();
            });
        });
      });
    });
  }
})();
