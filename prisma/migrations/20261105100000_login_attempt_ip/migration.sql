-- IP klien pada percobaan login gagal: kunci akun berlaku per pasangan akun+IP.
ALTER TABLE "LoginAttempt" ADD COLUMN "ip_address" VARCHAR(64);
CREATE INDEX "LoginAttempt_ip_address_created_at_idx" ON "LoginAttempt"("ip_address", "created_at");
