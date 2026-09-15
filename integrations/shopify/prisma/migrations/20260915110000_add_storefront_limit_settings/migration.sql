ALTER TABLE "SelfxConnection"
ADD COLUMN "adminLocale" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN "visitorTryOnLimit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "visitorTryOnLimitPeriod" TEXT NOT NULL DEFAULT 'DAY',
ADD COLUMN "monthlyStoreTryOnLimit" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "SelfxConnection"
ALTER COLUMN "storefrontLocale" SET DEFAULT 'auto';
