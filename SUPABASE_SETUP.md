# Настройка входа и отзывов (Supabase)

## 1. Создайте проект Supabase

1. Зайдите на [supabase.com](https://supabase.com), зарегистрируйтесь.
2. **New project** → укажите имя, пароль БД, регион → Create.
3. В боковой панели: **Project Settings** (иконка шестерёнки) → **API**.
4. Скопируйте:
   - **Project URL**
   - **anon public** (ключ в разделе Project API keys).

## 2. Укажите ключи на сайте

Откройте файл **config.js** и вставьте:

```js
window.SUPABASE_URL = 'https://ВАШ_ПРОЕКТ.supabase.co';
window.SUPABASE_ANON_KEY = 'ваш_anon_ключ';
```

Сохраните и загрузите на сайт (или перезапустите локальный сервер).

## 3. Создайте таблицу отзывов

В Supabase откройте **SQL Editor** → New query. Вставьте и выполните (Run):

```sql
create table if not exists public.reviews (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete set null,
  author_name text not null,
  rating int not null check (rating >= 1 and rating <= 5),
  text text not null,
  created_at timestamptz default now()
);

alter table public.reviews enable row level security;

create policy "Все могут читать отзывы"
  on public.reviews for select
  using (true);

create policy "Авторизованные могут добавлять отзыв"
  on public.reviews for insert
  with check (auth.uid() = user_id);
```

## 4. Включите Email-авторизацию (по желанию)

**Authentication** → **Providers** → **Email** → включите **Enable Email provider**.  
При необходимости включите **Confirm email** (подтверждение по письму).

После этого на сайте заработают вход, регистрация и отправка отзывов.
