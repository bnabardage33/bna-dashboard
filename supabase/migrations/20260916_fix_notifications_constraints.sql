DO $$
DECLARE
    conname text;
BEGIN
    SELECT constraint_name INTO conname
    FROM information_schema.table_constraints
    WHERE table_name = 'notifications' AND constraint_type = 'CHECK';
    
    IF conname IS NOT NULL THEN
        EXECUTE 'ALTER TABLE notifications DROP CONSTRAINT ' || conname;
    END IF;
END $$;

ALTER TABLE notifications ADD CONSTRAINT notifications_type_check CHECK (type IN ('devis', 'facture', 'sav', 'chat', 'chantier', 'rapport', 'general', 'commande_retard', 'client_alert'));
