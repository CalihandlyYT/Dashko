# Как выложить сайт в интернет

Сайт лежит в **корне** репозитория (`index.html`, `styles.css`, `script.js` и т.д.). Пуш делается из папки `c:\Dev\dashko`.

---

## Вариант 1: GitHub Pages (бесплатно)

**Чтобы на сайте отображались последние изменения:** в репозитории **CalihandlyYT/Dashko** откройте **Settings** → **Pages** → в блоке **Build and deployment** выберите **Source: GitHub Actions**. Сохраните. После каждого пуша в `main` сайт будет автоматически обновляться из корня репозитория.

1. Код уже в GitHub. После изменений пушите из корня проекта:
   ```bash
   cd c:\Dev\dashko
   git add .
   git commit -m "Обновление сайта"
   git push origin main
   ```

2. **Важно:** на GitHub откройте репозиторий **CalihandlyYT/Dashko** → **Settings** → **Pages**. В блоке **Build and deployment** → **Source** выберите:
   - **Deploy from a branch**
   - Branch: **main**
   - Folder: **/ (root)** — именно корень, не папку Dashko.

   Нажмите **Save**. Если была выбрана папка **Dashko**, сайт показывал старую версию; после переключения на root обновится.

3. Подождите 1–2 минуты, обновите страницу с принудительной перезагрузкой (Ctrl+F5 или Cmd+Shift+R), чтобы сбросить кэш.

4. Сайт: **https://calihandlyyt.github.io/Dashko/**

Если репозиторий приватный, в бесплатном плане GitHub Pages не работает — сделайте репозиторий публичным или используйте Netlify.

---

## Вариант 2: Netlify (бесплатно)

1. Зайдите на [netlify.com](https://www.netlify.com), зарегистрируйтесь или войдите через GitHub.

2. **Add new site** → **Import an existing project** → **GitHub** → выберите репозиторий **CalihandlyYT/Dashko**.

3. Настройки сборки:
   - **Base directory:** пусто (корень репозитория).
   - **Publish directory:** пусто.
   - **Build command:** пусто (статический сайт).

4. Нажмите **Deploy**. Ссылка будет вида `https://random-name.netlify.app`.

---

**Примечание:** Вход и отзывы (Flask) на GitHub Pages и Netlify не работают — там только статика. Форма входа и отзывы будут видны, но запросы к `/api/` не сработают, пока не поднимете бэкенд отдельно (например на Timeweb, Railway, Render).
