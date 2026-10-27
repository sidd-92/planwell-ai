#!/usr/bin/env bash
# Deploys PlanWell.AI: Convex (production) + Cloud Run (app + Gemini API).
#
#   ./deploy.sh                        # uses your current gcloud project, region asia-south1 (Mumbai)
#   GCP_PROJECT_ID=my-proj REGION=us-central1 ./deploy.sh
#
# Needs: gcloud (logged in), node/npm, and a Convex login (`npx convex dev` has been run here).
set -euo pipefail
cd "$(dirname "$0")"

PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REGION="${REGION:-asia-south1}"              # Cloud Run region
VERTEX_LOCATION="${GCP_LOCATION:-global}"      # Vertex AI location for Gemini (the 3.x models are served from "global")
SERVICE="${SERVICE:-planwell-ai}"

bold() { printf '\n\033[1m%s\033[0m\n' "$1"; }
die() { printf '\n\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

command -v gcloud >/dev/null || die "gcloud is not installed: https://cloud.google.com/sdk/docs/install"
command -v npx >/dev/null || die "Node.js/npm is not installed."
[ -n "$PROJECT" ] || die "No Google Cloud project. Run: gcloud config set project <PROJECT_ID>  (or set GCP_PROJECT_ID)"
gcloud auth print-access-token >/dev/null 2>&1 || die "gcloud is not logged in. Run: gcloud auth login"
[ -f .env.local ] || die "No .env.local — run 'npx convex dev' once in this folder first."

echo "Project:        $PROJECT"
echo "Cloud Run:      $SERVICE in $REGION"
echo "Gemini region:  $VERTEX_LOCATION"
read -r -p "Continue? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || exit 0

bold "1/5  Installing dependencies"
npm install --no-audit --no-fund

bold "2/5  Deploying Convex functions to production"
rm -f .convex-prod-url
npx convex deploy --cmd 'printenv CONVEX_URL > .convex-prod-url' --cmd-url-env-var-name CONVEX_URL
CONVEX_URL="$(tr -d '[:space:]' < .convex-prod-url)"
rm -f .convex-prod-url
[[ "$CONVEX_URL" == https://* ]] || die "Couldn't read the production Convex URL (got '$CONVEX_URL')."
echo "Convex production: $CONVEX_URL"

bold "3/5  Enabling Google Cloud APIs and Vertex AI access"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com aiplatform.googleapis.com --project "$PROJECT"
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding "$PROJECT" \
  --member "serviceAccount:${RUNTIME_SA}" --role roles/aiplatform.user --condition=None --quiet >/dev/null
echo "Granted Vertex AI User to $RUNTIME_SA"

bold "4/5  Building and deploying to Cloud Run (takes a few minutes)"
gcloud run deploy "$SERVICE" \
  --project "$PROJECT" \
  --region "$REGION" \
  --source . \
  --allow-unauthenticated \
  --service-account "$RUNTIME_SA" \
  --memory 512Mi \
  --set-env-vars "GCP_PROJECT_ID=${PROJECT},GCP_LOCATION=${VERTEX_LOCATION},CONVEX_URL=${CONVEX_URL}"
APP_URL="$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format='value(status.url)')"

bold "5/5  Configuring sign-in on the Convex production deployment"
if npx convex env get JWT_PRIVATE_KEY --prod >/dev/null 2>&1 && [ -n "$(npx convex env get JWT_PRIVATE_KEY --prod 2>/dev/null)" ]; then
  npx convex env set SITE_URL "$APP_URL" --prod
  echo "Sign-in keys already set; SITE_URL updated."
else
  npx @convex-dev/auth --prod --web-server-url "$APP_URL" --skip-git-check
fi

bold "Done. PlanWell.AI is live at: $APP_URL"
