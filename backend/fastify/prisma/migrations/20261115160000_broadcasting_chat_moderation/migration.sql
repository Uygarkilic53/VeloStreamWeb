-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN "message_type" TEXT NOT NULL DEFAULT 'text',
ADD COLUMN "gif_url" TEXT,
ADD COLUMN "is_deleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "deleted_by" TEXT,
ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "channel_moderators" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "assigned_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_moderators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_mutes" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "issued_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_mutes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_warnings" (
    "id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "issued_by" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "channel_warnings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channel_moderators_channel_id_user_id_key" ON "channel_moderators"("channel_id", "user_id");

-- CreateIndex
CREATE INDEX "channel_moderators_channel_id_idx" ON "channel_moderators"("channel_id");

-- CreateIndex
CREATE INDEX "channel_moderators_user_id_idx" ON "channel_moderators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "channel_mutes_channel_id_user_id_key" ON "channel_mutes"("channel_id", "user_id");

-- CreateIndex
CREATE INDEX "channel_mutes_channel_id_expires_at_idx" ON "channel_mutes"("channel_id", "expires_at");

-- CreateIndex
CREATE INDEX "channel_warnings_channel_id_user_id_idx" ON "channel_warnings"("channel_id", "user_id");

-- AddForeignKey
ALTER TABLE "channel_moderators" ADD CONSTRAINT "channel_moderators_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_moderators" ADD CONSTRAINT "channel_moderators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_moderators" ADD CONSTRAINT "channel_moderators_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_mutes" ADD CONSTRAINT "channel_mutes_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_mutes" ADD CONSTRAINT "channel_mutes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_mutes" ADD CONSTRAINT "channel_mutes_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_warnings" ADD CONSTRAINT "channel_warnings_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_warnings" ADD CONSTRAINT "channel_warnings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_warnings" ADD CONSTRAINT "channel_warnings_issued_by_fkey" FOREIGN KEY ("issued_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
