-- CreateEnum
CREATE TYPE "KycType" AS ENUM ('INDIVIDUAL', 'BUSINESS');

-- CreateEnum
CREATE TYPE "KycStatus" AS ENUM ('IN_REVIEW', 'VERIFIED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "KycDocKind" AS ENUM ('KTP', 'SELFIE', 'NPWP', 'NIB', 'REP_KTP', 'DEED');

-- CreateEnum
CREATE TYPE "KycDocStatus" AS ENUM ('PENDING_UPLOAD', 'UPLOADED', 'REJECTED');

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "elevatedUntil" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "kyc_cases" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "type" "KycType" NOT NULL,
    "status" "KycStatus" NOT NULL,
    "fullName" TEXT,
    "entityType" TEXT,
    "legalName" TEXT,
    "repName" TEXT,
    "dekWrapped" TEXT NOT NULL,
    "nikEnc" TEXT,
    "npwpEnc" TEXT,
    "nibEnc" TEXT,
    "repNikEnc" TEXT,
    "nikIdx" TEXT,
    "npwpIdx" TEXT,
    "nibIdx" TEXT,
    "masked" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "externalRef" TEXT,
    "providerStartedAt" TIMESTAMPTZ(3),
    "userActionUrl" TEXT,
    "userActionExpiresAt" TIMESTAMPTZ(3),
    "rejectionCode" TEXT,
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMPTZ(3),
    "retainUntil" TIMESTAMPTZ(3),

    CONSTRAINT "kyc_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documents" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "caseId" UUID,
    "kind" "KycDocKind" NOT NULL,
    "status" "KycDocStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "objectKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedAt" TIMESTAMPTZ(3),

    CONSTRAINT "kyc_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_provider_events" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_provider_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kyc_cases_externalRef_key" ON "kyc_cases"("externalRef");

-- CreateIndex
CREATE INDEX "kyc_cases_accountId_submittedAt_idx" ON "kyc_cases"("accountId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_documents_objectKey_key" ON "kyc_documents"("objectKey");

-- CreateIndex
CREATE INDEX "kyc_documents_accountId_status_idx" ON "kyc_documents"("accountId", "status");

-- CreateIndex
CREATE INDEX "kyc_documents_caseId_idx" ON "kyc_documents"("caseId");

-- CreateIndex
CREATE UNIQUE INDEX "kyc_provider_events_provider_eventId_key" ON "kyc_provider_events"("provider", "eventId");

-- AddForeignKey
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documents" ADD CONSTRAINT "kyc_documents_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "kyc_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- At most one case in review and one verified per account (a verified account may have an update in review)
CREATE UNIQUE INDEX "kyc_one_in_review_per_account" ON "kyc_cases" ("accountId") WHERE "status" = 'IN_REVIEW';
CREATE UNIQUE INDEX "kyc_one_verified_per_account" ON "kyc_cases" ("accountId") WHERE "status" = 'VERIFIED';

-- An identity number can be verified on one account only
CREATE UNIQUE INDEX "kyc_verified_nik"  ON "kyc_cases" ("nikIdx")  WHERE "status" = 'VERIFIED' AND "nikIdx"  IS NOT NULL;
CREATE UNIQUE INDEX "kyc_verified_npwp" ON "kyc_cases" ("npwpIdx") WHERE "status" = 'VERIFIED' AND "npwpIdx" IS NOT NULL;
CREATE UNIQUE INDEX "kyc_verified_nib"  ON "kyc_cases" ("nibIdx")  WHERE "status" = 'VERIFIED' AND "nibIdx"  IS NOT NULL;

-- A case always carries the numbers its type requires
ALTER TABLE "kyc_cases" ADD CONSTRAINT "kyc_cases_shape" CHECK (
  ("type" = 'INDIVIDUAL' AND "nikEnc" IS NOT NULL AND "nibEnc" IS NULL)
  OR ("type" = 'BUSINESS' AND "nibEnc" IS NOT NULL AND "npwpEnc" IS NOT NULL AND "repNikEnc" IS NOT NULL)
);