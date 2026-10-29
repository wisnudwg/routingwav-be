-- AlterEnum
ALTER TYPE "TokenPurpose" ADD VALUE 'VERIFY_NOTIFICATION_EMAIL';

-- AlterTable
ALTER TABLE "auth_tokens" ADD COLUMN     "target" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notificationEmail" TEXT,
ADD COLUMN     "notificationEmailVerifiedAt" TIMESTAMPTZ(3),
ADD COLUMN     "tempPasswordExpiresAt" TIMESTAMPTZ(3);

-- A notification address belongs to at most one member per account, always lowercase, members only
CREATE UNIQUE INDEX "users_notification_email_per_account"
  ON "users" ("accountId", "notificationEmail") WHERE "notificationEmail" IS NOT NULL;
ALTER TABLE "users" ADD CONSTRAINT "users_notification_email_lowercase"
  CHECK ("notificationEmail" IS NULL OR "notificationEmail" = lower("notificationEmail"));
ALTER TABLE "users" ADD CONSTRAINT "users_notification_email_members_only"
  CHECK ("notificationEmail" IS NULL OR "type" = 'IAM');
