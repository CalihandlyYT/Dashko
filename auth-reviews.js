(function () {
  var API = '/api';
  var currentUser = null;
  var pendingAvatarDataUrl = null;

  var authModal = document.getElementById('auth-modal');
  var profileModal = document.getElementById('profile-modal');
  var authClose = document.getElementById('auth-modal-close');
  var profileClose = document.getElementById('profile-modal-close');
  var authLoginTab = document.getElementById('auth-tab-login');
  var authRegTab = document.getElementById('auth-tab-register');
  var authForm = document.getElementById('auth-form');
  var authEmail = document.getElementById('auth-email');
  var authPassword = document.getElementById('auth-password');
  var authName = document.getElementById('auth-name');
  var authMessage = document.getElementById('auth-message');
  var authBlock = document.getElementById('auth-block');
  var authNavUser = document.getElementById('auth-nav-user');
  var authNavAvatar = document.getElementById('auth-nav-avatar');
  var profileNavLink = document.getElementById('profile-nav-link');
  var logoutBtn = document.getElementById('auth-logout');
  var reviewsList = document.getElementById('reviews-list');
  var reviewFormBlock = document.getElementById('review-form-block');
  var reviewForm = document.getElementById('review-form');
  var reviewRating = document.getElementById('review-rating');
  var reviewText = document.getElementById('review-text');
  var reviewAuthorName = document.getElementById('review-author-name');
  var reviewSubmitMsg = document.getElementById('review-submit-msg');
  var reviewNameHint = document.getElementById('review-name-hint');

  var profileForm = document.getElementById('profile-form');
  var profileName = document.getElementById('profile-name');
  var profileEmail = document.getElementById('profile-email');
  var profileAvatarFile = document.getElementById('profile-avatar-file');
  var profileAvatarClear = document.getElementById('profile-avatar-clear');
  var profileAvatarPreviewImg = document.getElementById('profile-avatar-preview-img');
  var profileCurrentPassword = document.getElementById('profile-current-password');
  var profileNewPassword = document.getElementById('profile-new-password');
  var profileMessage = document.getElementById('profile-message');
  var adminNavLink = document.getElementById('admin-nav-link');
  var profileAdminBadge = document.getElementById('profile-admin-badge');

  function showAuthModal() { if (authModal) authModal.classList.add('is-open'); }
  function hideAuthModal() { if (authModal) authModal.classList.remove('is-open'); }
  function showProfileModal() {
    if (!profileModal) return;
    fillProfileForm();
    setProfileMessage('');
    profileModal.classList.add('is-open');
    profileModal.setAttribute('aria-hidden', 'false');
  }
  function hideProfileModal() {
    if (!profileModal) return;
    profileModal.classList.remove('is-open');
    profileModal.setAttribute('aria-hidden', 'true');
  }

  function setAuthMessage(msg, isError) {
    if (!authMessage) return;
    authMessage.textContent = msg || '';
    authMessage.style.color = isError ? '#c00' : 'var(--color-text-soft)';
  }

  function setProfileMessage(msg, isError) {
    if (!profileMessage) return;
    profileMessage.textContent = msg || '';
    profileMessage.style.color = isError ? '#c00' : 'var(--color-text-soft)';
  }

  function updateNavAvatar(imgEl, user) {
    if (!imgEl) return;
    if (user && user.avatar) {
      imgEl.src = user.avatar;
      imgEl.alt = user.name || 'Аватар';
      imgEl.style.display = 'block';
    } else {
      imgEl.removeAttribute('src');
      imgEl.alt = '';
      imgEl.style.display = 'none';
    }
  }

  function applyReviewAuthorFromProfile() {
    if (!reviewAuthorName) return;
    if (currentUser && currentUser.name) {
      reviewAuthorName.value = currentUser.name;
      if (reviewNameHint) reviewNameHint.style.display = 'block';
    } else {
      if (reviewNameHint) reviewNameHint.style.display = 'none';
    }
  }

  function setAuthUI(user) {
    currentUser = user || null;
    if (authBlock) authBlock.style.display = user ? 'none' : 'inline-block';
    if (authNavUser) {
      authNavUser.style.display = user ? 'flex' : 'none';
    }
    updateNavAvatar(authNavAvatar, user);
    if (adminNavLink) adminNavLink.style.display = user && user.is_admin ? 'inline' : 'none';
    if (reviewFormBlock) reviewFormBlock.style.display = user ? 'block' : 'none';
    applyReviewAuthorFromProfile();
  }

  var API_UNAVAILABLE_MSG = 'Вход и отзывы работают только при запуске сайта на своём компьютере: в папке проекта выполните python main.py и откройте http://127.0.0.1:8000 — на GitHub Pages сервер с базой данных не запускается.';

  function api(method, path, body) {
    var opts = { method: method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    if (body) opts.body = JSON.stringify(body);
    return fetch(API + path, opts)
      .then(function (r) {
        return r.text().then(function (text) {
          var data = {};
          if (text) {
            try {
              data = JSON.parse(text);
            } catch (e) {
              data = {
                error: r.status === 404 || (text.indexOf('<!') === 0)
                  ? API_UNAVAILABLE_MSG
                  : 'Сервер вернул не JSON. Проверьте, что запущен python main.py.'
              };
            }
          }
          return { ok: r.ok, status: r.status, data: data };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, data: { error: API_UNAVAILABLE_MSG } };
      });
  }

  function loadUser() {
    api('GET', '/me').then(function (res) {
      var u = res.data && res.data.user ? res.data.user : null;
      setAuthUI(u);
    }).catch(function () { /* тихо */ });
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
    }).catch(function () { /* тихо */ });
  }

  function fillProfileForm() {
    pendingAvatarDataUrl = null;
    if (!currentUser) return;
    if (profileAdminBadge) profileAdminBadge.style.display = currentUser.is_admin ? 'block' : 'none';
    if (profileName) profileName.value = currentUser.name || '';
    if (profileEmail) profileEmail.value = currentUser.email || '';
    if (profileCurrentPassword) profileCurrentPassword.value = '';
    if (profileNewPassword) profileNewPassword.value = '';
    if (profileAvatarPreviewImg) {
      if (currentUser.avatar) {
        profileAvatarPreviewImg.src = currentUser.avatar;
        profileAvatarPreviewImg.classList.add('is-visible');
      } else {
        profileAvatarPreviewImg.removeAttribute('src');
        profileAvatarPreviewImg.classList.remove('is-visible');
      }
    }
  }

  function readFileAsDataUrl(file, maxBytes, cb) {
    if (!file || !file.type || file.type.indexOf('image/') !== 0) {
      cb('Выберите изображение (JPEG, PNG, WebP, GIF).');
      return;
    }
    if (file.size > maxBytes) {
      cb('Файл слишком большой. Максимум ~300 КБ.');
      return;
    }
    var r = new FileReader();
    r.onload = function () {
      var url = r.result;
      if (typeof url === 'string' && url.length > 200000) {
        cb('Изображение слишком большое после загрузки.');
        return;
      }
      cb(null, url);
    };
    r.onerror = function () { cb('Не удалось прочитать файл.'); };
    r.readAsDataURL(file);
  }

  loadUser();
  loadReviews();

  if (authClose) authClose.addEventListener('click', hideAuthModal);
  if (authModal) authModal.addEventListener('click', function (e) { if (e.target === authModal) hideAuthModal(); });
  if (profileClose) profileClose.addEventListener('click', hideProfileModal);
  if (profileModal) profileModal.addEventListener('click', function (e) { if (e.target === profileModal) hideProfileModal(); });

  var authLink = document.getElementById('auth-nav-link');
  if (authLink) authLink.addEventListener('click', function (e) { e.preventDefault(); showAuthModal(); });

  if (profileNavLink) profileNavLink.addEventListener('click', function (e) {
    e.preventDefault();
    showProfileModal();
  });

  if (logoutBtn) logoutBtn.addEventListener('click', function () {
    api('POST', '/logout').then(function () {
      setAuthUI(null);
      hideAuthModal();
      hideProfileModal();
    });
  });

  if (profileAvatarFile) {
    profileAvatarFile.addEventListener('change', function () {
      var f = profileAvatarFile.files && profileAvatarFile.files[0];
      if (!f) return;
      readFileAsDataUrl(f, 300 * 1024, function (err, dataUrl) {
        if (err) {
          setProfileMessage(err, true);
          profileAvatarFile.value = '';
          return;
        }
        pendingAvatarDataUrl = dataUrl;
        if (profileAvatarPreviewImg) {
          profileAvatarPreviewImg.src = dataUrl;
          profileAvatarPreviewImg.classList.add('is-visible');
        }
        setProfileMessage('');
      });
    });
  }

  if (profileAvatarClear) {
    profileAvatarClear.addEventListener('click', function () {
      pendingAvatarDataUrl = '';
      if (profileAvatarFile) profileAvatarFile.value = '';
      if (profileAvatarPreviewImg) {
        profileAvatarPreviewImg.removeAttribute('src');
        profileAvatarPreviewImg.classList.remove('is-visible');
      }
      setProfileMessage('Сохраните, чтобы удалить фото с профиля.');
    });
  }

  if (profileForm) {
    profileForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!currentUser) return;
      setProfileMessage('Сохранение...');
      var body = {
        name: profileName ? profileName.value.trim() : '',
        email: profileEmail ? profileEmail.value.trim().toLowerCase() : ''
      };
      if (pendingAvatarDataUrl !== null) {
        body.avatar = pendingAvatarDataUrl === '' ? '' : pendingAvatarDataUrl;
      }
      var newPw = profileNewPassword && profileNewPassword.value ? profileNewPassword.value : '';
      var curPw = profileCurrentPassword && profileCurrentPassword.value ? profileCurrentPassword.value : '';
      if (newPw) {
        body.new_password = newPw;
        body.current_password = curPw;
      }
      api('PATCH', '/profile', body).then(function (res) {
        if (!res.ok) {
          setProfileMessage(res.data && res.data.error ? res.data.error : 'Не удалось сохранить', true);
          return;
        }
        if (!res.data || !res.data.user) {
          setProfileMessage('Нет ответа сервера.', true);
          return;
        }
        pendingAvatarDataUrl = null;
        setProfileMessage('Сохранено.');
        setAuthUI(res.data.user);
        setTimeout(hideProfileModal, 600);
      });
    });
  }

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
        if (!res.data || !res.data.user) {
          setAuthMessage('Нет данных пользователя. Проверьте, что запущен сервер (python main.py).', true);
          return;
        }
        setAuthMessage('');
        setAuthUI(res.data.user);
        hideAuthModal();
      });
    });
  }

  if (reviewForm && reviewRating && reviewText && reviewAuthorName) {
    reviewForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var rating = parseInt(reviewRating.value, 10) || 5;
      var text = reviewText.value.trim();
      var authorName = reviewAuthorName.value.trim();
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
