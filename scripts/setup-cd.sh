#!/usr/bin/env bash
# One-time setup so GitHub Actions can deploy to Google Cloud without a key file
# (Workload Identity Federation). Run it yourself, from a machine where gcloud is logged in
# as a project owner. It changes IAM in your project, so it asks before doing anything.
#
#   ./scripts/setup-cd.sh                                  # current gcloud project, repo sidd-92/planwell-ai
#   GCP_PROJECT_ID=my-proj GITHUB_REPO=me/repo ./scripts/setup-cd.sh
set -euo pipefail

PROJECT="${GCP_PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
REPO="${GITHUB_REPO:-sidd-92/planwell-ai}"
SA_NAME="planwell-deployer"
POOL="github"
PROVIDER="planwell-repo"

[ -n "$PROJECT" ] || { echo "No Google Cloud project. Run: gcloud config set project <PROJECT_ID>" >&2; exit 1; }
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"
SA="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

echo "Project:  $PROJECT"
echo "GitHub:   $REPO (only this repository will be able to deploy)"
echo "Creates:  service account $SA, a Workload Identity pool '$POOL', and grants it deploy roles"
read -r -p "Continue? [y/N] " ok
[[ "$ok" =~ ^[Yy]$ ]] || exit 0

gcloud services enable iamcredentials.googleapis.com sts.googleapis.com run.googleapis.com \
  cloudbuild.googleapis.com artifactregistry.googleapis.com --project "$PROJECT"

gcloud iam service-accounts describe "$SA" --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam service-accounts create "$SA_NAME" --project "$PROJECT" --display-name "PlanWell GitHub deployer"

# What `gcloud run deploy --source` needs: build from source, push the image, deploy the service.
for role in roles/run.admin roles/cloudbuild.builds.editor roles/artifactregistry.writer roles/storage.admin roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$PROJECT" --member "serviceAccount:$SA" --role "$role" --condition=None --quiet >/dev/null
done
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" --project "$PROJECT" \
  --member "serviceAccount:$SA" --role roles/iam.serviceAccountUser --quiet >/dev/null

gcloud iam workload-identity-pools describe "$POOL" --location global --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools create "$POOL" --location global --project "$PROJECT" --display-name "GitHub Actions"

gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool "$POOL" --location global --project "$PROJECT" >/dev/null 2>&1 ||
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --workload-identity-pool "$POOL" --location global --project "$PROJECT" \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "assertion.repository == '${REPO}'"

gcloud iam service-accounts add-iam-policy-binding "$SA" --project "$PROJECT" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}" --quiet >/dev/null

PROVIDER_NAME="$(gcloud iam workload-identity-pools providers describe "$PROVIDER" --workload-identity-pool "$POOL" --location global --project "$PROJECT" --format='value(name)')"

cat <<DONE

Google Cloud is ready. Now add these in GitHub (repo > Settings > Secrets and variables > Actions):

  Variables (the Variables tab):
    GCP_PROJECT_ID    $PROJECT
    GCP_WIF_PROVIDER  $PROVIDER_NAME
    GCP_DEPLOY_SA     $SA

  Secret (the Secrets tab):
    CONVEX_DEPLOY_KEY   a production deploy key from the Convex dashboard
                        (your project > production deployment > Settings > Deploy keys)

Then push to main, or run the "Deploy" workflow by hand from the Actions tab.
DONE
