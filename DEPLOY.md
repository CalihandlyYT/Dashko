# Как выложить сайт в интернет

## В чём была проблема

Сайт лежал в папке `c:\Dev\dashko`, а репозиторий Git — во вложенной папке `Dashko`. Сервисы видели репозиторий в `Dashko` и предлагали подключить его, но файлов сайта там не было.

**Что сделано:** все файлы сайта скопированы в папку `Dashko`. Теперь репозиторий содержит полный сайт.

---

## Вариант 1: GitHub Pages (бесплатно)

1. Откройте папку **`c:\Dev\dashko\Dashko`** в терминале и отправьте код на GitHub:
   ```bash
   cd c:\Dev\dashko\Dashko
   git add .
   git commit -m "Сайт Dashko Studio"
   git push origin main
   ```

2. На GitHub: репозиторий **CalihandlyYT/Dashko** → **Settings** → **Pages** → в блоке Source выберите ветку **main**, папку **/ (root)** → **Save**.

3. Через 1–2 минуты сайт будет доступен по адресу:  
   **https://calihandlyyt.github.io/Dashko/**

Если репозиторий приватный, в бесплатном плане GitHub Pages не работает — сделайте репозиторий публичным или используйте Netlify.

---

## Вариант 2: Netlify (бесплатно)

1. Зайдите на [netlify.com](https://www.netlify.com), зарегистрируйтесь или войдите через GitHub.

2. **Add new site** → **Import an existing project** → **GitHub** → выберите репозиторий **CalihandlyYT/Dashko**.

3. Настройки сборки:
   - **Base directory:** оставьте пустым или укажите `Dashko`, если Netlify покажет вложенную папку.
   - **Publish directory:** оставьте пустым (корень репозитория).
   - **Build command:** оставьте пустым (статический сайт).

4. Нажмите **Deploy**. Netlify даст ссылку вида `https://random-name.netlify.app`. В настройках сайта можно задать своё доменное имя.

---

## Если спрашивают «Add this repository?»

Когда сервис пишет: *«The directory ...\Dashko appears to be a Git repository. Would you like to add this repository instead?»* — нажмите **«add this repository»**. Подключайте именно папку **Dashko** (в ней теперь лежит весь сайт и репозиторий).

Дальше при деплое указывайте корень этого репозитория — в нём лежат `index.html`, `styles.css` и остальные файлы.
