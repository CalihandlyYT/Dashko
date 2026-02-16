/**
 * Ссылки на запись по каждой услуге в Dikidi.
 * Чтобы кнопка «Записаться на услугу» открывала окно записи именно на эту услугу:
 * 1. Зайдите в Dikidi Business (веб или приложение).
 * 2. Онлайн-запись → Создать кнопку → выберите «Запись на конкретную услугу».
 * 3. Выберите услугу, получите прямую ссылку и вставьте её в массив ниже (порядок — как в прайсе на сайте).
 * Пока ссылок нет — все кнопки ведут на общую страницу записи студии.
 */
(function () {
  var DIKIDI_BASE = 'https://dikidi.ru/ru/profile/dashko_studio_1318724';
  var SERVICE_LINKS = [
    DIKIDI_BASE, /* 0: Ламинирование бровей */
    DIKIDI_BASE, /* 1: Окрашивание ресниц */
    DIKIDI_BASE, /* 2: Оформление бровей */
    DIKIDI_BASE, /* 3: Усики */
    DIKIDI_BASE, /* 4: Выезд */
    DIKIDI_BASE, /* 5: Ранний выход мастера */
    DIKIDI_BASE, /* 6: Макияж */
    DIKIDI_BASE, /* 7: Свадебный макияж */
    DIKIDI_BASE, /* 8: Образ (макияж и прическа) */
    DIKIDI_BASE, /* 9: Образ (макияж и локоны) */
    DIKIDI_BASE, /* 10: Экспресс образ */
    DIKIDI_BASE, /* 11: Обучение «макияж для себя» */
    DIKIDI_BASE, /* 12: Афро локоны */
    DIKIDI_BASE, /* 13: Прическа */
    DIKIDI_BASE  /* 14: Пробный свадебный образ */
  ];

  function applyLinks() {
    var buttons = document.querySelectorAll('.price-list-photo .price-book-btn');
    for (var i = 0; i < buttons.length && i < SERVICE_LINKS.length; i++) {
      buttons[i].href = SERVICE_LINKS[i] || DIKIDI_BASE;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyLinks);
  } else {
    applyLinks();
  }
})();
