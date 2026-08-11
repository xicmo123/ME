# GCP Cloud Run 部署

這個專案是 Next.js + Prisma + PostgreSQL，建議部署成 Cloud Run 服務，資料庫使用 Cloud SQL for PostgreSQL，敏感環境變數放 Secret Manager。

## 1. 建立 GCP 資源

```bash
export PROJECT_ID="你的-project-id"
export REGION="asia-east1"
export SERVICE_NAME="zeno"
export AR_REPOSITORY="cloud-run"
export CLOUD_SQL_INSTANCE="zeno-postgres"

gcloud config set project "$PROJECT_ID"

gcloud services enable \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  run.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com \
  cloudscheduler.googleapis.com

gcloud artifacts repositories create "$AR_REPOSITORY" \
  --repository-format=docker \
  --location="$REGION"

gcloud sql instances create "$CLOUD_SQL_INSTANCE" \
  --database-version=POSTGRES_16 \
  --region="$REGION" \
  --tier=db-f1-micro

gcloud sql databases create zeno --instance="$CLOUD_SQL_INSTANCE"
gcloud sql users create zeno --instance="$CLOUD_SQL_INSTANCE" --password="換成強密碼"
```

Cloud Run 預設執行身分需要能讀 Secret Manager、連 Cloud SQL：

```bash
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
RUN_SERVICE_ACCOUNT="$PROJECT_NUMBER-compute@developer.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUN_SERVICE_ACCOUNT" \
  --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUN_SERVICE_ACCOUNT" \
  --role="roles/cloudsql.client"
```

如果 Cloud Build 部署時遇到權限錯誤，確認 Cloud Build 使用的服務帳戶具有 Cloud Run Admin、Artifact Registry Writer，以及對 Cloud Run 執行身分的 Service Account User 權限。

## 2. 建立 Secret Manager 變數

`DATABASE_URL` 若使用 Cloud SQL Unix socket，格式如下：

```text
postgresql://zeno:你的密碼@localhost/zeno?host=/cloudsql/PROJECT_ID:REGION:INSTANCE
```

建立必要 secrets：

```bash
printf '%s' '你的 DATABASE_URL' | gcloud secrets create DATABASE_URL --data-file=-
printf '%s' '你的 JWT_SECRET' | gcloud secrets create JWT_SECRET --data-file=-
printf '%s' '64 個十六進位字元的 ENCRYPTION_KEY' | gcloud secrets create ENCRYPTION_KEY --data-file=-
printf '%s' '你的 CRON_SECRET' | gcloud secrets create CRON_SECRET --data-file=-
```

需要 Google / Apple 登入、RevenueCat、SMTP 時，也把 README 裡對應的選填變數建成 secrets，並在部署指令追加 `--set-secrets`。

## 3. 第一次部署

第一次還不知道 Cloud Run 網址，可以先用臨時 `APP_BASE_URL` 部署，部署完成後再更新成正式網址或自訂網域。

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions=_REGION="$REGION",_SERVICE_NAME="$SERVICE_NAME",_AR_REPOSITORY="$AR_REPOSITORY",_APP_BASE_URL="https://replace-me.run.app",_CLOUD_SQL_CONNECTION_NAME="$PROJECT_ID:$REGION:$CLOUD_SQL_INSTANCE"

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region="$REGION" --format='value(status.url)')"

gcloud run services update "$SERVICE_NAME" \
  --region="$REGION" \
  --update-env-vars="APP_BASE_URL=$SERVICE_URL"
```

## 4. 套用 Prisma migration

正式資料庫建立後，先在可以連到 Cloud SQL 的環境執行：

```bash
npx prisma migrate deploy
```

若本機不能直連 Cloud SQL，建議開 Cloud SQL Auth Proxy，或建立一個只跑 migration 的 Cloud Run Job。

## 5. 排程

`cloudbuild.yaml` 目前用 `--min-instances=0`（縮到零、低流量下大致在免費額度內）。

代價是 `instrumentation.ts` 裡的 node-cron **不會可靠執行**——容器閒置就被回收，排程跟著消失。
所以排程一定要改由 Cloud Scheduler 觸發。

> 若改回 `--min-instances=1` + `--no-cpu-throttling`，容器 24 小時常駐、node-cron 可以正常運作，
> 但費用約 US$45–55／月。以目前階段不建議。

用 Cloud Scheduler 呼叫這些 API：

- 每 10 分鐘：`/api/test-fetch-prices`
- 每天 00:05 Asia/Taipei：`/api/recurring/apply`
- 每天 03:00 Asia/Taipei：`/api/accounts/purge-archived`
- 每天 23:59 Asia/Taipei：`/api/history/snapshot`

每個 Scheduler request 都要帶 header：

```text
x-cron-secret: 你的 CRON_SECRET
```

## 6. 本機驗證容器

```bash
docker build -t zeno-local .
docker run --rm -p 8080:8080 --env-file .env zeno-local
```

容器啟動後可以先確認健康檢查端點，不需要登入、也不會連資料庫：

```bash
curl http://localhost:8080/api/health
```

`cloudbuild.yaml` 已設定 Cloud Run startup/liveness probe 打 `/api/health`。如果遇到 502 Bad Gateway，優先確認：

- Cloud Run revision logs 內是否有 app 啟動錯誤。
- `DATABASE_URL`、`JWT_SECRET`、`ENCRYPTION_KEY`、`CRON_SECRET` secrets 是否存在且有授權。
- `DATABASE_URL` 的 Cloud SQL connection name 是否和 `_CLOUD_SQL_CONNECTION_NAME` 相同。
- `APP_BASE_URL` 是否已從 `https://replace-me.run.app` 更新成實際 Cloud Run 網址或自訂網域。
