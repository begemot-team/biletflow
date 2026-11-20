# Развёртывание BiletFlow

Два окружения: локальное (Docker Compose, для разработки и демо без интернета)
и живое на Heroku (для сдачи и показа с любого устройства).

| | Локально | Heroku |
| --- | --- | --- |
| Адрес | `localhost:5173` (веб), `localhost:8000/api` | https://begemot-b8b43e7ea8ea.herokuapp.com |
| Сборка | `docker-compose.yml`: `db`, `web`, `frontend` | `heroku.yml` → `Dockerfile.heroku`, один контейнер |
| Сервер | Django `runserver` + Vite dev server | gunicorn (3 воркера), React собран и отдаётся через WhiteNoise |
| База | PostgreSQL 16 в Docker volume | Heroku Postgres (Essential-0) |
| Миграции | при старте `web` | release-фаза Heroku, до переключения трафика |
| Письма | `docker compose logs web` | `heroku logs --tail -a begemot` |
| Деплой | `docker compose up --build` | автоматически при push в `main` |

## Локально

Нужен Docker Desktop.

```bash
git clone https://github.com/begemot-team/biletflow.git
cd biletflow
docker compose up --build -d --wait
docker compose exec -T web python manage.py seed_demo
```

Веб — `localhost:5173`, админка — `localhost:5173/admin`, проверка API —
`localhost:8000/api/health` (`{"status":"ok","database":"ok"}`). Демо-аккаунты
печатает `seed_demo`: `demo-organizer@`, `demo-attendee@`, `demo-admin@biletflow.local`,
пароль `Demo-pass-2026!` (только локально). Подробнее, включая занятые порты
и `.env`, — в [README](../README.md).

Остановить: `docker compose down` (данные сохраняются). `down -v` удаляет базу.

## Heroku

### Как устроено

- Приложение `begemot`, стек `container`. `heroku.yml` собирает
  `Dockerfile.heroku`: первый этап собирает React (`npm run build`), второй
  ставит Django, кладёт сборку в `frontend_dist` и делает `collectstatic`.
  Фронтенд и `/api` живут на одном домене, CORS не нужен.
- Release-фаза выполняет `python manage.py migrate`. Если миграция падает,
  релиз отменяется и продолжает работать прошлая версия.
- Workflow `.github/workflows/deploy.yml`: каждый push в `main` пушит код в Heroku
  и затем ждёт, пока `/api/health` ответит. Работа идёт в `dev`; на живой сайт
  она попадает, когда PR `dev` → `main` смержен.
  Можно запустить вручную: Actions → Deploy to Heroku → Run workflow.
  Ключ — секрет репозитория `HEROKU_API_KEY` (окружение `heroku` в GitHub).

### Переменные окружения (config vars)

| Переменная | Значение |
| --- | --- |
| `DATABASE_URL` | ставит аддон Heroku Postgres |
| `DJANGO_SECRET_KEY` | случайная строка, не из Git |
| `DJANGO_ALLOWED_HOSTS` | `begemot-b8b43e7ea8ea.herokuapp.com,biletflow.tech,www.biletflow.tech` |
| `FRONTEND_BASE_URL` | `https://begemot-b8b43e7ea8ea.herokuapp.com` (ссылки в письмах, Campaign QR, CSRF) |
| `DEMO_PASSWORD` | пароль демо-аккаунтов на Heroku; хранится только здесь |
| `WEB_CONCURRENCY` | необязательно, число воркеров gunicorn (по умолчанию 3) |

`DJANGO_DEBUG` на Heroku не задаётся: без него включены HTTPS-редирект и
secure cookies. Посмотреть: `heroku config -a begemot`.

### Частые действия

```bash
heroku logs --tail -a begemot                      # логи и симулированные письма
heroku releases -a begemot                         # история релизов
heroku releases:rollback -a begemot                # откат на прошлый релиз
heroku run -a begemot -- python manage.py seed_demo --password "$(heroku config:get DEMO_PASSWORD -a begemot)"
heroku run -a begemot -- python manage.py createsuperuser
heroku ps:scale web=0 -a begemot                   # остановить (база продолжает списывать)
```

