-- NULL deliberately requires legacy human sessions to authenticate again.
ALTER TABLE "user_sessions" ADD COLUMN "last_user_activity_at" TIMESTAMPTZ(3);
ALTER TABLE "customer_sessions" ADD COLUMN "last_user_activity_at" TIMESTAMPTZ(3);
