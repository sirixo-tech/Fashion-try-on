ALTER TABLE "SelfxConnection"
ADD COLUMN "tryOnMode" TEXT NOT NULL DEFAULT 'BOTH';

ALTER TABLE "SelfxConnection"
ADD CONSTRAINT "SelfxConnection_tryOnMode_check"
CHECK ("tryOnMode" IN ('GARMENT', 'JEWELLERY', 'BOTH'));