Ручной деплой без GitHub Actions (нужны Docker и `heroku login`). На macOS
`git push heroku` с git из Xcode не работает (известная ошибка Apple Git-146),
поэтому образ собирается локально и загружается в Container Registry:

```bash
heroku container:login
docker buildx build --platform linux/amd64 --provenance=false --sbom=false \
  -f Dockerfile.heroku -t registry.heroku.com/begemot/web \
  --output type=registry,oci-mediatypes=false .
heroku container:release web -a begemot
heroku run:detached -a begemot -- python manage.py migrate --noinput
```

В этом пути release-фаза `heroku.yml` не участвует, поэтому миграции запускаются отдельно.

Повторный `seed_demo` переносит прошедшие демо-события на ту же дистанцию от
сегодняшнего дня (Jazz Night +14, Meetup +7, Pitch Day +21 день), заказы и
билеты сохраняются. `--refresh-dates` переносит все демо-события, даже ещё не прошедшие.

`releases:rollback` возвращает код, но не откатывает миграции. Если новая
миграция уже изменила данные, сначала сделайте `heroku pg:backups:capture`.

### С нуля (новое приложение)

```bash
heroku create <имя> --stack container --region eu
heroku addons:create heroku-postgresql:essential-0 -a <имя>
heroku config:set -a <имя> DJANGO_SECRET_KEY="$(python3 -c 'import secrets;print(secrets.token_urlsafe(50))')"
heroku config:set -a <имя> DJANGO_ALLOWED_HOSTS=<хост> FRONTEND_BASE_URL=https://<хост>
heroku config:set -a <имя> DEMO_PASSWORD="$(python3 -c 'import secrets;print(secrets.token_urlsafe(16))')"
git push https://git.heroku.com/<имя>.git HEAD:main
```

Хост берётся из `heroku apps:info -a <имя>`. Для автодеплоя поменяйте
`HEROKU_APP` и адрес в `deploy.yml`.

## Мобильный сканер

`mobile/config.ts` указывает на `localhost:8000` (`10.0.2.2:8000` в Android-эмуляторе).
Для телефона в одной сети с компьютером замените хост на IP компьютера, а для
работы с Heroku — на `https://begemot-b8b43e7ea8ea.herokuapp.com/api`. Вход —
аккаунт организатора или сотрудника события (`/events/{id}/staff`).

## Проверка после деплоя

1. `curl https://begemot-b8b43e7ea8ea.herokuapp.com/api/health` → `{"status":"ok","database":"ok"}`.
2. Открыть сайт, войти организатором, открыть событие и страницу продаж.
3. Войти посетителем, купить бесплатный билет, открыть QR.
4. Сканер (или `POST /api/tickets/check-in`): первый проход 200, повторный 409.

## Производительность

Замеры 20 ноября 2026 года, gunicorn с 3 воркерами (как на Heroku) в Docker на ноутбуке:

| Сценарий | p50 | p95 | max |
| --- | --- | --- | --- |
| Резерв (`POST /orders`) | 7.5 мс | 8.9 мс | 33.6 мс |
| Оплата (`POST /orders/:id/checkout`) | 13.0 мс | 14.9 мс | 36.3 мс |
| Резерв + оплата | 20.5 мс | 23.5 мс | 69.9 мс |
| Сканер: verify + check-in (200 билетов) | 11.6 мс | 14.3 мс | 30.3 мс |

40 параллельных покупок на 10 билетов: продано ровно 10, 30 получили отказ,
лишних билетов нет. Повторить:

```bash
docker compose exec -d -T web gunicorn config.wsgi --bind 127.0.0.1:8001 --workers 3
docker compose exec -T web python bench_checkout.py --base-url http://127.0.0.1:8001/api
docker compose exec -T web python bench_checkin.py --base-url http://127.0.0.1:8001/api
```

Конкурентный прогон нельзя запускать против `runserver` (порт 8000): dev-сервер
сбрасывает соединения при 40 одновременных клиентах. Регистрация ограничена
60 запросами в минуту, поэтому между прогонами нужна пауза около минуты.
