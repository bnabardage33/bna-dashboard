-- Ajout des colonnes pour la signature électronique OTP par SMS
ALTER TABLE public.devis
ADD COLUMN otp_code VARCHAR(6),
ADD COLUMN otp_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN signature_date TIMESTAMP WITH TIME ZONE,
ADD COLUMN signature_ip VARCHAR(45),
ADD COLUMN signature_phone VARCHAR(20);

